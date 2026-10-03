import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from './db.js';
import { discoverConcertSource } from './concert-discovery.js';

test('Eventpop stops at rate limits, persists resume position and excludes implausible source dates', { skip: !process.env.INGEST_TEST_DATABASE_URL },async (t) => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN'); await client.query('CREATE SCHEMA concert_discovery_fixture');
    await client.query('SET LOCAL search_path TO concert_discovery_fixture,public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    let limited = true; const requests: string[] = [];
    t.mock.method(globalThis,'fetch',async (input: string | URL) => {
      const url = new URL(input); requests.push(url.pathname);
      if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n');
      if (url.pathname.startsWith('/g/')) return new Response('<a href="/e/101">One</a><a href="/e/102">Two</a><a href="/e/103">Three</a>',{ headers: { 'content-type': 'text/html' } });
      if (limited && url.pathname === '/e/102') return new Response('',{ status: 429,headers: { 'retry-after': '7200' } });
      const year = url.pathname === '/e/103' ? 2126 : 2027;
      return new Response(`<div id="event-title"><h2>Fixture Music</h2></div><a class="event-date-range"><strong>12 Feb ${year} at 18:00</strong></a>`,{ headers: { 'content-type': 'text/html' } });
    });
    const source = { name: 'Eventpop',host: 'eventpop.me',url: 'https://www.eventpop.me/',linkPattern: /\/e\/\d+/ };
    const first = await discoverConcertSource(source);
    assert.equal(first.events.length,1); assert.equal(first.metrics.fetchFailures,1); assert.equal(first.metrics.attempted,2);
    assert.equal(first.metrics.pending,1); assert.ok(!requests.includes('/e/103'));
    assert.equal((await client.query("SELECT cursor_offset FROM concert_discovery_cursors WHERE source_name='Eventpop'")).rows[0].cursor_offset,1);
    assert.ok((await client.query("SELECT retry_after FROM concert_source_backoff WHERE source_name='Eventpop'")).rows[0].retry_after.getTime() > Date.now() + 7_000_000);
    limited = false; requests.length = 0;
    const second = await discoverConcertSource(source);
    assert.equal(requests.find(path => path.startsWith('/e/')),'/e/102');
    assert.equal(second.events.length,2); assert.equal(second.metrics.rejectedDates,1);
    assert.ok(second.events.every(event => new Date(event.startsAt!).getUTCFullYear() === 2027));
  } finally {
    t.mock.restoreAll(); await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
