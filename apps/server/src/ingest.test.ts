import assert from 'node:assert/strict';
import test from 'node:test';
import { matchTicketmasterAttraction, parseEventpop, parseEventpopMeta, parseEvents, parseLiveNation, parseTheConcert, parseTheConcertHighlightIds, parseTicketmaster, parseTicketmelon, robotsAllows } from './ingest.js';

test('Ticketmelon robots wildcard permits home but blocks search and query URLs', () => {
  const rules = 'User-agent: *\nAllow: /\nDisallow: /search\nDisallow: /*?*\n';
  assert.equal(robotsAllows(rules, '/'), true);
  assert.equal(robotsAllows(rules, '/some/event'), true);
  assert.equal(robotsAllows(rules, '/search'), false);
  assert.equal(robotsAllows(rules, '/?page=2'), false);
});

test('Ticketmelon embedded event data yields Thai music date with unknown price', () => {
  const page = { props: { pageProps: { event: { name: 'Yves', show_starttime: Date.parse('2026-11-06T18:30:00+07:00'), show_endtime: Date.parse('2026-11-06T23:00:00+07:00'), categories: ['Music'], venue: { name: 'Lido Connect Hall 2', formatted_address: 'Bangkok, Thailand' }, currency: { code: 'THB', country: 'Thailand' }, status: 'publish', img_poster: 'https://example.com/poster.jpg' } } } };
  const markup = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script>`;
  const url = 'https://www.ticketmelon.com/cultofya/yvesinbangkok';
  const parsed = parseTicketmelon(markup, url);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].startsAt, '2026-11-06T11:30:00.000Z');
  assert.equal(parsed[0].venue, 'Lido Connect Hall 2');
  assert.equal(parsed[0].priceMin, null);
  assert.equal(parseTicketmelon(markup.replace('Music', 'Workshop'), url).length, 0);
  assert.equal(parseTicketmelon(markup.replace('Bangkok, Thailand', 'Singapore'), url).length, 0);
});

test('JSON-LD event retains cancellation and source metadata', () => {
  const body = `<script type="application/ld+json">{"@type":"MusicEvent","name":"Example Live","startDate":"2027-01-20T19:00:00+07:00","eventStatus":"https://schema.org/EventCancelled","location":{"name":"Hall","address":{"addressLocality":"Bangkok","addressCountry":"TH"}},"offers":{"lowPrice":500,"highPrice":1200,"priceCurrency":"THB"}}</script>`;
  const events = parseEvents(body, 'https://example.com/event');
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'cancelled');
  assert.equal(events[0].priceMin, 500);
  assert.equal(events[0].city, 'Bangkok');
});

test('Eventpop public markup extracts local date without inventing price', () => {
  const body = `<div id="event-title"><h2>Thai Music Night</h2></div><a class="event-date-range"><strong>12 Feb 2027 at 17:00 - 23:59</strong></a><a href="https://www.google.com/maps/search/?api=1&amp;query=1,2"><strong>One Bangkok Forum</strong></a><div>Bangkok, Thailand</div>`;
  const events = parseEventpop(body, 'https://www.eventpop.me/e/123');
  assert.equal(events.length, 1);
  assert.equal(events[0].startsAt, '2027-02-12T10:00:00.000Z');
  assert.equal(events[0].priceMin, undefined);
});

test('Eventpop date range marks show time as unannounced', () => {
  const body = `<div id="event-title"><h2>Music Festival</h2></div><a class="event-date-range"><strong>29 Dec 2026 - 03 Jan 2027</strong></a>`;
  const events = parseEventpop(body, 'https://www.eventpop.me/e/456');
  assert.equal(events.length, 1);
  assert.equal(events[0].timeTba, true);
  assert.equal(events[0].startsAt, '2026-12-28T17:00:00.000Z');
});

test('Thai JSON-LD without timezone uses Bangkok local time', () => {
  const body = `<script type="application/ld+json">{"@type":"MusicEvent","name":"Bangkok Live","startDate":"2026-10-03T18:00:00"}</script>`;
  const events = parseEvents(body, 'https://www.thaiticketmajor.com/concert/example');
  assert.equal(events[0].startsAt, '2026-10-03T11:00:00.000Z');
});

test('JSON-LD title decodes entities without removing angle brackets', () => {
  const body = `<script type="application/ld+json">{"@type":"MusicEvent","name":"Young K &lt;YOUNGEST&gt; &#39;Live&#39;","startDate":"2026-10-10T18:00:00+07:00"}</script>`;
  assert.equal(parseEvents(body, 'https://example.com/event')[0].title, "Young K <YOUNGEST> 'Live'");
});

test('Live Nation detail exposes date while show time remains unknown', () => {
  const body = `<h1>wave to earth - the pieces tour</h1><h2>Thu, 12 Nov 2026</h2><meta name="description" content="Buy tickets for wave to earth - the pieces tour at UOB LIVE, EmSphere on Thu, 12 Nov 2026 at www.livenationtero.co.th."/>`;
  const events = parseLiveNation(body, 'https://www.livenationtero.co.th/en/event/sample');
  assert.equal(events.length, 1);
  assert.equal(events[0].timeTba, true);
  assert.equal(events[0].venue, 'UOB LIVE, EmSphere');
});

test('JSON-LD keeps missing prices unknown and combines same-currency offers', () => {
  const event = (offers: unknown) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'MusicEvent', name: 'Price test', startDate: '2027-02-01T19:00:00+07:00', offers })}</script>`;
  assert.equal(parseEvents(event(null), 'https://example.com/event')[0].priceMin, null);
  const prices = parseEvents(event([{ price: 1200, priceCurrency: 'THB' }, { price: 500, priceCurrency: 'THB' }]), 'https://example.com/event')[0];
  assert.equal(prices.priceMin, 500);
  assert.equal(prices.priceMax, 1200);
  const mixed = parseEvents(event([{ price: 500, priceCurrency: 'THB' }, { price: 20, priceCurrency: 'USD' }]), 'https://example.com/event')[0];
  assert.equal(mixed.priceMin, null);
  assert.equal(mixed.priceMax, null);
  assert.equal(parseEvents(event([{ price: 900, priceCurrency: 'BAHT' }]), 'https://example.com/event')[0].priceMin, 900);
});

