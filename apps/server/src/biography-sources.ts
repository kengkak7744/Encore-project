import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import { robotsAllows } from './ingest.js';
import { normalizeArtistName, normalizeText, type BiographyArtist, type BiographySource } from './biography-policy.js';

const userAgent = 'ArtistTrackerResearch/0.2 (Encore; public artist biographies)';
const robotsCache = new Map<string, { text: string; expires: number }>();
type SourceLink = { source_url: string; label: string };
export type CollectedSources = { documents: BiographySource[]; errors: { url: string; error: string }[] };

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6; reject mapped IPv4, local, multicast, and documentation ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
}

async function publicGet(url: URL, signal: AbortSignal, maxBytes = 1_000_000): Promise<{ status: number; type: string; location?: string; text: string }> {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Only public HTTPS sources on port 443 are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error('Source resolves to a non-public address');
  signal.throwIfAborted();
  const address = addresses[0];
  // Pin the checked address for the connection to prevent DNS rebinding into the local network.
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', family: address.family, lookup: (_hostname, _options, callback) => callback(null, address.address, address.family), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { 'User-Agent': userAgent, Accept: 'text/html,application/json,text/plain' } }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(new Error('Source response exceeds size limit')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode || 0, type: String(res.headers['content-type'] || ''), location: res.headers.location, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function permitted(url: URL, signal: AbortSignal) {
  let cached = robotsCache.get(url.origin);
  if (!cached || cached.expires < Date.now()) {
    const response = await publicGet(new URL('/robots.txt', url), signal, 64000);
    if (response.status !== 404 && response.status !== 410 && response.status !== 200) throw new Error('Unable to check robots.txt: HTTP ' + response.status);
    cached = { text: response.status === 200 ? response.text : '', expires: Date.now() + 24 * 60 * 60 * 1000 };
    robotsCache.set(url.origin, cached);
  }
  if (!robotsAllows(cached.text, url.pathname + url.search)) throw new Error('Source disallows automated reading in robots.txt');
}

export function extractBiographyText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer,form,aside,[role=navigation],.references,.reflist').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  const paragraphs = [...new Set(root.find('p').map((_, item) => normalizeText($(item).text())).get().filter((text) => text.length >= 35))];
  const title = normalizeText($('title').text());
  return normalizeText(title + '\n' + (paragraphs.length ? paragraphs.join('\n') : root.text()));
}

async function readSource(link: SourceLink, signal: AbortSignal): Promise<BiographySource> {
  let url = new URL(link.source_url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await permitted(url, signal);
    const response = await publicGet(url, signal);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) { url = new URL(response.location, url); continue; }
    if (response.status !== 200 || !response.type.includes('html')) throw new Error('Source is not accessible HTML: HTTP ' + response.status);
    const text = extractBiographyText(response.text).slice(0, 2400);
    if (text.length < 250) throw new Error('Source contains too little readable biography text');
    return { id: '', url: url.toString(), label: link.label.slice(0, 160), text, fetchedAt: new Date().toISOString() };
  }
  throw new Error('Too many source redirects');
}

async function wikiApi(language: 'th' | 'en', params: Record<string, string>, signal: AbortSignal) {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params }).toString();
  const response = await publicGet(url, signal);
  if (response.status !== 200) throw new Error('Wikipedia API HTTP ' + response.status);
  const data = JSON.parse(response.text);
  if (data.error) throw new Error('Wikipedia API unavailable');
  return data.query;
}

async function discoverWikipedia(artist: BiographyArtist, signal: AbortSignal): Promise<BiographySource[]> {
  const names = [...new Set([artist.name, artist.name_en].filter((name): name is string => !!name))];
  const identities = names.map(normalizeArtistName);
  const results: BiographySource[] = [];
  for (const language of ['th', 'en'] as const) {
    for (const name of names) {
      signal.throwIfAborted();
      const search = await wikiApi(language, { list: 'search', srsearch: name, srlimit: '3', srnamespace: '0' }, signal);
      const match = (search?.search || []).find((page: { title: string }) => identities.includes(normalizeArtistName(page.title)));
      if (!match) continue;
      const detail = await wikiApi(language, { pageids: String(match.pageid), prop: 'extracts|pageprops', explaintext: '1', exintro: '1' }, signal);
      const page = detail?.pages?.[0];
      if (!page?.extract || page.pageprops?.disambiguation !== undefined) continue;
      const text = normalizeText(page.title + ' ' + page.extract).slice(0, 2400);
      if (text.length < 250 || !/นักร้อง|นักดนตรี|ศิลปิน|วงดนตรี|บอยแบนด์|เกิร์ลกรุ๊ป|singer|musician|songwriter|rapper|\bband\b|boy group|girl group/i.test(text)) continue;
      results.push({ id: '', url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, label: `Wikipedia (${language}) — ${page.title}`, text, fetchedAt: new Date().toISOString() });
      break;
    }
  }
  return results;
}

export async function collectBiographySources(artist: BiographyArtist, links: SourceLink[], signal: AbortSignal): Promise<CollectedSources> {
  const documents: BiographySource[] = [];
  const errors: CollectedSources['errors'] = [];
  for (const link of links.slice(0, 6)) {
    if (documents.length >= 3) break;
    try { documents.push(await readSource(link, signal)); }
    catch (error) { signal.throwIfAborted(); errors.push({ url: link.source_url, error: error instanceof Error ? error.message : 'Failed to read source' }); }
  }
  if (documents.length < 3) {
    try { documents.push(...await discoverWikipedia(artist, signal)); }
    catch (error) { signal.throwIfAborted(); errors.push({ url: 'https://www.wikipedia.org/', error: error instanceof Error ? error.message : 'Discovery failed' }); }
  }
  const unique = documents.filter((doc, index) => documents.findIndex((other) => other.url === doc.url) === index).slice(0, 3);
  // Keep context small enough for an 8K model context on 16 GB VRAM.
  return { documents: unique.map((doc, index) => ({ ...doc, id: 'source-' + (index + 1), text: doc.text.slice(0, 2000) })), errors };
}
