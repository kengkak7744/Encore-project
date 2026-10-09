import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from './db.js';
import { config } from './config.js';
import { runScheduledNews } from './social-scheduler.js';

test('News scheduler survives repeated worker boots and preserves a recent pre-deploy rate limit', { skip: !process.env.INGEST_TEST_DATABASE_URL },async (t) => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  const before = { xBearerToken: config.xBearerToken,metaToken: config.metaToken };
  Object.assign(config,{ xBearerToken: '',metaToken: '' });
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA social_scheduler_fixture');
    await client.query('SET LOCAL search_path TO social_scheduler_fixture,public');
    const dir = new URL('../sql/',import.meta.url);
    const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort();
    for (const file of files.filter(name => name<'015_')) await client.query(await readFile(new URL(file,dir),'utf8'));
    await client.query("INSERT INTO sync_runs(source_name,category,status,finished_at,error) VALUES('INSTAGRAM','news','failed',now(),'Instagram Graph HTTP 403 (codes 4)')");
    await client.query(await readFile(new URL(files.find(name => name.startsWith('015_'))!,dir),'utf8'));
    for (const file of files.filter(name => name>'015_instagram_usage.sql')) await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    t.mock.method(pool,'connect',async () => ({ query: client.query.bind(client),release() {} }));
    t.mock.method(console,'error',() => {});
    let requests = 0;
    t.mock.method(globalThis,'fetch',async () => { requests++; throw new Error('No external request permitted while cooling down'); });
    assert.equal((await client.query("SELECT paused_until>=now()+interval '59 minutes' AS paused FROM instagram_sync_budget")).rows[0].paused,true);
    await runScheduledNews();
    const runs = (await client.query('SELECT count(*)::int n FROM sync_runs')).rows[0].n;
    await runScheduledNews(); await runScheduledNews();
    assert.equal((await client.query('SELECT count(*)::int n FROM sync_runs')).rows[0].n,runs);
    assert.equal(requests,0);
    assert.equal((await client.query('SELECT count(*)::int n FROM social_scheduler_state WHERE last_started_at IS NOT NULL')).rows[0].n,2);
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()');
    t.mock.restoreAll(); Object.assign(config,before);
    await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
