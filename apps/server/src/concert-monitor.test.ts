import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConcertMonitor, concertMonitorCsv, type MonitorRun } from './concert-monitor.js';
import { primaryConcertSources } from './concert-types.js';
import { discoverConcertSource, rotatingUrls } from './concert-discovery.js';
import { accessChallenge, fetchConcertResource } from './concert-fetch.js';

const start = Date.parse('2026-10-04T02:00:00Z');
const hour = 3_600_000;
const window = { id: 1, started_at: new Date(start), ends_at: new Date(start + 168 * hour) };
test('A new verification window preserves the earlier missing-hour verdict and its evidence', () => {
  const old = buildConcertMonitor(window,[],start+168*hour)!;
  const next = buildConcertMonitor({ id: 2,started_at: new Date(start+168*hour),ends_at: new Date(start+336*hour),reason: 'Worker continuity fix' },[],start+168*hour)!;
  assert.equal(old.cadenceVerdict,'needs_review'); assert.equal(old.cadenceIssues,672);
  assert.equal(next.cadenceVerdict,'collecting'); assert.equal(next.elapsedHours,0);
  assert.equal(next.reason,'Worker continuity fix');
  assert.equal(buildConcertMonitor(window,[],start+168*hour)!.cadenceIssues,672);
});
function runs(hours: number): MonitorRun[] {
  return Array.from({ length: hours },(_unused,index) => primaryConcertSources.map(source => ({
    source_name: source, scheduled_at: new Date(start + index * hour), started_at: new Date(start + index * hour + 60_000),
    finished_at: new Date(start + index * hour + 120_000), status: 'success', items_seen: 3, items_changed: 1, error: null, metrics: { discovered: 20, attempted: 20 },
  }))).flat();
}
test('Seven-day monitoring distinguishes future, current awaiting, and a missed past hour', () => {
  const initial = buildConcertMonitor(window,[],start - 1)!;
  assert.equal(initial.rows.length,672); assert.equal(initial.issues,0); assert.equal(initial.verdict,'collecting');
  assert.ok(initial.rows.every(row => row.status === 'future'));
  const report = buildConcertMonitor(window,runs(1),start + hour + 1000)!;
  assert.equal(report.elapsedHours,1); assert.equal(report.checked,4); assert.equal(report.issues,0);
  assert.equal(report.rows[4].status,'awaiting');
  const missed = buildConcertMonitor(window,runs(1),start + 2 * hour)!;
  assert.equal(missed.issues,4); assert.equal(missed.rows[4].status,'missing');
});
test('Final monitoring needs all 168 scheduled hours and preserves failure evidence on retries', () => {
  const all = runs(168);
  assert.equal(buildConcertMonitor(window,all,start + 168 * hour)!.verdict,'passed');
  all[7].status = 'partial';
  all.push({ ...all[7],status: 'success',started_at: new Date(start + hour + 180_000) });
  const report = buildConcertMonitor(window,all,start + 168 * hour)!;
  assert.equal(report.verdict,'needs_review'); assert.equal(report.issues,1); assert.equal(report.checked,672);
  assert.equal(report.cadenceVerdict,'passed');
  assert.equal(buildConcertMonitor(window,runs(167),start + 168 * hour)!.issues,4);
  assert.equal(buildConcertMonitor(window,runs(167),start + 168 * hour)!.cadenceVerdict,'needs_review');
  assert.equal(buildConcertMonitor(window,runs(168),start + 167 * hour)!.verdict,'collecting');
});
test('Monitoring excludes outside-window attempts and safely exports all source/hour rows', () => {
  const data = runs(1); data[0].error = '=IMPORTXML("bad")';
  data.push({ ...data[0],scheduled_at: new Date(start - hour) });
  const report = buildConcertMonitor(window,data,start + hour)!;
  assert.equal(report.checked,4);
  const csv = concertMonitorCsv(report);
  assert.equal(csv.trim().split('\r\n').length,673);
  assert.ok(csv.includes("'=IMPORTXML"));
});
test('Ticketmelon catalog rotation reaches older URLs even while rechecking known upcoming events', () => {
  const catalog = Array.from({ length: 559 },(_unused,index) => ({ url: 'https://www.ticketmelon.com/fixture/' + index.toString().padStart(3,'0'),modified: new Date(start + index * hour).toISOString() }));
  const visited = new Set<string>(); let offset = 0;
  for (let cycle = 0; cycle < 6; cycle++) {
    const selection = rotatingUrls(catalog,catalog.slice(0,100).map(row => row.url),offset,200);
    selection.urls.forEach(url => visited.add(url)); offset = selection.nextOffset;
    assert.equal(selection.urls.length,200); assert.equal(new Set(selection.urls).size,200);
  }
  assert.equal(visited.size,559);
  assert.equal(rotatingUrls(catalog,[],0,1000).urls.length,559);
  assert.deepEqual(rotatingUrls([],[],0,200),{ urls: [],nextOffset: 0,catalogSize: 0 });
});
test('HTTP 200 access verification is a fetch failure and robots restrictions are checked before each redirect', async (t) => {
  assert.equal(accessChallenge('<title>Access Verification</title>'),true);
  assert.equal(accessChallenge('<title>Concert | Eventpop</title><h2>Music night</h2><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'),false);
  const requests: string[] = [];
  t.mock.method(globalThis,'fetch', async (input: string | URL) => {
    const url = String(input); requests.push(url);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /blocked\n');
    if (url.endsWith('/redirect')) return new Response('',{ status: 302,headers: { location: '/blocked' } });
    return new Response('<title>Access Verification</title>',{ headers: { 'content-type': 'text/html' } });
  });
  await assert.rejects(fetchConcertResource('https://fixture-concert.example/detail','fixture-concert.example','html'),/Access verification/);
  await assert.rejects(fetchConcertResource('https://fixture-concert.example/redirect','fixture-concert.example','html'),/robots/);
  assert.ok(!requests.some(url => url.endsWith('/blocked')));
});

