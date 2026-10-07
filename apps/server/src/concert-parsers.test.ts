import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEventpop, parseTheConcert, parseTicketmelon } from './ingest.js';
import { eventpopUrl, eventpopPoster, parseTheConcertApi } from './concert-parsers.js';

test('Eventpop uses the real full poster when OG contains a placeholder and never substitutes unrelated attachments', () => {
  const page='https://www.eventpop.me/e/173607';
  const markup='<meta property="og:image" content="/images/cover-placeholder.jpg"><div class="event-cover"><div class="poster-wrapper"><a href="https://p-u.popcdn.net/poster-large.jpg"><img src="https://p-u.popcdn.net/poster-medium.jpg"></a></div></div><img class="attachment" src="https://example.com/seat-map.jpg">';
  assert.equal(eventpopPoster(markup,page),'https://p-u.popcdn.net/poster-large.jpg');
  assert.equal(eventpopPoster('<meta property="og:image" content="/images/cover-placeholder.jpg"><img class="attachment" src="https://example.com/seat-map.jpg">',page),null);
  assert.equal(eventpopPoster('<div class="event-cover"><img src="javascript:alert(1)"></div><meta property="og:image" content="https://p-u.popcdn.net/cover.jpg">',page),'https://p-u.popcdn.net/cover.jpg');
  assert.equal(eventpopPoster(markup,'https://example.com/e/173607'),null);
});

test('Eventpop prefers announced showtime rows over stale metadata and recognizes category without title keywords', () => {
  const markup = `<meta property="og:start_time" content="2026-10-03T18:00:00+07:00"><div><small>Concert</small><div id="event-title"><h2>NONT TANONT ARENA ENCORE</h2></div></div><meta property="og:location" content="Arena, Bangkok, Thailand"><div id="event-showtimes"><div class="ticket-row sold-out"><div class="ticket-detail">04 Oct 2026 18:00</div><div class="ticket-price">฿1,800.00 - ฿5,500.00</div></div></div>`;
  const events = parseEventpop(markup, 'https://www.eventpop.me/e/165644/nont-themoment-encore');
  assert.equal(events.length, 1);
  assert.equal(events[0].startsAt, '2026-10-04T11:00:00.000Z');
  assert.equal(events[0].status, 'scheduled', 'Sold out is not cancelled');
  assert.equal(events[0].priceMin, 1800);
  assert.equal(events[0].priceMax, 5500);
});

test('Eventpop keeps exact multi-day times, current satang prices and unknown prices distinct', () => {
  const markup = `<div id="event-title"><h2>Music Festival</h2></div><a class="event-date-range"><strong>04 Oct 2026 15:00 - 06 Oct 2026 06:00</strong></a><meta property="og:location" content="Venue, Surat Thani, Thailand"><evp-react-island component="event_details/NavigationStickyBar" props='{"priceRangeSatangs":[89900,140000]}'></evp-react-island>`;
  const [event] = parseEventpop(markup, 'https://www.eventpop.me/e/159926');
  assert.equal(event.startsAt, '2026-10-04T08:00:00.000Z');
  assert.equal(event.endsAt, '2026-10-05T23:00:00.000Z');
  assert.equal(event.timeTba, false);
  assert.equal(event.city, 'Surat Thani');
  assert.equal(event.priceMin, 899);
  assert.equal(event.priceMax, 1400);
  assert.equal(parseEventpop(markup.replace('[89900,140000]', '[null,null]'), 'https://www.eventpop.me/e/159926')[0].priceMin, null);
  assert.equal(parseEventpop(markup.replace('Thailand', 'Singapore'), 'https://www.eventpop.me/e/159926').length, 0);
  assert.equal(eventpopUrl('https://www.eventpop.me/e/159926/changed-slug'), eventpopUrl(event.url));
});

