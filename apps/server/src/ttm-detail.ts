import * as cheerio from 'cheerio';
import type { ConcertEvent } from './concert-types.js';
import { parseTtmDates } from './ttm-listing.js';

export function ttmVenueMetadata(event: ConcertEvent): ConcertEvent {
  // TTM sometimes publishes the organizer's Maleenont office as a theatre's
  // JSON-LD address. Keep it only when that building is actually the named venue.
  const address=event.venueLocation?.address;
  if(address&&/maleenont|มาลีนนท์/i.test(address)&&!/maleenont|มาลีนนท์/i.test(event.venue || '')) {
    return {...event,venueLocation:{...event.venueLocation,address:null}};
  }
  return event;
}

export function parseTtmRounds(markup: string,event: ConcertEvent): ConcertEvent[] {
  const $=cheerio.load(markup);
  const rows=$('#section-event-round .box-event-list > .body > .row').toArray();
  const rounds=new Map<string,ConcertEvent>();
  let complete=rows.length>0;
  for(const row of rows) {
    const dateText=$(row).find('.col-label .date').first().text();
    const explicit=dateText.match(/\d{1,2}\s+[ก-๙.]+\s+(?:25|20)\d{2}/)?.[0];
    const dates=explicit?parseTtmDates(explicit):[];
    const times=$(row).find('.col-btn .item-show').toArray().map(el=>$(el).text().trim());
    if(dates.length!==1||!times.length) {complete=false;continue;}
    for(const time of times) {
      if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {complete=false;continue;}
      const localDay=new Date(Date.parse(dates[0])+7*3_600_000).toISOString().slice(0,10);
      const startsAt=new Date(localDay+'T'+time.padStart(5,'0')+':00+07:00').toISOString();
      rounds.set(startsAt,{...event,startsAt,endsAt:null,timeTba:false,
        performanceLabel:'รอบแสดงตามตารางผู้ขายบัตร เวลา '+time+' น.'});
    }
  }
  return [...rounds.values()].sort((a,b)=>a.startsAt!.localeCompare(b.startsAt!))
    .map(round=>({...round,completeSchedule:complete}));
}