test('ThaiTicketMajor discovery excludes sort/category links and AllTicket reports its JavaScript limitation',async t => {
  const requests: string[] = [];
  t.mock.method(globalThis,'fetch',async (input: string | URL) => {
    const url = new URL(input); requests.push(url.pathname);
    if (url.pathname==='/robots.txt') return new Response('User-agent: *\nAllow: /\n');
    if (url.hostname==='allticket-fixture.example') return new Response('<h2>JavaScript Required</h2><p>Allticket does not work properly without JavaScript enabled.</p>',{ headers: { 'content-type': 'text/html' } });
    if (url.pathname==='/concert/') return new Response('<a href="/concert/name/">Sort</a><a href="/concert/latest/">Latest</a><a href="/concert/show.html">Concert</a>',{ headers: { 'content-type': 'text/html' } });
    return new Response('<script type="application/ld+json">{"@type":"MusicEvent","name":"Fixture concert","startDate":"2027-02-12T18:00:00+07:00","location":{"name":"Bangkok"}}</script>',{ headers: { 'content-type': 'text/html' } });
  });
  const result = await discoverConcertSource({ name: 'ThaiTicketMajor',host: 'ttm-fixture.example',url: 'https://ttm-fixture.example/concert/',linkPattern: /\/concert\// });
  assert.equal(result.metrics.discovered,1); assert.equal(result.events.length,1);
  assert.ok(!requests.includes('/concert/name/')); assert.ok(!requests.includes('/concert/latest/'));
  assert.equal(result.events[0].priceMin,null);
  await assert.rejects(discoverConcertSource({ name: 'AllTicket',host: 'allticket-fixture.example',url: 'https://allticket-fixture.example/',linkPattern: /\/event\// }),/requires JavaScript/);
});