test('The Concert legacy markup no longer restricts valid Thai music to central provinces', () => {
  const markup = `<h1>Chiang Mai Music Concert</h1><div class="location-direct">Chiang Mai Hall<a href="https://www.google.com/maps/search/?api=1&amp;query=18.79,98.99">Map</a></div><span id="date_show_time" data-date="7 พ.ย. 26, 20:00 - 21:30 น."></span><select-concert-btn has_round="false"></select-concert-btn>`;
  assert.equal(parseTheConcert(markup, 'https://www.theconcert.com/p/4970').length, 1);
});

test('The Concert API validates parent country/genre and never uses placeholder list prices', () => {
  const parent = { data: { id: 4995, name: 'Music market', group_type: 'multiple', venue: { name: 'Hall', country: { name: 'Thailand' }, province: { name: 'Bangkok' } }, attributes: [{ code: 'genre', items: [{ name: 'MINICONCERT' }] }] } };
  const rounds = { data: { record: [
    { show_time: { start: '2026-12-25 16:00:00', end: '2026-12-25 23:59:00', status_text: 'Available' }, price: { min: 350, max: 350, status: true } },
    { show_time: { start: '2026-12-26 16:00:00', end: '2026-12-26 23:59:00' }, price: { min: 0, max: 0, status: false } },
  ] } };
  const parsed = parseTheConcertApi(parent, rounds);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].priceMin, 350);
  assert.equal(parsed[1].priceMin, null);
  assert.equal(parsed[0].url, parsed[1].url);
  assert.equal(parsed[0].title, parent.data.name);
  assert.equal(parsed[1].startsAt, '2026-12-26T09:00:00.000Z');
  assert.equal(parseTheConcertApi({ data: { ...parent.data, venue: { country: { name: 'Singapore' } } } }, rounds).length, 0);
  assert.equal(parseTheConcertApi({ data: { ...parent.data, attributes: [{ code: 'genre', items: [{ name: 'TalkShow' }] }] } }, rounds).length, 0);
});

test('Eventpop keeps the announced beach party, deduplicates hotel festival bundles and excludes shuttle products', () => {
  const props = { initializationData: { showtimes: [
    { title: 'EDC FESTIVAL TICKET',start_at: '18 Dec 2026 14:00',end_at: '20 Dec 2026 23:59' },
    { title: 'HOTEL EDC + FESTIVAL TICKET',start_at: '18 Dec 2026 14:00',end_at: '20 Dec 2026 23:59' },
    { title: 'HOTEL EDC BEACH PARTY PASS',start_at: '17 Dec 2026 15:00',end_at: '18 Dec 2026 00:00' },
    { title: 'SHUTTLE PASSES',start_at: '16 Dec 2026 14:00',end_at: '20 Dec 2026 23:59' },
  ] } };
  const markup = `<div id="event-title"><h2>EDC Music Festival</h2></div><evp-react-island component="events/EventShowtimeImageLayout" props='${JSON.stringify(props)}'></evp-react-island>`;
  const rows = parseEventpop(markup,'https://www.eventpop.me/e/132318');
  assert.equal(rows.length,2); assert.ok(rows.some(row => row.startsAt === '2026-12-17T08:00:00.000Z'));
  assert.equal(rows.find(row => row.startsAt === '2026-12-17T08:00:00.000Z')?.performanceLabel,'HOTEL EDC BEACH PARTY PASS');
  assert.equal(rows.find(row => row.startsAt === '2026-12-18T07:00:00.000Z')?.performanceLabel,'EDC FESTIVAL TICKET');
});
test('Ticketmelon rejects a TV episode miscategorized as Music while retaining music livestreams', () => {
  const event = { name: '(Livestream) WeTV Original Khom Khlang The Series | Special Episode 5',categories: ['Music'],venue: { name: 'Live Streaming',formatted_address: 'Bangkok, Thailand' },currency: { code: 'THB' },status: 'publish',show_starttime: Date.parse('2026-12-20T12:00:00Z') };
  const markup = (name: string) => `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { event: { ...event,name } } } })}</script>`;
  assert.equal(parseTicketmelon(markup(event.name),'https://www.ticketmelon.com/fixture/tv').length,0);
  assert.equal(parseTicketmelon(markup('Thai Music Concert Livestream'),'https://www.ticketmelon.com/fixture/music').length,1);
});
