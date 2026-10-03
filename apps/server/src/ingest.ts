import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { one, query } from './db.js';
import { config } from './config.js';
import { instagramFeedPosts, instagramMedia, newsUpsertSql } from './social-media.js';

import type { ConcertEvent as Event, DiscoveryMetrics } from './concert-types.js';
import { eventpopUrl, parseEventpopDetail } from './concert-parsers.js';
import { discoverConcertSource } from './concert-discovery.js';
import { recordConcertBackoff } from './concert-backoff.js';
type TicketmasterIdentity = { aliases: string[]; attractionIds: string[]; officialUrls: string[]; evidenceUrls?: Record<string, string> };
type Source = { name: string; url: string; host: string; linkPattern: RegExp };
const sources: Source[] = [
  { name: 'ThaiTicketMajor', url: 'https://www.thaiticketmajor.com/concert/', host: 'thaiticketmajor.com', linkPattern: /\/(concert|performance)\//i },
  { name: 'Eventpop', url: 'https://www.eventpop.me/', host: 'eventpop.me', linkPattern: /\/e\/\d+/i },
  { name: 'The Concert', url: 'https://www.theconcert.com/concert', host: 'theconcert.com', linkPattern: /\/(concert|event|show|p)\//i },
  { name: 'Ticketmelon', url: 'https://www.ticketmelon.com/', host: 'ticketmelon.com', linkPattern: /ticketmelon\.com\/[^/]+\/[^/]+/i },
];
const backupSources: Source[] = [
  { name: 'AllTicket', url: 'https://www.allticket.com/', host: 'allticket.com', linkPattern: /\/event\//i },
  { name: 'Live Nation Tero', url: 'https://www.livenationtero.co.th/en', host: 'livenationtero.co.th', linkPattern: /\/event(s)?\//i },
];
export function robotsAllows(robotsText: string, pathAndQuery: string, userAgent = 'ArtistTrackerResearch') {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group: (typeof groups)[number] | undefined;
  for (const line of robotsText.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const colon = clean.indexOf(':');
    if (colon < 0) continue;
    const key = clean.slice(0, colon).trim().toLowerCase();
    const value = clean.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && group && value.startsWith('/')) {
      group.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const agent = userAgent.toLowerCase();
  const specificity = (name: string) => name === '*' ? 0 : agent.includes(name) ? name.length : -1;
  const bestGroup = Math.max(-1, ...groups.flatMap((item) => item.agents.map(specificity)));
  if (bestGroup < 0) return true;
  let bestLength = -1;
  let allowed = true;
  for (const item of groups) {
    if (!item.agents.some((name) => specificity(name) === bestGroup)) continue;
    for (const rule of item.rules) {
      const anchored = rule.path.endsWith('$');
      const path = anchored ? rule.path.slice(0, -1) : rule.path;
      const pattern = '^' + [...path].map((char) => char === '*' ? '.*' : /[\\^$.*+?()[\]{}|]/.test(char) ? '\\' + char : char).join('') + (anchored ? '$' : '');
      if (!new RegExp(pattern).test(pathAndQuery)) continue;
      const length = path.replace(/\*/g, '').length;
      if (length > bestLength || (length === bestLength && rule.allow)) { bestLength = length; allowed = rule.allow; }
    }
  }
  return allowed;
}

function nodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  const object = value as Record<string, unknown>;
  return [object, ...nodes(object['@graph'])];
}
function str(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function imageUrl(value: unknown): string | null { return str(value) || (value && typeof value === 'object' ? str((value as Record<string, unknown>).url) : null); }
function money(value: unknown): number | null {
  if ((typeof value !== 'string' || !value.trim()) && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function offerSummary(value: unknown) {
  const offers = (Array.isArray(value) ? value : [value]).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
  const currencies = new Set(offers.map((item) => {
    const code = str(item.priceCurrency)?.toUpperCase();
    return code === 'TH' || code === 'BAHT' ? 'THB' : code;
  }).filter(Boolean));
  const currency = [...currencies][0];
  if (currencies.size > 1 || (currency && !/^[A-Z]{3}$/.test(currency))) return { priceMin: null, priceMax: null, currency: 'THB' };
  const minimums = offers.map((item) => money(item.lowPrice ?? item.price)).filter((item): item is number => item !== null);
  const maximums = offers.map((item) => money(item.highPrice ?? item.price)).filter((item): item is number => item !== null);
  return { priceMin: minimums.length ? Math.min(...minimums) : null, priceMax: maximums.length ? Math.max(...maximums) : null, currency: currency || 'THB' };
}
function decodeTitle(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (full, entity: string) => {
    const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entity.startsWith('#')) {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
    }
    return named[entity.toLowerCase()] || full;
  });
}
function eventDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const local = dateOnly ? value + 'T00:00:00+07:00' : hasZone ? value : value + '+07:00';
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : { iso: date.toISOString(), timeTba: dateOnly };
}

export function parseEvents(markup: string, pageUrl: string): Event[] {
  const $ = cheerio.load(markup);
  const found: Event[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      for (const item of nodes(JSON.parse($(element).html() || '{}'))) {
        const type = item['@type'];
        if (!(Array.isArray(type) ? type : [type]).some((part) => typeof part === 'string' && /event$/i.test(part))) continue;
        const title = str(item.name), date = str(item.startDate);
        const start = date ? eventDate(date) : null;
        if (!title || !start) continue;
        const place = item.location && typeof item.location === 'object' ? item.location as Record<string, unknown> : {};
        const address = place.address && typeof place.address === 'object' ? place.address as Record<string, unknown> : {};
        const prices = offerSummary(item.offers);
        const performer = Array.isArray(item.performer) ? item.performer[0] : item.performer;
        const artist = performer && typeof performer === 'object' ? str((performer as Record<string, unknown>).name) : str(performer);
        found.push({ title: decodeTitle(title), url: str(item.url) || pageUrl, startsAt: start.iso, endsAt: str(item.endDate) ? eventDate(str(item.endDate)!)?.iso : null, timeTba: start.timeTba, venue: str(place.name), city: str(address.addressLocality), country: str(address.addressCountry) || 'TH', description: str(item.description), image: imageUrl(Array.isArray(item.image) ? item.image[0] : item.image), ...prices, status: /cancelled/i.test(String(item.eventStatus || '')) ? 'cancelled' : /postponed/i.test(String(item.eventStatus || '')) ? 'postponed' : 'scheduled', artist });
      }
    } catch { /* Invalid third-party JSON-LD cannot stop the remaining items. */ }
  });
  return found;
}

export function parseEventpop(markup: string, pageUrl: string): Event[] {
  return parseEventpopDetail(markup, pageUrl);
}

export function parseEventpopMeta(markup: string, pageUrl: string): Event[] {
  const url = new URL(pageUrl);
  if (!['eventpop.me', 'www.eventpop.me'].includes(url.hostname) || !/^\/e\/\d+(?:\/[\w-]+)?\/?$/.test(url.pathname)) return [];
  const $ = cheerio.load(markup);
  const meta = (key: string) => str($(`meta[property="${key}"]`).attr('content'));
  const title = meta('og:title')?.replace(/^Eventpop\s*\|\s*/i, '').trim();
  const startText = meta('og:start_time');
  const location = meta('og:location')?.split(',').map((part) => part.trim()).filter(Boolean) || [];
  if (!title || !/(concert|music|คอนเสิร์ต|ดนตรี|เพลง|มิวสิค)/i.test(title) || !startText || !/\+07:00$/.test(startText) || location.length < 2 || !/^(thailand|ไทย|ประเทศไทย)$/i.test(location.at(-1)!)) return [];
  const startsAt = eventDate(startText)?.iso;
  if (!startsAt) return [];
  const endText = meta('og:end_time');
  const endsAt = endText && /\+07:00$/.test(endText) ? eventDate(endText)?.iso : null;
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) return [];
  return [{ title, url: url.origin + url.pathname, startsAt, endsAt, venue: location.length >= 3 ? location.slice(0, -2).join(', ') : location[0], city: location.length >= 3 ? location.at(-2) : null, country: 'TH', image: meta('og:image') }];
}

const thaiMonths: Record<string, number> = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
export function parseTheConcert(markup: string, pageUrl: string): Event[] {
  const url = new URL(pageUrl);
  if (url.hostname !== 'www.theconcert.com' || !/^\/p\/\d+$/.test(url.pathname)) return [];
  const $ = cheerio.load(markup);
  if ($('select-concert-btn').attr('has_round') === 'true') return [];
  const title = $('h1').first().text().trim();
  const venue = $('.location-direct').first().clone().find('a').remove().end().text().trim();
  const rawDate = $('#date_show_time').attr('data-date') || '';
  const match = rawDate.match(/^\s*(\d{1,2})\s+(\S+)\s+(\d{2}|\d{4}),\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*น\.\s*$/);
  if (!title || !venue || !match || !thaiMonths[match[2]] || !/(concert|music|คอนเสิร์ต|ดนตรี)/i.test(title) && !/ดนตรีสด/.test($('.genre-box').text())) return [];
  const mapHref = $('.location-direct a[href]').first().attr('href');
  if (!mapHref) return [];
  let map: URL;
  try { map = new URL(mapHref); } catch { return []; }
  const coords = map.searchParams.get('query')?.split(',').map(Number);
  if (map.hostname !== 'www.google.com' || map.pathname !== '/maps/search/' || coords?.length !== 2 || !(coords[0] >= 5.5 && coords[0] <= 20.5 && coords[1] >= 97.3 && coords[1] <= 105.7)) return [];
  let year = Number(match[3]);
  year = year < 100 ? year + 2000 : year >= 2400 ? year - 543 : year;
  const day = Number(match[1]);
  const date = `${year}-${String(thaiMonths[match[2]]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const checked = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(checked.getTime()) || checked.getUTCFullYear() !== year || checked.getUTCMonth() + 1 !== thaiMonths[match[2]] || checked.getUTCDate() !== day) return [];
  const startsAt = eventDate(`${date}T${match[4].padStart(2, '0')}:${match[5]}:00+07:00`)?.iso;
  let endsAt = eventDate(`${date}T${match[6].padStart(2, '0')}:${match[7]}:00+07:00`)?.iso;
  if (!startsAt || !endsAt) return [];
  if (Date.parse(endsAt) < Date.parse(startsAt)) endsAt = new Date(Date.parse(endsAt) + 86400000).toISOString();
  const priceText = $('.price').first().text().trim();
  const priceMin = priceText.match(/^฿\s*([\d,]+(?:\.\d{1,2})?)$/) ? money(priceText.replace(/[฿,\s]/g, '')) : null;
  const image = str($('meta[property="og:image"]').attr('content'));
  return [{ title, url: pageUrl, startsAt, endsAt, venue, country: 'TH', priceMin, currency: 'THB', image: image && validUrl(image) ? image : null }];
}

export function parseTicketmelon(markup: string, pageUrl: string): Event[] {
  const url = new URL(pageUrl);
  if (url.hostname !== 'www.ticketmelon.com' || !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return [];
  const embedded = cheerio.load(markup)('script#__NEXT_DATA__').html();
  if (!embedded) return [];
  let event: Record<string, unknown>;
  try { event = record(record(record(JSON.parse(embedded)).props).pageProps).event as Record<string, unknown>; }
  catch { return []; }
  if (!event || typeof event !== 'object') return [];
  const title = str(event.name);
  const categories = Array.isArray(event.categories) ? event.categories : [];
  const venue = record(event.venue);
  const currency = record(event.currency);
  const startsAtMs = Number(event.show_starttime);
  const endsAtMs = Number(event.show_endtime);
  const status = str(event.status)?.toLowerCase();
  if (!title || /(?:the series|ตอนที่|episode\s*\d)/i.test(title) || !categories.some((item) => typeof item === 'string' && /music|concert|ดนตรี|คอนเสิร์ต/i.test(item)) ||
      !/thailand|ประเทศไทย|ไทย/i.test(str(venue.formatted_address) || '') || str(currency.code) !== 'THB' ||
      !Number.isFinite(startsAtMs) || startsAtMs < Date.parse('2020-01-01') ||
      !['publish', 'cancelled', 'canceled', 'postponed'].includes(status || '') || event.is_hide_web === true) return [];
  const artists = Array.isArray(event.artist_tag) ? event.artist_tag : [];
  return [{ title, url: url.origin + url.pathname, startsAt: new Date(startsAtMs).toISOString(),
    endsAt: Number.isFinite(endsAtMs) && endsAtMs > startsAtMs ? new Date(endsAtMs).toISOString() : null,
    venue: str(venue.name), country: 'TH', image: str(event.img_poster), priceMin: null, priceMax: null, currency: 'THB',
    status: status === 'cancelled' || status === 'canceled' ? 'cancelled' : status === 'postponed' ? 'postponed' : 'scheduled',
    artist: str(record(artists[0]).artist) }];
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function localTimeToUtc(localDate: string, localTime: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(localTime)) return null;
  const target = Date.parse(`${localDate}T${localTime.length === 5 ? localTime + ':00' : localTime}Z`);
  if (!Number.isFinite(target)) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const localValue = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    };
    let instant = target;
    for (let i = 0; i < 3; i++) instant += target - localValue(instant);
    return localValue(instant) === target ? new Date(instant).toISOString() : null;
  } catch { return null; }
}

function identityUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'x.com') host = 'twitter.com';
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    // A platform home page cannot identify a performer.
    if (!path && ['facebook.com', 'instagram.com', 'twitter.com'].includes(host)) return null;
    return host + path + (url.pathname === '/profile.php' ? '?' + url.searchParams.get('id') : '');
  } catch { return null; }
}

export function matchTicketmasterAttraction(item: unknown, identity: TicketmasterIdentity) {
  const embedded = record(record(item)._embedded);
  const attractions = Array.isArray(embedded.attractions) ? embedded.attractions.map(record) : [];
  const names = new Set(identity.aliases.map(normalized));
  const official = new Set(identity.officialUrls.map(identityUrl).filter(Boolean));
  for (const attraction of attractions) {
    const id = str(attraction.id), name = str(attraction.name);
    if (!id || !name || !names.has(normalized(name))) continue;
    if (identity.attractionIds.includes(id)) return { id, evidenceUrl: identity.evidenceUrls?.[id] || str(attraction.url) || undefined };
    for (const entries of Object.values(record(attraction.externalLinks))) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const url = str(record(entry).url);
        const canonical = url ? identityUrl(url) : null;
        if (url && canonical && official.has(canonical)) return { id, evidenceUrl: url };
      }
    }
  }
  return null;
}

export function parseTicketmaster(item: unknown, artist?: string, countryFilter?: string, identity?: TicketmasterIdentity): Event | null {
  const data = record(item);
  const venue = record(record(data._embedded).venues instanceof Array ? (record(data._embedded).venues as unknown[])[0] : null);
  const country = str(record(venue.country).countryCode)?.toUpperCase();
  const title = str(data.name), url = str(data.url);
  if (!title || !url || !validUrl(url) || !country || !/^[A-Z]{2}$/.test(country) || (countryFilter ? country !== countryFilter : country === 'TH')) return null;
  const performer = !countryFilter && artist ? matchTicketmasterAttraction(item, identity || { aliases: [artist], attractionIds: [], officialUrls: [] }) : null;
  if (!countryFilter && (!artist || !performer)) return null;
  const dates = record(data.dates), start = record(dates.start);
  if (start.dateTBA === true || start.dateTBD === true) return null;
  const explicit = str(start.dateTime);
  let startsAt = explicit && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(explicit) && Number.isFinite(Date.parse(explicit)) ? new Date(explicit).toISOString() : null;
  if (!startsAt) {
    const localDate = str(start.localDate), zone = str(dates.timezone) || str(venue.timezone);
    if (localDate && zone) startsAt = localTimeToUtc(localDate, str(start.localTime) || '00:00', zone);
  }
  if (!startsAt) return null;
  const ranges = (Array.isArray(data.priceRanges) ? data.priceRanges : []).map(record);
  const priceBearing = ranges.filter((range) => range.min != null || range.max != null);
  const currencies = new Set(priceBearing.map((range) => str(range.currency)?.toUpperCase()));
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const validCurrency = !!currency && /^[A-Z]{3}$/.test(currency);
  const minimums = validCurrency ? priceBearing.map((range) => money(range.min)).filter((value): value is number => value !== null) : [];
  const maximums = validCurrency ? priceBearing.map((range) => money(range.max)).filter((value): value is number => value !== null) : [];
  const rawStatus = str(record(dates.status).code)?.toLowerCase();
  const status = rawStatus === 'canceled' || rawStatus === 'cancelled' ? 'cancelled' : rawStatus === 'postponed' ? 'postponed' : 'scheduled';
  const images = (Array.isArray(data.images) ? data.images : []).map(record)
    .filter((image) => image.fallback !== true && str(image.url) && validUrl(str(image.url)!));
  const width = (image: Record<string, unknown>) => typeof image.width === 'number' && Number.isFinite(image.width) && image.width > 0 ? image.width : 0;
  images.sort((a, b) => Number(b.ratio === '16_9') - Number(a.ratio === '16_9') || width(b) - width(a));
  const image = images.length ? str(images[0].url) : null;
  return { title, url, startsAt, timeTba: start.timeTBA === true || start.noSpecificTime === true || !str(start.localTime) && !explicit, venue: str(venue.name), city: str(record(venue.city).name), country, description: str(data.info) || str(data.pleaseNote), image, priceMin: minimums.length ? Math.min(...minimums) : null, priceMax: maximums.length ? Math.max(...maximums) : null, currency: validCurrency ? currency : 'XXX', status, artist, ...(performer ? { ticketmasterAttractionId: performer.id, artistEvidenceUrl: performer.evidenceUrl } : {}) };
}

export function parseLiveNation(markup: string, pageUrl: string): Event[] {
  const $ = cheerio.load(markup);
  const title = $('h1').first().text().trim();
  const heading = $('h2').map((_i, el) => $(el).text().trim()).get().find((value) => /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(value));
  const dateText = heading?.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/)?.[1];
  if (!title || !dateText) return [];
  const date = new Date(dateText + ' 00:00 GMT+0700');
  if (Number.isNaN(date.getTime())) return [];
  const description = $('meta[name="description"]').attr('content') || '';
  const venue = description.match(/\bat (.+?) on (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),/i)?.[1] || null;
  const city = description.match(/\b(Bangkok|Chiang Mai|Phuket|Pattaya|Nonthaburi)\b/i)?.[1] || null;
  const image = $('meta[property="og:image"]').attr('content') || null;
  return [{ title, url: pageUrl, startsAt: date.toISOString(), timeTba: true, venue, city, country: 'TH', image, status: /cancelled/i.test($('main').text().slice(0, 300)) ? 'cancelled' : 'scheduled' }];
}

export function parseTheConcertHighlightIds(value: unknown): number[] {
  const records = record(record(value).data).record;
  if (!Array.isArray(records)) return [];
  return [...new Set(records.map((item) => record(item).id).filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id < 100_000_000))].slice(0, 10);
}

function normalized(text: string) { return text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function slug(text: string) { return createHash('sha1').update(text).digest('hex').slice(0, 14); }
function validUrl(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

export async function saveEvent(source: string, event: Event) {
  if (!validUrl(event.url)) return false;
  const date = event.startsAt ? new Date(event.startsAt) : null;
  if (date && Number.isNaN(date.getTime())) return false;
  const existingSource = await one<{ concert_id: string }>(`SELECT concert_id FROM concert_sources WHERE source_url=$1 OR ($2::text IS NOT NULL AND source_name='Eventpop' AND substring(source_url from '/e/([0-9]+)')=$2) LIMIT 1`, [event.url, source === 'Eventpop' ? eventpopUrl(event.url)?.match(/\/e\/(\d+)/)?.[1] || null : null]);
  let concertId = existingSource?.concert_id;
  if (!concertId && !date) return false;
  if (!concertId && date) {
    const candidate = await one<{ id: string }>("SELECT id FROM concerts WHERE (starts_at BETWEEN $1::timestamptz - interval '12 hours' AND $1::timestamptz + interval '12 hours' OR ($3::boolean AND (starts_at AT TIME ZONE 'Asia/Bangkok')::date = ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date)) AND country_code=$4 AND $5::text IS NOT NULL AND lower(venue)=lower($5) AND similarity(lower(title), lower($2)) > 0.72 ORDER BY similarity(lower(title), lower($2)) DESC LIMIT 1", [date.toISOString(), event.title, event.timeTba || false, event.country?.slice(0, 2).toUpperCase() || 'TH', event.venue || null]);
    concertId = candidate?.id;
  }
  if (!concertId) {
    const key = slug(normalized(event.title) + '|' + (date?.toISOString().slice(0, 10) || '') + '|' + (event.city || '') + '|' + normalized(event.venue || '') + '|' + (event.country || 'TH'));
    const row = await one<{ id: string }>('INSERT INTO concerts(slug,title,description,venue,city,country_code,starts_at,ends_at,time_tba,status,price_min,price_max,currency,image_url,official_url,last_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()) ON CONFLICT(slug) DO UPDATE SET updated_at = now() RETURNING id', ['event-' + key, event.title, event.description || null, event.venue || null, event.city || null, event.country?.slice(0, 2).toUpperCase() || 'TH', date?.toISOString() || null, event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.priceMin ?? null, event.priceMax ?? null, event.currency || 'THB', event.image || null, event.url]);
    concertId = row!.id;
  }
  const role = source === 'Live Nation Tero' ? 'organizer' : 'ticket';
  await query('INSERT INTO concert_sources(concert_id,source_name,source_url,source_role,raw_data,fetched_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(source_url) DO UPDATE SET raw_data = EXCLUDED.raw_data, source_role=EXCLUDED.source_role, fetched_at = now(), last_error = null', [concertId, source, event.url, role, JSON.stringify(event)]);
  // Manual organizer corrections retain precedence over ticketing metadata.
  const hasOrganizer = await one('SELECT 1 FROM concert_sources WHERE concert_id = $1 AND source_role = \'organizer\'', [concertId]);
  if (role === 'organizer' || !hasOrganizer) await query('UPDATE concerts SET title=$2, description=COALESCE($3,description), venue=COALESCE($4,venue), city=COALESCE($5,city), starts_at=CASE WHEN $8 AND NOT time_tba AND starts_at IS NOT NULL THEN starts_at ELSE COALESCE($6,starts_at) END, ends_at=COALESCE($7,ends_at), time_tba=CASE WHEN $8 AND NOT time_tba AND starts_at IS NOT NULL THEN false ELSE $8 END, status=$9, price_min=COALESCE($10,price_min), price_max=COALESCE($11,price_max), image_url=COALESCE($12,image_url), currency=$13, last_verified_at=now(), updated_at=now() WHERE id=$1 AND manual_override=false', [concertId, event.title, event.description || null, event.venue || null, event.city || null, date?.toISOString() || null, event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.priceMin ?? null, event.priceMax ?? null, event.image || null, event.currency || 'THB']);
  const protectedConcert = await one<{ manual_override: boolean }>('SELECT manual_override FROM concerts WHERE id=$1', [concertId]);
  if (date && !protectedConcert?.manual_override && (role === 'organizer' || !hasOrganizer)) {
    const preciseRound = event.timeTba ? await one("SELECT id FROM concert_performances WHERE concert_id=$1 AND NOT time_tba AND (starts_at AT TIME ZONE 'Asia/Bangkok')::date = ($2::timestamptz AT TIME ZONE 'Asia/Bangkok')::date", [concertId, date.toISOString()]) : null;
    if (!preciseRound) await query('INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url,performance_label) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(concert_id,starts_at) DO UPDATE SET ends_at=COALESCE(EXCLUDED.ends_at,concert_performances.ends_at), time_tba=concert_performances.time_tba AND EXCLUDED.time_tba, status=EXCLUDED.status, source_url=EXCLUDED.source_url, performance_label=COALESCE(EXCLUDED.performance_label,concert_performances.performance_label), is_current=true, updated_at=now()', [concertId, date.toISOString(), event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.url, event.performanceLabel || null]);
  }
  if (!protectedConcert?.manual_override && (role === 'organizer' || !hasOrganizer)) await query('UPDATE concerts SET price_note=$2 WHERE id=$1', [concertId, event.priceNote || ((event.priceMin == null && event.priceMax == null) ? 'ต้นทางรอบนี้ยังไม่ระบุราคา ราคาที่แสดงเดิม (ถ้ามี) ต้องตรวจสอบอีกครั้ง' : null)]);
  if (event.artist) await query('INSERT INTO concert_artists(concert_id,artist_id) SELECT $1,id FROM artists WHERE lower(name)=lower($2) OR lower(name_en)=lower($2) ON CONFLICT DO NOTHING', [concertId, event.artist]);
  // Foreign Ticketmaster performers have been verified; title keywords cannot add other artists.
  if (source === 'Ticketmaster' && event.country !== 'TH') return !existingSource;
  const titleWords = ' ' + normalized(event.title) + ' ';
  const catalog = await query<{ id: string; name: string; name_en: string | null }>("SELECT id,name,name_en FROM artists WHERE kind <> 'member'");
  for (const artist of catalog) {
    const names = [artist.name, artist.name_en].filter(Boolean) as string[];
    if (names.some((name) => titleWords.includes(' ' + normalized(name) + ' '))) {
      await query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [concertId, artist.id]);
    }
  }
  return !existingSource;
}

export async function saveSourceEvents(source: string, events: Event[]) {
  let changed = 0;
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    if (await saveEvent(source, event)) changed++;
    const group = groups.get(event.url) || [];
    group.push(event); groups.set(event.url, group);
  }
  for (const [url, rows] of groups) {
    const concert = await one<{ id: string; manual_override: boolean; organizer: boolean }>(`SELECT c.id,c.manual_override,
      EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_role='organizer') AS organizer
      FROM concerts c JOIN concert_sources s ON s.concert_id=c.id WHERE s.source_url=$1`, [url]);
    if (!concert || concert.manual_override || concert.organizer && source !== 'Live Nation Tero') continue;
    const times = rows.filter(row => row.startsAt).map(row => row.startsAt!);
    if (times.length && rows.every(row => row.completeSchedule)) {
      // Removed dates stay in history; removal alone is not a cancellation.
      await query(`UPDATE concert_performances SET is_current=false,updated_at=now()
        WHERE concert_id=$1 AND source_url=$2 AND (starts_at >= now() OR time_tba)
        AND NOT(starts_at=ANY($3::timestamptz[]))`, [concert.id, url, times]);
    }
    const dated = rows.filter(row => row.startsAt).sort((a,b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
    const first = dated.find(row => Date.parse(row.endsAt || row.startsAt!) >= Date.now()) || dated[0];
    if (first) {
      const last = dated.at(-1)!;
      const mins = dated.map(row => row.priceMin).filter((value): value is number => value != null);
      const maxs = dated.map(row => row.priceMax ?? row.priceMin).filter((value): value is number => value != null);
      await query(`UPDATE concerts SET starts_at=CASE WHEN $4 AND NOT time_tba THEN starts_at ELSE $2 END,
        ends_at=CASE WHEN $4 AND NOT time_tba THEN ends_at ELSE $3 END,time_tba=CASE WHEN $4 AND NOT time_tba THEN false ELSE $4 END,
        price_min=COALESCE($5,price_min),price_max=COALESCE($6,price_max) WHERE id=$1 AND NOT manual_override`,
        [concert.id,first.startsAt,last.endsAt || null,first.timeTba || false,mins.length ? Math.min(...mins) : null,maxs.length ? Math.max(...maxs) : null]);
    }
  }
  return changed;
}

type SourceResult = { seen: number; changed: number; metrics?: DiscoveryMetrics; status?: 'success' | 'partial' | 'failed' | 'skipped'; error?: string };
async function runSource(name: string, category: 'concert' | 'news' | 'travel', load: () => Promise<SourceResult>, cycleId?: number) {
  await query('INSERT INTO source_state(source_name,category,last_started_at) VALUES($1,$2,now()) ON CONFLICT(source_name) DO UPDATE SET last_started_at=now(), category=$2', [name, category]);
  const run = await one<{ id: number }>('INSERT INTO sync_runs(source_name,category,cycle_id) VALUES($1,$2,$3) RETURNING id', [name, category, cycleId || null]);
  try {
    const result = await load();
    const status = result.status || 'success';
    await query('UPDATE sync_runs SET finished_at=now(),status=$2,items_seen=$3,items_changed=$4,metrics=$5,error=$6 WHERE id=$1', [run!.id,status,result.seen,result.changed,JSON.stringify(result.metrics || {}),result.error || null]);
    await query(`UPDATE source_state SET last_success_at=CASE WHEN $3='success' THEN now() ELSE last_success_at END,
      last_error=$4,last_count=$2 WHERE source_name=$1`, [name,result.seen,status,result.error || null]);
    return status === 'success' || status === 'partial' ? result.seen : 0;
  } catch (error) {
    if (category === 'concert') await recordConcertBackoff(name,error);
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
    await query('UPDATE sync_runs SET finished_at=now(),status=$2,error=$3 WHERE id=$1', [run!.id, 'failed', message]);
    await query('UPDATE source_state SET last_error=$2 WHERE source_name=$1', [name, message]);
    console.error(name + ': ' + message);
    return 0;
  }
}

export async function syncConcerts(options: { cycleId?: number; primaryOnly?: boolean; sweep?: boolean } = {}) {
  const load = async (source: Source): Promise<SourceResult> => {
    const deferred = await one<{ retry_after: Date }>('SELECT retry_after FROM concert_source_backoff WHERE source_name=$1 AND retry_after > now()',[source.name]);
    if (deferred) return { seen: 0,changed: 0,status: 'skipped',error: 'Source rate limited; retry after ' + deferred.retry_after.toISOString() };
    if (['Eventpop','The Concert','Ticketmelon'].includes(source.name) && !config.concertLocalResearch && !config.concertReuseAuthorized.includes(source.name)) {
      return { seen: 0, changed: 0, status: 'skipped', error: 'Local research disabled; publication permission not configured' };
    }
    const result = await discoverConcertSource(source, options);
    const changed = await saveSourceEvents(source.name, result.events);
    const status = result.metrics.fetchFailures ? (result.events.length ? 'partial' : 'failed') : result.events.length ? 'success' : 'failed';
    const error = status === 'partial' ? `${result.metrics.fetchFailures} detail pages could not be checked; latest saved data retained` : status === 'failed' ? 'No parseable upcoming music events; latest saved data retained' : undefined;
    return { seen: result.events.length,changed,metrics: result.metrics,status,error };
  };
  let failures = 0;
  for (const source of sources) {
    const count = await runSource(source.name,'concert',() => load(source),options.cycleId);
    if (!count || await one('SELECT 1 FROM source_state WHERE source_name=$1 AND last_error IS NOT NULL',[source.name])) failures++;
  }
  for (const source of backupSources) {
    if (!failures) break;
    const count = await runSource(source.name,'concert',() => load(source),options.cycleId);
    if (count) failures--;
  }
  if (!options.primaryOnly) { await syncTicketmasterThailand(); await syncForeign(); }
}

let nextTicketmasterRequestAt = 0;
async function ticketmasterPage(url: URL) {
  const waitMs = Math.max(0, nextTicketmasterRequestAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextTicketmasterRequestAt = Date.now() + 250;
  const response = await fetch(url, { signal: AbortSignal.timeout(config.ticketmasterTimeoutMs) });
  if (!response.ok) throw new Error('Ticketmaster HTTP ' + response.status);
  return response.json() as Promise<{ _embedded?: { events?: unknown[]; attractions?: unknown[] }; page?: { totalPages?: number } }>;
}

export async function syncTicketmasterThailand() {
  if (!config.ticketmasterKey) return;
  await runSource('Ticketmaster TH', 'concert', async () => {
    let seen = 0, changed = 0;
    for (let page = 0; page < 10; page++) {
      const url = new URL(config.ticketmasterBaseUrl + '/events.json');
      url.searchParams.set('apikey', config.ticketmasterKey);
      url.searchParams.set('countryCode', config.ticketmasterCountryCode);
      url.searchParams.set('classificationName', 'music');
      url.searchParams.set('size', '100');
      url.searchParams.set('page', String(page));
      const data = await ticketmasterPage(url);
      const items = data._embedded?.events || [];
      if (!Array.isArray(items)) throw new Error('Ticketmaster returned an invalid event list');
      for (const item of items) {
        const event = parseTicketmaster(item, undefined, config.ticketmasterCountryCode);
        if (!event) continue;
        seen++;
        if (await saveEvent('Ticketmaster', event)) changed++;
      }
      if (!data.page?.totalPages || page + 1 >= data.page.totalPages) return { seen, changed };
    }
    throw new Error('Ticketmaster TH reached the 10-page limit; coverage is incomplete');
  });
}

export async function syncForeign() {
  if (!config.ticketmasterKey) await runSource('Ticketmaster', 'concert', async () => { throw new Error('Ticketmaster API key not configured'); });
  if (!config.bandsintownAppId) await runSource('Bandsintown', 'concert', async () => { throw new Error('Bandsintown app ID not configured'); });
  if (config.ticketmasterKey) await runSource('Ticketmaster', 'concert', async () => {
    let count = 0; let seen = 0;
    const artists = await query<{ name_en: string | null; name: string; attraction_ids: string[]; official_urls: string[]; evidence_urls: Record<string, string> }>(`SELECT a.name,a.name_en,
      ARRAY(SELECT attraction_id FROM ticketmaster_artist_identities i WHERE i.artist_id=a.id) AS attraction_ids,
      COALESCE((SELECT jsonb_object_agg(attraction_id,evidence_url) FROM ticketmaster_artist_identities i WHERE i.artist_id=a.id),'{}'::jsonb) AS evidence_urls,
      ARRAY(SELECT url FROM social_accounts s WHERE s.artist_id=a.id AND s.verified_at IS NOT NULL) AS official_urls
      FROM artists a`);
    for (const artist of artists) {
      if (!artist.attraction_ids.length && !artist.official_urls.length) continue;
      const identity = { aliases: [artist.name, artist.name_en].filter((name): name is string => !!name), attractionIds: artist.attraction_ids, officialUrls: artist.official_urls, evidenceUrls: artist.evidence_urls };
      // Resolve the performer first; event keyword searches also match venues and unrelated acts.
      if (!identity.attractionIds.length) {
        for (let page = 0; page < 10; page++) {
          const url = new URL(config.ticketmasterBaseUrl + '/attractions.json');
          url.searchParams.set('apikey', config.ticketmasterKey);
          url.searchParams.set('keyword', artist.name_en || artist.name);
          url.searchParams.set('size', '100'); url.searchParams.set('page', String(page));
          const data = await ticketmasterPage(url);
          const items = data._embedded?.attractions || [];
          if (!Array.isArray(items)) throw new Error('Ticketmaster returned an invalid attraction list');
          for (const item of items) {
            const match = matchTicketmasterAttraction({ _embedded: { attractions: [item] } }, identity);
            if (!match?.evidenceUrl || identity.attractionIds.includes(match.id)) continue;
            identity.attractionIds.push(match.id);
            identity.evidenceUrls[match.id] = match.evidenceUrl;
          }
          if (!data.page?.totalPages || page + 1 >= data.page.totalPages) break;
          if (page === 9) throw new Error('Ticketmaster attraction search reached the 10-page limit; coverage is incomplete');
        }
      }
      if (!identity.attractionIds.length) continue;
      for (let page = 0; page < 10; page++) {
        const url = new URL(config.ticketmasterBaseUrl + '/events.json');
        url.searchParams.set('apikey', config.ticketmasterKey);
        url.searchParams.set('attractionId', identity.attractionIds.join(','));
        url.searchParams.set('classificationName', 'music'); url.searchParams.set('size', '100'); url.searchParams.set('page', String(page));
        const data = await ticketmasterPage(url);
        const items = data._embedded?.events || [];
        if (!Array.isArray(items)) throw new Error('Ticketmaster returned an invalid event list');
        for (const item of items) {
          const event = parseTicketmaster(item, artist.name, undefined, identity);
          if (!event) continue;
          seen++;
          if (await saveEvent('Ticketmaster', event)) count++;
        }
        if (!data.page?.totalPages || page + 1 >= data.page.totalPages) break;
        if (page === 9) throw new Error('Ticketmaster foreign search reached the 10-page limit; coverage is incomplete');
      }
    }
    return { seen, changed: count };
  });
  if (config.bandsintownAppId) await runSource('Bandsintown', 'concert', async () => {
    let count = 0; let seen = 0;
    const artists = await query<{ name_en: string | null; name: string }>('SELECT name,name_en FROM artists');
    for (const artist of artists) {
      const response = await fetch('https://rest.bandsintown.com/artists/' + encodeURIComponent(artist.name_en || artist.name) + '/events?app_id=' + encodeURIComponent(config.bandsintownAppId), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Bandsintown HTTP ' + response.status);
      const data = await response.json() as any;
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        if (!item.url || !item.datetime || item.venue?.country === 'Thailand') continue;
        seen++;
        if (await saveEvent('Bandsintown', { title: item.title || artist.name + ' live', url: item.url, startsAt: item.datetime, venue: item.venue?.name, city: item.venue?.city, country: item.venue?.country?.slice(0, 2).toUpperCase() || 'US', artist: artist.name })) count++;
      }
    }
    return { seen, changed: count };
  });
}

export class InstagramGraphError extends Error {
  readonly rateLimited: boolean;
  constructor(status: number, codes: number[]) {
    super('Instagram Graph HTTP ' + status + (codes.length ? ' (codes ' + codes.join('/') + ')' : ''));
    this.rateLimited = status === 429 || codes[0] === 4;
  }
}

export async function instagramBusinessPosts(handle: string) {
  const username = handle.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]+$/.test(username)) throw new Error('Instagram username is invalid');
  const expires = Date.parse(config.instagramGraphTokenExpiresAt);
  if (Number.isFinite(expires) && expires <= Date.now()) throw new Error('Instagram token expired');
  const fields = `business_discovery.username(${username}){id,username,media.limit(20){id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,children.limit(20){id,media_type,media_url,thumbnail_url}}}`;
  const url = new URL(`https://graph.facebook.com/${config.instagramGraphVersion}/${encodeURIComponent(config.instagramGraphUserId)}`);
  url.searchParams.set('fields', fields);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + config.instagramGraphToken }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: { code?: unknown; error_subcode?: unknown } } | null;
    // Keep only numeric diagnostics; Graph messages can contain request credentials.
    const codes = [failure?.error?.code, failure?.error?.error_subcode].filter((value) => typeof value === 'number');
    throw new InstagramGraphError(response.status, codes as number[]);
  }
  const data = await response.json() as any;
  const discovery = data.business_discovery;
  if (!discovery?.id || String(discovery.username || '').toLowerCase() !== username || (discovery.media && !Array.isArray(discovery.media.data))) throw new Error('Instagram Business Discovery account unavailable');
  return instagramFeedPosts(discovery.media?.data);
}

