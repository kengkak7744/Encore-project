import * as cheerio from 'cheerio';
import type { ConcertEvent } from './concert-types.js';

const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const shortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
export { dates as parseTtmDates };
function dates(value: string): string[] {
  if (/[-–]|ถึง/.test(value)) {
    const parts = value.split(/[-–]|ถึง/).map(part => part.trim());
    if (parts.length !== 2) return [];
    const end = dates(parts[1]);
    if (end.length !== 1) return [];
    let left = parts[0];
    if (!/\b(25\d{2}|20\d{2})\b/.test(left)) {
      const year = parts[1].match(/\b(25\d{2}|20\d{2})\b/)?.[0];
      const month = months.findIndex((name,index) => parts[1].includes(name) || parts[1].includes(shortMonths[index]));
      if (!year || month < 0) return [];
      if (!months.some((name,index) => left.includes(name) || left.includes(shortMonths[index]))) left += ' '+months[month];
      left += ' '+year;
    }
    const start = dates(left);
    // Two adjacent calendar dates are explicit; longer spans do not establish daily shows.
    if (start.length !== 1 || Date.parse(end[0])-Date.parse(start[0]) !== 86_400_000) return [];
    return [start[0],end[0]];
  }
  const yearText = value.match(/\b(25\d{2}|20\d{2})\b/g);
  if (!yearText || new Set(yearText).size !== 1) return [];
  const year = Number(yearText[0]) >= 2400 ? Number(yearText[0]) - 543 : Number(yearText[0]);
  const month = months.findIndex((name,index) => value.includes(name) || value.includes(shortMonths[index]));
  if (month < 0 || year < 2020 || year > new Date().getFullYear() + 5) return [];
  // A non-range card spanning different months still needs a detail page.
  if (months.some((name,index) => index !== month && (value.includes(name) || value.includes(shortMonths[index])))) return [];
  const prefix = value.split(value.includes(months[month]) ? months[month] : shortMonths[month])[0];
  const days = [...prefix.matchAll(/\d{1,2}/g)].map(match => Number(match[0]));
  if (!days.length || days.some(day => day < 1 || day > 31)) return [];
  return [...new Set(days)].flatMap(day => {
    const local = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00+07:00`;
    const date = new Date(local);
    return new Intl.DateTimeFormat('en-US',{ timeZone: 'Asia/Bangkok',day: 'numeric' }).format(date) === String(day) ? [date.toISOString()] : [];
  });
}

export function parseTtmListing(markup: string,page: string): ConcertEvent[] {
  const $ = cheerio.load(markup);
  const found = new Map<string,ConcertEvent>();
  $('.box-txt a.title[href]').each((_index,element) => {
    const anchor = $(element),box = anchor.closest('.box-txt');
    let url: URL;
    try { url = new URL(anchor.attr('href')!,page); } catch { return; }
    if (url.protocol !== 'https:' || url.host !== new URL(page).host || !/^\/concert\/[^/]+\.html$/.test(url.pathname)) return;
    const title = anchor.text().replace(/\s+/g,' ').trim();
    const venue = box.find('.venue').text().replace(/\s+/g,' ').trim();
    if (!title || !venue || box.find('.venue.online').length || /rerun|ttm live|live\s*stream/i.test(venue)) return;
    const rows = box.find('.datetime').toArray();
    const show = rows.find(row => /วันแสดง/.test($(row).find('.txt-label').text()));
    const row = show || rows.find(row => !$(row).find('.txt-label').length);
    if (!row) return;
    const label = $(row).clone();label.find('.txt-label').remove();
    let image: string | null = null;
    try {
      const img = anchor.closest('.event-item').find('.box-img img').first();
      const poster = new URL(img.attr('data-src') || img.attr('src') || '',page);
      if (poster.protocol==='https:' && poster.host===new URL(page).host && /^\/img_poster\/.+\.(?:jpe?g|png|webp)$/i.test(poster.pathname)) image=poster.href;
    } catch { /* Optional artwork must not prevent date discovery. */ }
    for (const startsAt of dates(label.text().trim())) {
      const canonical = url.origin + url.pathname;
      found.set(canonical + startsAt,{ title,url: canonical,startsAt,timeTba: true,venue,image,country: 'TH',currency: 'THB',listingOnly: true,
        performanceLabel: 'วันแสดงตามหน้ารวม ยังไม่ยืนยันเวลาและรอบย่อย',
        priceMin: null,priceMax: null,priceNote: 'อ่านได้เฉพาะหน้ารวม ยังตรวจรายละเอียด เวลาแสดง และราคาบัตรไม่ได้' });
    }
  });
  return [...found.values()];
}
