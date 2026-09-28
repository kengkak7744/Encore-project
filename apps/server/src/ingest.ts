import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { one, query } from './db.js';
import { config } from './config.js';

type Event = { title: string; url: string; startsAt: string | null; endsAt?: string | null; timeTba?: boolean; venue?: string | null; city?: string | null; country?: string; description?: string | null; image?: string | null; priceMin?: number | null; priceMax?: number | null; currency?: string; status?: string; artist?: string | null };
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
const robotRules = new Map<string, string>();
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

async function allowedByRobots(host: string, pathAndQuery: string) {
  if (!robotRules.has(host)) {
    const response = await fetch('https://' + host + '/robots.txt', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not check robots.txt: HTTP ' + response.status);
    robotRules.set(host, await response.text());
  }
  return robotsAllows(robotRules.get(host)!, pathAndQuery);
}

async function html(url: string, host: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== host && !parsed.hostname.endsWith('.' + host))) throw new Error('URL outside allowed source');
  if (!await allowedByRobots(parsed.hostname, parsed.pathname + parsed.search)) throw new Error('Blocked by robots.txt');
  const response = await fetch(url, { headers: { 'User-Agent': 'ArtistTrackerResearch/0.1 (+public event metadata; contact admin)', Accept: 'text/html,application/xhtml+xml' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('html')) throw new Error('Non-HTML response');
  const body = await response.text();
  if (body.length > 3_000_000) throw new Error('Oversize page');
  return body;
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
  const $ = cheerio.load(markup);
  const title = $('#event-title h2').first().text().trim() || $('#event-title h3').first().text().trim();
  const dateText = $('a.event-date-range strong').first().text().trim();
  const match = dateText.match(/^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})(?:\s+at\s+(\d{1,2}:\d{2}))?/);
  if (!title || !match) return [];
  const parsed = new Date(match[1] + ' ' + (match[2] || '00:00') + ' GMT+0700');
  if (Number.isNaN(parsed.getTime())) return [];
  const venue = $('a[href*="google.com/maps"] strong').first().text().trim() || null;
  const location = $('a[href*="google.com/maps"]').first().next().text().trim();
  const status = /cancelled/i.test($('#event-title').parent().parent().text()) ? 'cancelled' : 'scheduled';
  const image = $('meta[property="og:image"]').attr('content') || null;
  return [{ title, url: pageUrl, startsAt: parsed.toISOString(), timeTba: !match[2], venue, city: location.split(',')[0]?.trim() || null, country: 'TH', image, status }];
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
  if (map.hostname !== 'www.google.com' || map.pathname !== '/maps/search/' || coords?.length !== 2 || !(coords[0] >= 13 && coords[0] <= 15 && coords[1] >= 100 && coords[1] <= 101)) return [];
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
  return [{ title, url: pageUrl, startsAt, endsAt, venue, country: 'TH', priceMin, currency: 'THB' }];
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
  if (!title || !categories.some((item) => typeof item === 'string' && /music|concert|ดนตรี|คอนเสิร์ต/i.test(item)) ||
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

export function parseTicketmaster(item: unknown, artist?: string, countryFilter?: string): Event | null {
  const data = record(item);
  const venue = record(record(data._embedded).venues instanceof Array ? (record(data._embedded).venues as unknown[])[0] : null);
  const country = str(record(venue.country).countryCode)?.toUpperCase();
  const title = str(data.name), url = str(data.url);
  if (!title || !url || !validUrl(url) || !country || !/^[A-Z]{2}$/.test(country) || (countryFilter ? country !== countryFilter : country === 'TH')) return null;
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
  return { title, url, startsAt, timeTba: start.timeTBA === true || start.noSpecificTime === true || !str(start.localTime) && !explicit, venue: str(venue.name), city: str(record(venue.city).name), country, description: str(data.info) || str(data.pleaseNote), priceMin: minimums.length ? Math.min(...minimums) : null, priceMax: maximums.length ? Math.max(...maximums) : null, currency: validCurrency ? currency : 'XXX', status, artist };
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

async function ticketmelonSitemap(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'www.ticketmelon.com' || !/^\/sitemap(?:-event\d+)?\.xml$/.test(parsed.pathname) || !await allowedByRobots(parsed.hostname, parsed.pathname)) throw new Error('Ticketmelon sitemap unavailable');
  const response = await fetch(url, { headers: { 'User-Agent': 'ArtistTrackerResearch/0.1 (+public event metadata; contact admin)' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('xml')) throw new Error('Ticketmelon sitemap HTTP ' + response.status);
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('Ticketmelon sitemap too large');
  const $ = cheerio.load(body, { xmlMode: true });
  return $('url').map((_index, element) => ({ url: $(element).find('loc').first().text().trim(), modified: $(element).find('lastmod').first().text().trim() })).get();
}

async function discoverTicketmelon() {
  const index = await ticketmelonSitemap('https://www.ticketmelon.com/sitemap.xml');
  const maps = index.map((item) => item.url).filter((url) => /^https:\/\/www\.ticketmelon\.com\/sitemap-event\d+\.xml$/.test(url)).slice(0, 10);
  if (!maps.length) throw new Error('Ticketmelon event sitemap not found');
  const entries = (await Promise.all(maps.map(ticketmelonSitemap))).flat().sort((a, b) => b.modified.localeCompare(a.modified));
  const events: Event[] = [];
  let checked = 0;
  for (const item of entries) {
    if (checked >= 60) break;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (url.hostname !== 'www.ticketmelon.com' || !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname) || url.search) continue;
    checked++;
    try { events.push(...parseTicketmelon(await html(url.href, 'ticketmelon.com'), url.href)); }
    catch { /* An individual event can be removed without stopping the source. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return events.filter((event) => event.startsAt && Date.parse(event.startsAt) > Date.now() - 86400000);
}

export function parseTheConcertHighlightIds(value: unknown): number[] {
  const records = record(record(value).data).record;
  if (!Array.isArray(records)) return [];
  return [...new Set(records.map((item) => record(item).id).filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id < 100_000_000))].slice(0, 10);
}

async function discoverTheConcert() {
  const feedPath = '/v3/concerts/en/highlight.json';
  const robots = await fetch('https://cdn.theconcert.com/robots.txt', { redirect: 'manual', signal: AbortSignal.timeout(8000) });
  // A missing robots.txt (4xx) permits crawling under RFC 9309; 429 and 5xx do not.
  if (robots.ok) {
    if (!robotsAllows(await robots.text(), feedPath)) throw new Error('The Concert feed blocked by robots.txt');
  } else if (robots.status === 429 || robots.status < 400 || robots.status >= 500) {
    throw new Error('Could not check The Concert feed robots.txt: HTTP ' + robots.status);
  }
  const response = await fetch('https://cdn.theconcert.com' + feedPath, { headers: { 'User-Agent': 'ArtistTrackerResearch/0.1 (+public event metadata; contact admin)', Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw new Error('The Concert feed HTTP ' + response.status);
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('The Concert feed too large');
  const ids = parseTheConcertHighlightIds(JSON.parse(body));
  if (!ids.length) throw new Error('The Concert feed has no public event IDs');
  const events: Event[] = [];
  for (const id of ids) {
    const url = 'https://www.theconcert.com/p/' + id;
    try {
      const markup = await html(url, 'theconcert.com');
      const details = parseEvents(markup, url);
      events.push(...(details.length ? details : parseTheConcert(markup, url)));
    } catch { /* A highlighted event can be removed without failing the whole feed. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return events.filter((event) => event.startsAt && Date.parse(event.startsAt) > Date.now() - 86400000);
}

async function discover(source: Source) {
  if (source.name === 'Ticketmelon') return discoverTicketmelon();
  if (source.name === 'The Concert') return discoverTheConcert();
  const body = await html(source.url, source.host);
  const $ = cheerio.load(body);
  const urls = new Set<string>();
  for (const event of parseEvents(body, source.url)) urls.add(event.url);
  $('a[href]').each((_index, element) => {
    try {
      const url = new URL($(element).attr('href') || '', source.url);
      if ((url.hostname === source.host || url.hostname.endsWith('.' + source.host)) && source.linkPattern.test(url.href)) urls.add(url.origin + url.pathname);
    } catch { /* Ignore invalid links. */ }
  });
  const events = parseEvents(body, source.url);
  for (const url of [...urls].slice(0, 50)) {
    if (url === source.url || events.some((event) => event.url === url)) continue;
    try {
      const detailMarkup = await html(url, source.host);
      const details = parseEvents(detailMarkup, url);
      if (source.name === 'Eventpop' && !details.length) {
        const publicMarkup = parseEventpop(detailMarkup, url);
        details.push(...(publicMarkup.length ? publicMarkup : parseEventpopMeta(detailMarkup, url)));
      }
      if (source.name === 'The Concert' && !details.length) details.push(...parseTheConcert(detailMarkup, url));
      if (source.name === 'Live Nation Tero') details.push(...parseLiveNation(detailMarkup, url));
      events.push(...details);
    } catch { /* The listing may contain private or removed events. */ }
  }
  return events.filter((event) => event.startsAt && Date.parse(event.startsAt) > Date.now() - 86400000);
}

function normalized(text: string) { return text.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function slug(text: string) { return createHash('sha1').update(text).digest('hex').slice(0, 14); }
function validUrl(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

async function saveEvent(source: string, event: Event) {
  if (!validUrl(event.url)) return false;
  const date = event.startsAt ? new Date(event.startsAt) : null;
  if (date && Number.isNaN(date.getTime())) return false;
  const existingSource = await one<{ concert_id: string }>('SELECT concert_id FROM concert_sources WHERE source_url = $1', [event.url]);
  let concertId = existingSource?.concert_id;
  if (!concertId && date) {
    const candidate = await one<{ id: string }>("SELECT id FROM concerts WHERE (starts_at BETWEEN $1::timestamptz - interval '12 hours' AND $1::timestamptz + interval '12 hours' OR ($3::boolean AND (starts_at AT TIME ZONE 'Asia/Bangkok')::date = ($1::timestamptz AT TIME ZONE 'Asia/Bangkok')::date)) AND similarity(lower(title), lower($2)) > 0.72 ORDER BY similarity(lower(title), lower($2)) DESC LIMIT 1", [date.toISOString(), event.title, event.timeTba || false]);
    concertId = candidate?.id;
  }
  if (!concertId) {
    const key = slug(normalized(event.title) + '|' + (date?.toISOString().slice(0, 10) || '') + '|' + (event.city || ''));
    const row = await one<{ id: string }>('INSERT INTO concerts(slug,title,description,venue,city,country_code,starts_at,ends_at,time_tba,status,price_min,price_max,currency,image_url,official_url,last_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()) ON CONFLICT(slug) DO UPDATE SET updated_at = now() RETURNING id', ['event-' + key, event.title, event.description || null, event.venue || null, event.city || null, event.country?.slice(0, 2).toUpperCase() || 'TH', date?.toISOString() || null, event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.priceMin ?? null, event.priceMax ?? null, event.currency || 'THB', event.image || null, event.url]);
    concertId = row!.id;
  }
  const role = source === 'Live Nation Tero' ? 'organizer' : 'ticket';
  await query('INSERT INTO concert_sources(concert_id,source_name,source_url,source_role,raw_data,fetched_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(source_url) DO UPDATE SET raw_data = EXCLUDED.raw_data, source_role=EXCLUDED.source_role, fetched_at = now(), last_error = null', [concertId, source, event.url, role, JSON.stringify(event)]);
  // Manual organizer corrections retain precedence over ticketing metadata.
  const hasOrganizer = await one('SELECT 1 FROM concert_sources WHERE concert_id = $1 AND source_role = \'organizer\'', [concertId]);
  if (role === 'organizer' || !hasOrganizer) await query('UPDATE concerts SET title=$2, description=COALESCE($3,description), venue=COALESCE($4,venue), city=COALESCE($5,city), starts_at=CASE WHEN $8 AND NOT time_tba AND starts_at IS NOT NULL THEN starts_at ELSE COALESCE($6,starts_at) END, ends_at=COALESCE($7,ends_at), time_tba=CASE WHEN $8 AND NOT time_tba AND starts_at IS NOT NULL THEN false ELSE $8 END, status=$9, price_min=COALESCE($10,price_min), price_max=COALESCE($11,price_max), image_url=COALESCE($12,image_url), currency=$13, last_verified_at=now(), updated_at=now() WHERE id=$1 AND manual_override=false', [concertId, event.title, event.description || null, event.venue || null, event.city || null, date?.toISOString() || null, event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.priceMin ?? null, event.priceMax ?? null, event.image || null, event.currency || 'THB']);
  if (date) {
    const preciseRound = event.timeTba ? await one("SELECT id FROM concert_performances WHERE concert_id=$1 AND NOT time_tba AND (starts_at AT TIME ZONE 'Asia/Bangkok')::date = ($2::timestamptz AT TIME ZONE 'Asia/Bangkok')::date", [concertId, date.toISOString()]) : null;
    if (!preciseRound) await query('INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(concert_id,starts_at) DO UPDATE SET ends_at=COALESCE(EXCLUDED.ends_at,concert_performances.ends_at), time_tba=concert_performances.time_tba AND EXCLUDED.time_tba, status=EXCLUDED.status, source_url=EXCLUDED.source_url, updated_at=now()', [concertId, date.toISOString(), event.endsAt || null, event.timeTba || false, event.status || 'scheduled', event.url]);
  }
  if (event.artist) await query('INSERT INTO concert_artists(concert_id,artist_id) SELECT $1,id FROM artists WHERE lower(name)=lower($2) OR lower(name_en)=lower($2) ON CONFLICT DO NOTHING', [concertId, event.artist]);
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

async function runSource(name: string, category: 'concert' | 'news' | 'travel', load: () => Promise<{ seen: number; changed: number }>) {
  await query('INSERT INTO source_state(source_name,category,last_started_at) VALUES($1,$2,now()) ON CONFLICT(source_name) DO UPDATE SET last_started_at=now(), category=$2', [name, category]);
  const run = await one<{ id: number }>('INSERT INTO sync_runs(source_name,category) VALUES($1,$2) RETURNING id', [name, category]);
  try {
    const result = await load();
    await query('UPDATE sync_runs SET finished_at=now(),status=$2,items_seen=$3,items_changed=$4 WHERE id=$1', [run!.id, 'success', result.seen, result.changed]);
    await query('UPDATE source_state SET last_success_at=now(),last_error=null,last_count=$2 WHERE source_name=$1', [name, result.seen]);
    return result.seen;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
    await query('UPDATE sync_runs SET finished_at=now(),status=$2,error=$3 WHERE id=$1', [run!.id, 'failed', message]);
    await query('UPDATE source_state SET last_error=$2 WHERE source_name=$1', [name, message]);
    console.error(name + ': ' + message);
    return 0;
  }
}

export async function syncConcerts() {
  let failed = 0;
  for (const source of sources) {
    const count = await runSource(source.name, 'concert', async () => {
    let changed = 0;
    const events = await discover(source);
    if (!events.length) throw new Error('No parseable upcoming events on public pages');
    for (const event of events) if (await saveEvent(source.name, event)) changed++;
    return { seen: events.length, changed };
    });
    if (count === 0) failed++;
  }
  for (const source of backupSources.slice(0, failed)) await runSource(source.name, 'concert', async () => {
    let changed = 0;
    const events = await discover(source);
    if (!events.length) throw new Error('No parseable upcoming events on public pages');
    for (const event of events) if (await saveEvent(source.name, event)) changed++;
    return { seen: events.length, changed };
  });
  await syncTicketmasterThailand();
  await syncForeign();
}

let nextTicketmasterRequestAt = 0;
async function ticketmasterPage(url: URL) {
  const waitMs = Math.max(0, nextTicketmasterRequestAt - Date.now());
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextTicketmasterRequestAt = Date.now() + 250;
  const response = await fetch(url, { signal: AbortSignal.timeout(config.ticketmasterTimeoutMs) });
  if (!response.ok) throw new Error('Ticketmaster HTTP ' + response.status);
  return response.json() as Promise<{ _embedded?: { events?: unknown[] }; page?: { totalPages?: number } }>;
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

async function syncForeign() {
  if (!config.ticketmasterKey) await runSource('Ticketmaster', 'concert', async () => { throw new Error('Ticketmaster API key not configured'); });
  if (!config.bandsintownAppId) await runSource('Bandsintown', 'concert', async () => { throw new Error('Bandsintown app ID not configured'); });
  if (config.ticketmasterKey) await runSource('Ticketmaster', 'concert', async () => {
    let count = 0; let seen = 0;
    const artists = await query<{ name_en: string | null; name: string }>('SELECT name,name_en FROM artists');
    for (const artist of artists) {
      const url = new URL(config.ticketmasterBaseUrl + '/events.json');
      url.searchParams.set('apikey', config.ticketmasterKey); url.searchParams.set('keyword', artist.name_en || artist.name); url.searchParams.set('classificationName', 'music'); url.searchParams.set('size', '20');
      const data = await ticketmasterPage(url);
      for (const item of data._embedded?.events || []) {
        const event = parseTicketmaster(item, artist.name);
        if (!event) continue;
        seen++;
        if (await saveEvent('Ticketmaster', event)) count++;
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

export async function instagramBusinessPosts(handle: string) {
  const username = handle.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]+$/.test(username)) throw new Error('Instagram username is invalid');
  const expires = Date.parse(config.instagramGraphTokenExpiresAt);
  if (Number.isFinite(expires) && expires <= Date.now()) throw new Error('Instagram token expired');
  const fields = `business_discovery.username(${username}){id,username,media.limit(20){id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url}}`;
  const url = new URL(`https://graph.facebook.com/${config.instagramGraphVersion}/${encodeURIComponent(config.instagramGraphUserId)}`);
  url.searchParams.set('fields', fields);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + config.instagramGraphToken }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Instagram Graph HTTP ' + response.status);
  const data = await response.json() as any;
  const discovery = data.business_discovery;
  if (!discovery?.id || String(discovery.username || '').toLowerCase() !== username || (discovery.media && !Array.isArray(discovery.media.data))) throw new Error('Instagram Business Discovery account unavailable');
  return (discovery.media?.data || []).filter((post: any) => {
    const product = String(post.media_product_type || '').toUpperCase();
    const type = String(post.media_type || '').toUpperCase();
    return (!product || product === 'FEED' || product === 'REELS') && ['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO'].includes(type) && !(type === 'VIDEO' && !product);
  }).map((post: any) => ({ ...post, media_url: String(post.media_product_type || '').toUpperCase() === 'REELS' ? post.thumbnail_url : post.media_url || post.thumbnail_url }));
}

export async function syncNews() {
  for (const platform of ['x', 'facebook', 'instagram'] as const) await runSource(platform.toUpperCase(), 'news', async () => {
    const accounts = await query<{ id: string; artist_id: string; external_id: string | null; handle: string | null }>('SELECT id,artist_id,external_id,handle FROM social_accounts WHERE platform=$1 AND verified_at IS NOT NULL', [platform]);
    if (!accounts.length) throw new Error('No verified official accounts configured');
    if (platform === 'x' && !config.xBearerToken) throw new Error('X API token missing; automatic discovery unavailable');
    if (platform === 'facebook' && !config.metaToken) throw new Error('Meta access token missing; automatic discovery unavailable');
    const hasInstagramDiscovery = !!config.instagramGraphToken && !!config.instagramGraphUserId;
    if (platform === 'instagram' && !hasInstagramDiscovery && !config.metaToken) throw new Error('Instagram Graph token or IG user ID missing; automatic discovery unavailable');
    const monthlyLimit = Math.floor(config.xMonthlyLimitThb / (50 * 0.005));
    const spent = platform === 'x' ? await one<{ total: string }>("SELECT COALESCE(sum(items_seen),0)::text AS total FROM sync_runs WHERE source_name='X' AND started_at >= date_trunc('month',now()) AND status='success'") : null;
    if (platform === 'x' && Number(spent?.total || 0) + 10 > monthlyLimit) throw new Error('X monthly read budget reached; see Developer Console spending limit');
    let count = 0, succeeded = 0;
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
          const fields = platform === 'facebook' ? 'id,message,created_time,permalink_url,full_picture' : 'id,caption,timestamp,permalink,media_url';
          const response = await fetch(`https://graph.facebook.com/${config.metaVersion}/${account.external_id}/${edge}?fields=${fields}&limit=10`, { headers: { Authorization: 'Bearer ' + config.metaToken }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('Meta HTTP ' + response.status);
          posts = ((await response.json()) as any).data || [];
        }
        for (const post of posts) {
          const url = platform === 'x' ? `https://x.com/${account.handle}/status/${post.id}` : post.permalink_url || post.permalink;
          if (!url || !post.id) continue;
          await query('INSERT INTO news_items(artist_id,platform,source_url,external_id,body,image_url,published_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_url) DO UPDATE SET body=EXCLUDED.body,last_verified_at=now()', [account.artist_id, platform, url, post.id, post.text || post.message || post.caption || null, post.full_picture || post.media_url || null, post.created_at || post.created_time || post.timestamp || null]);
          count++;
        }
        await query('UPDATE social_accounts SET last_checked_at=now(),last_success_at=now(),last_error=null WHERE id=$1', [account.id]);
        succeeded++;
      } catch (error) { await query('UPDATE social_accounts SET last_checked_at=now(),last_error=$2 WHERE id=$1', [account.id, error instanceof Error ? error.message : String(error)]); }
    }
    if (!succeeded) throw new Error('No verified account could be read; inspect account errors');
    return { seen: count, changed: count };
  });
  if (!config.amadeusClientId || !config.amadeusClientSecret) await runSource('Amadeus', 'travel', async () => { throw new Error('Amadeus credentials not configured'); });
  await runSource('12Go', 'travel', async () => { throw new Error('12Go affiliate/API access not configured'); });
}
