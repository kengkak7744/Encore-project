import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEvents } from './ingest.js';
import { parseTtmPhysicalDetail,parseTtmRounds } from './ttm-detail.js';

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

const group = (venue: string,dates: string,price: string) => `<div class="event-detail-item"><div class="box-txt"><p><a class="venue">${venue}</a></p><p><small>ราคาบัตร</small><br>${price}</p></div><div class="box-event-list"><div class="body">${dates}</div></div></div>`;
const mixedPage = (body: string) => `<link rel="canonical" href="${page}"><meta property="og:image" content="https://www.thaiticketmajor.com/img_poster/physical.jpg"><h1 class="title">Golden Fixture Concert</h1>${rounds(body)}`;

test('TTM mixed streaming JSON-LD recovers only named physical tables and their own prices',()=>{
  const html=mixedPage(group('Union Hall',row('13 พฤศจิกายน 2569',['17:00'])+row('14 พฤศจิกายน 2569',['17:00']),'6,900 / 5,900 / 1,500')+
    group('Live Streaming by TTM LIVE',row('13 พฤศจิกายน 2569',['17:00']),'900')+
    group('RERUN by TTM LIVE',row('28 พฤศจิกายน 2569',['10:00']),'200'));
  const result=parseTtmPhysicalDetail(html,page);
  assert.equal(result.length,2);
  assert.deepEqual(result.map(event=>event.startsAt),['2026-11-13T10:00:00.000Z','2026-11-14T10:00:00.000Z']);
  assert.ok(result.every(event=>event.venue==='Union Hall'&&event.priceMin===1500&&event.priceMax===6900&&event.completeSchedule));
  assert.ok(result.every(event=>!event.venueLocation&&event.image?.endsWith('/physical.jpg')));
  const mixedSchema=schema.replace('เมืองไทยรัชดาลัย เธียเตอร์','Live Streaming by TTM LIVE');
  assert.deepEqual(parseEvents(mixedSchema+html,page),result,'Production parser must reach physical recovery after excluding streaming JSON-LD');
});

test('TTM separately priced physical after-party keeps its price and restrictions separate',()=>{
  const html=mixedPage(group('ICONSIAM HALL',row('24 ตุลาคม 2569',['18:00']),'35,000 / 8,500 / 2,500')+
    group('Live Streaming by TTM LIVE',row('24 ตุลาคม 2569',['18:00']),'900')+
    group('ICONSIAM HALL',row('24 ตุลาคม 2569',['21:00']),'2,500 บาท<br>ซื้อบัตร 8,500 เพื่อรับโค้ด after party จำนวน 1 ใบ'));
  const result=parseTtmPhysicalDetail(html,page);
  assert.equal(result.length,2);
  assert.deepEqual(result.map(event=>[event.startsAt,event.priceMin,event.priceMax]),[
    ['2026-10-24T11:00:00.000Z',2500,35000],['2026-10-24T14:00:00.000Z',2500,2500]]);
  assert.match(result[1].priceNote!,/เงื่อนไข/);
  assert.match(result[1].performanceLabel!,/After Party/);
});

test('TTM ordinary physical JSON-LD rounds use physical prices instead of mixed stream offers',()=>{
  const html=schema+rounds(group('เมืองไทยรัชดาลัย เธียเตอร์',row('7 พฤศจิกายน 2569',['18:30']),'1,500 / 6,900')+
    group('Live Streaming by TTM LIVE',row('7 พฤศจิกายน 2569',['18:30']),'100'));
  const result=parseEvents(html,page);
  assert.equal(result.length,1);assert.equal(result[0].priceMin,1500);assert.equal(result[0].priceMax,6900);
});

test('TTM physical recovery rejects foreign/mismatched pages, ambiguous prices and invalid rows',()=>{
  const html=mixedPage(group('Hall',row('7 พฤศจิกายน 2569',['18:30'])+row('8 พฤศจิกายน 2569',['เร็ว ๆ นี้']),'ซื้อ 2 ใบ ราคา 900 บาท'));
  assert.equal(parseTtmPhysicalDetail(html,'https://outside.example/concert/fixture.html').length,0);
  assert.equal(parseTtmPhysicalDetail(html.replace(page,'https://www.thaiticketmajor.com/concert/other.html'),page).length,0);
  const result=parseTtmPhysicalDetail(html,page);
  assert.equal(result.length,1);assert.equal(result[0].completeSchedule,false);assert.equal(result[0].priceMin,null);
  assert.equal(parseTtmPhysicalDetail(mixedPage(group('Live Streaming by TTM LIVE',row('7 พฤศจิกายน 2569',['18:30']),'900')),page).length,0);
  assert.equal(parseTtmPhysicalDetail(mixedPage(group('Hall A',row('7 พฤศจิกายน 2569',['18:30']),'900')+group('Hall B',row('8 พฤศจิกายน 2569',['18:30']),'900')),page).length,0);
  const physical={title:'Fixture',url:page,startsAt:null,venue:'Hall'};
  assert.equal(parseTtmRounds(mixedPage(group('Hall',row('7 พฤศจิกายน 2569',['18:30']),'900')+group('RERUN by TTM LIVE',row('8 พฤศจิกายน 2569',['18:30']),'100')),physical).length,1);
});

test('TTM physical recovery preserves announced cancellations and postponements',()=>{
  for(const status of ['cancelled','postponed']) {
    const html=mixedPage(group('Hall',row('7 พฤศจิกายน 2569',['18:30']),'900'))+
      `<script type="application/ld+json">${JSON.stringify({'@type':'Event',url:page,eventStatus:'https://schema.org/Event'+status})}</script>`;
    assert.equal(parseTtmPhysicalDetail(html,page)[0].status,status);
  }
});

test('TTM prices retain explicit Golden Seat tiers without extracting quantities from annotations',()=>{
  const html=mixedPage(group('Hall',row('6 พฤศจิกายน 2569',['18:30']),'7,000 (Golden Seat) / 5,000 / 1,000')+
    group('Hall',row('7 พฤศจิกายน 2569',['13:00']),'10,000 (Golden Seat) / 7,500 / 1,500'));
  assert.deepEqual(parseEvents(html,page).map(e=>[e.priceMin,e.priceMax]),[[1000,7000],[1500,10000]]);
  for(const price of ['7,000 (2 seats) / 1,000','7,000 (Golden Seat 2) / 1,000','ซื้อ 2 ใบ 7,000 / 1,000','7,000 (discount 50%) / 1,000']) {
    const rows=parseEvents(mixedPage(group('Hall',row('7 พฤศจิกายน 2569',['13:00']),price)),page);
    assert.equal(rows[0].priceMin,null,price);
    assert.equal(rows[0].priceMax,null,price);
  }
});