test('Eventpop Open Graph fallback requires a Thai music event with explicit timezone', () => {
  const body = `<meta property="og:title" content="Eventpop | Thai Music Night"><meta property="og:start_time" content="2027-02-12T17:00:00+07:00"><meta property="og:location" content="One Bangkok Forum, Bangkok, Thailand">`;
  const parsed = parseEventpopMeta(body, 'https://www.eventpop.me/e/123/night');
  assert.equal(parsed[0].startsAt, '2027-02-12T10:00:00.000Z');
  assert.equal(parsed[0].venue, 'One Bangkok Forum');
  assert.equal(parsed[0].priceMin, undefined);
  assert.equal(parseEventpopMeta(body.replace('Thailand', 'Singapore'), 'https://www.eventpop.me/e/123/night').length, 0);
});

test('The Concert single-round page reads Thai date and overnight end time', () => {
  const body = `<h1>Thai Music Concert</h1><div class="location-direct">Impact Hall<a href="https://www.google.com/maps/search/?api=1&amp;query=13.9,100.6">Map</a></div><div id="date_show_time" data-date="12 ก.พ. 2570, 20:00 - 01:00 น."></div><div class="price">฿1,200</div><select-concert-btn has_round="false"></select-concert-btn>`;
  const parsed = parseTheConcert(body, 'https://www.theconcert.com/p/123');
  assert.equal(parsed[0].startsAt, '2027-02-12T13:00:00.000Z');
  assert.equal(parsed[0].endsAt, '2027-02-12T18:00:00.000Z');
  assert.equal(parsed[0].priceMin, 1200);
  assert.equal(parseTheConcert(body.replace('has_round="false"', 'has_round="true"'), 'https://www.theconcert.com/p/123').length, 0);
  assert.equal(parseTheConcert(body.replace('12 ก.พ.', '31 ก.พ.'), 'https://www.theconcert.com/p/123').length, 0);
});

test('The Concert accepts a music category when the title has no music keyword', () => {
  const body = `<h1>ค่ำคืนที่คิดถึง โดย เท่ห์</h1>${'<div>intro</div>'.repeat(150)}<div class="genre-box"><li>ดนตรีสด</li></div><div class="location-direct">สากกาดก Sak-Ka-Dok<a href="https://www.google.com/maps/search/?api=1&amp;query=14.4097925,100.8869848">ดูเส้นทาง</a></div><span id="date_show_time" data-date="7 พ.ย. 26, 20:00 - 21:30 น."></span><div class="price">฿3,500</div><select-concert-btn has_round="false"></select-concert-btn>`;
  const events = parseTheConcert(body, 'https://www.theconcert.com/p/4970');
  assert.equal(events.length, 1);
  assert.equal(events[0].startsAt, '2026-11-07T13:00:00.000Z');
  assert.equal(events[0].priceMin, 3500);
});

test('The Concert public highlights yield bounded numeric detail IDs', () => {
  assert.deepEqual(parseTheConcertHighlightIds({ data: { record: [{ id: 4970 }, { id: '4874' }, { id: -1 }, { id: 4970 }, { id: 4910 }] } }), [4970, 4910]);
});

