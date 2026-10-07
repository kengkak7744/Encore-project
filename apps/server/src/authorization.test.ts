import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import test from 'node:test';
import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

test('Permissions and session lifecycle through the production HTTP app', { skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  if (!url.pathname.startsWith('/encore_ingest_test')) throw Error('Authorization fixtures require an isolated test database');
  const schema = 'authorization_' + randomUUID().replaceAll('-','');
  const setup = new pg.Client({ connectionString: url.href });
  await setup.connect();
  const fixtures = new pg.Pool({ connectionString: url.href,options: '-c search_path='+schema+',public' });
  const savedConfig = { ...config };
  let duringModel: (() => Promise<unknown>) | undefined;
  const ollama = express(); ollama.use(express.json());
  // Only the external model is simulated; middleware, hashing, DB and queue are real.
  ollama.get('/api/ps',(_req,res) => res.json({ models: [] }));
  ollama.post('/api/chat',async (_req,res) => { await duringModel?.(); res.json({ message: { content: JSON.stringify({ intent: 'recommendations',artist: null,city: null,month: null,year: null }) } }); });
  ollama.post('/api/generate',(_req,res) => res.json({ done: true }));
  const modelServer = ollama.listen(0,'127.0.0.1'); await once(modelServer,'listening');
  let server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const request = async (path: string,method = 'GET',cookie?: string,body?: unknown,headers: Record<string,string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api${path}`,{
      method,headers: { 'Content-Type': 'application/json',...(cookie ? { cookie } : {}),...headers },...(body===undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status,headers: response.headers,body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
  };
  const register = async (email: string) => {
    const result = await request('/auth/register','POST',undefined,{ email,displayName: email.split('@')[0],password: 'fixture-password-123',role: 'admin' });
    assert.equal(result.status,201); assert.equal(result.body.user.role,'user'); assert.ok(!('password_hash' in result.body.user));
    return { id: result.body.user.id as string,cookie: result.headers.get('set-cookie')!.split(';')[0],headers: result.headers };
  };
  const expire = (cookie: string) => fixtures.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[createHash('sha256').update(cookie.split('=')[1]).digest('hex')]);
  try {
    await setup.query('CREATE SCHEMA '+schema);
    await setup.query('SET search_path TO '+schema+',public');
    const dir = new URL('../sql/',import.meta.url);
    for (const name of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(name,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => fixtures.query(sql,params));
    t.mock.method(pool,'connect',() => fixtures.connect());
    Object.assign(config,{ googleRoutesEnabled: false,agodaEnabled: false,ollamaUrl: `http://127.0.0.1:${(modelServer.address() as { port: number }).port}`,ollamaResource: schema,ollamaQuietMs: 0 });
    const a = await register('user-a@example.test'),b = await register('user-b@example.test'),admin = await register('admin@example.test');
    await fixtures.query("UPDATE users SET role='admin' WHERE id=$1",[admin.id]);
    const oldUser = await register('expired-user@example.test'),oldAdmin = await register('expired-admin@example.test');
    await fixtures.query("UPDATE users SET role='admin' WHERE id=$1",[oldAdmin.id]); await expire(oldUser.cookie); await expire(oldAdmin.cookie);
    const revoked = await register('revoked@example.test'); await request('/auth/logout','POST',revoked.cookie);
    const addArtist = async (slug: string,name: string,kind: string,genres: string[]) => {
      const result = await request('/admin/artists','POST',admin.cookie,{ slug,name,kind,genres }); assert.equal(result.status,201); return result.body.id as string;
    };
    const artistA = await addArtist('fixture-a','Fixture A','band',['Pop']),artistB = await addArtist('fixture-b','Fixture B','solo',['Rock']),member = await addArtist('fixture-member','Fixture member','member',[]);
    const addShow = async (slug: string,title: string,startsAt: string) => {
      const result = await request('/admin/concerts','POST',admin.cookie,{ slug,title,city: 'กรุงเทพมหานคร',startsAt,priceMin: 1000 }); assert.equal(result.status,201); return result.body.id as string;
    };
    const showA = await addShow('show-a','Show A','2099-01-01T11:00Z'),showB = await addShow('show-b','Show B','2099-01-02T11:00Z');
    const pastA = await addShow('past-a','Past A','2020-01-01T11:00Z'),pastB = await addShow('past-b','Past B','2020-01-02T11:00Z');
    for (const [show,artist] of [[showA,artistA],[pastA,artistA],[showB,artistB],[pastB,artistB]]) assert.equal((await request(`/admin/concerts/${show}/artists/${artist}`,'PUT',admin.cookie)).status,200);
    for (const [artist,title] of [[artistA,'News A'],[artistB,'News B']]) await fixtures.query("INSERT INTO news_items(artist_id,platform,source_url,title,body,published_at) VALUES($1,'instagram',$2,$3,$3,now())",[artist,'https://www.instagram.com/p/'+artist+'/',title]);
    await fixtures.query("INSERT INTO biography_runs(artist_id,window_date,model,status,source_documents,draft) VALUES($1,current_date,'fixture','failed',$2::jsonb,$3::jsonb)",[artistA,JSON.stringify([{ url: 'https://example.test/evidence',text: 'ADMIN-ONLY-SOURCE' }]),JSON.stringify({ sections: [{ heading: 'Draft',body: 'ADMIN-ONLY-DRAFT',evidence: [] }] })]);
    await fixtures.query("INSERT INTO concert_monitor_windows(started_at,ends_at) VALUES(now(),now()+interval '7 days')");
    // Reset only the HTTP app between cases; this keeps production throttling intact.
    t.beforeEach(async () => { server.close(); server.closeAllConnections(); await once(server,'close'); server=createApp().listen(0,'127.0.0.1'); await once(server,'listening'); });
    await t.test('Registration cannot grant admin rights; account responses and cookies protect private data',async () => {
      const me = await request('/me','GET',a.cookie); assert.equal(me.status,200); assert.equal(me.body.user.role,'user'); assert.ok(!('password_hash' in me.body.user));
      assert.match(me.headers.get('cache-control') || '',/no-store/); assert.match(me.headers.get('vary') || '',/Cookie/i);
      const cookie = a.headers.get('set-cookie')!;
      for (const flag of [/HttpOnly/i,/SameSite=Lax/i,/Path=\//i,/Max-Age=2592000/i]) assert.match(cookie,flag);
    });
    await t.test('Malformed session cookies do not break public pages',async () => {
      assert.equal((await request('/me','GET','artist_session=%E0%A4%A')).status,401);
      assert.equal((await request('/artists','GET','artist_session=%E0%A4%A')).status,200);
    });
    const denied = [undefined,'artist_session=unknown-token',oldUser.cookie,oldAdmin.cookie,revoked.cookie];
    const privateRoutes: [string,string,unknown?][] = [
      ['GET','/me'],['PUT',`/me/follows/${artistA}`,{ userId: a.id }],['DELETE',`/me/follows/${artistA}`],
      ['PUT',`/me/attendance/${pastA}`,{ userId: a.id }],['DELETE',`/me/attendance/${pastA}`],['GET','/recommendations'],
      ['POST','/chat',{ message: 'แนะนำงาน',userId: a.id }],['POST','/trip-estimates',{ concertId: showA,origin: 'กรุงเทพมหานคร',save: true,userId: a.id }],['GET',`/me/trip-budgets/${showA}`],
    ];
    for (const [method,path,body] of privateRoutes) await t.test(`Private ${method} ${path} rejects absent, forged, expired and revoked sessions`,async () => {
      for (const cookie of denied) {
        const result = await request(path,method,cookie,body); assert.equal(result.status,401); assert.equal(result.body.error,'กรุณาเข้าสู่ระบบ');
        assert.match(result.headers.get('cache-control') || '',/no-store/);
        if (cookie) assert.match(result.headers.get('set-cookie') || '',/artist_session=;/);
      }
    });
    const adminRoutes: [string,string,unknown?][] = [
      ['POST','/admin/artists',{ slug: 'forbidden-artist',name: 'New fixture',kind: 'solo' }],['PATCH',`/admin/artists/${artistA}`,{ name: 'Fixture A updated' }],
      ['PUT',`/admin/artists/${artistA}/accounts`,{ platform: 'instagram',url: 'https://www.instagram.com/fixture_a/' }],['PUT',`/admin/artists/${artistA}/members/${member}`],
      ['PUT',`/admin/artists/${artistA}/sources`,{ url: 'https://example.test/evidence',label: 'Fixture source' }],['GET','/admin/biography-runs'],
      ['POST','/admin/concerts',{ slug: 'forbidden-show',title: 'New fixture show' }],['PATCH',`/admin/concerts/${showA}`,{ title: 'Show A updated' }],
      ['PUT',`/admin/concerts/${showA}/artists/${artistB}`],['POST',`/admin/concerts/${showA}/performances`,{ startsAt: '2099-01-01T12:00Z' }],['GET','/admin/sync-runs'],
    ];
    for (const [method,path,body] of adminRoutes) await t.test(`Admin ${method} ${path} checks roles before processing data`,async () => {
      for (const cookie of [...denied,a.cookie,b.cookie]) {
        const result = await request(path,method,cookie,body,{ 'X-User-Id': admin.id,'X-Role': 'admin' });
        assert.equal(result.status,cookie===a.cookie || cookie===b.cookie ? 403 : 401); assert.match(result.headers.get('cache-control') || '',/no-store/);
        assert.ok(!JSON.stringify(result.body).includes('ADMIN-ONLY'));
      }
    });
    await t.test('Denied writes leave public data and private collections unchanged',async () => {
      const artist = (await request('/artists/fixture-a')).body;
      assert.equal(artist.name,'Fixture A'); assert.deepEqual(artist.accounts,[]); assert.deepEqual(artist.members,[]); assert.deepEqual(artist.sources,[]);
      const show = (await request('/concerts/show-a')).body; assert.equal(show.title,'Show A'); assert.equal(show.artists.length,1); assert.equal(show.performances.length,1); assert.equal(show.performances[0].starts_at,'2099-01-01T11:00:00.000Z');
      assert.equal((await request('/artists/forbidden-artist')).status,404); assert.equal((await request('/concerts/forbidden-show')).status,404);
      const me = (await request('/me','GET',a.cookie)).body; assert.deepEqual(me.follows,[]); assert.deepEqual(me.attendance,[]);
      assert.equal((await request('/me/trip-budgets/'+showA,'GET',a.cookie)).status,404);
    });
    await t.test('Administrators can use all eleven administrator endpoints',async () => {
      for (const [method,path,body] of adminRoutes) {
        const result = await request(path,method,admin.cookie,body); assert.equal(result.status,method==='POST' ? 201 : 200);
        if (path==='/admin/biography-runs') assert.ok(JSON.stringify(result.body).includes('ADMIN-ONLY-DRAFT'));
      }
      const artist = (await request('/artists/fixture-a')).body; assert.equal(artist.name,'Fixture A updated'); assert.equal(artist.accounts.length,1); assert.equal(artist.members.length,1); assert.equal(artist.sources.length,1);
      assert.equal((await request('/concerts/show-a')).body.performances.length,2);
      await fixtures.query('DELETE FROM concert_artists WHERE concert_id=$1 AND artist_id=$2',[showA,artistB]);
    });
    await t.test('Follow and attendance writes ignore spoofed owners and cannot delete another users records',async () => {
      await request(`/me/follows/${artistA}?userId=${b.id}`,'PUT',a.cookie,{ userId: b.id }); await request(`/me/attendance/${pastA}`,'PUT',a.cookie,{ userId: b.id });
      await request(`/me/follows/${artistB}`,'PUT',b.cookie); await request(`/me/attendance/${pastB}`,'PUT',b.cookie);
      for (const path of [`/me/follows/${artistA}`,`/me/attendance/${pastA}`]) assert.equal((await request(path,'DELETE',b.cookie,{ userId: a.id })).status,200);
      const first = (await request('/me','GET',a.cookie)).body,second = (await request('/me?userId='+a.id,'GET',b.cookie)).body;
      assert.equal(first.user.id,a.id); assert.deepEqual(first.follows.map((r: { id: string }) => r.id),[artistA]); assert.deepEqual(first.attendance.map((r: { id: string }) => r.id),[pastA]);
      assert.equal(second.user.id,b.id); assert.deepEqual(second.follows.map((r: { id: string }) => r.id),[artistB]); assert.deepEqual(second.attendance.map((r: { id: string }) => r.id),[pastB]);
      for (const path of [`/me/follows/${artistA}`,`/me/attendance/${pastA}`]) assert.equal((await request(path,'DELETE',a.cookie)).status,200);
      assert.deepEqual((await request('/me','GET',a.cookie)).body.follows,[]); assert.deepEqual((await request('/me','GET',a.cookie)).body.attendance,[]);
      await request(`/me/follows/${artistA}`,'PUT',a.cookie); await request(`/me/attendance/${pastA}`,'PUT',a.cookie);
    });
    await t.test('News personalization uses only the signed-in users follows',async () => {
      for (const [cookie,expected] of [[a.cookie,'News A'],[b.cookie,'News B']] as const) {
        const result = await request('/news?userId='+admin.id,'GET',cookie);
        assert.equal(result.body.items[0].title,expected); assert.equal(result.body.items[0].followed,true); assert.equal(result.body.items[1].followed,false);
        assert.match(result.headers.get('cache-control') || '',/no-store/); assert.match(result.headers.get('vary') || '',/Cookie/i);
      }
      for (const cookie of [undefined,oldUser.cookie,oldAdmin.cookie]) assert.ok((await request('/news','GET',cookie)).body.items.every((item: { followed: boolean }) => !item.followed));
    });
    await t.test('Recommendations and Thai chat cannot borrow another users tastes',async () => {
      for (const [cookie,expected,excluded,otherId] of [[a.cookie,'Show A updated','Show B',b.id],[b.cookie,'Show B','Show A updated',a.id]] as const) {
        const recommendations = await request('/recommendations?userId='+otherId,'GET',cookie); assert.equal(recommendations.status,200); assert.deepEqual(recommendations.body.items.map((r: { title: string }) => r.title),[expected]);
        const chat = await request('/chat','POST',cookie,{ message: 'แนะนำงานจากศิลปินที่ติดตาม',userId: otherId }); assert.equal(chat.status,200); assert.ok(chat.body.answer.includes(expected)); assert.ok(!chat.body.answer.includes(excluded));
      }
    });
    await t.test('Saved budgets remain private even to administrators and do not modify public prices',async () => {
      const input = { concertId: showA,origin: 'กรุงเทพมหานคร',nights: 0,transport: 'none',save: true,userId: b.id,manualPrices: { ticket: { amount: 123,currency: 'THB',unit: 'group_total' } } };
      const saved = await request('/trip-estimates','POST',a.cookie,input); assert.equal(saved.status,200); assert.ok(saved.body.saved.id);
      for (const cookie of [b.cookie,admin.cookie]) assert.equal((await request('/me/trip-budgets/'+showA+'?userId='+a.id,'GET',cookie)).status,404);
      const other = await request('/trip-estimates','POST',b.cookie,{ ...input,userId: a.id,manualPrices: { ticket: { amount: 456,currency: 'THB',unit: 'group_total' } } }); assert.equal(other.status,200); assert.notEqual(other.body.saved.id,saved.body.saved.id);
      const updated = await request('/trip-estimates','POST',b.cookie,{ ...input,manualPrices: { ticket: { amount: 789,currency: 'THB',unit: 'group_total' } } }); assert.equal(updated.body.saved.id,other.body.saved.id);
      assert.equal((await request('/me/trip-budgets/'+showA,'GET',a.cookie)).body.inputs.manualPrices.ticket.amount,123);
      assert.equal((await request('/me/trip-budgets/'+showA,'GET',b.cookie)).body.inputs.manualPrices.ticket.amount,789);
      assert.equal((await request('/concerts/show-a')).body.price_min,'1000.00');
    });
    for (const path of ['/artists','/artists/fixture-a','/concerts','/concerts/show-a','/news','/status','/status/concert-monitor','/status/concert-monitor.csv','/status/concert-monitor.md']) await t.test(`Public GET ${path} works after user and admin expiry without exposing drafts`,async () => {
      for (const cookie of [undefined,a.cookie,b.cookie,admin.cookie,oldUser.cookie,oldAdmin.cookie]) {
        const result = await request(path,'GET',cookie); assert.equal(result.status,200);
        for (const secret of ['ADMIN-ONLY-DRAFT','ADMIN-ONLY-SOURCE','password_hash']) assert.ok(!JSON.stringify(result.body).includes(secret));
      }
    });
    await t.test('Login rotates tokens and logout revokes only that session; expired sessions can log in again',async () => {
      const login = () => request('/auth/login','POST',undefined,{ email: 'user-a@example.test',password: 'fixture-password-123' });
      const first = await login(),second = await login(); assert.equal(first.status,200); assert.equal(second.status,200); assert.ok(!('password_hash' in first.body.user));
      const cookie1=first.headers.get('set-cookie')!.split(';')[0],cookie2=second.headers.get('set-cookie')!.split(';')[0]; assert.notEqual(cookie1,cookie2); assert.notEqual(cookie1,a.cookie);
      const logout=await request('/auth/logout','POST',cookie1); assert.equal(logout.status,200); assert.match(logout.headers.get('set-cookie') || '',/artist_session=;/);
      assert.equal((await request('/me','GET',cookie1)).status,401); assert.equal((await request('/me','GET',cookie2)).status,200);
      for (const [email,password] of [['user-a@example.test','incorrect-password'],['unknown@example.test','fixture-password-123']]) assert.equal((await request('/auth/login','POST',undefined,{ email,password })).status,401);
      assert.equal((await request('/auth/register','POST',undefined,{ email: 'user-a@example.test',displayName: 'Duplicate',password: 'fixture-password-123' })).status,409);
      await expire(cookie2); assert.equal((await request('/me','GET',cookie2)).status,401); assert.equal((await login()).status,200);
      assert.equal((await request('/auth/logout','POST',oldUser.cookie)).status,200); assert.equal((await request('/auth/logout','POST')).status,200);
    });
    await t.test('Demotion changes administrator permissions on the next request',async () => {
      await fixtures.query("UPDATE users SET role='user' WHERE id=$1",[admin.id]); assert.equal((await request('/admin/biography-runs','GET',admin.cookie)).status,403); assert.equal((await request('/me','GET',admin.cookie)).body.user.role,'user');
      await fixtures.query("UPDATE users SET role='admin' WHERE id=$1",[admin.id]); assert.equal((await request('/admin/biography-runs','GET',admin.cookie)).status,200);
    });
    await t.test('Deleting an account revokes all its sessions',async () => {
      const removed = await register('deleted@example.test'); await fixtures.query('DELETE FROM users WHERE id=$1',[removed.id]); assert.equal((await request('/me','GET',removed.cookie)).status,401);
    });
    await t.test('Cross-origin changes cannot write user or administrator data',async () => {
      for (const [cookie,path,method,body] of [[a.cookie,'/me/follows/'+artistB,'PUT',{}],[admin.cookie,'/admin/artists/'+artistA,'PATCH',{ name: 'CROSS-ORIGIN' }],[a.cookie,'/auth/logout','POST',{}]] as const) assert.equal((await request(path,method,cookie,body,{ origin: 'https://untrusted.example' })).status,403);
      assert.equal((await request('/artists/fixture-a')).body.name,'Fixture A updated'); assert.equal((await request('/me','GET',a.cookie)).status,200); assert.deepEqual((await request('/me','GET',a.cookie)).body.follows.map((r: { id: string }) => r.id),[artistA]);
    });
    await t.test('Production cookies have the Secure flag',async () => {
      const before=process.env.NODE_ENV;
      try { process.env.NODE_ENV='production'; const result=await request('/auth/login','POST',undefined,{ email: 'user-a@example.test',password: 'fixture-password-123' }); assert.match(result.headers.get('set-cookie') || '',/; Secure/i); }
      finally { if (before===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=before; }
    });
    await t.test('Chat does not release personalized answers after its session expires during model inference',async () => {
      const active = await register('during-chat@example.test'); await request('/me/follows/'+artistA,'PUT',active.cookie);
      duringModel=() => expire(active.cookie);
      try { assert.equal((await request('/chat','POST',active.cookie,{ message: 'แนะนำงานที่ติดตาม' })).status,401); }
      finally { duringModel=undefined; }
    });
    await t.test('Trip calculations cannot save after the session expires while waiting for a provider',async () => {
      const active = await register('during-trip@example.test');
      const realFetch = globalThis.fetch;
      const mocked = t.mock.method(globalThis,'fetch',async (input: string | URL | Request,init?: RequestInit) => {
        if (String(input).startsWith('https://routes.googleapis.com/')) { await expire(active.cookie); return Response.json({ routes: [{ distanceMeters: 100000 }] }); }
        return realFetch(input,init);
      });
      const googleBefore = { enabled: config.googleRoutesEnabled,key: config.googleRoutesKey };
      Object.assign(config,{ googleRoutesEnabled: true,googleRoutesKey: 'fixture-only' });
      try { assert.equal((await request('/trip-estimates','POST',active.cookie,{ concertId: showA,origin: 'เชียงใหม่',save: true })).status,401); }
      finally { mocked.mock.restore(); Object.assign(config,{ googleRoutesEnabled: googleBefore.enabled,googleRoutesKey: googleBefore.key }); }
      const login = await request('/auth/login','POST',undefined,{ email: 'during-trip@example.test',password: 'fixture-password-123' });
      assert.equal((await request('/me/trip-budgets/'+showA,'GET',login.headers.get('set-cookie')!.split(';')[0])).status,404);
    });
  } finally {
    Object.assign(config,savedConfig);
    server.close(); server.closeAllConnections(); await once(server,'close'); modelServer.close(); modelServer.closeAllConnections(); await once(modelServer,'close');
    await fixtures.end(); if (/^authorization_[a-f0-9]{32}$/.test(schema)) await setup.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'); await setup.end(); await pool.end();
  }
});
