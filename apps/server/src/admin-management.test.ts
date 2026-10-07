import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import test from 'node:test';
import { createApp } from './app.js';
import { pool } from './db.js';
import { accountInput } from './admin-management.js';
import { seedArtistAccounts, seedArtistBiography } from './artist-seed.js';
import { applyArtistAudit } from './artist-audit.js';
import { curatedArtistProfiles } from './artist-profiles.js';
import { newsUpsertSql } from './social-media.js';

test('Social links validate profiles, platforms and credentials',() => {
  for (const input of [
    { platform: 'instagram',url: 'https://instagram.com/p/123' },{ platform: 'instagram',url: 'https://evil.com/person' },
    { platform: 'x',url: 'https://x.com/person/status/1' },{ platform: 'instagram',url: 'https://secret:token@instagram.com/person' },
    { platform: 'website',url: 'https://127.0.0.1/' },{ platform: 'tiktok',url: 'https://tiktok.com/@name/video/123' },
    { platform: 'youtube',url: 'https://youtube.com/watch?v=123' },
  ]) assert.throws(() => accountInput(input));
  const account = accountInput({ platform: 'instagram',url: 'https://instagram.com/Fixture?utm=test',verified: false });
  assert.equal(account.url,'https://www.instagram.com/fixture/'); assert.equal(account.handle,'fixture'); assert.equal(account.verified,false);
});
test('Admin management uses real HTTP, sessions and an isolated PostgreSQL schema',{ skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  if (!url.pathname.startsWith('/encore_ingest_test')) throw Error('Management tests need an isolated database');
  const schema = 'admin_management_'+randomUUID().replaceAll('-',''), setup = new pg.Client({ connectionString: url.href }); await setup.connect();
  const db = new pg.Pool({ connectionString: url.href,options: '-c search_path='+schema+',public' });
  const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = 'http://127.0.0.1:'+(server.address() as { port: number }).port;
  const request = async (path: string,method='GET',cookie?: string,body?: unknown) => {
    const response = await fetch(origin+'/api'+path,{ method,headers: { 'content-type': 'application/json',...(cookie ? { cookie } : {}) },...(body===undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status,body: await response.json(),headers: response.headers };
  };
  try {
    await setup.query('CREATE SCHEMA '+schema); await setup.query('SET search_path TO '+schema+',public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => db.query(sql,params)); t.mock.method(pool,'connect',() => db.connect());
    const session = async (role: string,expired=false) => {
      const user = (await db.query("INSERT INTO users(email,display_name,password_hash,role) VALUES($1,'fixture','unused',$2) RETURNING id",[randomUUID()+'@example.test',role])).rows[0];
      const token = randomUUID(); await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3::interval)",[createHash('sha256').update(token).digest('hex'),user.id,expired ? '-1 second' : '1 hour']);
      return { id: user.id as string,cookie: 'artist_session='+token };
    };
    const admin = await session('admin'),user = await session('user'),expired = await session('admin',true);
    const band = (await db.query("INSERT INTO artists(slug,name,kind) VALUES('fixture-band','Fixture band','band') RETURNING id")).rows[0].id;
    const member = (await db.query("INSERT INTO artists(slug,name,kind) VALUES('fixture-member','Fixture member','member') RETURNING id")).rows[0].id;
    const accountId = (await db.query("INSERT INTO social_accounts(artist_id,platform,url) VALUES($1,'instagram','https://www.instagram.com/member/') RETURNING id",[member])).rows[0].id;
    const newsId = (await db.query("INSERT INTO news_items(artist_id,platform,source_url,body) VALUES($1,'instagram','https://www.instagram.com/p/fixture/','ข่าวเก็บไว้') RETURNING id",[member])).rows[0].id;
    const concertId = (await db.query("INSERT INTO concerts(slug,title) VALUES('fixture-concert','Fixture show') RETURNING id")).rows[0].id;
    const performanceId = (await db.query("INSERT INTO concert_performances(concert_id,starts_at) VALUES($1,'2099-01-01T12:00Z') RETURNING id",[concertId])).rows[0].id;
    const endpoints: [string,string,unknown?][] = [
      ['GET','/admin/overview'],['GET',`/admin/artists/${member}/accounts`],['PATCH',`/admin/artists/${member}/accounts/${accountId}`,{ verified: true }],
      ['DELETE',`/admin/artists/${member}/accounts/${accountId}`],['DELETE',`/admin/artists/${band}/members/${member}`],['DELETE',`/admin/artists/${member}/sources`,{ url: 'https://example.org/source' }],
      ['DELETE',`/admin/concerts/${concertId}/artists/${member}`],['PATCH',`/admin/concerts/${concertId}/performances/${performanceId}`,{ status: 'cancelled' }],
      ['GET','/admin/news'],['PATCH',`/admin/news/${newsId}`,{ hidden: true }],['GET','/admin/users'],['PATCH',`/admin/users/${user.id}/role`,{ role: 'admin' }],['DELETE',`/admin/users/${user.id}/sessions`],
    ];
    for (const [method,path,body] of endpoints) await t.test(method+' '+path+' rejects guest, normal user and expired admin',async () => {
      for (const [cookie,status] of [[undefined,401],[user.cookie,403],[expired.cookie,401]] as const) {
        const result = await request(path,method,cookie,body); assert.equal(result.status,status); assert.match(result.headers.get('cache-control') || '',/no-store/);
      }
    });
    await t.test('Name and social links create an unverified profile atomically; duplicate and invalid writes leave no rows',async () => {
      const body = { name: 'ศิลปินใหม่',accounts: [{ platform: 'instagram',url: 'https://instagram.com/new_artist/' },{ platform: 'youtube',url: 'https://youtube.com/@newartist' }] };
      const created = await request('/admin/artists','POST',admin.cookie,body); assert.equal(created.status,201); assert.equal(created.body.slug,'new-artist'); assert.equal(created.body.kind,'solo'); assert.equal(created.body.verified_at,null);
      assert.equal(created.body.biography_manual_override,false);
      assert.equal((await request('/artists/'+created.body.slug)).body.accounts.length,0);
      const accounts = (await request('/admin/artists/'+created.body.id+'/accounts','GET',admin.cookie)).body.items;
      assert.equal(accounts.length,2); assert.ok(accounts.every((row: { verified_at: unknown }) => row.verified_at===null));
      const before = (await db.query('SELECT count(*)::int n FROM artists')).rows[0].n;
      assert.equal((await request('/admin/artists','POST',admin.cookie,body)).status,409);
      assert.equal((await request('/admin/artists','POST',admin.cookie,{ ...body,name: 'Different name' })).status,409);
      assert.equal((await request('/admin/artists','POST',admin.cookie,{ name: 'Invalid fixture',accounts: [...body.accounts,{ platform: 'x',url: 'https://wrong.com/user' }] })).status,400);
      assert.equal((await db.query('SELECT count(*)::int n FROM artists')).rows[0].n,before);
      const sameName = await Promise.all([1,2].map(() => request('/admin/artists','POST',admin.cookie,{ name: 'Concurrent fixture' })));
      assert.deepEqual(sameName.map(row => row.status).sort(),[201,409]);
      const minimal = await request('/admin/artists','POST',admin.cookie,{ name: 'ชื่อภาษาไทยล้วน' }); assert.equal(minimal.status,201); assert.match(minimal.body.slug,/^artist-[a-f0-9]{8}$/);
    });
    await t.test('Verification is explicit; account edits are scoped and do not mark biography as verified',async () => {
      assert.equal((await request(`/admin/artists/${member}/accounts/${accountId}`,'PATCH',admin.cookie,{ verified: true })).status,200);
      assert.equal((await request('/artists/fixture-member')).body.accounts.length,1);
      assert.equal((await request(`/admin/artists/${band}/accounts/${accountId}`,'PATCH',admin.cookie,{ verified: false })).status,404);
      assert.equal((await request(`/admin/artists/${member}`,'PATCH',admin.cookie,{ nameEn: 'English name',genres: ['Pop'] })).status,200);
      assert.equal((await request('/artists/fixture-member')).body.verified_at,null);
      assert.equal((await request(`/admin/artists/${member}/accounts/${accountId}`,'PATCH',admin.cookie,{ url: 'https://instagram.com/new_member/',verified: false })).status,200);
      assert.equal((await request('/artists/fixture-member')).body.accounts.length,0);
    });
    await t.test('Band membership validates kinds and supports removing a relationship without removing the artist',async () => {
      assert.equal((await request(`/admin/artists/${member}/members/${band}`,'PUT',admin.cookie)).status,400);
      assert.equal((await request(`/admin/artists/${band}/members/${member}`,'PUT',admin.cookie)).status,200);
      assert.equal((await request(`/admin/artists/${band}`,'PATCH',admin.cookie,{ kind: 'solo' })).status,400);
      assert.equal((await request('/artists/fixture-band')).body.members.length,1);
      assert.equal((await request(`/admin/artists/${band}/members/${member}`,'DELETE',admin.cookie)).status,200);
      assert.equal((await request('/artists/fixture-band')).body.members.length,0); assert.equal((await request('/artists/fixture-member')).status,200);
    });
    await t.test('Removed accounts and sources stay removed when seed and dated evidence run again',async () => {
      const profile = curatedArtistProfiles.find(profile => profile.slug==='aheye-4eve')!;
      const artistId = (await db.query('INSERT INTO artists(slug,name,kind) VALUES($1,$2,$3) RETURNING id',[profile.slug,'Aheye fixture','member'])).rows[0].id;
      const client = await db.connect();
      try { await client.query('BEGIN'); await seedArtistBiography(client,profile); await seedArtistAccounts(client,profile); await applyArtistAudit(client); await client.query('COMMIT'); } finally { client.release(); }
      const account = (await request(`/admin/artists/${artistId}/accounts`,'GET',admin.cookie)).body.items[0]; assert.ok(account);
      assert.equal((await request(`/admin/artists/${artistId}/accounts/${account.id}`,'DELETE',admin.cookie)).status,200);
      const detail = (await request('/artists/'+profile.slug)).body, source = detail.sources[0]; assert.ok(source);
      assert.equal((await request(`/admin/artists/${artistId}/sources`,'DELETE',admin.cookie,{ url: source.source_url })).status,200);
      const after = await db.connect();
      try { await after.query('BEGIN'); await seedArtistBiography(after,profile); await seedArtistAccounts(after,profile); await applyArtistAudit(after); await after.query('COMMIT'); } finally { after.release(); }
      const accounts = (await request(`/admin/artists/${artistId}/accounts`,'GET',admin.cookie)).body.items;
      assert.ok(!accounts.some((row: { id: string; url: string }) => row.id===account.id || row.url===account.url));
      assert.ok(!(await request('/artists/'+profile.slug)).body.sources.some((row: { source_url: string }) => row.source_url===source.source_url));
    });
    await t.test('News can be hidden and restored without deletion; source refresh retains moderation',async () => {
      assert.equal((await request(`/admin/news/${newsId}`,'PATCH',admin.cookie,{ hidden: true })).status,200);
      assert.equal((await request('/news')).body.total,0); assert.equal((await request('/admin/news','GET',admin.cookie)).body.total,1);
      await db.query(newsUpsertSql,[member,'instagram','https://www.instagram.com/p/fixture/',null,'อัปเดตข้อความ',null,null,'[]']);
      assert.equal((await request('/news')).body.total,0); assert.equal((await db.query('SELECT body,hidden FROM news_items WHERE id=$1',[newsId])).rows[0].body,'อัปเดตข้อความ');
      assert.equal((await request(`/admin/news/${newsId}`,'PATCH',admin.cookie,{ hidden: false })).status,200); assert.equal((await request('/news')).body.total,1);
    });
    await t.test('Concert creation and changes validate prices, dates and edit versions; schedule history is retained',async () => {
      const body = { title: 'งานทดสอบไทย',startsAt: '2099-02-01T12:00:00Z',priceMin: null,priceMax: null };
      const created = await request('/admin/concerts','POST',admin.cookie,body); assert.equal(created.status,201); assert.equal(created.body.price_min,null);
      const path = '/admin/concerts/'+created.body.id, detail = '/concerts/'+created.body.slug;
      const before = (await request(detail)).body; assert.equal(before.performances.length,1);
      for (const invalid of [{ priceMin: -1 },{ priceMin: 100,priceMax: 50 },{ endsAt: '2099-01-01T12:00Z' },{ startsAt: '2099-02-01T19:00' },{ status: 'invalid' },{ officialUrl: 'javascript:alert(1)' }]) assert.equal((await request(path,'PATCH',admin.cookie,invalid)).status,400);
      assert.equal((await request(path,'PATCH',admin.cookie,{ status: 'cancelled',editVersion: before.edit_version })).status,200);
      assert.equal((await request(detail)).body.performances[0].status,'cancelled');
      assert.equal((await request(path,'PATCH',admin.cookie,{ title: 'Stale update',editVersion: before.edit_version })).status,409);
      const round = before.performances[0].id;
      assert.equal((await request(path+'/performances/'+round,'PATCH',admin.cookie,{ isCurrent: false,status: 'postponed' })).status,200);
      assert.equal((await request(path+'/performances','POST',admin.cookie,{ startsAt: '2099-03-01T12:00Z',label: 'รอบใหม่' })).status,201);
      const saved = (await request(detail)).body; assert.equal(saved.performances.length,2); assert.equal(saved.starts_at,'2099-03-01T12:00:00.000Z'); assert.equal(saved.performances.filter((row: { is_current: boolean }) => row.is_current).length,1);
      assert.equal((await request(path+'/artists/'+member,'PUT',admin.cookie)).status,200); assert.equal((await request(path+'/artists/'+member,'DELETE',admin.cookie)).status,200);
      assert.equal((await request(detail)).body.artists.length,0);
    });
    await t.test('User listing excludes secrets; role changes and session revocation take immediate effect',async () => {
      const listed = await request('/admin/users','GET',admin.cookie); assert.equal(listed.status,200); assert.ok(!JSON.stringify(listed.body).includes('password_hash')); assert.ok(!JSON.stringify(listed.body).includes('token_hash'));
      assert.equal((await request(`/admin/users/${admin.id}/role`,'PATCH',admin.cookie,{ role: 'user' })).status,400);
      assert.equal((await request(`/admin/users/${user.id}/role`,'PATCH',admin.cookie,{ role: 'admin' })).status,200);
      assert.equal((await request('/me','GET',user.cookie)).status,401);
      assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[user.id])).rows[0].role,'admin');
      const fresh = await session('user'); assert.equal((await request(`/admin/users/${fresh.id}/sessions`,'DELETE',admin.cookie)).status,200);
      assert.equal((await request('/me','GET',fresh.cookie)).status,401);
      assert.equal((await request('/admin/overview','GET',admin.cookie)).status,200);
    });
  } finally {
    server.close(); server.closeAllConnections(); await once(server,'close'); t.mock.restoreAll(); await db.end();
    await setup.query('DROP SCHEMA '+schema+' CASCADE'); await setup.end();
  }
});
