import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';
import { pool } from './db.js';
import { InstagramGraphError, instagramBusinessPosts, syncNews } from './ingest.js';

test('Instagram Business Discovery validates identity and reports safe API failures', async (t) => {
  const before = { instagramGraphToken: config.instagramGraphToken, instagramGraphUserId: config.instagramGraphUserId, instagramGraphTokenExpiresAt: config.instagramGraphTokenExpiresAt };
  Object.assign(config, { instagramGraphToken: 'fixture-token', instagramGraphUserId: '123', instagramGraphTokenExpiresAt: '' });
  t.after(() => { Object.assign(config, before); t.mock.restoreAll(); });
  let calls = 0;
  let payload: unknown = { business_discovery: { id: '456', username: 'artist_one', media: { data: [
    { id: 'post', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/Test/' },
    { id: 'story', media_type: 'VIDEO', media_product_type: 'STORY' },
  ] } } };
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    calls++;
    assert.equal(input.hostname, 'graph.facebook.com');
    assert.equal(input.searchParams.has('access_token'), false);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fixture-token');
    return new Response(JSON.stringify(payload), { status });
  });
  assert.deepEqual((await instagramBusinessPosts('@Artist_One')).map(post => post.id), ['post']);
  await assert.rejects(instagramBusinessPosts('artist_one){id}'), /username is invalid/);
  assert.equal(calls, 1);
  payload = { business_discovery: { id: '789', username: 'another_artist', media: { data: [] } } };
  await assert.rejects(instagramBusinessPosts('artist_one'), /account unavailable/);
  payload = { business_discovery: { id: '456', username: 'artist_one', media: { data: [] } } };
  assert.deepEqual(await instagramBusinessPosts('artist_one'), []);
  status = 400;
  payload = { error: { code: 100, error_subcode: 2207013, message: 'secret fixture-token must not be logged' } };
  await assert.rejects(instagramBusinessPosts('artist_one'), { message: 'Instagram Graph HTTP 400 (codes 100/2207013)' });
  status = 403;
  payload = { error: { code: 4, message: 'Application request limit reached' } };
  await assert.rejects(instagramBusinessPosts('artist_one'), error => error instanceof InstagramGraphError && error.rateLimited);
  config.instagramGraphTokenExpiresAt = '2000-01-01T00:00:00Z';
  const lastCalls = calls;
  await assert.rejects(instagramBusinessPosts('artist_one'), /token expired/);
  assert.equal(calls, lastCalls);
});

