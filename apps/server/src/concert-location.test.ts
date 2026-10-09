import assert from 'node:assert/strict';
import test from 'node:test';
import {locationTarget,mapCoordinates,sourceLocation} from './concert-location.js';
import {parseEvents,parseTheConcert,parseTicketmelon,parseTicketmaster} from './ingest.js';
import {parseEventpopDetail,parseTheConcertApi} from './concert-parsers.js';
const url='https://www.ticketmelon.com/fixture/show',at='2026-10-09T03:00:00Z';
test('Source location never converts missing/city-only/zero/out-of-country coordinates into a venue',()=>{
  assert.equal(sourceLocation({address:'Bangkok, Thailand'},url,at),null);
  assert.equal(sourceLocation({latitude:null,longitude:null},url,at),null);
  assert.equal(sourceLocation({latitude:0,longitude:0},url,at),null);
  assert.equal(sourceLocation({latitude:51,longitude:-1},url,at),null);
  const location=sourceLocation({address:'99 Rama 1 Road, Bangkok',latitude:'13.75',longitude:'100.5'},url,at)!;
  assert.equal(locationTarget(location),'13.75,100.5');assert.equal(location.sourceUrl,url);
  assert.equal(locationTarget(sourceLocation({address:'99 Rama 1 Road, Bangkok'},url,at)),'99 Rama 1 Road, Bangkok');
  assert.equal(locationTarget(sourceLocation({address:'Ambiguous Hall, Bangkok, Thailand'},url,at)),null);
  assert.equal(sourceLocation({address:'99 Rama 1 Road'},'javascript:alert(1)',at),null);
  assert.deepEqual(mapCoordinates('https://evil.example/maps?query=13,100'),{});
});
test('Ticketmelon captures source address/coordinates/Place ID and rejects Product Delivery',()=>{
  const event={name:'Artist Music Night',categories:['Music'],venue:{name:'Source Hall',formatted_address:'99 Rama 1 Road, Bangkok, Thailand',latitude:13.75,longitude:100.5,place_id:'ChIJ_source'},currency:{code:'THB'},status:'publish',show_starttime:Date.parse('2026-12-20T12:00:00Z')};
  const markup=(name:string)=>'<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{event:{...event,venue:{...event.venue,name}}}}})+'</script>';
  const parsed=parseTicketmelon(markup('Source Hall'),url);assert.equal(parsed[0].venueLocation?.address,event.venue.formatted_address);assert.equal(parsed[0].venueLocation?.latitude,13.75);assert.equal(parsed[0].venueLocation?.placeId,'ChIJ_source');
  assert.equal(parseTicketmelon(markup('Product Delivery'),url).length,0);
});
test('JSON-LD, Eventpop, The Concert and Ticketmaster retain source locations instead of only names',()=>{
  const json={'@type':'MusicEvent',name:'Music Concert',startDate:'2026-12-20T12:00:00Z',location:{name:'Source Hall',address:{streetAddress:'99 Rama 1 Road',addressLocality:'Bangkok',addressCountry:'TH'},geo:{latitude:13.75,longitude:100.5}}};
  assert.match(parseEvents('<script type="application/ld+json">'+JSON.stringify(json)+'</script>','https://www.thaiticketmajor.com/concert/fixture.html')[0].venueLocation?.address || '',/99 Rama 1 Road/);
  const markup='<div id="event-title"><h2>Music Concert</h2></div><a class="event-date-range"><strong>20 Dec 2026 at 18:00 - 23:00</strong></a><meta property="og:location" content="99 Rama 1 Road, Bangkok, Thailand"><a href="https://www.google.com/maps/search/?api=1&amp;query=13.75,100.5"><strong>Source Hall</strong></a>';
  assert.equal(parseEventpopDetail(markup,'https://www.eventpop.me/e/123')[0].venueLocation?.latitude,13.75);
  const api={data:{id:123,name:'Music Concert',venue:{name:'Source Hall',address:'99 Rama 1 Road',lat:13.75,long:100.5,country:{name:'Thailand'}},attributes:[{code:'genre',items:[{name:'Music'}]}],show_time:{start:'2026-12-20 18:00:00'}}};
  assert.equal(parseTheConcertApi(api)[0].venueLocation?.longitude,100.5);
  const legacy='<h1>Music Concert</h1><div class="location-direct">Source Hall<a href="https://www.google.com/maps/search/?api=1&amp;query=13.75,100.5">Map</a></div><span id="date_show_time" data-date="20 ธ.ค. 26, 18:00 - 23:00 น."></span>';
  assert.equal(parseTheConcert(legacy,'https://www.theconcert.com/p/123')[0].venueLocation?.latitude,13.75);
  const ticketmaster={name:'Music Concert',url:'https://www.ticketmaster.com/fixture',dates:{start:{dateTime:'2026-12-20T12:00:00Z'}},_embedded:{venues:[{name:'Source Hall',address:{line1:'99 Rama 1 Road'},city:{name:'Bangkok'},country:{countryCode:'TH'},location:{latitude:'13.75',longitude:'100.5'}}]}};
  assert.equal(parseTicketmaster(ticketmaster,undefined,'TH')?.venueLocation?.latitude,'13.75');
});