export async function syncNews(options: { platform?: 'x' | 'facebook' | 'instagram'; artistSlug?: string } = {}) {
  const platforms = (['x', 'facebook', 'instagram'] as const).filter((platform) => !options.platform || platform === options.platform);
  for (const platform of platforms) await runSource(platform.toUpperCase(), 'news', async () => {
    const accounts = await query<{ id: string; artist_id: string; external_id: string | null; handle: string | null }>(`SELECT s.id,s.artist_id,s.external_id,s.handle FROM social_accounts s
      JOIN artists a ON a.id=s.artist_id WHERE s.platform=$1 AND s.verified_at IS NOT NULL
      AND ($2::text IS NULL OR a.slug=$2) ORDER BY s.last_success_at NULLS FIRST,s.last_checked_at NULLS FIRST,a.slug,s.id`, [platform, options.artistSlug || null]);
    if (!accounts.length) throw new Error('No verified official accounts configured');
    if (platform === 'x' && !config.xBearerToken) throw new Error('X API token missing; automatic discovery unavailable');
    if (platform === 'facebook' && !config.metaToken) throw new Error('Meta access token missing; automatic discovery unavailable');
    const hasInstagramDiscovery = !!config.instagramGraphToken && !!config.instagramGraphUserId;
    if (platform === 'instagram' && !hasInstagramDiscovery && !config.metaToken) throw new Error('Instagram Graph token or IG user ID missing; automatic discovery unavailable');
    const monthlyLimit = Math.floor(config.xMonthlyLimitThb / (50 * 0.005));
    const spent = platform === 'x' ? await one<{ total: string }>("SELECT COALESCE(sum(items_seen),0)::text AS total FROM sync_runs WHERE source_name='X' AND started_at >= date_trunc('month',now()) AND status='success'") : null;
    if (platform === 'x' && Number(spent?.total || 0) + 10 > monthlyLimit) throw new Error('X monthly read budget reached; see Developer Console spending limit');
    let count = 0, succeeded = 0;
    let rateLimitError: string | null = null;
    for (const account of accounts) {
      if (platform === 'x' && count + Number(spent?.total || 0) + 10 > monthlyLimit) break;
      if (!account.external_id && platform === 'facebook') { await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, 'Page ID required']); continue; }
      if (!account.handle && platform === 'instagram' && hasInstagramDiscovery) { await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, 'Verified Instagram username required']); continue; }
      if (!account.external_id && platform === 'instagram' && !hasInstagramDiscovery) { await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, 'Instagram account ID required']); continue; }
      if (platform === 'x' && !account.handle) { await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, 'X handle required']); continue; }
      try {
        let posts: any[] = [];
        if (platform === 'x') {
          const response = await fetch('https://api.x.com/2/tweets/search/recent?query=' + encodeURIComponent('from:' + account.handle + ' -is:retweet') + '&max_results=10&tweet.fields=created_at', { headers: { Authorization: 'Bearer ' + config.xBearerToken }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('X HTTP ' + response.status);
          posts = ((await response.json()) as any).data || [];
        } else if (platform === 'instagram' && hasInstagramDiscovery && account.handle) {
          posts = await instagramBusinessPosts(account.handle);
        } else {
          const edge = platform === 'facebook' ? 'posts' : 'media';
          const fields = platform === 'facebook' ? 'id,message,created_time,permalink_url,full_picture' : 'id,caption,timestamp,permalink,media_type,media_product_type,media_url,thumbnail_url,children.limit(20){id,media_type,media_url,thumbnail_url}';
          const response = await fetch(`https://graph.facebook.com/${config.metaVersion}/${account.external_id}/${edge}?fields=${fields}&limit=10`, { headers: { Authorization: 'Bearer ' + config.metaToken }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('Meta HTTP ' + response.status);
          posts = ((await response.json()) as any).data || [];
          if (platform === 'instagram') posts = instagramFeedPosts(posts);
        }
        for (const post of posts) {
          const url = platform === 'x' ? `https://x.com/${account.handle}/status/${post.id}` : post.permalink_url || post.permalink;
          if (!url || !post.id) continue;
          const media = platform === 'instagram' ? instagramMedia(post) : [];
          const image = platform === 'instagram' ? (media[0]?.type === 'image' ? media[0].url : media[0]?.thumbnailUrl) : post.full_picture;
          await query(newsUpsertSql, [account.artist_id, platform, url, post.id, post.text || post.message || post.caption || null, image && validUrl(image) ? image : null, post.created_at || post.created_time || post.timestamp || null, JSON.stringify(media)]);
          count++;
        }
        await query('UPDATE social_accounts SET last_checked_at=now(),last_success_at=now(),last_error=null WHERE id=$1', [account.id]);
        succeeded++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, message]);
        if (platform === 'instagram' && error instanceof InstagramGraphError && error.rateLimited) {
          rateLimitError = `${message}; ${succeeded}/${accounts.length} accounts read; retry next scheduled cycle`;
          const remaining = accounts.slice(accounts.indexOf(account) + 1).map(item => item.id);
          // Deferred accounts were not checked; preserve their check/success times and posts.
          if (remaining.length) await query('UPDATE social_accounts SET last_error=$2 WHERE id=ANY($1::uuid[])', [remaining, 'Instagram sync deferred: API rate limit; retry next scheduled cycle']);
          break;
        }
      }
    }
    if (rateLimitError) throw new Error(rateLimitError);
    if (!succeeded) throw new Error('No verified account could be read; inspect account errors');
    return { seen: count, changed: count };
  });
  if (options.platform) return;
  if (!config.amadeusClientId || !config.amadeusClientSecret) await runSource('Amadeus', 'travel', async () => { throw new Error('Amadeus credentials not configured'); });
  await runSource('12Go', 'travel', async () => { throw new Error('12Go affiliate/API access not configured'); });
}
