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

test('Instagram sync prioritizes unread artists, stops on rate limit and isolates a selected artist', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async (t) => {
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
    t.mock.method(console, 'error', () => {});
    for (const [slug, success, verified] of [['new-artist', null, true], ['old-artist', '2026-01-01', true], ['deferred-artist', '2026-02-01', true], ['unverified-artist', null, false]] as const) {
      const id = (await client.query('INSERT INTO artists(slug,name,kind) VALUES($1,$1,\'solo\') RETURNING id', [slug])).rows[0].id;
      await client.query(`INSERT INTO social_accounts(artist_id,platform,handle,url,verified_at,last_success_at,last_checked_at)
        VALUES($1,'instagram',$2,$3,CASE WHEN $4 THEN now() ELSE NULL END,$5,'2026-02-01')`, [id, slug.replaceAll('-', '_'), 'https://www.instagram.com/' + slug.replaceAll('-', '_') + '/', verified, success]);
      await client.query('INSERT INTO news_items(artist_id,platform,source_url,body) VALUES($1,\'instagram\',$2,\'previous post\')', [id, 'https://www.instagram.com/p/previous_' + slug + '/']);
    }
    let limited = true;
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: URL) => {
      const handle = url.searchParams.get('fields')!.match(/username\(([^)]+)\)/)![1];
      requests.push(handle);
      if (limited && handle === 'old_artist') return new Response(JSON.stringify({ error: { code: 4 } }), { status: 403 });
      return new Response(JSON.stringify({ business_discovery: { id: '456', username: handle, media: { data: [
        { id: 'post_' + handle, media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/' + handle + '/', media_url: 'https://example.com/photo.jpg' },
      ] } } }));
    });
    await syncNews({ platform: 'instagram' });
    assert.deepEqual(requests, ['new_artist', 'old_artist']);
    const states = (await client.query('SELECT handle,last_checked_at,last_error FROM social_accounts ORDER BY handle')).rows;
    assert.match(states.find(s => s.handle === 'deferred_artist').last_error, /deferred.*rate limit/);
    assert.equal(states.find(s => s.handle === 'deferred_artist').last_checked_at.toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal((await client.query('SELECT count(*)::int AS total FROM news_items')).rows[0].total, 5);
    assert.match((await client.query("SELECT last_error FROM source_state WHERE source_name='INSTAGRAM'")).rows[0].last_error, /1\/3 accounts read/);
    assert.equal((await client.query('SELECT count(*)::int AS total FROM source_state')).rows[0].total, 1);
    limited = false;
    await syncNews({ platform: 'instagram', artistSlug: 'deferred-artist' });
    assert.deepEqual(requests, ['new_artist', 'old_artist', 'deferred_artist']);
    const posts = (await client.query("SELECT a.slug FROM news_items n JOIN artists a ON a.id=n.artist_id WHERE n.source_url='https://www.instagram.com/p/deferred_artist/'")).rows;
    assert.deepEqual(posts, [{ slug: 'deferred-artist' }]);
  } finally {
    t.mock.restoreAll();
    Object.assign(config, before);
    await client.query('ROLLBACK');
    await client.end();
    await pool.end();
  }
});
