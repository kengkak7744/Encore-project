import { robotsAllows } from './ingest.js';

const robotsCache = new Map<string, { text: string; expires: number }>();
const agent = 'ArtistTrackerResearch/0.1 (+public event metadata; contact admin)';
export class ConcertAccessChallengeError extends Error {
  constructor() {super('Access verification page; no bypass attempted');}
}
export class ConcertFetchError extends Error {
  readonly retryMs: number;
  constructor(readonly status: number, retryAfter: string | null = null) {
    super('HTTP ' + status);
    const delay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
    this.retryMs = Math.max(3_600_000,Number.isFinite(delay) ? delay : 0);
  }
}
export function accessChallenge(markup: string) {
  // Ordinary event pages can include Cloudflare telemetry scripts at the footer.
  // Their presence alone does not mean the response is an access challenge.
  return /<title[^>]*>\s*(?:Access Verification|Just a moment|Attention Required)/i.test(markup) || /<form[^>]+id=["']challenge-form["']/i.test(markup);
}

export async function fetchConcertResource(url: string, host: string, kind: 'html' | 'json' | 'xml', redirects = 0): Promise<string> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.hostname !== host && !target.hostname.endsWith('.' + host)) throw Error('URL outside allowed source');
  let rules = robotsCache.get(target.hostname);
  if (!rules || rules.expires <= Date.now()) {
    const response = await fetch(target.origin + '/robots.txt', { headers: { 'User-Agent': agent }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (response.status === 429) throw new ConcertFetchError(429,response.headers.get('retry-after'));
    if (!response.ok && (response.status < 400 || response.status >= 500)) throw Error('Could not check robots.txt: HTTP ' + response.status);
    rules = { text: response.ok ? await response.text() : '', expires: Date.now() + 3600000 };
    robotsCache.set(target.hostname, rules);
  }
  if (!robotsAllows(rules.text, target.pathname + target.search)) throw Error('Blocked by robots.txt');
  const response = await fetch(target, { headers: { 'User-Agent': agent, Accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'application/' + kind }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location') && redirects < 3) return fetchConcertResource(new URL(response.headers.get('location')!, target).href, host, kind, redirects + 1);
  if (!response.ok) throw new ConcertFetchError(response.status,response.headers.get('retry-after'));
  const type = response.headers.get('content-type') || '';
  if (!type.includes(kind)) throw Error('Unexpected content type for ' + kind);
  const body = await response.text();
  if (body.length > 3_000_000) throw Error('Oversize source response');
  if (kind === 'html' && accessChallenge(body)) throw new ConcertAccessChallengeError();
  return body;
}
