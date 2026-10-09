import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createApp } from './app.js';
import { pool } from './db.js';
import { usagePercent } from './data-usage.js';

test('Quota percentages retain unknowns and do not turn over-limit usage into negative headroom',() => {
  assert.deepEqual(usagePercent(23),{ used: 23,remaining: 77 });
  assert.deepEqual(usagePercent(120),{ used: 120,remaining: 0 });
  assert.deepEqual(usagePercent(0),{ used: 0,remaining: 100 });
  for (const value of [null,undefined,'23',-1,NaN,Infinity]) assert.deepEqual(usagePercent(value),{ used: null,remaining: null });
});

test('Admin usage reports use isolated PostgreSQL logs without external requests',{ skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  if (!url.pathname.startsWith('/encore_ingest_test')) throw Error('Usage tests require an isolated database');
  const schema = 'data_usage_'+randomUUID().replaceAll('-','');
  const setup = new pg.Client({ connectionString: url.href }); await setup.connect();
  const db = new pg.Pool({ connectionString: url.href,options: '-c search_path='+schema+',public' });
  const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = 'http://127.0.0.1:'+(server.address() as { port: number }).port;
  const request = async (path='/admin/data-usage',cookie?: string) => {
    const response = await fetch(origin+'/api'+path,{ headers: cookie ? { cookie } : {} });
    return { status: response.status,body: await response.json(),cache: response.headers.get('cache-control') };
  };
  try {
    await setup.query('CREATE SCHEMA '+schema); await setup.query('SET search_path TO '+schema+',public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => db.query(sql,params));
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis,'fetch',((input: string | URL | Request,init?: RequestInit) => {
      assert.ok(String(input).startsWith(origin+'/api/'),'Dashboard must not contact external APIs');
      return originalFetch(input,init);
    }) as typeof fetch);
    const session = async (role: string,expired=false) => {
      const user = (await db.query("INSERT INTO users(email,display_name,password_hash,role) VALUES($1,'Usage fixture','unused',$2) RETURNING id",[randomUUID()+'@example.test',role])).rows[0];
      const token = randomUUID();
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3::interval)",[createHash('sha256').update(token).digest('hex'),user.id,expired ? '-1 second' : '1 hour']);
      return 'artist_session='+token;
    };
    const admin = await session('admin'),user = await session('user'),expired = await session('admin',true);
    await db.query("INSERT INTO source_state(source_name,category,enabled) VALUES('Instagram fixture','news',true),('Scraper fixture','concert',true),('Idle fixture','concert',false)");
    for (const [status,metrics] of [['success',{ requests: 2 }],['partial',{ requests: 1 }],['failed',{ requests: 1 }],['skipped',{}],['running',{}]] as const) {
      await db.query("INSERT INTO sync_runs(source_name,category,status,items_seen,items_changed,metrics) VALUES('Instagram fixture','news',$1,20,2,$2)",[status,JSON.stringify(metrics)]);
    }
    await db.query(`INSERT INTO sync_runs(source_name,category,status,started_at,metrics) VALUES
      ('Scraper fixture','concert','success',now()-interval '2 hours','{"requests":"secret-invalid"}'),
      ('Scraper fixture','concert','success',now()-interval '2 days','{"requests":3}'),
      ('Scraper fixture','concert','failed',now()-interval '8 days','{"requests":999}'),
      ('No state fixture','travel','failed',now(),'{"requests":-2}')`);
    await db.query(`UPDATE instagram_sync_budget SET usage='{"callCount":23,"totalTime":58,"cpuTime":0}',
      usage_checked_at=now()-interval '1 hour',paused_until=now()-interval '1 minute',pause_reason='old cooldown' WHERE id=1`);
    const before = (await db.query('SELECT * FROM instagram_sync_budget')).rows;
    await t.test('Guest, member and expired admin sessions cannot inspect usage',async () => {
      assert.equal((await request()).status,401);
      assert.equal((await request(undefined,user)).status,403);
      assert.equal((await request(undefined,expired)).status,401);
      assert.equal((await request('/admin/instagram-monitor')).status,401);
      assert.equal((await request('/admin/instagram-monitor',user)).status,403);
      assert.equal((await request('/admin/instagram-monitor',expired)).status,401);
    });
    await t.test('Separate runs, measured requests, unavailable counts and each result',async () => {
      const result = await request(undefined,admin); assert.equal(result.status,200); assert.match(result.cache!,/no-store/);
      const ig = result.body.sources.find((s: { source_name: string }) => s.source_name==='Instagram fixture');
      assert.equal(ig.runs,5); assert.equal(ig.requests,4); assert.equal(ig.unmetered_runs,2);
      for (const field of ['succeeded','partial','failed','skipped','running']) assert.equal(ig[field],1);
      assert.equal(ig.items_seen,100); assert.equal(ig.items_changed,10);
      const scraper = result.body.sources.find((s: { source_name: string }) => s.source_name==='Scraper fixture');
      assert.equal(scraper.runs,1); assert.equal(scraper.requests,null); assert.equal(scraper.unmetered_runs,1);
      assert.ok(result.body.sources.some((s: { source_name: string; runs: number; enabled: boolean }) => s.source_name==='Idle fixture' && s.runs===0 && !s.enabled));
      assert.equal(result.body.sources.find((s: { source_name: string }) => s.source_name==='No state fixture').requests,null);
      assert.ok(!JSON.stringify(result.body).includes('secret-invalid'));
      assert.equal(result.body.instagram.call.remaining,77); assert.equal(result.body.instagram.time.remaining,42);
      assert.equal(result.body.instagram.cpu.remaining,100); assert.equal(result.body.instagram.paused,false);
      assert.equal(result.body.instagram.pausedUntil,null);
    });
    await t.test('Seven-day filter includes older runs; invalid and repeated ranges are rejected',async () => {
      const result = await request('/admin/data-usage?period=7d',admin);
      const scraper = result.body.sources.find((s: { source_name: string }) => s.source_name==='Scraper fixture');
      assert.equal(scraper.runs,2); assert.equal(scraper.requests,3); assert.equal(scraper.unmetered_runs,1);
      for (const path of ['?period=all','?period=24h&period=7d','?period[$gt]=0']) assert.equal((await request('/admin/data-usage'+path,admin)).status,400);
    });
    await t.test('Missing quota fields remain unknown and inspection does not change budget state',async () => {
      const monitor=await request('/admin/instagram-monitor',admin);
      assert.equal(monitor.status,200);assert.equal(monitor.body.accounts,0);
      assert.deepEqual((await db.query('SELECT * FROM instagram_sync_budget')).rows,before);
      await db.query("UPDATE instagram_sync_budget SET usage='{}',paused_until=now()+interval '30 minutes' WHERE id=1");
      const result = await request(undefined,admin);
      assert.deepEqual(result.body.instagram.call,{ used: null,remaining: null }); assert.equal(result.body.instagram.paused,true);
      assert.ok(result.body.instagram.pausedUntil);
    });
  } finally {
    server.close(); server.closeAllConnections(); await once(server,'close'); t.mock.restoreAll(); await db.end();
    await setup.query('DROP SCHEMA '+schema+' CASCADE'); await setup.end();
  }
});
