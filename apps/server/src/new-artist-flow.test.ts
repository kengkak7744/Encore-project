import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createApp } from './app.js';
import { pool } from './db.js';
import { config } from './config.js';
import { runBiographyCycle } from './biography-jobs.js';
import { syncNews } from './ingest.js';
import type { BiographySource } from './biography-policy.js';

test('new artist flows from administrator creation through scheduled biography, verified news and concurrent private chat', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  assert.match(url.pathname, /^\/encore_ingest_test[\w]*$/);
  const schema = 'artist_flow_' + randomUUID().replaceAll('-', '');
  const setup = new pg.Client({ connectionString: url.href });
  await setup.connect();
  const database = new pg.Pool({ connectionString: url.href, options: '-c search_path=' + schema + ',public' });
  const saved = { ...config };
  const nativeFetch = globalThis.fetch;
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing HTTP address');
  const origin = 'http://127.0.0.1:' + address.port;
  const cookies: Record<string, string> = {};
  let releaseDraftStarted!: () => void;
  const draftStarted = new Promise<void>(resolve => { releaseDraftStarted = resolve; });
  let firstDraft = true;
  const quote = 'Flow Band เป็นวงตัวอย่างสำหรับการทดสอบระบบในฐานข้อมูลแยก สมาชิกทำงานดนตรีร่วมกันและเผยแพร่ผลงานผ่านบัญชีทางการของวง ข้อมูลในข้อความนี้ใช้ตรวจเส้นทางการทำประวัติและการอ้างอิงเท่านั้น';
  const documents: BiographySource[] = [{ id: 'source-1', url: 'https://example.org/flow-band', label: 'Fixture artist source', text: quote, fetchedAt: '2026-10-07T16:00:00Z' }];
  let artist: { id: string; slug: string }, accountId: string;
  try {
    await setup.query('CREATE SCHEMA ' + schema); await setup.query('SET search_path TO ' + schema + ',public');
    const dir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(file, dir), 'utf8'));
    t.mock.method(pool, 'query', (sql: string, params: unknown[]) => database.query(sql, params));
    t.mock.method(pool, 'connect', () => database.connect());
    Object.assign(config, { biographyEnabled: true, biographyWindowStart: '23:00', biographyWindowEnd: '00:00', ollamaQuietMs: 0, instagramGraphToken: 'fixture-only', instagramGraphUserId: '123', instagramGraphTokenExpiresAt: '' });
    for (const role of ['admin', 'fan-a', 'fan-b', 'fan-c']) {
      const token = randomUUID();
      const user = (await database.query('INSERT INTO users(email,display_name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id', [role + '@example.test', role, 'session-fixture', role === 'admin' ? 'admin' : 'user'])).rows[0];
      await database.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), user.id]);
      cookies[role] = 'artist_session=' + token;
    }
    const request = async (path: string, method = 'GET', role = '', body?: unknown) => {
      const response = await nativeFetch(origin + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(role ? { cookie: cookies[role] } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const graphCalls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const uri = new URL(String(input));
      if (uri.origin === origin) return nativeFetch(input, init);
      if (uri.hostname === 'graph.facebook.com') {
        const fields = uri.searchParams.get('fields') || ''; graphCalls.push(fields);
        assert.ok(fields.includes('username(flow_band)'));
        return new Response(JSON.stringify({ business_discovery: { id: '456', username: 'flow_band', media: { data: [{ id: 'flow-post', caption: 'โพสต์จากบัญชีวงสำหรับทดสอบในฐานแยก', timestamp: '2026-10-07T15:00:00Z', permalink: 'https://www.instagram.com/p/FlowFixture/', media_type: 'IMAGE', media_product_type: 'FEED', ...(fields.includes('children.limit') ? { media_url: 'https://example.org/fixture-photo.jpg' } : {}) }] } } }), { headers: { 'x-app-usage': '{"call_count":5,"total_time":10,"total_cputime":0}' } });
      }
      if (uri.origin === config.ollamaUrl || uri.origin === config.biographyOllamaUrl) {
        if (uri.pathname === '/api/ps') return new Response('{"models":[]}');
        if (uri.pathname === '/api/generate') return new Response('{}');
        assert.equal(uri.pathname, '/api/chat');
        const body = JSON.parse(String(init?.body));
        if (body.model === config.chatModel) {
          const question = body.messages[1].content as string;
          return new Response(JSON.stringify({ message: { content: JSON.stringify({ intent: question.startsWith('ข่าว') ? 'news' : question.startsWith('คอนเสิร์ต') ? 'concerts' : 'recommendations', artist: question.startsWith('แนะนำ') ? null : 'Flow Band', city: null, month: null, year: null }) } }));
        }
        assert.equal(body.model, config.biographyModel);
        if (firstDraft) {
          firstDraft = false; releaseDraftStarted();
          // Hold the first external inference until the actual queue cancels it for chat.
          await new Promise<void>((_resolve, reject) => {
            const signal = init!.signal!;
            if (signal.aborted) reject(signal.reason);
            else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        }
        const input = JSON.parse(body.messages[1].content);
        const result = body.messages[0].content.startsWith('ตรวจประวัติ')
          ? { identityMatches: true, reason: 'Fixture evidence supports all three sections', checks: [{ index: 0, supported: true, reason: 'Supported' }, { index: 1, supported: true, reason: 'Supported' }, { index: 2, supported: true, reason: 'Supported' }] }
          : { identityMatches: true, reason: 'Matching fixture artist', sections: ['ข้อมูลวง', 'การทำงานดนตรี', 'ช่องทางเผยแพร่'].map(heading => ({ heading, body: quote, sourceId: input.sources[0].id, evidenceIds: ['source-1:1'] })) };
        return new Response(JSON.stringify({ message: { content: JSON.stringify(result) } }));
      }
      throw Error('Unexpected external request: ' + uri.origin);
    });
    await t.test('admin can create from name/social while guests/users cannot; no biography or verified badge is invented', async () => {
      const input = { name: 'Flow Band', kind: 'band', accounts: [{ platform: 'instagram', url: 'https://www.instagram.com/flow_band/' }] };
      assert.equal((await request('/admin/artists', 'POST', '', input)).status, 401);
      assert.equal((await request('/admin/artists', 'POST', 'fan-a', input)).status, 403);
      const created = await request('/admin/artists', 'POST', 'admin', input);
      assert.equal(created.status, 201); artist = created.body;
      assert.equal(artist.slug, 'flow-band');
      const profile = (await request('/artists/' + artist.slug)).body;
      assert.deepEqual(profile.biography, []); assert.deepEqual(profile.accounts, []); assert.equal(profile.verified_at, null); assert.equal(profile.bio, null); assert.equal(profile.image_url, null);
      accountId = (await request('/admin/artists/' + artist.id + '/accounts', 'GET', 'admin')).body.items[0].id;
    });
    await t.test('new biography remains unpublished before 23:00 and at midnight, without source/model requests', async () => {
      const forbid = async () => { throw Error('No source request outside the nightly window'); };
      for (const at of ['2026-10-07T15:59:59Z', '2026-10-07T17:00:00Z']) {
        assert.equal((await runBiographyCycle({ database, now: () => new Date(at), collect: forbid })).status, 'outside_window');
        assert.deepEqual((await request('/artists/' + artist.slug)).body.biography, []);
        assert.deepEqual((await request('/admin/biography-runs', 'GET', 'admin')).body.items, []);
      }
    });
    await t.test('unverified accounts do not fetch news; explicit verification enables automatic discovery and repeat reads respect cadence', async () => {
      assert.equal(await syncNews({ platform: 'instagram', artistSlug: artist.slug }), 0);
      assert.deepEqual(graphCalls, []); assert.equal((await request('/news?artistId=' + artist.id)).body.total, 0);
      assert.equal((await request('/admin/artists/' + artist.id + '/accounts/' + accountId, 'PATCH', 'admin', { verified: true })).status, 200);
      assert.equal(await syncNews({ platform: 'instagram', artistSlug: artist.slug }), 1);
      const news = (await request('/news?artistId=' + artist.id)).body;
      assert.equal(news.total, 1); assert.equal(news.items[0].source_url, 'https://www.instagram.com/p/FlowFixture/'); assert.equal(news.items[0].media_items[0].url, 'https://example.org/fixture-photo.jpg');
      const requests = graphCalls.length;
      assert.equal(await syncNews({ platform: 'instagram', artistSlug: artist.slug }), 0);
      assert.equal(graphCalls.length, requests); assert.equal((await request('/news?artistId=' + artist.id)).body.total, 1);
    });
    await t.test('23:00 biography resumes after three concurrent user chats and publishes Thai prose with the fetched source', { timeout: 90000 }, async () => {
      const concert = await request('/admin/concerts', 'POST', 'admin', { title: 'Flow Band isolated fixture concert', startsAt: '2099-01-01T12:00:00Z', priceMin: null, officialUrl: 'https://example.org/flow-concert' });
      assert.equal(concert.status, 201);
      assert.equal((await request('/admin/concerts/' + concert.body.id + '/artists/' + artist.id, 'PUT', 'admin')).status, 200);
      for (const fan of ['fan-a', 'fan-c']) assert.equal((await request('/me/follows/' + artist.id, 'PUT', fan)).status, 200);
      const cycle = runBiographyCycle({ database, now: () => new Date('2026-10-07T16:00:00Z'), signal: AbortSignal.timeout(85000), collect: async () => ({ documents, errors: [] }) });
      await Promise.race([draftStarted, new Promise<void>((_resolve, reject) => { const timer = setTimeout(() => reject(Error('Biography never reached the model')), 30000); timer.unref(); })]);
      const chats = await Promise.all(['fan-a', 'fan-b', 'fan-c'].map(async fan => ({ fan, ...await request('/chat', 'POST', fan, { message: 'แนะนำงานจากศิลปินที่ฉันติดตาม' }) })));
      const result = await cycle;
      for (const chat of chats) {
        assert.equal(chat.status, 200);
        if (chat.fan === 'fan-b') { assert.deepEqual(chat.body.sources, []); assert.ok(!chat.body.answer.includes('Flow Band isolated fixture concert')); }
        else { assert.ok(chat.body.answer.includes('Flow Band isolated fixture concert')); assert.deepEqual(chat.body.sources, ['https://example.org/flow-concert']); }
      }
      assert.equal(result.status, 'published');
      const profile = (await request('/artists/' + artist.slug)).body;
      assert.equal(profile.biography.length, 3);
      for (const section of profile.biography) { assert.equal(section.body, quote); assert.equal(section.source_url, 'https://example.org/flow-band'); assert.equal(section.generated_model, config.biographyModel); }
      const runs = (await request('/admin/biography-runs', 'GET', 'admin')).body.items;
      assert.equal(runs.length, 1); assert.equal(runs[0].status, 'published'); assert.deepEqual(runs[0].source_documents, documents);
      for (const section of runs[0].draft.sections) assert.deepEqual(section.evidence, [quote.normalize('NFKC')]);
    });
    await t.test('chat facts cite the admin concert URL and discovered news rather than inventing references', async () => {
      const news = await request('/chat', 'POST', 'fan-a', { message: 'ข่าว Flow Band ล่าสุด' });
      assert.equal(news.status, 200); assert.deepEqual(news.body.sources, ['https://www.instagram.com/p/FlowFixture/']);
      const concert = await request('/chat', 'POST', 'fan-a', { message: 'คอนเสิร์ต Flow Band จัดเมื่อไหร่' });
      assert.equal(concert.status, 200); assert.deepEqual(concert.body.sources, ['https://example.org/flow-concert']);
    });
    await t.test('published biographies are skipped on subsequent nights and an administrator can keep the biography intentionally empty', async () => {
      const forbid = async () => { throw Error('Existing or manually locked biographies must not contact external sources'); };
      assert.equal((await runBiographyCycle({ database, now: () => new Date('2026-10-08T16:01:00Z'), collect: forbid })).status, 'empty_queue');
      assert.equal((await request('/admin/artists/' + artist.id, 'PATCH', 'admin', { bio: null, biography: [] })).status, 200);
      assert.equal((await runBiographyCycle({ database, now: () => new Date('2026-10-09T16:01:00Z'), collect: forbid })).status, 'empty_queue');
      assert.deepEqual((await request('/artists/' + artist.slug)).body.biography, []);
    });
    await t.test('insufficient evidence for another new artist remains unavailable, without invented biography or model requests', async () => {
      const fresh = await request('/admin/artists', 'POST', 'admin', { name: 'No Evidence Artist' }); assert.equal(fresh.status, 201);
      const result = await runBiographyCycle({ database, now: () => new Date('2026-10-09T16:02:00Z'), collect: async () => ({ documents: [], errors: [{ url: 'https://example.org/unavailable', error: 'Source unavailable in fixture' }] }) });
      assert.equal(result.status, 'insufficient_sources');
      assert.deepEqual((await request('/artists/' + fresh.body.slug)).body.biography, []);
      const runs = (await request('/admin/biography-runs', 'GET', 'admin')).body.items;
      assert.equal(runs[0].status, 'insufficient_sources');
    });
  } finally {
    Object.assign(config, saved); t.mock.restoreAll();
    server.close(); server.closeAllConnections(); await once(server, 'close');
    await database.end(); await setup.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await setup.end(); await pool.end();
  }
});
