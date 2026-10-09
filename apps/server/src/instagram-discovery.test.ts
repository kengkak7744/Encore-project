import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';
import { pool } from './db.js';
import { InstagramGraphError, instagramBusinessPosts, syncNews } from './ingest.js';

test('Instagram Business Discovery validates identity and reports safe API failures', async (t) => {
  const before = { ...config };
  Object.assign(config, { instagramGraphToken: 'fixture-token', instagramGraphUserId: '123', instagramGraphTokenExpiresAt: '',
    instagramProbeLimit: 5,instagramRequestSpacingSeconds: 60,instagramMinSpacingSeconds: 30,instagramAdaptivePacingEnabled: true,
    instagramCheckIntervalMinutes: 45,instagramMediaMaxUsagePercent: 40 });
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
  const before = { ...config };
  Object.assign(config, { instagramGraphToken: 'fixture-token', instagramGraphUserId: '123', instagramGraphTokenExpiresAt: '',
    instagramProbeLimit: 5,instagramRequestSpacingSeconds: 60,instagramMinSpacingSeconds: 30,instagramAdaptivePacingEnabled: true,
    instagramCheckIntervalMinutes: 45,instagramMediaMaxUsagePercent: 40,instagramDetailMaxUsagePercent: 60 });
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA instagram_sync_fixture');
    await client.query('SET LOCAL search_path TO instagram_sync_fixture, public');
    const dir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file, dir), 'utf8'));
    t.mock.method(pool, 'query', (sql: string, params: unknown[]) => client.query(sql, params));
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));
    let fields: string[] = [];
    let failMedia = false, failProbe = false, highUsage = false, changed = false, emptyCaption = false, noMedia = false;
    let unavailableHandle = '', headerUsage = 10, missingHeaders = false;
    const reset = async () => {
      fields = []; failMedia = false; failProbe = false; highUsage = false; changed = false; emptyCaption = false; noMedia = false; unavailableHandle = ''; headerUsage = 10; missingHeaders = false;
      await client.query('TRUNCATE artists CASCADE');
      await client.query('TRUNCATE sync_runs');
      await client.query('DELETE FROM source_state');
      await client.query("UPDATE instagram_sync_budget SET last_request_at=NULL,next_request_at=NULL,paused_until=NULL,pause_reason=NULL,usage='{}',usage_checked_at=NULL,consecutive_limits=0,spacing_seconds=60,healthy_responses=0,checks_since_media=0");
    };
    const add = async (slug: string, known = true) => {
      const id = (await client.query("INSERT INTO artists(slug,name,kind) VALUES($1,$1,'solo') RETURNING id", [slug])).rows[0].id;
      await client.query(`INSERT INTO social_accounts(artist_id,platform,handle,url,verified_at,last_success_at,last_media_refresh_at)
        VALUES($1,'instagram',$2,$3,now(),now()-interval '2 hours',now())`, [id,slug.replaceAll('-','_'),'https://www.instagram.com/' + slug + '/']);
      if (known) await client.query(`INSERT INTO news_items(artist_id,platform,source_url,external_id,body,image_url,media_items,instagram_details_checked_at)
        VALUES($1,'instagram',$2,'post','stable','https://example.com/old.jpg','[{"type":"image","url":"https://example.com/old.jpg","thumbnailUrl":null}]',now())`, [id,'https://www.instagram.com/p/' + slug.replaceAll('-','_') + '/']);
      return id;
    };
    t.mock.method(globalThis, 'fetch', async (url: URL) => {
      const requested = url.searchParams.get('fields')!;
      fields.push(requested);
      const handle = requested.match(/username\(([^)]+)\)/)![1];
      const media = requested.includes('children.limit');
      const active=(await client.query("SELECT metrics FROM sync_runs WHERE source_name='INSTAGRAM' AND status='running' ORDER BY id DESC LIMIT 1")).rows[0];
      assert.equal(active.metrics.handle,handle); assert.equal(active.metrics.requests,1,'Request metering must survive a crash during fetch');
      assert.equal(active.metrics.mode,media ? 'media' : requested.includes('caption') ? 'detail' : 'discovery');
      if (!media && handle===unavailableHandle) return new Response('{"error":{"code":110,"error_subcode":2207013,"message":"private fixture-token"}}',
        {status:400,headers:{'x-app-usage':'{"call_count":5,"total_time":10,"total_cputime":0}'}});
      if ((!media && failProbe) || (media && failMedia)) return new Response('{"error":{"code":4,"message":"private fixture-token"}}', { status: 403,headers: { 'retry-after': '7200' } });
      const post = { id: 'post',...(requested.includes('caption') && !emptyCaption ? {caption: changed ? 'changed' : 'stable'} : {}),media_type: 'IMAGE',media_product_type: 'FEED',permalink: 'https://www.instagram.com/p/' + handle + '/',timestamp: '2026-10-03T12:00:00Z',...(media && !noMedia ? { media_url: 'https://example.com/new.jpg' } : {}) };
      return new Response(JSON.stringify({ business_discovery: { id: '456',username: handle,media: { data: [post] } } }), { headers: missingHeaders ? {} : { 'x-app-usage': JSON.stringify({ call_count: 5,total_time: highUsage ? 95 : headerUsage,total_cputime: 3 }) } });
    });
    await t.test('restart and manual sync inside spacing or account interval make no extra calls', async () => {
      await reset(); await add('artist-one'); await add('artist-two');
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,1); assert.ok(!fields[0].includes('children'));
      assert.ok(!fields[0].includes('caption'),'Scheduled discovery must not read captions during an identity probe');
      assert.ok(fields[0].includes('media.limit(5)'),'Scheduled discovery reads five latest identities only');
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
    await t.test('new posts queue a separate durable media job and preserve discovery timestamps', async () => {
      await reset(); await add('artist-one',false);
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,1); assert.ok(!fields[0].includes('media_url'));
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,1);
      const discovered = (await client.query('SELECT last_success_at,last_checked_at FROM social_accounts')).rows[0];
      const probeRun = (await client.query('SELECT status,items_seen,items_changed,metrics FROM sync_runs')).rows[0];
      assert.equal(probeRun.status,'success'); assert.equal(probeRun.metrics.requests,1); assert.equal(probeRun.items_changed,1);
      assert.equal(probeRun.metrics.mode,'discovery'); assert.equal(probeRun.metrics.artistSlug,'artist-one'); assert.ok(probeRun.metrics.accountId);
      await syncNews({ platform: 'instagram' }); assert.equal(fields.length,1);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,2); assert.ok(fields[1].includes('caption')); assert.ok(!fields[1].includes('media_url'));
      assert.equal((await client.query('SELECT body FROM news_items')).rows[0].body,'stable');
      assert.equal((await client.query('SELECT needs_text FROM instagram_media_jobs')).rows[0].needs_text,false);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,3); assert.ok(fields[2].includes('children.limit(20)'));
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,0);
      const mediaRun = (await client.query("SELECT metrics FROM sync_runs WHERE metrics->>'mode'='media'")).rows[0];
      assert.equal(mediaRun.metrics.requests,1); assert.equal(mediaRun.metrics.mediaRefreshed,true);
      assert.deepEqual((await client.query('SELECT last_success_at,last_checked_at FROM social_accounts')).rows[0],discovered);
      const stored = (await client.query('SELECT image_url FROM news_items')).rows[0];
      assert.equal(stored.image_url,'https://example.com/new.jpg');
    });
    await t.test('high processing usage pauses across invocations and does not request media', async () => {
      await reset(); await add('artist-one',false); highUsage = true;
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      assert.equal(fields.length,1);
      assert.equal((await client.query('SELECT status FROM sync_runs')).rows[0].status,'success');
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,1);
      assert.equal(await syncNews({ platform: 'instagram' }),0);
      assert.equal(await syncNews({ platform: 'instagram',artistSlug: 'artist-one' }),0);
      const budget = (await client.query("SELECT usage,paused_until>=now()+interval '59 minutes' AS paused FROM instagram_sync_budget")).rows[0];
      assert.equal(budget.paused,true); assert.equal(budget.usage.totalTime,95);
      assert.equal(fields.length,1);
    });
    await t.test('rate limit during the separate media job retains text, old media and successful discovery', async () => {
      await reset(); await add('artist-one'); changed = true; failMedia = true;
      await client.query("UPDATE social_accounts SET last_media_refresh_at=now()-interval '7 hours'");
      assert.equal(await syncNews({ platform: 'instagram' }),1);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({ platform: 'instagram' }),0);
      const row = (await client.query('SELECT body,image_url FROM news_items')).rows[0];
      assert.equal(row.body,'stable'); assert.equal(row.image_url,'https://example.com/old.jpg');
      const run = (await client.query("SELECT status,items_seen,metrics,error FROM sync_runs WHERE metrics->>'mode'='media'")).rows[0];
      assert.equal(run.status,'failed'); assert.equal(run.items_seen,0); assert.equal(run.metrics.requests,1);
      assert.ok(!run.error.includes('fixture-token'));
      assert.equal((await client.query('SELECT failures FROM instagram_media_jobs')).rows[0].failures,1);
      assert.equal((await client.query('SELECT last_error,instagram_failures FROM social_accounts')).rows[0].last_error,null);
      const budget = (await client.query("SELECT paused_until>=now()+interval '119 minutes' AS paused FROM instagram_sync_budget")).rows[0];
      assert.equal(budget.paused,true);
      await syncNews({ platform: 'instagram' }); assert.equal(fields.length,2);
    });
    await t.test('expired CDN refresh is scheduled even without new posts', async () => {
      await reset(); await add('artist-one');
      await client.query("UPDATE social_accounts SET last_media_refresh_at=now()-interval '7 hours'");
      await syncNews({ platform: 'instagram' });
      assert.equal(fields.length,1);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
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
    await t.test('text enrichment uses a separate lightweight request while media waits for lower usage',async () => {
      await reset(); await add('artist-one'); changed=true; headerUsage=45;
      await client.query("UPDATE news_items SET instagram_details_checked_at=NULL,summary='keep this summary'");
      await syncNews({platform:'instagram'});
      let post=(await client.query('SELECT body,summary,image_url FROM news_items')).rows[0];
      assert.equal(post.body,'stable'); assert.equal(post.summary,'keep this summary');
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      await syncNews({platform:'instagram'});
      post=(await client.query('SELECT body,summary,image_url FROM news_items')).rows[0];
      assert.equal(post.body,'changed'); assert.equal(post.summary,null); assert.equal(post.image_url,'https://example.com/old.jpg');
      assert.ok(fields[1].includes('caption')); assert.ok(!fields[1].includes('media_url'));
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({platform:'instagram'}),0); assert.equal(fields.length,2);
      assert.equal((await client.query('SELECT needs_text FROM instagram_media_jobs')).rows[0].needs_text,false);
    });
    await t.test('unchecked or overdue discovery takes priority; background shares remain bounded',async () => {
      await reset(); await add('artist-one',false); await syncNews({platform:'instagram'});
      await add('artist-two',false);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL,checks_since_media=100');
      await syncNews({platform:'instagram'});
      assert.ok(fields[1].includes('artist_two')); assert.ok(!fields[1].includes('caption'));
      await client.query("UPDATE social_accounts SET next_sync_at=now(),last_checked_at=now()-interval '50 minutes'");
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL,checks_since_media=5');
      await syncNews({platform:'instagram'});
      assert.ok(fields[2].includes('caption')); assert.ok(!fields[2].includes('media_url'));
      assert.equal((await client.query('SELECT checks_since_media FROM instagram_sync_budget')).rows[0].checks_since_media,0);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      await syncNews({platform:'instagram'});
      assert.ok(!fields[3].includes('caption'),'Other due accounts resume before another background request');
    });
    await t.test('persistent unavailable accounts back off 6/12 hours, other accounts progress and recovery resets failures',async () => {
      await reset(); await add('artist-one',false); await add('artist-two'); unavailableHandle='artist_one';
      await client.query("UPDATE social_accounts SET last_success_at=NULL WHERE handle='artist_one'");
      await client.query('UPDATE instagram_sync_budget SET healthy_responses=2');
      await syncNews({platform:'instagram'});
      assert.equal((await client.query('SELECT healthy_responses,spacing_seconds FROM instagram_sync_budget')).rows[0].healthy_responses,0);
      assert.equal((await client.query('SELECT spacing_seconds FROM instagram_sync_budget')).rows[0].spacing_seconds,60);
      let account=(await client.query("SELECT instagram_failures,last_success_at,next_sync_at>=now()+interval '359 minutes' AS waiting FROM social_accounts WHERE handle='artist_one'")).rows[0];
      assert.equal(account.instagram_failures,1); assert.equal(account.last_success_at,null); assert.equal(account.waiting,true);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({platform:'instagram',artistSlug:'artist-one'}),0);
      await syncNews({platform:'instagram'}); assert.ok(fields[1].includes('artist_two'));
      await client.query("UPDATE social_accounts SET next_sync_at=now() WHERE handle='artist_one'");
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      await syncNews({platform:'instagram'});
      account=(await client.query("SELECT instagram_failures,next_sync_at>=now()+interval '719 minutes' AS waiting FROM social_accounts WHERE handle='artist_one'")).rows[0];
      assert.equal(account.instagram_failures,2); assert.equal(account.waiting,true);
      unavailableHandle='';
      await client.query("UPDATE social_accounts SET next_sync_at=now() WHERE handle='artist_one'");
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      await syncNews({platform:'instagram'});
      account=(await client.query("SELECT instagram_failures,last_error,last_success_at,next_sync_at<now()+interval '46 minutes' AS recovered FROM social_accounts WHERE handle='artist_one'")).rows[0];
      assert.equal(account.instagram_failures,0); assert.equal(account.last_error,null); assert.ok(account.last_success_at); assert.equal(account.recovered,true);
    });
    await t.test('legitimate empty captions or unavailable media do not create an endless enrichment loop',async () => {
      await reset(); await add('artist-one',false); emptyCaption=true; noMedia=true;
      for(let i=0;i<3;i++) {
        await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
        await syncNews({platform:'instagram'});
      }
      assert.equal(fields.length,3);
      const post=(await client.query('SELECT body,media_items,instagram_details_checked_at FROM news_items')).rows[0];
      assert.equal(post.body,null); assert.deepEqual(post.media_items,[]); assert.ok(post.instagram_details_checked_at);
      await client.query('UPDATE social_accounts SET next_sync_at=now()');
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      await syncNews({platform:'instagram'});
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,0);
    });
    await t.test('100 known accounts rotate under an hour of simulated slot time with constantly low usage',async () => {
      await reset();
      for(let i=0;i<100;i++) await add('artist-'+String(i).padStart(3,'0'));
      let simulatedSeconds=0;
      for(let i=0;i<100;i++) {
        simulatedSeconds+=(await client.query('SELECT spacing_seconds FROM instagram_sync_budget')).rows[0].spacing_seconds;
        await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
        await syncNews({platform:'instagram'});
      }
      assert.equal(fields.length,100); assert.equal(new Set(fields).size,100);
      assert.ok(simulatedSeconds<3600,'Hypothetical low-usage slots must leave headroom below an hour');
      assert.equal((await client.query('SELECT spacing_seconds FROM instagram_sync_budget')).rows[0].spacing_seconds,30);
      assert.equal((await client.query('SELECT count(*)::int n FROM social_accounts WHERE last_checked_at IS NOT NULL')).rows[0].n,100);
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,0);
    });
    await t.test('stale or missing headers retain safe request reservations and defer optional work',async () => {
      await reset(); await add('artist-one',false); missingHeaders=true;
      await client.query(`UPDATE instagram_sync_budget SET spacing_seconds=30,healthy_responses=2,
        usage='{"callCount":5,"totalTime":10,"cpuTime":0}',usage_checked_at=now()-interval '16 minutes'`);
      await syncNews({platform:'instagram'});
      const budget=(await client.query("SELECT spacing_seconds,healthy_responses,next_request_at>=last_request_at+interval '60 seconds' AS reserved FROM instagram_sync_budget")).rows[0];
      assert.equal(budget.spacing_seconds,60); assert.equal(budget.healthy_responses,0); assert.equal(budget.reserved,true);
      await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL');
      assert.equal(await syncNews({platform:'instagram'}),0); assert.equal(fields.length,1);
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,1);
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
