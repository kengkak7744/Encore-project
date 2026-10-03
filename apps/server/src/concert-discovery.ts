import * as cheerio from 'cheerio';
import { query, one } from './db.js';
import { config } from './config.js';
import { fetchConcertResource } from './concert-fetch.js';
import { recordConcertBackoff } from './concert-backoff.js';
import { eventpopUrl, parseEventpopDetail, parseTheConcertApi, theConcertListing } from './concert-parsers.js';
import { parseEvents, parseEventpopMeta, parseLiveNation, parseTicketmelon } from './ingest.js';
import type { ConcertEvent, DiscoveryMetrics, DiscoveryResult } from './concert-types.js';

type Source = { name: string; url: string; host: string; linkPattern: RegExp };
const pause = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms));
const metrics = (discovery: string): DiscoveryMetrics => ({ discovery, discovered: 0, attempted: 0, parsedPages: 0, emptyPages: 0, fetchFailures: 0, filteredPast: 0, pending: 0, limited: false, warnings: [] });

export function rotatingUrls(entries: { url: string; modified: string }[], priority: string[], offset: number, limit: number) {
  const all = [...new Set(entries.map(item => item.url))].sort();
  const recent = [...entries].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 20).map(item => item.url);
  const selected = [...new Set([...priority.filter(url => all.includes(url)), ...recent])].slice(0, Math.floor(limit * 0.75));
  let advanced = 0;
  while (selected.length < limit && advanced < all.length) {
    const url = all[(offset + advanced) % all.length];
    if (!selected.includes(url)) selected.push(url);
    advanced++;
  }
  return { urls: selected, nextOffset: all.length ? (offset + advanced) % all.length : 0, catalogSize: all.length };
}

function upcoming(events: ConcertEvent[], counters: DiscoveryMetrics) {
  return events.filter(event => {
    if (!event.startsAt) return event.status === 'cancelled' || event.status === 'postponed';
    const year = new Date(event.startsAt).getUTCFullYear();
    if (!Number.isFinite(year) || year > new Date(Date.now()).getUTCFullYear() + 5) {
      counters.rejectedDates = (counters.rejectedDates || 0) + 1;
      if (counters.warnings.length < 10) counters.warnings.push('Implausible event year; excluded: ' + new URL(event.url).pathname);
      return false;
    }
    const keep = Date.parse(event.endsAt || event.startsAt) > Date.now() - 86400000;
    if (!keep) counters.filteredPast++;
    return keep;
  });
}

