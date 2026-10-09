import * as cheerio from 'cheerio';
import type { ConcertEvent } from './concert-types.js';
import { mapCoordinates } from './concert-location.js';

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const price = (value: unknown): number | null => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const music = /music|concert|festival|live\s?band|mini\s?concert|metal|hiphop|hip.hop|edm|house|techno|reggae|ska|underground|rock|pop|jazz|soul|r&b|classical|folk|blues|ดนตรี|คอนเสิร์ต|เพลง|ลูกทุ่ง|หมอลำ/i;
function iso(local: unknown) {
  const value = text(local);
  if (!value) return null;
  const parsed = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value.replace(' ', 'T') + '+07:00');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function image(value: unknown, page: string) {
  const raw = text(value);
  if (!raw || /placeholder/i.test(raw)) return null;
  try { const url = new URL(raw, page); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function eventpopPoster(markup: string, page: string) {
  if (!eventpopUrl(page)) return null;
  const $ = cheerio.load(markup);
  // Some event pages publish a placeholder Open Graph cover but a real full-size poster.
  const poster = $('.event-cover .poster-wrapper a[href]').first().attr('href') || $('.event-cover img').first().attr('src');
  return image(poster,page) || image($('meta[property="og:image"]').attr('content'),page);
}

export function eventpopUrl(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/e\/(\d+)(?:\/[^/]+)?\/?$/);
    return url.protocol === 'https:' && ['www.eventpop.me', 'eventpop.me'].includes(url.hostname) && match ? 'https://www.eventpop.me/e/' + match[1] : null;
  } catch { return null; }
}

