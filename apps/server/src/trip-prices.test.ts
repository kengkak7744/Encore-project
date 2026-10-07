import assert from 'node:assert/strict';
import test from 'node:test';
import { applyManualPrices,BudgetInputError,manualPrices,tripTotals,type TripItem } from './trip-prices.js';

test('Manual units scale passengers and room nights while shared costs and booking totals stay whole',() => {
  const items: TripItem[] = ['ticket','flight','hotel','car'].map(kind => ({ kind: kind as TripItem['kind'],label: kind,amount: null,currency: 'THB',priceType: 'unavailable',note: 'No price' }));
  const prices = manualPrices({ ticket: { amount: 0,currency: 'THB',unit: 'person' },flight: { amount: 1200,currency: 'THB',unit: 'person_one_way' },hotel: { amount: 1250.5,currency: 'THB',unit: 'room_night' },car: { amount: 700,currency: 'THB',unit: 'group_total' } });
  const context = { people: 3,rooms: 2,nights: 2,enteredAt: '2026-10-05T10:00:00Z' };
  const result = applyManualPrices(items,prices,context);
  assert.deepEqual(result.map(item => item.amount),[0,7200,5002,700]);
  assert.deepEqual(tripTotals(result,'flight').totals,[{ currency: 'THB',amount: 12202 }]);
  assert.equal(tripTotals(result,'flight').complete,true);
  for (const [unit,expected] of [['room_stay',8400],['group_total',4200]] as const) {
    const changed = applyManualPrices(items,manualPrices({ hotel: { amount: 4200,currency: 'THB',unit } }),context);
    assert.equal(changed.find(item => item.kind==='hotel')?.amount,expected);
  }
});

test('Manual prices replace provider provenance and mixed-currency/incomplete totals remain explicit',() => {
  const items: TripItem[] = [
    { kind: 'ticket',label: 'ticket',amount: 100,currency: 'USD',priceType: 'observed',note: 'provider',sourceUrl: 'https://organizer.example/',observedAt: 'old',validUntil: 'old' },
    { kind: 'bus',label: 'bus',amount: null,currency: 'THB',priceType: 'unavailable',note: 'unknown' },
    { kind: 'hotel',label: 'hotel',amount: 1200,currency: 'THB',priceType: 'estimate',note: 'formula' },
  ];
  const result = applyManualPrices(items,manualPrices({ ticket: { amount: 25,currency: 'USD',unit: 'person' } }),{ people: 2,rooms: 1,nights: 1,enteredAt: '2026-10-05T10:00:00Z' });
  assert.equal(result[0].amount,50); assert.equal(result[0].priceType,'user'); assert.equal(result[0].sourceUrl,null); assert.equal(result[0].observedAt,undefined); assert.equal(result[0].validUntil,undefined); assert.equal(result[0].enteredAt,'2026-10-05T10:00:00Z');
  const summary = tripTotals(result,'bus');
  assert.equal(summary.complete,false); assert.deepEqual(summary.missingKinds,['bus']); assert.deepEqual(summary.totals,[{ currency: 'USD',amount: 50 },{ currency: 'THB',amount: 1200 }]);
});

test('Bad amounts, currencies, price scopes and unsafe URLs are rejected instead of coerced',() => {
  const price = { amount: 1,currency: 'THB',unit: 'person' };
  for (const invalid of [{ amount: -1 },{ amount: '100' },{ amount: 100.001 },{ amount: Infinity },{ currency: 'ABC' },{ unit: 'room_night' },{ sourceUrl: 'javascript:alert(1)' }]) assert.throws(() => manualPrices({ ticket: { ...price,...invalid } }),BudgetInputError);
  for (const input of [null,[],{ other: price }]) assert.throws(() => manualPrices(input),BudgetInputError);
  assert.equal(manualPrices({ ticket: { ...price,amount: 0.29,currency: 'thb' } }).ticket?.amount,0.29);
});
