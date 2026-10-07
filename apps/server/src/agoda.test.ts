import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from './config.js';
import { hotelQuote } from './agoda.js';

test('Agoda uses documented booking totals, labels sandbox data and never bypasses missing access',async t => {
  const before = { ...config };
  const calls: { url: string; body: any }[] = [];
  t.mock.method(globalThis,'fetch',async (input: string | URL,options?: RequestInit) => {
    calls.push({ url: String(input),body: JSON.parse(String(options?.body || '{}')) });
    if (String(input).endsWith('/token')) return Response.json({ success: true,token: 'fictional-fixture-token' });
    return Response.json({ properties: [{ rooms: [{ rate: { currency: 'THB',inclusive: 800,method: 'PRPN' },totalPayment: { inclusive: 3200 },landingUrl: 'https://www.agoda.com/fictional-fixture.html?checkin=2030-01-15&rooms=2' }] }] });
  });
  const request = { destination: 'กรุงเทพมหานคร',checkIn: '2030-01-15',checkOut: '2030-01-17',nights: 2,rooms: 2,adults: 4,travellerCountry: 'TH' };
  try {
    Object.assign(config,{ agodaEnabled: false });
    assert.equal(await hotelQuote(request),null); assert.equal(calls.length,0);
    Object.assign(config,{ agodaEnabled: true,agodaClientId: 'fixture',agodaClientSecret: 'fixture-secret',agodaTokenUrl: 'https://fixture.agoda.com/token',agodaSearchUrl: 'https://fixture.agoda.com/search',agodaEnvironment: 'sandbox',agodaPropertyIds: '{"BKK":[999999999]}' });
    const quote = await hotelQuote(request);
    assert.equal(quote?.amount,3200); assert.equal(quote?.currency,'THB'); assert.equal(quote?.live,false);
    assert.ok(quote?.observedAt && quote.validUntil);
    assert.equal(calls[1].body.criteria.rooms,2); assert.equal(calls[1].body.criteria.adults,4);
    assert.equal(calls[1].body.criteria.checkOut,'2030-01-17');
    assert.deepEqual(await hotelQuote(request),quote); assert.equal(calls.length,2);
  } finally { Object.assign(config,before); t.mock.restoreAll(); }
});

test('Agoda declines ambiguous currencies, selling restrictions and unsafe links, and surfaces provider failures',async t => {
  const before = { ...config };
  let room: any = {};
  let status = 200;
  const calls: string[] = [];
  t.mock.method(globalThis,'fetch',async (input: string | URL) => {
    calls.push(String(input));
    if (String(input).endsWith('/token')) return Response.json({ success: true,token: 'fictional-negative-token' });
    return status===200 ? Response.json({ properties: [{ rooms: [room] }] }) : new Response('',{ status });
  });
  Object.assign(config,{ agodaEnabled: true,agodaClientId: 'negative-fixture',agodaClientSecret: 'fixture-secret',agodaTokenUrl: 'https://fixture.agoda.com/token',agodaSearchUrl: 'https://fixture.agoda.com/search',agodaEnvironment: 'sandbox',agodaPropertyIds: '{"BKK":[999999997]}' });
  const request = { destination: 'กรุงเทพมหานคร',checkIn: '2030-02-01',checkOut: '2030-02-03',nights: 2,rooms: 1,adults: 2,travellerCountry: 'TH' };
  try {
    for (const [index,invalid] of [
      { rate: { currency: 'USD' },totalPayment: { inclusive: 100 },landingUrl: 'https://www.agoda.com/fixture' },
      { rate: { currency: 'THB',inclusive: 1000,method: 'PRPN' },landingUrl: 'https://www.agoda.com/fixture' },
      { rate: { currency: 'THB' },totalPayment: { inclusive: -100 },landingUrl: 'https://www.agoda.com/fixture' },
      { rate: { currency: 'THB' },totalPayment: { inclusive: 1000,minSellPrice: 1100 },landingUrl: 'https://www.agoda.com/fixture' },
      { rate: { currency: 'THB' },totalPayment: { inclusive: 1000 },landingUrl: 'https://agoda.com.evil.example/fixture' },
    ].entries()) {
      room=invalid;
      const day = String(index+1).padStart(2,'0'),out=String(index+3).padStart(2,'0');
      assert.equal(await hotelQuote({ ...request,checkIn: '2030-02-'+day,checkOut: '2030-02-'+out }),null);
    }
    status=429;
    await assert.rejects(hotelQuote({ ...request,checkIn: '2030-03-01',checkOut: '2030-03-03' }),/HTTP 429/);
    const previous=calls.length;
    config.agodaTokenUrl='https://unapproved.example/token';
    assert.equal(await hotelQuote(request),null); assert.equal(calls.length,previous);
    config.agodaTokenUrl='https://fixture.agoda.com/token'; config.agodaPropertyIds='{}';
    assert.equal(await hotelQuote(request),null); assert.equal(calls.length,previous);
  } finally { Object.assign(config,before); t.mock.restoreAll(); }
});
