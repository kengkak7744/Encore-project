import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverConcertSource, rotatingUrls } from './concert-discovery.js';
import { buildConcertMonitor, concertCoverageCsv, concertMonitorMarkdown, type MonitorRun } from './concert-monitor.js';
import { parseTtmListing } from './ttm-listing.js';

const card = `<div class="box-txt"><a class="title" href="/concert/fixture-live.html">Fixture Live Concert</a>
<span class="datetime"><span class="txt-label">Public Sale</span><span>17 ต.ค. 2569, 10:00 น.</span></span>
<span class="datetime"><span class="txt-label">วันแสดง</span><span>วันเสาร์ที่ 19 และ วันอาทิตย์ที่ 20 ธันวาคม 2569</span></span>
<a class="venue"><span>อิมแพ็ค อารีน่า เมืองทองธานี</span></a></div>`;

test('TTM blocked details retain explicit show dates from public cards without inventing times or prices',async t => {
  t.mock.method(globalThis,'fetch',async (input: string | URL) => {
    const url = new URL(input);
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /');
    return new Response(url.pathname === '/concert/' ? card : '<title>Access Verification</title>',{ headers: { 'content-type': 'text/html' } });
  });
  const result = await discoverConcertSource({ name: 'ThaiTicketMajor',host: 'ttm-coverage.example',url: 'https://ttm-coverage.example/concert/',linkPattern: /\/concert\// });
  assert.equal(result.events.length,2);
  assert.deepEqual(result.events.map(row => row.startsAt),['2026-12-18T17:00:00.000Z','2026-12-19T17:00:00.000Z']);
  assert.ok(result.events.every(row => row.timeTba && row.listingOnly && row.priceMin == null && row.endsAt == null && !row.completeSchedule));
  assert.equal(result.metrics.fetchFailures,1);
  assert.equal(result.metrics.listingFallback,1);
  assert.equal(result.metrics.pages?.[0].outcome,'failed');
});

test('Coverage totals use distinct latest page outcomes while cadence passes independently',() => {
  const start = Date.parse('2026-10-05T23:00:00Z');
  const source = 'Ticketmelon';
  const run = (hour: number,metrics: Record<string,unknown>): MonitorRun => ({ source_name: source,scheduled_at: new Date(start + hour*3600000),started_at: new Date(start + hour*3600000 + 1000),finished_at: new Date(start + hour*3600000 + 2000),status: 'success',items_seen: 1,items_changed: 0,error: null,metrics });
  const urls = ['https://www.ticketmelon.com/f/a','https://www.ticketmelon.com/f/b','https://www.ticketmelon.com/f/c'];
  const result = buildConcertMonitor({ id: 2,started_at: new Date(start),ends_at: new Date(start + 168*3600000) },[
    run(0,{ catalogUrls: urls,pages: [{ url: urls[0],outcome: 'failed' },{ url: urls[1],outcome: 'parsed' }] }),
    run(1,{ catalogUrls: urls,pages: [{ url: urls[0],outcome: 'parsed' }] }),
  ],start+2*3600000)!;
  const coverage = result.coverage.find(row => row.source === source)!;
  assert.equal(coverage.catalog,3);assert.equal(coverage.checked,2);assert.equal(coverage.parsed,2);
  assert.equal(coverage.failed,0);assert.equal(coverage.pending,1);assert.equal(coverage.verdict,'needs_review');
  assert.equal(coverage.pages.find(row => row.url === urls[2])?.outcome,'pending');
  assert.ok(concertCoverageCsv(result).includes(urls[2]));assert.match(concertMonitorMarkdown(result),/Catalog page coverage/);
  assert.ok(!('pages' in result.rows[0].metrics),'Hourly response must not repeat full catalogs and per-page evidence');
});

test('TTM cards reject ambiguous date ranges, impossible dates, other hosts and online reruns',() => {
  const page = 'https://www.thaiticketmajor.com/concert/';
  for (const value of ['19-20 ธันวาคม 2569','19 ธันวาคม 2569 ถึง 20 มกราคม 2570','31 กุมภาพันธ์ 2570']) {
    assert.equal(parseTtmListing(card.replace('วันเสาร์ที่ 19 และ วันอาทิตย์ที่ 20 ธันวาคม 2569',value),page).length,0);
  }
  assert.equal(parseTtmListing(card.replace('/concert/fixture-live.html','https://outside.example/concert/fixture-live.html'),page).length,0);
  assert.equal(parseTtmListing(card.replace('อิมแพ็ค อารีน่า เมืองทองธานี','RERUN by TTM LIVE'),page).length,0);
  const single = parseTtmListing(card.replace('วันเสาร์ที่ 19 และ วันอาทิตย์ที่ 20 ธันวาคม 2569','30 ต.ค. 2569'),page);
  assert.equal(single[0].startsAt,'2026-10-29T17:00:00.000Z');
});

test('New sitemap entries are checked promptly even when known upcoming events fill the priority budget',() => {
  const entries = Array.from({ length: 400 },(_,index) => ({ url: 'https://www.ticketmelon.com/fixture/' + index,modified: index === 399 ? '2026-10-06T12:00:00Z' : '2026-10-01T00:00:00Z' }));
  const known = entries.slice(0,220).map(row => row.url);
  const selected = rotatingUrls(entries,known,0,200);
  assert.ok(selected.urls.includes(entries[399].url),'Recent new event must not be dropped behind 150 known events');
  assert.equal(selected.urls.length,200);
  const visited = new Set<string>();let offset = 0;
  for (let index = 0;index < 8;index++) { const round = rotatingUrls(entries,known,offset,200);round.urls.forEach(url=>visited.add(url));offset=round.nextOffset; }
  assert.equal(visited.size,400);
});