export async function discoverConcertSource(source: Source, options: { sweep?: boolean } = {}): Promise<DiscoveryResult> {
  const counters = metrics(source.name === 'Ticketmelon' ? 'sitemap: recent + known upcoming + rotating catalog' : source.name === 'The Concert' ? 'public listing pagination + detail + announced rounds' : 'public listing/detail pages');
  const events: ConcertEvent[] = [];
  const limit = options.sweep ? 1000 : config.concertDetailLimit;
  if (source.name === 'The Concert') {
    const api = async (path: string) => JSON.parse(await fetchConcertResource('https://apic.theconcert.com' + path, 'apic.theconcert.com', 'json'));
    const ids = new Set<number>();
    let lastPage = 1;
    for (let page = 1; page <= Math.min(lastPage, 50); page++) {
      const listing = theConcertListing(await api(`/v4/concert/lists?page=${page}&lang=en&currency=THB`));
      listing.ids.forEach(id => ids.add(id));
      lastPage = listing.lastPage;
      await pause();
    }
    counters.discovered = ids.size;
    counters.limited = lastPage > 50 || ids.size > limit;
    counters.pending = Math.max(0, ids.size - limit);
    for (const id of [...ids].slice(0, limit)) {
      counters.attempted++;
      try {
        const detail = await api(`/v4/event/${id}?lang=en&currency=THB`);
        const grouped = detail.data?.group_type === 'group' || detail.data?.group_type === 'multiple';
        let rounds: unknown;
        if (grouped) {
          const records: unknown[] = [];
          let roundLast = 1;
          for (let page = 1; page <= Math.min(roundLast, 50); page++) {
            const data = await api(`/v4/event/${id}/round?page=${page}&lang=en&currency=THB`);
            if (!Array.isArray(data.data?.record)) throw Error('Invalid announced round list');
            records.push(...data.data.record);
            roundLast = data.data.pagination?.last_page || 1;
          }
          if (roundLast > 50) throw Error('Announced round pagination limit');
          rounds = { data: { record: records } };
        }
        const parsed = parseTheConcertApi(detail, rounds);
        if (parsed.length) counters.parsedPages++; else counters.emptyPages++;
        events.push(...parsed);
      } catch (error) {
        counters.fetchFailures++;
        if (counters.warnings.length < 10) counters.warnings.push(`/p/${id}: ` + (error instanceof Error ? error.message : 'Unreadable detail'));
        if (await recordConcertBackoff(source.name,error)) break;
      }
      await pause();
    }
    counters.pending = Math.max(0,counters.discovered - counters.attempted);
    counters.limited ||= counters.pending > 0;
    return { events: upcoming(events, counters), metrics: counters };
  }
  const urls = new Set<string>();
  let nextOffset: number | undefined;
  let eventpopOffset = 0;
  if (source.name === 'Ticketmelon') {
    const sitemap = async (url: string) => {
      const $ = cheerio.load(await fetchConcertResource(url, source.host, 'xml'), { xmlMode: true });
      return $('url,sitemap').map((_i, element) => ({ url: $(element).find('loc').text().trim(), modified: $(element).find('lastmod').text().trim() })).get();
    };
    const index = await sitemap('https://www.ticketmelon.com/sitemap.xml');
    const maps = index.filter(item => /^https:\/\/www\.ticketmelon\.com\/sitemap-event\d+\.xml$/.test(item.url));
    if (!maps.length) throw Error('No public event sitemap found');
    if (maps.length > 100) throw Error('Event sitemap count exceeds safe limit');
    const entries: { url: string; modified: string }[] = [];
    for (const map of maps) { entries.push(...await sitemap(map.url)); await pause(); }
    const eligible = entries.filter(item => /^https:\/\/www\.ticketmelon\.com\/[^/?]+\/[^/?]+\/?$/.test(item.url));
    const cursor = await one<{ cursor_offset: number }>("SELECT cursor_offset FROM concert_discovery_cursors WHERE source_name='Ticketmelon'");
    const known = await query<{ source_url: string }>("SELECT cs.source_url FROM concert_sources cs JOIN concerts c ON c.id=cs.concert_id WHERE cs.source_name='Ticketmelon' AND (c.ends_at >= now() OR c.starts_at >= now()) ORDER BY cs.fetched_at ASC");
    const selection = rotatingUrls(eligible, known.map(item => item.source_url), cursor?.cursor_offset || 0, limit);
    selection.urls.forEach(url => urls.add(url));
    counters.discovered = selection.catalogSize;
    nextOffset = selection.nextOffset;
  } else {
    const listings = source.name === 'Eventpop' ? ['https://www.eventpop.me/g/concert', 'https://www.eventpop.me/g/music-festival'] : [source.url];
    for (const listing of listings) {
      const markup = await fetchConcertResource(listing, source.host, 'html');
      const $ = cheerio.load(markup);
      $('footer').remove();
      $('a[href]').each((_i, element) => {
        try {
          const url = new URL($(element).attr('href') || '', listing);
          if (url.protocol !== 'https:' || url.hostname !== source.host && !url.hostname.endsWith('.' + source.host) || !source.linkPattern.test(url.href)) return;
          const canonical = source.name === 'Eventpop' ? eventpopUrl(url.href) : url.origin + url.pathname;
          if (canonical && canonical !== listing) urls.add(canonical);
        } catch { /* Ignore malformed links. */ }
      });
      for (const event of parseEvents(markup, listing)) if (event.url !== listing) urls.add(event.url);
    }
    counters.discovered = urls.size;
    if (source.name === 'Eventpop' && urls.size) {
      const cursor = await one<{ cursor_offset: number }>("SELECT cursor_offset FROM concert_discovery_cursors WHERE source_name='Eventpop'");
      eventpopOffset = options.sweep ? 0 : (cursor?.cursor_offset || 0) % urls.size;
      const ordered = [...urls].sort();
      urls.clear();
      [...ordered.slice(eventpopOffset),...ordered.slice(0,eventpopOffset)].forEach(url => urls.add(url));
      nextOffset = (eventpopOffset + Math.min(limit,urls.size)) % urls.size;
    }
  }
  counters.pending = Math.max(0, counters.discovered - Math.min(urls.size, limit));
  counters.limited = counters.pending > 0;
  for (const url of [...urls].slice(0, limit)) {
    counters.attempted++;
    try {
      const markup = await fetchConcertResource(url, source.host, 'html');
      let parsed: ConcertEvent[];
      if (source.name === 'Ticketmelon') parsed = parseTicketmelon(markup, url);
      else if (source.name === 'Eventpop') { parsed = parseEventpopDetail(markup, url); if (!parsed.length) parsed = parseEventpopMeta(markup, url); }
      else { parsed = parseEvents(markup, url); if (source.name === 'Live Nation Tero' && !parsed.length) parsed = parseLiveNation(markup, url); }
      if (parsed.length) counters.parsedPages++; else counters.emptyPages++;
      events.push(...parsed);
    } catch (error) {
      counters.fetchFailures++;
      if (counters.warnings.length < 10) counters.warnings.push(new URL(url).pathname + ': ' + (error instanceof Error ? error.message : 'Unreadable detail'));
      if (await recordConcertBackoff(source.name,error)) {
        nextOffset = source.name === 'Eventpop' ? (eventpopOffset + counters.attempted - 1) % urls.size : undefined;
        break;
      }
    }
    await pause(source.name === 'Eventpop' ? 2000 : 400);
  }
  counters.pending = Math.max(0,counters.discovered - counters.attempted);
  counters.limited ||= counters.pending > 0;
  if (nextOffset !== undefined) await query(`INSERT INTO concert_discovery_cursors(source_name,cursor_offset,catalog_size,last_checked_at)
    VALUES($1,$2,$3,now()) ON CONFLICT(source_name) DO UPDATE SET cursor_offset=$2,catalog_size=$3,last_checked_at=now()`, [source.name, nextOffset, counters.discovered]);
  return { events: upcoming(events, counters), metrics: counters };
}
