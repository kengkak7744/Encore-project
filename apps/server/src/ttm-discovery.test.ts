import assert from 'node:assert/strict';
import test from 'node:test';
import {pool} from './db.js';
import {discoverConcertSource} from './concert-discovery.js';

test('TTM stops repeated access challenges, rotates pending details and retains unverified listing dates',async t=>{
  let offset=0;
  t.mock.method(pool,'query',async(sql:string,params:unknown[]=[])=>{
    if(sql.startsWith('SELECT cursor_offset'))return {rows:[{cursor_offset:offset}]};
    if(sql.startsWith('INSERT INTO concert_discovery_cursors')){offset=Number(params[1]);return {rows:[]};}
    throw Error('Unexpected database operation');
  });
  const cards=Array.from({length:5},(_,index)=>`<div class="box-txt"><a class="title" href="/concert/fixture-${index}.html">Music ${index}</a><span class="datetime">12 ธันวาคม 2569</span><a class="venue">Hall</a></div>`).join('');
  const requests:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:string|URL)=>{
    const url=new URL(input);
    if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /');
    if(url.pathname==='/concert/')return new Response(cards,{headers:{'content-type':'text/html'}});
    requests.push(url.pathname);return new Response('<title>Access Verification</title>',{headers:{'content-type':'text/html'}});
  });
  const source={name:'ThaiTicketMajor',host:'ttm-stop.example',url:'https://ttm-stop.example/concert/',linkPattern:/\/concert\//};
  const first=await discoverConcertSource(source);
  assert.equal(requests.length,3);assert.equal(first.metrics.fetchFailures,3);assert.equal(first.metrics.pending,2);
  assert.equal(first.metrics.deferredListingFallback,2);assert.equal(first.metrics.listingFallback,5);
  assert.equal(first.events.length,5);assert.ok(first.events.every(event=>event.listingOnly&&event.timeTba&&event.priceMin===null));
  assert.equal(first.metrics.pages?.length,3);assert.equal(offset,3);
  requests.length=0;await discoverConcertSource(source);
  assert.equal(requests[0],'/concert/fixture-3.html');
});
