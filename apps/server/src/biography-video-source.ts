import * as cheerio from 'cheerio';
import { normalizeText } from './biography-policy.js';

export type BiographyVideoSource = { text: string; publishedAt: string | null };

const maxHtmlBytes = 2_000_000;
const maxContextCharacters = 2000;

// Read one JSON object without executing script code or treating quoted braces
// as object boundaries. The caller supplies the position immediately after '='.
function readAssignedObject(script: string, start: number): unknown {
  while (/\s/.test(script[start] || '') && start < script.length) start++;
  if (script[start] !== '{') return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < script.length; index++) {
    const character = script[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > 64) return null;
    } else if (character === '}' || character === ']') {
      if (--depth === 0) {
        try { return JSON.parse(script.slice(start, index + 1)); }
        catch { return null; }
      }
      if (depth < 0) return null;
    }
  }
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function publicationDate(value: unknown, now: Date): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const midnight = Date.parse(day + 'T00:00:00Z');
  const instant = Date.parse(value);
  if (!Number.isFinite(midnight) || !Number.isFinite(instant) || new Date(midnight).toISOString().slice(0, 10) !== day || midnight < Date.UTC(1900, 0, 1) || instant > now.getTime()) return null;
  return day;
}

const credit = /^(?:Title|Artist|Release Date|Executive Director|Executive Producer|Produced(?: by)?|Producer|Co-Producer|Assistant Producer|Lyrics?|Composed(?: by)?|Compose|Composer|Written(?: by)?|Arranged(?: by)?|Arranger|Vocal(?:s| Produced| Directed| Director| Edit(?:ed)?| Chorus)?|Background Vocal|Guitar(?: Solo)?|Bass|Drums?|Keyboard(?:s)?|All Instruments|Music Program(?: by)?|Additional Music Program|Mixed(?: & Mastered)?(?: by)?|Mastered(?: by)?|Recorded(?: at)?|Recording|เนื้อร้อง|ทำนอง|เรียบเรียง|โปรดิวซ์|มิกซ์|มาสเตอร์)\s*[:：-]/i;
const lyricHeading = /^[\[(]?\s*(?:lyrics?|song\s+lyrics?|เนื้อเพลง)\s*[\])]?\s*[:：]?\s*$/i;
const footer = /^(?:ติดตาม(?:ข่าวสาร|ทุกความเคลื่อนไหว)|ติดต่องาน|Follow\b|Facebook\s*:|Instagram\s*:|TikTok\s*:|Twitter\s*:|YouTube\s*:|Subtitles\b|สมัครสมาชิก|©|Copyright\b)/i;
const skippedMetadata = /^(?:All Streaming|Streaming|LINE MELODY|Digital Download)\s*[:：*]/i;

function descriptionParagraphs(description: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let proseSeen = false;
  const finish = () => {
    if (!current.length) return;
    const text = normalizeText(current.join(' '));
    const isCredit = current.some(line => credit.test(line));
    // Wrapped press paragraphs are useful; short song stanzas without labels
    // are not biographical prose. Never reconstruct lyrics as a paragraph.
    const averageLineLength = current.reduce((sum, line) => sum + line.length, 0) / current.length;
    if (isCredit || (text.length >= 90 && /[\u0e00-\u0e7f]/.test(text) && averageLineLength >= 50)) {
      paragraphs.push(text);
      if (!isCredit) proseSeen = true;
    }
    current = [];
  };
  for (const original of description.replace(/\r\n?/g, '\n').split('\n')) {
    const line = original.trim();
    if (lyricHeading.test(line) || /^(?:LYRICS|SONG LYRICS)\s*[:：]\s*\S/.test(line) || footer.test(line) || /^#/.test(line)) {
      finish();
      break;
    }
    if (/^[\s\-–—_=\u00ad]{5,}$/.test(line)) {
      finish();
      if (proseSeen) break;
      continue;
    }
    if (!line || skippedMetadata.test(line) || /https?:\/\//i.test(line)) {
      finish();
      continue;
    }
    current.push(line);
  }
  finish();
  return paragraphs;
}

export function extractBiographyVideoSource(html: string, input: string | URL, now = new Date()): BiographyVideoSource | null {
  let url: URL;
  try { url = typeof input === 'string' ? new URL(input) : input; }
  catch { return null; }
  const ids = url.searchParams.getAll('v');
  if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com'].includes(url.hostname) || url.pathname !== '/watch' || url.username || url.password || (url.port && url.port !== '443') || ids.length !== 1 || !/^[A-Za-z0-9_-]{11}$/.test(ids[0]) || Buffer.byteLength(html, 'utf8') > maxHtmlBytes) return null;
  const $ = cheerio.load(html);
  let result: BiographyVideoSource | null = null;
  $('script:not([src])').each((_, element) => {
    if (result) return;
    const script = $(element).text();
    const assignment = /(?:^|[;\n])\s*(?:(?:var|let|const)\s+)?ytInitialPlayerResponse\s*=\s*/g;
    for (const match of script.matchAll(assignment)) {
      const player = record(readAssignedObject(script, match.index! + match[0].length));
      const video = record(player?.videoDetails);
      if (!video || video.videoId !== ids[0] || typeof video.title !== 'string' || !video.title.trim() || video.title.length > 300 || typeof video.author !== 'string' || !video.author.trim() || video.author.length > 200 || typeof video.shortDescription !== 'string' || video.shortDescription.length > 20_000) continue;
      const microformat = record(record(player?.microformat)?.playerMicroformatRenderer);
      const header = `Title: ${normalizeText(video.title)}\nAuthor: ${normalizeText(video.author)}`;
      const blocks = descriptionParagraphs(video.shortDescription);
      if (!blocks.length) continue;
      let text = header;
      for (const block of blocks) {
        if (text.length + block.length + 1 <= maxContextCharacters) text += '\n' + block;
        else {
          // Keep only complete excerpts. A clipped number or time unit could
          // turn a source claim into a different claim during generation.
          break;
        }
      }
      if (text === header) continue;
      result = { text, publishedAt: publicationDate(microformat?.publishDate, now) };
      break;
    }
  });
  return result;
}
