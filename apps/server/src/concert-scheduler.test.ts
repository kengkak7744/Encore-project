import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from './db.js';
import { config } from './config.js';
import { getConcertMonitor, runScheduledConcerts } from './concert-scheduler.js';

test('Persistent scheduled hours survive restart, exclude manual runs and record interrupted cycles', { skip: !process.env.INGEST_TEST_DATABASE_URL },async (t) => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  const before = { concertLocalResearch: config.concertLocalResearch,ticketmasterKey: config.ticketmasterKey,bandsintownAppId: config.bandsintownAppId };
  Object.assign(config,{ concertLocalResearch: true,ticketmasterKey: '',bandsintownAppId: '' });
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA concert_scheduler_fixture');
    await client.query('SET LOCAL search_path TO concert_scheduler_fixture,public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'connect',async () => ({ query: client.query.bind(client),release() {} }));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    t.mock.method(console,'error',() => {});
    t.mock.method(globalThis,'fetch',async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n');
      if (url.includes('/v4/')) return new Response('{"data":{"record":[],"pagination":{"last_page":1}}}',{ headers: { 'content-type': 'application/json' } });
      if (url.endsWith('.xml')) return new Response('<sitemapindex/>',{ headers: { 'content-type': 'application/xml' } });
      return new Response('<title>No events fixture</title>',{ headers: { 'content-type': 'text/html' } });
    });
    let now = Date.parse('2030-01-01T00:01:00Z');
    t.mock.method(Date,'now',() => now);
    assert.equal(await runScheduledConcerts(),true);
    assert.equal(await runScheduledConcerts(),false);
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_sync_cycles')).rows[0].n,1);
    let report = (await getConcertMonitor())!;
    assert.equal(report.startedAt,'2030-01-01T01:00:00.000Z'); assert.equal(report.checked,0);
    // An arbitrary number of successful manual runs must never fill a scheduled gap.
    await client.query("INSERT INTO sync_runs(source_name,category,status,started_at,finished_at) VALUES('Eventpop','concert','success','2030-01-01T01:00Z','2030-01-01T01:01Z')");
    now += 2 * 3_600_000;
    assert.equal(await runScheduledConcerts(),true);
    report = (await getConcertMonitor())!;
    assert.equal(report.elapsedHours,1); assert.equal(report.checked,0); assert.equal(report.issues,4);
    assert.ok(report.rows.slice(0,4).every(row => row.status === 'missing'));
    const stale = (await client.query("INSERT INTO concert_sync_cycles(scheduled_at,status) VALUES('2029-12-31T23:00Z','running') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO sync_runs(source_name,category,cycle_id) VALUES('Eventpop','concert',$1)",[stale]);
    assert.equal(await runScheduledConcerts(),false);
    assert.equal((await client.query('SELECT status FROM sync_runs WHERE cycle_id=$1',[stale])).rows[0].status,'failed');
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_monitor_windows')).rows[0].n,1);
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()');
    t.mock.restoreAll(); Object.assign(config,before);
    await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
