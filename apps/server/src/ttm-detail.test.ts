import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEvents } from './ingest.js';

const page = 'https://www.thaiticketmajor.com/concert/golden-fixture.html';
const schema = `<script type="application/ld+json">${JSON.stringify({ '@type':'Event',name:'Golden Fixture Concert',startDate:'2026-11-06T13:00:00',endDate:'2026-11-08T23:59:00',location:{'@type':'Place',name:'เมืองไทยรัชดาลัย เธียเตอร์',address:{streetAddress:'3199 Maleenont Tower 27th Floor, Rama IV Rd., Klongton, Klongtoey, Bangkok 10110',addressCountry:'TH'}},offers:[{price:'1000',priceCurrency:'TH'},{price:'10000',priceCurrency:'TH'}] })}</script>`;
const row = (date: string,times: string[]) => `<div class="row"><div class="col-label"><div class="date">${date}</div></div><div class="col-btn">${times.map(time=>`<a class="btn"><span class="item-show">${time}</span><span class="item-hide">ซื้อบัตร</span></a>`).join('')}</div></div>`;
const rounds = (rows: string) => `<section id="section-event-round"><div class="box-event-list"><div class="body">${rows}</div></div></section>`;

test('TTM announced rounds replace a misleading JSON-LD span without guessing times',()=>{
  const html=schema+rounds(row('วันเสาร์ที่ 7 พฤศจิกายน 2569',['13:00','18:30'])+row('วันอาทิตย์ที่ 8 พฤศจิกายน 2569',['13:00'])+row('วันศุกร์ที่ 6 พฤศจิกายน 2569 <br>(รอบการกุศล)',['18:30']));
  const result=parseEvents(html,page);
  assert.deepEqual(result.map(event=>event.startsAt),['2026-11-06T11:30:00.000Z','2026-11-07T06:00:00.000Z','2026-11-07T11:30:00.000Z','2026-11-08T06:00:00.000Z']);
  assert.ok(result.every(event=>event.completeSchedule&&event.endsAt===null&&!event.timeTba));
  assert.ok(result.every(event=>event.priceMin===1000&&event.priceMax===10000));
  assert.ok(result.every(event=>!event.venueLocation?.address),'The organizer office must not become the theatre address');
});

test('TTM incomplete rounds never declare a complete schedule or accept invalid dates/times',()=>{
  const result=parseEvents(schema+rounds(row('7 พฤศจิกายน 2569',['18:30'])+row('8 พฤศจิกายน 2569',['เร็ว ๆ นี้'])),page);
  assert.equal(result.length,1);assert.equal(result[0].startsAt,'2026-11-07T11:30:00.000Z');
  assert.equal(result[0].completeSchedule,false);
  for(const [date,time]of [['31 กุมภาพันธ์ 2570','18:30'],['7 พฤศจิกายน 2569','25:00']]){
    const fallback=parseEvents(schema+rounds(row(date,[time])),page);
    assert.equal(fallback.length,1);assert.ok(!fallback[0].completeSchedule);
  }
  assert.equal(parseEvents(schema+rounds(row('7 พฤศจิกายน 2569',['18:30'])),'https://example.com/event')[0].startsAt,'2026-11-06T06:00:00.000Z');
});