export function parseEventpopDetail(markup: string, page: string): ConcertEvent[] {
  const url = eventpopUrl(page);
  if (!url) return [];
  const $ = cheerio.load(markup);
  const title = $('#event-title h2, #event-title h3').first().text().trim() || $('meta[property="og:title"]').attr('content')?.replace(/^Eventpop\s*\|\s*/i, '').trim();
  const category = $('.flex-xs-fill small').text() + $('#event-title').parent().find('small').text();
  if (!title || !music.test(title + ' ' + category)) return [];
  const location = $('meta[property="og:location"]').attr('content') || $('a[href*="google.com/maps"]').first().next('.pl-5').find('small').text().trim();
  if (location && !/(?:thailand|ประเทศไทย|ไทย)\s*$/i.test(location)) return [];
  const venue = $('a[href*="google.com/maps"] strong').first().text().trim() || location.split(',')[0]?.trim() || null;
  const city = location.split(',').length > 1 ? location.split(',').at(-2)?.trim() || null : null;
  const base: ConcertEvent = { title, url, startsAt: null, venue,venueLocation:{address:location || null,...mapCoordinates($('a[href*="google.com/maps"]').first().attr('href'))}, city, country: 'TH', currency: 'THB', image: eventpopPoster(markup,page), status: /cancelled|canceled|ยกเลิก/i.test(title) ? 'cancelled' : /postponed|เลื่อน/i.test(title) ? 'postponed' : 'scheduled', priceMin: null, priceMax: null };
  const parseDate = (value: string) => {
    const match = value.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(?:at\s+)?(\d{1,2}:\d{2}))?/);
    if (!match) return null;
    const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} ${match[4] || '00:00'} GMT+0700`);
    return Number.isFinite(parsed.getTime()) ? { startsAt: parsed.toISOString(), timeTba: !match[4] } : null;
  };
  const range = (value: string) => {
    const [left, right] = value.split(/\s+-\s+/, 2);
    const start = parseDate(left);
    let end = right ? parseDate(right)?.startsAt : null;
    if (start && !end && /^\d{1,2}:\d{2}$/.test(right || '')) {
      const prefix = left.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/)?.[0];
      end = prefix ? parseDate(prefix + ' ' + right)?.startsAt : null;
      if (end && Date.parse(end) < Date.parse(start.startsAt)) end = new Date(Date.parse(end) + 86400000).toISOString();
    }
    return start ? { ...start, endsAt: end && Date.parse(end) >= Date.parse(start.startsAt) ? end : null } : null;
  };
  const numbers = (value: string) => [...value.matchAll(/(?:฿|THB)\s*([\d,]+(?:\.\d{1,2})?)/g)].map(match => Number(match[1].replaceAll(',', '')));
  $('evp-react-island').each((_i, element) => {
    if (!$(element).attr('component')?.endsWith('NavigationStickyBar')) return;
    try {
      const props = JSON.parse($(element).attr('props') || '{}');
      const values = Array.isArray(props.priceRangeSatangs) ? props.priceRangeSatangs.map(price).filter((value: number | null) => value !== null) : [];
      if (values.length) { base.priceMin = Math.min(...values) / 100; base.priceMax = Math.max(...values) / 100; base.priceNote = 'ช่วงราคาที่ต้นทางเผยแพร่ อาจรวมแพ็กเกจหลายใบ ตรวจประเภทบัตรที่ต้นทาง'; }
    } catch { /* Ignore malformed public component data. */ }
  });
  const rounds: ConcertEvent[] = [];
  $('#event-showtimes .ticket-row').each((_i, element) => {
    const start = range($(element).find('.ticket-detail').text().trim());
    if (!start) return;
    const values = numbers($(element).find('.ticket-price').text());
    rounds.push({ ...base, ...start, ...(values.length ? { priceMin: Math.min(...values), priceMax: Math.max(...values) } : {}) });
  });
  // Embedded public showtimes may include hotel/shuttle/package products. Keep
  // announced event times, deduplicate identical times, and exclude transport.
  $('evp-react-island[component="events/EventShowtimeImageLayout"]').each((_i, element) => {
    try {
      const props = JSON.parse($(element).attr('props') || '{}');
      for (const row of props.initializationData?.showtimes || []) {
        if (/shuttle|transport|transfer/i.test(row.title || '') || /hotel|package/i.test(row.title || '') && !/festival ticket|beach party pass/i.test(row.title || '')) continue;
        const start = parseDate(row.start_at || '');
        if (!start) continue;
        rounds.push({ ...base, ...start, performanceLabel: text(row.title), endsAt: parseDate(row.end_at || '')?.startsAt || null, priceMin: null, priceMax: null });
      }
    } catch { /* Ignore malformed public component data. */ }
  });
  if (rounds.length) {
    const distinct = new Map<string | null,ConcertEvent>();
    for (const row of rounds) if (!distinct.has(row.startsAt)) distinct.set(row.startsAt,{ ...row,completeSchedule: true });
    return [...distinct.values()];
  }
  const raw = $('a.event-date-range strong').first().text().trim();
  const start = range(raw);
  return start ? [{ ...base, ...start, completeSchedule: true }] : base.status === 'cancelled' ? [base] : [];
}

export function theConcertListing(value: unknown) {
  const data = object(object(value).data);
  const pagination = object(data.pagination);
  const rows = Array.isArray(data.record) ? data.record : [];
  return { ids: [...new Set(rows.map(row => object(row).id).filter((id): id is number => Number.isSafeInteger(id) && id > 0 && id < 100_000_000))], lastPage: Number.isSafeInteger(pagination.last_page) && pagination.last_page > 0 ? pagination.last_page : 1 };
}

export function parseTheConcertApi(value: unknown, roundValue?: unknown): ConcertEvent[] {
  const data = object(object(value).data);
  const venue = object(data.venue);
  const country = text(object(venue.country).name);
  const genres = (Array.isArray(data.attributes) ? data.attributes : []).filter(item => object(item).code === 'genre').flatMap(item => Array.isArray(object(item).items) ? object(item).items : []).map(item => text(object(item).name) || '');
  if (!Number.isSafeInteger(data.id) || !text(data.name) || !/^(Thailand|TH|ประเทศไทย)$/i.test(country || '') || !genres.some(genre => music.test(genre))) return [];
  const children = object(object(roundValue).data).record;
  const rows = data.group_type === 'multiple' || data.group_type === 'group' || Array.isArray(children) ? (Array.isArray(children) ? children : []) : [data];
  const events: ConcertEvent[] = [];
  for (const row of rows) {
    const time = object(row.show_time);
    const startsAt = iso(time.start), endsAt = iso(time.end);
    if (!startsAt || endsAt && Date.parse(endsAt) < Date.parse(startsAt)) continue;
    const prices = object(row.price);
    if (prices.currency_code && prices.currency_code !== 'THB') continue;
    const values = prices.status === true ? [price(prices.min), price(prices.max)].filter((item): item is number => item !== null) : [];
    const images = Array.isArray(data.images) ? data.images : [];
    const description = text(data.description) ? cheerio.load(data.description).text() : '';
    events.push({ title: data.name, url: 'https://www.theconcert.com/p/' + data.id, startsAt, endsAt, timeTba: false, completeSchedule: true, performanceLabel: row !== data ? text(row.name) : null, venue: text(venue.name),venueLocation:{address:text(venue.address)||text(venue.formatted_address),latitude:venue.latitude ?? venue.lat,longitude:venue.longitude ?? venue.long ?? venue.lng}, city: text(object(venue.province).name), country: 'TH', currency: 'THB',
      priceMin: values.length ? Math.min(...values) : null, priceMax: values.length ? Math.max(...values) : null,
      priceNote: /โต๊ะ|table|แพ็กเกจ|package/i.test(description) ? 'ราคาต้นทางอาจเป็นโต๊ะหรือแพ็กเกจ ไม่ยืนยันเป็นราคาต่อคน ตรวจประเภทบัตรที่ต้นทาง' : null,
      image: image(images.find(item => object(item).tag === 'logo')?.url || images[0]?.url, 'https://www.theconcert.com'),
      status: /cancelled|canceled/i.test(time.status_text || '') ? 'cancelled' : /postponed/i.test(time.status_text || '') ? 'postponed' : 'scheduled' });
  }
  return events;
}
