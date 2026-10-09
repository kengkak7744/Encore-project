import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { normalizeArtistName, normalizeText } from './biography-policy.js';

// A roster is usable only when the named text and a verified account occur in
// the same bounded heading segment. Never fall back to the whole roster.
export function extractArtistRosterText(html: string, artistName: string | string[], expectedInstagramHandle?: string): string | null {
  const handle = expectedInstagramHandle?.trim().replace(/^@/, '').toLowerCase();
  if (!handle || !/^[a-z0-9_.]+$/.test(handle)) return null;
  const names = new Set((Array.isArray(artistName) ? artistName : [artistName]).map(normalizeArtistName).filter(Boolean));
  if (!names.size) return null;
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer,form,aside,[role=navigation],iframe').remove();
  const headings = 'h1,h2,h3,h4,h5,h6';
  const owners = new Set<Element>();
  // Wix can put a two-line name such as Chart / Suchart in two h2 elements.
  $('h2').each((_, element) => {
    const heading = $(element);
    const parent = heading.parent();
    const parentName = normalizeArtistName(parent.find(headings).text());
    const owner = names.has(parentName) ? parent : names.has(normalizeArtistName(heading.text())) ? heading : null;
    if (owner?.get(0)) owners.add(owner.get(0)!);
  });
  if (owners.size !== 1) return null;
  const owner = $([...owners][0]);
  const chunks = [owner.text()];
  const links: string[] = [];
  const collectLinks = (node: cheerio.Cheerio<Element>) => {
    node.find('a[href]').add(node.filter('a[href]')).each((_, element) => {
      try {
        const url = new URL($(element).attr('href')!);
        if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return;
        const match = /^\/([a-z0-9_.]+)\/?$/i.exec(url.pathname);
        if (match) links.push(match[1].toLowerCase());
      } catch { /* An unrelated malformed link is not identity evidence. */ }
    });
  };
  collectLinks(owner);
  let node = owner.next();
  let siblings = 0;
  let size = chunks[0].length;
  if (size > 20_000) return null;
  while (node.length) {
    if (node.is(headings) || node.find(headings).length) break;
    if (++siblings > 80) return null;
    const text = node.text();
    size += text.length;
    if (size > 20_000) return null;
    chunks.push(text);
    collectLinks(node);
    node = node.next();
  }
  if (!links.length || links.some((value) => value !== handle)) return null;
  return normalizeText(chunks.join(' '));
}