test('Instagram ingestion keeps durable cadence, usage cooldown and media across worker restarts', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async (t) => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  const before = { instagramGraphToken: config.instagramGraphToken, instagramGraphUserId: config.instagramGraphUserId, instagramGraphTokenExpiresAt: config.instagramGraphTokenExpiresAt };
  Object.assign(config, { instagramGraphToken: 'fixture-token', instagramGraphUserId: '123', instagramGraphTokenExpiresAt: '' });
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA instagram_sync_fixture');
    await client.query('SET LOCAL search_path TO instagram_sync_fixture, public');
    const dir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file, dir), 'utf8'));
    t.mock.method(pool, 'query', (sql: string, params: unknown[]) => client.query(sql, params));
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));
    let fields: string[] = [];
    let failMedia = false, failProbe = false, highUsage = false, changed = false;
    const reset = async () => {
      fields = []; failMedia = false; failProbe = false; highUsage = false; changed = false;
      await client.query('TRUNCATE artists CASCADE');
      await client.query('TRUNCATE sync_runs');
      await client.query('DELETE FROM source_state');
      await client.query("UPDATE instagram_sync_budget SET last_request_at=NULL,next_request_at=NULL,paused_until=NULL,pause_reason=NULL,usage='{}',usage_checked_at=NULL,consecutive_limits=0");
    };
    const add = async (slug: string, known = true) => {
      const id = (await client.query("INSERT INTO artists(slug,name,kind) VALUES($1,$1,'solo') RETURNING id", [slug])).rows[0].id;
      await client.query(`INSERT INTO social_accounts(artist_id,platform,handle,url,verified_at,last_success_at,last_media_refresh_at)
        VALUES($1,'instagram',$2,$3,now(),now()-interval '2 hours',now())`, [id,slug.replaceAll('-','_'),'https://www.instagram.com/' + slug + '/']);
      if (known) await client.query(`INSERT INTO news_items(artist_id,platform,source_url,external_id,body,image_url,media_items)
        VALUES($1,'instagram',$2,'post','stable','https://example.com/old.jpg','[{"type":"image","url":"https://example.com/old.jpg","thumbnailUrl":null}]')`, [id,'https://www.instagram.com/p/' + slug.replaceAll('-','_') + '/']);
      return id;
    };
    t.mock.method(globalThis, 'fetch', async (url: URL) => {
      const requested = url.searchParams.get('fields')!;
      fields.push(requested);
      const handle = requested.match(/username\(([^)]+)\)/)![1];
      const media = requested.includes('children.limit');
      if ((!media && failProbe) || (media && failMedia)) return new Response('{"error":{"code":4,"message":"private fixture-token"}}', { status: 403,headers: { 'retry-after': '7200' } });
      const post = { id: 'post',caption: changed ? 'changed' : 'stable',media_type: 'IMAGE',media_product_type: 'FEED',permalink: 'https://www.instagram.com/p/' + handle + '/',timestamp: '2026-10-03T12:00:00Z',...(media ? { media_url: 'https://example.com/new.jpg' } : {}) };
      return new Response(JSON.stringify({ business_discovery: { id: '456',username: handle,media: { data: [post] } } }), { headers: { 'x-app-usage': JSON.stringify({ call_count: 5,total_time: highUsage ? 95 : 10,total_cputime: 3 }) } });
    });
    await t.test('restart and manual sync inside spacing or account interval make no extra calls', async () => {
      await reset(); await add('artist-one'); await add('artist-two');
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,1); assert.ok(!fields[0].includes('children'));
      // No in-memory timestamp exists: another invocation simulates a fresh worker.
      assert.equal(await syncNews({ platform: 'instagram' }),0);
      assert.equal(await syncNews({ platform: 'instagram',artistSlug: 'artist-two' }),0);
      assert.equal(fields.length,1);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({ platform: 'instagram',artistSlug: 'artist-one' }),0);
      assert.equal(await syncNews({ platform: 'instagram',artistSlug: 'artist-two' }),1);
      assert.equal(fields.length,2);
      assert.ok(fields[1].includes('artist_two'));
      const stored = (await client.query("SELECT image_url,media_items FROM news_items ORDER BY source_url")).rows;
      assert.ok(stored.every(row => row.image_url === 'https://example.com/old.jpg' && row.media_items[0].url === 'https://example.com/old.jpg'));
    });
    await t.test('new posts request media once, retain old news and record actual request counts', async () => {
      await reset(); await add('artist-one',false);
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,2); assert.ok(!fields[0].includes('media_url')); assert.ok(fields[1].includes('children.limit(20)'));
      const run = (await client.query('SELECT status,items_seen,items_changed,metrics FROM sync_runs')).rows[0];
      assert.equal(run.status,'success'); assert.equal(run.metrics.requests,2); assert.equal(run.items_changed,1);
      const stored = (await client.query('SELECT image_url FROM news_items')).rows[0];
      assert.equal(stored.image_url,'https://example.com/new.jpg');
    });
    await t.test('high processing usage pauses across invocations and does not request media', async () => {
      await reset(); await add('artist-one',false); highUsage = true;
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,1);
      assert.equal((await client.query('SELECT status FROM sync_runs')).rows[0].status,'partial');
      assert.equal(await syncNews({ platform: 'instagram' }),0);
      assert.equal(await syncNews({ platform: 'instagram',artistSlug: 'artist-one' }),0);
      const budget = (await client.query("SELECT usage,paused_until>=now()+interval '59 minutes' AS paused FROM instagram_sync_budget")).rows[0];
      assert.equal(budget.paused,true); assert.equal(budget.usage.totalTime,95);
      assert.equal(fields.length,1);
    });
    await t.test('rate limit during media retains successful probe counts and old media', async () => {
      await reset(); await add('artist-one'); changed = true; failMedia = true;
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      const row = (await client.query('SELECT body,image_url FROM news_items')).rows[0];
      assert.equal(row.body,'changed'); assert.equal(row.image_url,'https://example.com/old.jpg');
      const run = (await client.query('SELECT status,items_seen,metrics,error FROM sync_runs')).rows[0];
      assert.equal(run.status,'partial'); assert.equal(run.items_seen,1); assert.equal(run.metrics.requests,2);
      assert.ok(!run.error.includes('fixture-token'));
      const budget = (await client.query("SELECT paused_until>=now()+interval '119 minutes' AS paused FROM instagram_sync_budget")).rows[0];
      assert.equal(budget.paused,true);
      await syncNews({ platform: 'instagram' }); assert.equal(fields.length,2);
    });
    await t.test('expired CDN refresh is scheduled even without new posts', async () => {
      await reset(); await add('artist-one');
      await client.query("UPDATE social_accounts SET last_media_refresh_at=now()-interval '7 hours'");
      await syncNews({ platform: 'instagram' });
      assert.equal(fields.length,2);
      assert.equal((await client.query('SELECT image_url FROM news_items')).rows[0].image_url,'https://example.com/new.jpg');
    });
    await t.test('probe rate limit stops reads, leaves other account times and all existing news intact', async () => {
      await reset(); await add('artist-one'); await add('artist-two'); failProbe = true;
      await syncNews({ platform: 'instagram' });
      await syncNews({ platform: 'instagram' });
      assert.equal(fields.length,1);
      assert.equal((await client.query('SELECT count(*)::int n FROM news_items')).rows[0].n,2);
      const untouched = (await client.query("SELECT last_checked_at,next_sync_at FROM social_accounts WHERE handle='artist_two'")).rows[0];
      assert.equal(untouched.last_checked_at,null); assert.equal(untouched.next_sync_at,null);
      assert.equal((await client.query('SELECT metrics FROM sync_runs')).rows[0].metrics.requests,1);
    });
    await t.test('session lock prevents concurrent workers and manual sync from duplicating a request', async () => {
      await reset(); await add('artist-one');
      const competitor = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
      await competitor.connect();
      try {
        await competitor.query('SELECT pg_advisory_lock(6210418)');
        await syncNews({ platform: 'instagram' });
        assert.equal(fields.length,0);
      } finally { await competitor.query('SELECT pg_advisory_unlock_all()'); await competitor.end(); }
      await syncNews({ platform: 'instagram' }); assert.equal(fields.length,1);
    });
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()');
    t.mock.restoreAll(); Object.assign(config,before);
    await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
