import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import * as cheerio from 'cheerio';
import { robotsAllows } from './ingest.js';
import { normalizeArtistName, normalizeText, type BiographyArtist, type BiographySource } from './biography-policy.js';
import { extractArtistRosterText } from './biography-roster.js';
import { extractBiographyVideoSource } from './biography-video-source.js';

const userAgent = 'ArtistTrackerResearch/0.2 (Encore; public artist biographies)';
const robotsCache = new Map<string, { text: string; expires: number }>();
type SourceLink = { source_url: string; label: string };
export type CollectedSources = { documents: BiographySource[]; errors: { url: string; error: string }[] };

// Artist sites can contain more than 1 MB of scripts; extracted model context
// remains capped independently. Keep a hard network bound and smaller robots cap.
export async function readBiographyResponse(response: Readable, maxBytes = 2_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('Source response exceeds size limit');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6; reject mapped IPv4, local, multicast, and documentation ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
}

async function publicGet(url: URL, signal: AbortSignal, maxBytes?: number): Promise<{ status: number; type: string; location?: string; text: string }> {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Only public HTTPS sources on port 443 are allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error('Source resolves to a non-public address');
  signal.throwIfAborted();
  const address = addresses[0];
  // Pin the checked address for the connection to prevent DNS rebinding into the local network.
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', family: address.family, lookup: (_hostname, _options, callback) => callback(null, address.address, address.family), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { 'User-Agent': userAgent, Accept: 'text/html,application/json,text/plain' } }, (res) => {
      void readBiographyResponse(res, maxBytes).then((text) => resolve({ status: res.statusCode || 0, type: String(res.headers['content-type'] || ''), location: res.headers.location, text }), reject);
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

// Only publication metadata scoped to an article. Fetch time, page modification
// and unrelated navigation/footer dates must never date a historical claim.
export function extractBiographyPublishedAt(html: string, now = new Date()): string|null {
  const $ = cheerio.load(html);
  const values: unknown[] = $('meta[property="article:published_time"],meta[name="datePublished"],meta[itemprop="datePublished"]').map((_,el)=>$(el).attr('content')).get();
  const visit = (value: unknown,depth = 0) => {
    if (!value || typeof value!=='object' || depth>8) return;
    if (Array.isArray(value)) { for (const child of value) visit(child,depth+1); return; }
    const item = value as Record<string,unknown>;
    if ([item['@type']].flat().some(type=>typeof type==='string' && /^(?:Article|NewsArticle|BlogPosting|MusicArticle)$/.test(type))) values.push(item.datePublished);
    if (item['@graph']) visit(item['@graph'],depth+1);
  };
  $('script[type="application/ld+json"]').each((_,el)=>{ try { visit(JSON.parse($(el).text())); } catch { /* Optional malformed metadata. */ } });
  $('article time[datetime],main time[itemprop="datePublished"][datetime]').each((_,el)=>{ values.push($(el).attr('datetime')); });
  const dates = [...new Set(values.flatMap(value=>{
    if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return [];
    const day=value.slice(0,10),parsed=Date.parse(day+'T00:00:00Z');
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10)===day && parsed<=now.getTime() && parsed>=Date.UTC(1900,0,1) ? [day] : [];
  }))];
  return dates.length===1 ? dates[0] : null;
}

export function extractBiographyText(html: string): string {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer,form,aside,[role=navigation],.references,.reflist').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  const paragraphs = [...new Set(root.find('p').map((_, item) => normalizeText($(item).text())).get().filter((text) => text.length >= 35))];
  const title = normalizeText($('title').text());
  // Short release-date lines are often excluded by the prose length filter.
  // Put explicitly labelled event dates before prose so the context cap keeps them.
  const releaseDates=[...new Set(root.text().match(/(?:Release Date|วัน(?:ที่)?(?:วางจำหน่าย|เผยแพร่|ปล่อยเพลง))\s*[:：]?\s*\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})(?!\d)/gi)||[])].slice(0,8);
  // Keep article paragraphs distinct so a theme cannot drift into the next song.
  return [title,...releaseDates,...(paragraphs.length?paragraphs:[normalizeText(root.text())])]
    .map(normalizeText).filter(Boolean).join('\n\n');
}

// Trailer synopses can fill the context cap before the cast list. Preserve
// complete published cast rows before prose; never infer translated role names.
export function extractBiographyCastText(html:string):string {
  const $=cheerio.load(html);
  $('script,style,noscript,nav,header,footer,form,aside,[role=navigation]').remove();
  const root=$('main').first().length?$('main').first():$('body');
  root.find('br').replaceWith('\n');
  root.find('p,div,section,li').append('\n');
  const cast=[...new Set(root.text().split(/\r?\n/).map(normalizeText).filter(line=>line.length>=20&&line.length<=250&&/รับบท\s+/.test(line)))];
  const text=extractBiographyText(html);
  return cast.length>=2?[normalizeText($('title').text()),...cast,text].filter(Boolean).join('\n\n'):text;
}

