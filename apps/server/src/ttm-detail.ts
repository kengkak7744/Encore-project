import * as cheerio from 'cheerio';
import type { ConcertEvent } from './concert-types.js';
import { parseTtmDates } from './ttm-listing.js';
import {ttmNonMusicPerformance} from './concert-page-evidence.js';

const onlineVenue = /rerun|live\s*stream|ttm\s*live|ออนไลน์/i;

function tablePrices(markup: string) {
  const $ = cheerio.load(markup);
  const paragraph = $('p').toArray().find(element => $(element).find('small').text().trim() === 'ราคาบัตร');
  if (!paragraph) return { priceMin: null,priceMax: null };
  const copy = $(paragraph).clone();
  copy.find('small').remove();
  const text = cheerio.load((copy.html() || '').replace(/^\s*<br\s*\/?\s*>/i,'').split(/<br\s*\/?\s*>/i)[0]).text().trim()
    .replace(/\s*\(Golden Seat\)/gi,'');
  // Read only the announced price line, never quantities or prices mentioned
  // later in eligibility/after-party instructions.
  if (!/^\d[\d,]*(?:\.\d{1,2})?(?:\s*\/\s*\d[\d,]*(?:\.\d{1,2})?)*\s*(?:บาท)?$/.test(text)) return { priceMin: null,priceMax: null };
  const prices = (text.match(/\d[\d,]*(?:\.\d{1,2})?/g) || []).map(value => Number(value.replaceAll(',','')));
  return { priceMin: Math.min(...prices),priceMax: Math.max(...prices) };
}

/** Recover physical sessions when a mixed-format page's JSON-LD describes its stream. */
export function parseTtmPhysicalDetail(markup: string,pageUrl: string): ConcertEvent[] {
  let page: URL;
  try { page = new URL(pageUrl); } catch { return []; }
  if (page.protocol !== 'https:' || !/(^|\.)thaiticketmajor\.com$/.test(page.hostname) || !/^\/(concert|performance)\/[^/]+\.html$/.test(page.pathname)) return [];
  const $ = cheerio.load(markup);
  const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
  try { if (!canonical || new URL(canonical,page).href !== page.href) return []; } catch { return []; }
  const title = $('h1.title').first().text().replace(/\s+/g,' ').trim();
  if (!title || ttmNonMusicPerformance(title,page.href)) return [];
  let status = 'scheduled';
  $('script[type="application/ld+json"]').each((_index,element) => {
    try {
      const value = JSON.parse($(element).html() || '{}');
      const records = Array.isArray(value) ? value : Array.isArray(value['@graph']) ? value['@graph'] : [value];
      for (const record of records) {
        if (!record || !/Event$/.test(String(record['@type'] || ''))) continue;
        if (record.url && new URL(record.url,page).href !== page.href) continue;
        const recordName = typeof record.name === 'string' ? cheerio.load(record.name).text().replace(/\s+/g,' ').trim() : '';
        if (!record.url && recordName !== title) continue;
        if (/cancelled/i.test(String(record.eventStatus || ''))) status = 'cancelled';
        else if (/postponed/i.test(String(record.eventStatus || '')) && status !== 'cancelled') status = 'postponed';
      }
    } catch { /* Invalid optional JSON-LD cannot invalidate explicit round tables. */ }
  });
  const items = $('#section-event-round .event-detail-item').toArray();
  const physical = items.filter(item => {
    const venue = $(item).find('.box-txt .venue').first().text().trim();
    return venue && !onlineVenue.test(venue);
  });
  // The current concert record has one venue. Do not combine separately located
  // performances into a single guessed destination.
  if (new Set(physical.map(item => $(item).find('.box-txt .venue').first().text().replace(/\s+/g,' ').trim())).size > 1) return [];
  const result: ConcertEvent[] = [];
  let complete = physical.length > 0;
  for (const item of physical) {
    const venue = $(item).find('.box-txt .venue').first().text().replace(/\s+/g,' ').trim();
    const details = `<section id="section-event-round">${$.html(item)}</section>`;
    let image: string | null = null;
    try {
      const poster = new URL($('meta[property="og:image"]').attr('content') || '',page);
      if (poster.protocol === 'https:' && poster.hostname === page.hostname && /^\/img_poster\//.test(poster.pathname)) image = poster.href;
    } catch { /* A missing poster must not discard verified rounds. */ }
    const base: ConcertEvent = { title,url: page.href,startsAt: null,venue,image,country: 'TH',currency: 'THB',status,
      ...tablePrices($(item).find('.box-txt').first().html() || ''),
      priceNote: 'ราคาบัตรจากตารางสถานที่แสดง ตรวจเงื่อนไขและสิทธิ์เข้าชมแต่ละรอบจากผู้ขายบัตร' };
    const rounds = parseTtmRounds(details,base);
    if (!rounds.length || rounds.some(round => !round.completeSchedule)) complete = false;
    result.push(...rounds);
  }
  // An unnamed table cannot safely be treated as either physical or online.
  if (items.some(item => !$(item).find('.box-txt .venue').first().text().trim())) complete = false;
  return result.map(round => ({ ...round,completeSchedule: complete }));
}

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
    const group = $(row).closest('.event-detail-item');
    const venue = group.find('.box-txt .venue').first().text().trim();
    if (venue && onlineVenue.test(venue)) continue;
    if (venue && event.venue && venue !== event.venue) { complete=false;continue; }
    const dateText=$(row).find('.col-label .date').first().text();
    const explicit=dateText.match(/\d{1,2}\s+[ก-๙.]+\s+(?:25|20)\d{2}/)?.[0];
    const dates=explicit?parseTtmDates(explicit):[];
    const times=$(row).find('.col-btn .item-show').toArray().map(el=>$(el).text().trim());
    if(dates.length!==1||!times.length) {complete=false;continue;}
    for(const time of times) {
      if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {complete=false;continue;}
      const localDay=new Date(Date.parse(dates[0])+7*3_600_000).toISOString().slice(0,10);
      const startsAt=new Date(localDay+'T'+time.padStart(5,'0')+':00+07:00').toISOString();
      const afterParty = /after\s*party/i.test(group.find('.box-txt').text());
      rounds.set(startsAt,{...event,...(venue ? tablePrices(group.find('.box-txt').first().html() || '') : {}),startsAt,endsAt:null,timeTba:false,
        ...(venue ? {priceNote:'ราคาบัตรจากตารางสถานที่แสดง ตรวจเงื่อนไขและสิทธิ์เข้าชมแต่ละรอบจากผู้ขายบัตร'} : {}),
        performanceLabel:(afterParty ? 'รอบ After Party ตามเงื่อนไขผู้ขายบัตร ' : 'รอบแสดงตามตารางผู้ขายบัตร ')+'เวลา '+time+' น.'});
    }
  }
  return [...rounds.values()].sort((a,b)=>a.startsAt!.localeCompare(b.startsAt!))
    .map(round=>({...round,completeSchedule:complete}));
}
