import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchConcertResource} from './concert-fetch.js';

test('Ticketmelon public waiting-room redirects are reported without entering the queue or exposing its token',async t=>{
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async (input: string|URL)=>{
    const url=new URL(input);calls.push(url.href);
    if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /');
    return new Response(null,{status:302,headers:{location:'https://ticketmelon.queue-it.net/?enqueuetoken=private-queue-token&t=https%3A%2F%2Fwww.ticketmelon.com%2Ffixture%2Fshow'}});
  });
  await assert.rejects(fetchConcertResource('https://www.ticketmelon.com/fixture/show','ticketmelon.com','html'),error=>{
    assert.ok(error instanceof Error);
    assert.match(error.message,/waiting room/i);
    assert.ok(!error.message.includes('private-queue-token'));
    return true;
  });
  assert.equal(calls.length,2);
  assert.ok(calls.every(url=>new URL(url).hostname==='www.ticketmelon.com'));
});

test('Waiting-room recognition never permits unrelated redirects or similar hostnames',async t=>{
  t.mock.method(globalThis,'fetch',async (input:string|URL)=>new URL(input).pathname==='/robots.txt'
    ?new Response('User-agent: *\nAllow: /')
    :new Response(null,{status:302,headers:{location:'https://ticketmelon.queue-it.net.evil.example/?secret=hidden'}}));
  await assert.rejects(fetchConcertResource('https://www.ticketmelon.com/fixture/other','ticketmelon.com','html'),/URL outside allowed source/);
});