export function extractBiographyGmmtvNewsText(html:string):string {
  const $=cheerio.load(html);$('script,style,noscript,nav,header,footer,form,aside,[role=navigation]').remove();
  const root=$('main').first().length?$('main').first():$('body');
  root.find('br').replaceWith('\n');root.find('p,div,section,li').append('\n');
  const thai=[...new Set(root.text().split(/\r?\n/).map(normalizeText).filter(line=>{
    const count=(line.match(/[\u0e00-\u0e7f]/g)||[]).length;
    return count>=80&&count>(line.match(/[A-Za-z]/g)||[]).length;
  }))];
  if(thai.length<2)return extractBiographyText(html);
  const roles=thai.filter(line=>/รับบท|เป็นเรื่องราวของ/.test(line));
  return [normalizeText($('title').text()),...roles,...thai.filter(line=>!roles.includes(line))].filter(Boolean).join('\n\n');
}

async function readSource(link: SourceLink, signal: AbortSignal, artist: BiographyArtist): Promise<BiographySource> {
  let url = new URL(link.source_url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await permitted(url, signal);
    const response = await publicGet(url, signal);
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) { url = new URL(response.location, url); continue; }
    if (response.status !== 200 || !response.type.includes('html')) throw new Error('Source is not accessible HTML: HTTP ' + response.status);
    const roster=['www.whattheduckmusic.com','whattheduckmusic.com'].includes(url.hostname)&&/^\/a\/?$/.test(url.pathname);
    const videoPage=['youtube.com','www.youtube.com'].includes(url.hostname)&&url.pathname==='/watch';
    const video=videoPage?extractBiographyVideoSource(response.text,url):null;
    if(videoPage&&!video)throw new Error('Matching public video description unavailable');
    const castPage=['www.gmm-tv.com','gmm-tv.com'].includes(url.hostname)&&/^\/contents\//.test(url.pathname);
    const gmmtvNews=['www.gmm-tv.com','gmm-tv.com'].includes(url.hostname)&&/^\/news\//.test(url.pathname);
    const extracted=videoPage?video!.text:roster?extractArtistRosterText(response.text,[artist.name,artist.name_en||''],artist.instagram_handle||undefined):castPage?extractBiographyCastText(response.text):gmmtvNews?extractBiographyGmmtvNewsText(response.text):extractBiographyText(response.text);
    if(extracted===null)throw new Error('Roster does not contain one matching artist and verified Instagram account');
    const text = extracted.slice(0, 2400);
    if (text.length < 250) throw new Error('Source contains too little readable biography text');
    return { id: '', url: url.toString(), label: link.label.slice(0, 160), text, fetchedAt: new Date().toISOString(), publishedAt: videoPage?video!.publishedAt:extractBiographyPublishedAt(response.text) };
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

export function orderBiographyDocuments(documents:BiographySource[]):BiographySource[] {
  return [...documents].sort((a,b)=>Number(!!b.publishedAt&&Number.isFinite(Date.parse(b.publishedAt)))-Number(!!a.publishedAt&&Number.isFinite(Date.parse(a.publishedAt))))
    .map((doc,index)=>({...doc,id:'source-'+(index+1),text:doc.text.slice(0,2000)}));
}

export async function collectBiographySources(artist: BiographyArtist, links: SourceLink[], signal: AbortSignal): Promise<CollectedSources> {
  const documents: BiographySource[] = [];
  const errors: CollectedSources['errors'] = [];
  const uniqueLinks = links.filter((link, index) => links.findIndex((other) => other.source_url === link.source_url) === index);
  for (const link of uniqueLinks.slice(0, 6)) {
    if (documents.length >= 3) break;
    try { documents.push(await readSource(link, signal, artist)); }
    catch (error) { signal.throwIfAborted(); errors.push({ url: link.source_url, error: error instanceof Error ? error.message : 'Failed to read source' }); }
  }
  if (documents.length < 3) {
    try { documents.push(...await discoverWikipedia(artist, signal)); }
    catch (error) { signal.throwIfAborted(); errors.push({ url: 'https://www.wikipedia.org/', error: error instanceof Error ? error.message : 'Discovery failed' }); }
  }
  const unique = documents.filter((doc, index) => documents.findIndex((other) => other.url === doc.url) === index).slice(0, 3);
  // Keep context small enough for an 8K model context on 16 GB VRAM.
  return { documents: orderBiographyDocuments(unique), errors };
}
