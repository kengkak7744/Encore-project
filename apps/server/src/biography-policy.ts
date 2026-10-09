export type BiographyArtist = { id: string; slug: string; name: string; name_en: string | null; kind: string; updated_at?: string; instagram_handle?: string|null };
export type BiographySource = { id: string; url: string; label: string; text: string; fetchedAt: string };
export type BiographySection = { heading: string; body: string; sourceId: string; evidence: string[] };
export type BiographyDraft = { identityMatches: boolean; reason: string; sections: BiographySection[] };

export class BiographyRejected extends Error {}

export function normalizeText(value: string): string { return value.normalize('NFKC').replace(/\s+/g, ' ').trim(); }
export function biographyExcerpts(source: BiographySource): { id: string; text: string }[] {
  const text = normalizeText(source.text);
  const pieces: string[] = [];
  // A question mark can belong to a song title (e.g. Same Page?), so keep its alias together.
  for (const sentence of text.split(/(?<=[.!])\s+(?=[\p{Lu}\u0e00-\u0e7f])/u)) {
    let rest = sentence.trim();
    while (rest.length > 400) {
      const space = rest.lastIndexOf(' ', 400);
      const end = space >= 100 ? space : 400;
      pieces.push(rest.slice(0, end)); rest = rest.slice(end).trim();
    }
    if (rest.length >= 20) pieces.push(rest);
  }
  return pieces.map((piece, index) => ({ id: source.id + ':' + (index + 1), text: piece }));
}
export function normalizeArtistName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

function minuteOfDay(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Biography window must use HH:mm (00:00–23:59)');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

// Bangkok has a fixed UTC+7 offset. Return the date on which this night's window STARTED.
export function biographyWindow(now: Date, start = '23:00', end = '00:00'): { date: string; endsAt: Date } | null {
  const startMinute = minuteOfDay(start);
  const endMinute = minuteOfDay(end);
  if (startMinute === endMinute) throw new Error('Biography window start and end must differ');
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const current = local.getUTCHours() * 60 + local.getUTCMinutes();
  const crossesMidnight = endMinute < startMinute;
  if (crossesMidnight ? current < startMinute && current >= endMinute : current < startMinute || current >= endMinute) return null;
  const startDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (crossesMidnight && current < endMinute) startDay.setUTCDate(startDay.getUTCDate() - 1);
  const endsAt = new Date(startDay.getTime() + ((crossesMidnight ? 1440 : 0) + endMinute - 420) * 60 * 1000);
  return { date: startDay.toISOString().slice(0, 10), endsAt };
}

export function assertBiographyModel(model: string, chatModel: string) {
  const canonical = (value: string) => value.trim().toLowerCase().replace(/:latest$/, '');
  if (!canonical(model) || /cloud/i.test(model)) throw new Error('Biography model must be a local model');
  if (canonical(model) === canonical(chatModel)) throw new Error('Biography model must differ from the chatbot model');
}

export function validateBiographyDraft(value: unknown, sources: BiographySource[]): BiographyDraft {
  if (!value || typeof value !== 'object') throw new BiographyRejected('Invalid biography JSON');
  const draft = value as Partial<BiographyDraft>;
  if (draft.identityMatches !== true) throw new BiographyRejected('Artist identity is not supported by sources');
  if (!Array.isArray(draft.sections) || draft.sections.length < 3 || draft.sections.length > 6) throw new BiographyRejected('Need 3–6 supported biography sections');
  const headings = new Set<string>();
  for (const section of draft.sections) {
    if (!section || typeof section.heading !== 'string' || typeof section.body !== 'string' || typeof section.sourceId !== 'string') throw new BiographyRejected('Invalid section fields');
    const heading = normalizeText(section.heading);
    const body = normalizeText(section.body);
    if (!heading || heading.length > 100 || headings.has(heading)) throw new BiographyRejected('Missing, repeated, or oversized heading');
    headings.add(heading);
    if (body.length < 80 || body.length > 800 || !/[\u0e00-\u0e7f]/.test(body) || /https?:\/\//i.test(body)) throw new BiographyRejected('Biography must contain concise Thai prose');
    const source = sources.find((item) => item.id === section.sourceId);
    if (!source) throw new BiographyRejected('Section cites an unknown source');
    if (!Array.isArray(section.evidence) || !section.evidence.length || section.evidence.length > 4) throw new BiographyRejected('Each section requires source quotations');
    for (const quote of section.evidence) {
      if (typeof quote !== 'string' || normalizeText(quote).length < 20 || quote.length > 500 || !normalizeText(source.text).includes(normalizeText(quote))) throw new BiographyRejected('Evidence quotation is absent from fetched source: ' + String(quote).slice(0, 120));
    }
    const proof = normalizeText(section.evidence.join(' '));
    const assertions: [RegExp, RegExp, string][] = [
      [/อย่างกว้างขวาง|ทั่วโลก|ทั่วประเทศ/, /worldwide|globally|nationally|widely|ทั่วโลก|ทั่วประเทศ|อย่างกว้างขวาง/i, 'unverified reach'],
      [/ยอดนิยม|เพลงฮิต|ได้รับความนิยม/, /popular|\bhit\b|chart|ยอดนิยม|เพลงฮิต|ความนิยม/i, 'unverified popularity'],
      [/จุดเปลี่ยนสำคัญ/, /turning point|milestone|จุดเปลี่ยน/i, 'unverified milestone'],
      [/ฐานแฟน|แฟนคลับ.*เติบโต/, /fanbase|fans|แฟนคลับ|ฐานแฟน/i, 'unverified fanbase'],
    ];
    for (const [claim, support, reason] of assertions) {
      if (claim.test(heading + ' ' + body) && !support.test(proof)) throw new BiographyRejected('Unsupported editorial claim in ' + heading + ': ' + reason);
    }
  }
  return { identityMatches: true, reason: typeof draft.reason === 'string' ? draft.reason.slice(0, 500) : '', sections: draft.sections };
}

export function validateBiographyReview(value: unknown, count: number) {
  if (!value || typeof value !== 'object') throw new BiographyRejected('Invalid review JSON');
  const review = value as { identityMatches?: boolean; reason?: string; checks?: { index: number; supported: boolean; reason: string }[] };
  if (review.identityMatches !== true) throw new BiographyRejected('Identity review rejected: ' + String(review.reason || 'artist does not match source').slice(0, 300));
  if (!Array.isArray(review.checks) || review.checks.length !== count) throw new BiographyRejected('Incomplete factual review');
  const indexes = new Set<number>();
  for (const check of review.checks) {
    if (!check || !Number.isInteger(check.index) || check.index < 0 || check.index >= count || indexes.has(check.index)) throw new BiographyRejected('Review omitted or repeated a section');
    indexes.add(check.index);
    if (check.supported !== true) throw new BiographyRejected('Unsupported claim: ' + String(check.reason || 'no reason').slice(0, 300));
  }
}