test('Ticketmaster keeps country, status, local time and price evidence', () => {
  const identity = { aliases: ['Artist'], attractionIds: ['verified-artist'], officialUrls: [] };
  const event = {
    name: 'Artist Live', url: 'https://www.ticketmaster.com/event/123',
    _embedded: { venues: [{ name: 'Hall', timezone: 'America/New_York', city: { name: 'New York' }, country: { countryCode: 'US' } }], attractions: [{ id: 'verified-artist', name: 'Artist' }] },
    dates: { start: { localDate: '2027-03-14', localTime: '19:00:00' }, status: { code: 'postponed' } },
    priceRanges: [{ min: 40, max: 80, currency: 'USD' }, { min: 25, max: 100, currency: 'USD' }],
  };
  const parsed = parseTicketmaster(event, 'Artist', undefined, identity);
  assert.equal(parsed?.startsAt, '2027-03-14T23:00:00.000Z');
  assert.equal(parsed?.status, 'postponed');
  assert.equal(parsed?.priceMin, 25);
  assert.equal(parsed?.priceMax, 100);
  assert.equal(parseTicketmaster({ ...event, _embedded: { venues: [{ country: {} }] } }, 'Artist'), null);
  const mixed = parseTicketmaster({ ...event, priceRanges: [{ min: 40, currency: 'USD' }, { min: 500, currency: 'THB' }] }, 'Artist', undefined, identity);
  assert.equal(mixed?.priceMin, null);
  assert.equal(parseTicketmaster({ ...event, dates: { start: { dateTime: '2027-03-14T19:00:00' } } }, 'Artist', undefined, identity), null);
  const thaiVenue = { ...event, _embedded: { venues: [{ ...event._embedded.venues[0], country: { countryCode: 'TH' } }] } };
  assert.equal(parseTicketmaster(thaiVenue, 'Artist'), null);
  assert.equal(parseTicketmaster(thaiVenue, undefined, 'TH')?.country, 'TH');
});

test('Ticketmaster requires identity evidence even for an exact performer name', () => {
  const event = (name: string, externalLinks = {}) => ({ _embedded: { attractions: [{ id: 'other-atlas', name, externalLinks }] } });
  const identity = { aliases: ['ATLAS'], attractionIds: [], officialUrls: ['https://www.instagram.com/atlas_official_th/'] };
  assert.equal(matchTicketmasterAttraction(event('Atlas'), identity), null);
  assert.equal(matchTicketmasterAttraction(event('Dame Atlas'), identity), null);
  assert.equal(matchTicketmasterAttraction(event('Atlas', { instagram: [{ url: 'https://www.instagram.com/foreign_atlas/' }] }), identity), null);
  assert.equal(matchTicketmasterAttraction(event('Atlas', { instagram: [{ url: 'https://instagram.com/atlas_official_th/?ref=tm' }] }), identity)?.id, 'other-atlas');
});

test('Ticketmaster checks each festival performer and supports verified IDs and Thai aliases', () => {
  const event = { _embedded: { attractions: [{ id: 'other', name: 'Another Band' }, { id: 'verified', name: 'Bodyslam' }] } };
  const identity = { aliases: ['บอดี้สแลม', 'Bodyslam'], attractionIds: ['verified'], officialUrls: [] };
  assert.equal(matchTicketmasterAttraction(event, identity)?.id, 'verified');
  assert.equal(matchTicketmasterAttraction({ name: 'Bodyslam', _embedded: {} }, identity), null);
  assert.equal(matchTicketmasterAttraction(event, { ...identity, aliases: ['BUS'] }), null);
});

test('Ticketmaster social identity preserves profile IDs and handles X links', () => {
  const event = (url: string) => ({ _embedded: { attractions: [{ id: 'id', name: 'Artist', externalLinks: { homepage: [{ url }] } }] } });
  assert.equal(matchTicketmasterAttraction(event('https://facebook.com/profile.php?id=2'), { aliases: ['Artist'], attractionIds: [], officialUrls: ['https://facebook.com/profile.php?id=1'] }), null);
  assert.equal(matchTicketmasterAttraction(event('https://twitter.com/artist/'), { aliases: ['Artist'], attractionIds: [], officialUrls: ['https://x.com/artist'] })?.id, 'id');
  assert.equal(matchTicketmasterAttraction(event('https://instagram.com/'), { aliases: ['Artist'], attractionIds: [], officialUrls: ['https://instagram.com/'] }), null);
});

test('Ticketmaster domestic import rejects a foreign or missing venue country', () => {
  const event = { name: 'Local Live', url: 'https://www.ticketmaster.com/event/id', dates: { start: { dateTime: '2026-11-08T18:00:00Z' } }, _embedded: { venues: [{ country: { countryCode: 'GB' } }] } };
  assert.equal(parseTicketmaster(event, undefined, 'TH'), null);
  assert.equal(parseTicketmaster({ ...event, _embedded: { venues: [{ country: {} }] } }, undefined, 'TH'), null);
  assert.equal(parseTicketmaster({ ...event, _embedded: { venues: [{ country: { countryCode: 'TH' } }] } }, undefined, 'TH')?.country, 'TH');
});

test('Ticketmaster foreign keyword results must identify the requested performer', () => {
  const event = {
    name: 'Dame Atlas with Special Guests', url: 'https://www.ticketweb.ca/event/dame-atlas/15026313',
    _embedded: {
      venues: [{ name: "Lee's Palace", country: { countryCode: 'CA' } }],
      attractions: [{ id: 'unrelated-performer', name: 'Dame Atlas' }],
    },
    dates: { start: { dateTime: '2027-02-21T02:00:00Z' } },
  };
  assert.equal(parseTicketmaster(event, 'ATLAS'), null);
});
