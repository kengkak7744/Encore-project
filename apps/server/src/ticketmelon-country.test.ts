import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTicketmelon} from './ticketmelon-source.js';

const page='https://www.ticketmelon.com/fixture/music';
const venue=(country:string)=>({name:'Venue',address_components:[{types:['country'],short_name:country,long_name:country}]});
const fixture=(overrides:Record<string,unknown>={})=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{event:{name:'Music event',venue:{type:'unknown'},currency:{code:'THB'},status:'publish',categories:['Music'],show_starttime:1801123200000,show_endtime:1801454400000,is_hide_web:false,...overrides}}}})+'</script>';

test('captured UnKonscious event location recovers Pattaya without inventing a venue',()=>{
  const result=analyzeTicketmelon(fixture({name:'UnKonscious Festival 2027',description:'<h1>UnKonscious Festival 2027</h1><h2>A Decade Pioneering Trance in Asia</h2><p>Celebrate 10 years of UnKonscious as we return to Pattaya for our biggest edition yet.</p>'}),page);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].country,'TH');
  assert.equal(result.events[0].city,'Pattaya');
  assert.equal(result.events[0].venue,null);
  assert.equal(result.events[0].venueLocation,null);
  assert.equal(result.events[0].startsAt,'2027-01-28T08:00:00.000Z');
  assert.equal(result.events[0].endsAt,'2027-02-01T04:00:00.000Z');
});

test('captured Zamna Thai event retains USD with unknown prices',()=>{
  const result=analyzeTicketmelon(fixture({name:'Zamna Phuket 2027 - VVIP PACKAGE',venue:{...venue('TH'),name:'Yeden Gardens'},currency:{code:'USD'}}),page);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].currency,'USD');
  assert.equal(result.events[0].priceMin,null);
  assert.equal(result.events[0].priceMax,null);
  assert.equal(result.events[0].country,'TH');
});

for(const [name,description] of [
  ['Habibeats','<p>DJ Habibeats returns to Kuala Lumpur for round two with SaturdaySelects.</p><p>📍 [Venue &mdash; TBA], Kuala Lumpur</p>'],
  ['TOK','<p>Venue: TBA<br>Kuching, Sarawak <br>20 March 2027<br>🎟️ Blind Sales available now</p>']
])test('captured '+name+' location is explicitly excluded as Malaysia',()=>{
  const result=analyzeTicketmelon(fixture({name,description,currency:{code:'MYR'}}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.outcome,'excluded');
  assert.equal(result.review?.reason,'outside_thailand');
  assert.equal(result.review?.evidence.country,'MY');
  assert.match(String(result.review?.evidence.descriptionLocation),/Kuala Lumpur|Kuching/);
});

test('YUMM missing location stays unresolved despite THB and Bangkok timezone',()=>{
  const result=analyzeTicketmelon(fixture({name:'YUMM SLUMBER PARTY',description:'<p>YUMM SLUMBER PARTY<br>STACKED LINE UP<br>21 NOV 2026<br>300 early bird</p>',timezone:{country:'Asia/Bangkok'}}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.reason,'unverified_country');
});

for(const description of [
  '<p>The DJ was born in Pattaya and toured Kuala Lumpur.</p>',
  '<p>Previously we returned to Pattaya in 2025.</p>',
  '<p>The event is inspired by our past tours in Pattaya.</p>',
  '<p>Organizer address: Pattaya, Thailand.</p>',
  '<p>We return to Pattaya was the title of last year\'s tour.</p>'
])test('incidental location mention does not verify country: '+description,()=>{
  const result=analyzeTicketmelon(fixture({description}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.reason,'unverified_country');
});

test('conflicting explicit program and structured country remains unresolved',()=>{
  const result=analyzeTicketmelon(fixture({venue:venue('TH'),description:'<p>Venue: TBA<br>Kuching, Sarawak<br>20 March 2027</p>'}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.outcome,'empty');
  assert.equal(result.review?.reason,'conflicting_country_evidence');
});

test('conflicting explicit program locations remain unresolved',()=>{
  const result=analyzeTicketmelon(fixture({description:'<p>Celebrate 10 years as we return to Pattaya for our biggest edition yet.</p><p>Venue: TBA<br>Kuching, Sarawak</p>'}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.reason,'conflicting_country_evidence');
});

test('structured country is retained despite unrelated title, currency and past-tour mentions',()=>{
  const result=analyzeTicketmelon(fixture({name:'Thailand Memories',venue:venue('MY'),currency:{code:'USD'},description:'<p>Music inspired by Pattaya tours.</p>'}),page);
  assert.equal(result.review?.reason,'outside_thailand');
  assert.equal(result.review?.evidence.country,'MY');
});

test('unreadable structured country components cannot be replaced by a program hint',()=>{
  const result=analyzeTicketmelon(fixture({venue:{name:'Venue',address_components:[{types:['country'],short_name:'???'}]},description:'<p>Celebrate 10 years as we return to Pattaya for our biggest edition yet.</p>'}),page);
  assert.equal(result.events.length,0);
  assert.equal(result.review?.reason,'unverified_country');
});

for(const code of ['', 'US', '123', 'THB/USD'])test('invalid or missing currency remains unresolved: '+code,()=>{
  const result=analyzeTicketmelon(fixture({venue:venue('TH'),currency:{code}}),page);
  assert.equal(result.review?.reason,'unsupported_or_missing_currency');
});

test('explicit TBA venue does not become a routing destination',()=>{
  const result=analyzeTicketmelon(fixture({venue:{...venue('TH'),name:'TBA'}}),page);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].venue,null);
  assert.equal(result.events[0].venueLocation,null);
});
