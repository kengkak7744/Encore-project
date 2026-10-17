import { biographyContextYears, biographyReleaseYears, biographyYears } from './biography-dates.js';
import {biographyAffiliationProblem,biographyRoleNameProblem} from './biography-claims.js';

export type BiographyArtist = { id: string; slug: string; name: string; name_en: string | null; kind: string; updated_at?: string; instagram_handle?: string|null; revision_id?: string|null; revision_reason?:string|null };
export type BiographySource = { id: string; url: string; label: string; text: string; fetchedAt: string; publishedAt?: string|null };
export type BiographySection = { heading: string; body: string; sourceId: string; evidence: string[] };
export type BiographyDraft = { identityMatches: boolean; reason: string; sections: BiographySection[] };

export class BiographyRejected extends Error {}

function validateTemporalClaims(section: BiographySection, source: BiographySource) {
  const text = normalizeText(section.body);
  const heading = normalizeText(section.heading);
  const proof = normalizeText(section.evidence.join(' '));
  // A fetched article cannot establish completeness of the current catalog.
  const theme = /(?:เพลง|เนื้อหา|บทเพลง)/.test(text) && proof.includes('สังคมปัจจุบัน') ? text.replaceAll('สังคมปัจจุบัน','สังคมที่เพลงกล่าวถึง') : text;
  if (/ล่าสุด|ปัจจุบัน|ขณะนี้|ทุกวันนี้|\b(?:latest|currently|now)\b/i.test(heading+' '+theme)) throw new BiographyRejected('Unsupported temporal claim: use a named work and an evidenced year instead of latest/current');
  const quantities = (value: string) => [...value.matchAll(/(\d+(?:\.\d+)?)\s*(วัน|เดือน|ปี|days?|months?|years?|歳)/gi)].map(match=>({ number:match[1],unit:/^(?:วัน|days?)$/i.test(match[2])?'day':/^(?:เดือน|months?)$/i.test(match[2])?'month':'year' }));
  for (const quantity of quantities(text)) {
    if (!quantities(proof).some(item=>item.number===quantity.number && item.unit===quantity.unit)) throw new BiographyRejected('Unsupported time quantity: preserve the source number and day/month/year unit');
  }
  const metrics = (value:string) => [...value.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(ล้าน|million|พัน|thousand)?\s*(ครั้ง|วิว|สตรีม|views?|streams?)/gi)].map(match=>Number(match[1].replaceAll(',',''))*(/^(?:ล้าน|million)$/i.test(match[2]||'')?1_000_000:/^(?:พัน|thousand)$/i.test(match[2]||'')?1000:1));
  for(const number of metrics(text)) if(!metrics(proof).includes(number)) throw new BiographyRejected('Unsupported numeric metric: preserve the source magnitude');
  const contextualYears=biographyContextYears(text);
  const eventText=text.replace(/(?:ตาม|อ้างอิง(?:จาก)?)\s*บทความ(?:ปี|เมื่อปี)?\s*(?:19|20|25|26)\d{2}/g,'');
  if(/ปล่อย|เปิดตัว|ออก(?:เพลง|อัลบั้ม|ซิงเกิล)|เดบิวต์|ก่อตั้ง|เซ็นสัญญา/.test(eventText)) {
    const eventYears=new Set([...biographyYears(proof),...biographyReleaseYears(proof)]);
    if(source.publishedAt && /announced today|ประกาศ(?:ใน)?วันนี้/i.test(proof) && /ประกาศ/.test(eventText) && !/ปล่อย|เปิดตัว|ออก(?:เพลง|อัลบั้ม|ซิงเกิล)|เดบิวต์|ก่อตั้ง/.test(eventText)) eventYears.add(Number(source.publishedAt.slice(0,4)));
    if(biographyYears(eventText).some(year=>!eventYears.has(year))) throw new BiographyRejected('Unsupported event year: publication date does not establish a release or event date; quote dated event evidence or omit the year');
  }
  const affiliationProblem=biographyAffiliationProblem(text,proof,source.publishedAt);
  if(affiliationProblem)throw new BiographyRejected(affiliationProblem);
  const roleProblem=biographyRoleNameProblem(text,proof);
  if(roleProblem)throw new BiographyRejected(roleProblem);
  const volatile = /ยอด(?:เข้าชม|วิว|สตรีม|ฟัง)|ล้าน(?:ครั้ง|วิว|สตรีม)|\bstreams?\b|\bviews?\b|อายุ\s*\d|(?<!\d)\d{1,3}\s*ปี/i.test(text);
  if (volatile) {
    const sourceYears = new Set([...biographyYears(proof),...biographyReleaseYears(proof)]);
    if (source.publishedAt) {
      const year=Number(source.publishedAt.slice(0,4));
      if(Number.isFinite(Date.parse(source.publishedAt)))sourceYears.add(year);
    }
    if (!contextualYears.some(year=>sourceYears.has(year))) throw new BiographyRejected('Volatile fact needs source-supported dated context; fetchedAt is not a publication date. Add ตามบทความปี with the supported year, or omit the undated claim');
  }
  if (/สมาชิก/.test(section.heading) && /ร่วมงาน|collaborat|โปรดิวเซอร์/i.test(proof) && !/สมาชิก|\bmembers?\b/i.test(proof)) throw new BiographyRejected('Collaborator evidence does not establish band membership');
}

export function normalizeText(value: string): string { return value.normalize('NFKC').replace(/\s+/g, ' ').trim(); }
export function biographyExcerpts(source: BiographySource): { id: string; text: string }[] {
  const pieces: string[] = [];
  // A question mark can belong to a song title (e.g. Same Page?), so keep its alias together.
  const paragraphs=source.text.split(/\r?\n\s*\r?\n/).map(normalizeText).filter(Boolean);
  for (const sentence of paragraphs.flatMap(text=>text.split(/(?<=[.!])\s+(?=[\p{Lu}\u0e00-\u0e7f])/u))) {
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

export function groundBiographyEvidence(value:unknown, sources:BiographySource[]): Record<string,unknown> & { sections:BiographySection[] } {
  if(!value || typeof value!=='object' || !Array.isArray((value as Record<string,unknown>).sections)) throw new BiographyRejected('Model did not return biography sections');
  const raw=value as Record<string,unknown> & {sections:unknown[]};
  return {...raw,sections:raw.sections.map((item,index)=>{
    if(!item || typeof item!=='object')throw new BiographyRejected('Invalid section '+index);
    const section=item as Record<string,unknown>;
    if(typeof section.heading!=='string'||typeof section.body!=='string'||typeof section.sourceId!=='string')throw new BiographyRejected('Invalid section fields at '+index);
    const source=sources.find(s=>s.id===section.sourceId);
    if(!source)throw new BiographyRejected('Unknown sourceId '+String(section.sourceId)+' in section '+index);
    const excerpts=biographyExcerpts(source);
    const ids=section.evidenceIds;
    if(!Array.isArray(ids)||ids.length<1||ids.length>4||new Set(ids).size!==ids.length)throw new BiographyRejected('Select 1–4 unique evidenceIds from '+source.id+' for section '+index);
    const evidence=ids.map(id=>{
      const excerpt=excerpts.find(e=>e.id===id);
      if(!excerpt)throw new BiographyRejected('Invalid evidenceId '+String(id)+' for '+source.id+' in section '+index+'. Allowed IDs: '+excerpts.map(e=>e.id).join(', ')+'. Split cross-source claims into separate sections; do not move or drop unsupported claims silently');
      return excerpt.text;
    });
    return {...section,heading:section.heading,body:section.body,sourceId:source.id,evidence};
  })};
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
  for (const section of draft.sections) validateBiographySection(section,sources,headings);
  return { identityMatches: true, reason: typeof draft.reason === 'string' ? draft.reason.slice(0, 500) : '', sections: draft.sections };
}

// Shared by publication validation and repair diagnostics; the rules stay identical.
export function validateBiographySection(section:BiographySection,sources:BiographySource[],headings=new Set<string>()) {
  if (!section || typeof section.heading !== 'string' || typeof section.body !== 'string' || typeof section.sourceId !== 'string') throw new BiographyRejected('Invalid section fields');
  const heading = normalizeText(section.heading);
  const body = normalizeText(section.body);
  if (!heading || heading.length > 100 || headings.has(heading)) throw new BiographyRejected('Missing, repeated, or oversized heading');
  headings.add(heading);
  if (body.length < 80 || body.length > 800) throw new BiographyRejected('Section "'+heading+'" body has '+body.length+' characters; need 80–800 supported characters');
  if (!/[\u0e00-\u0e7f]/.test(body) || /https?:\/\//i.test(body)) throw new BiographyRejected('Biography must contain Thai prose without URLs');
  const source = sources.find((item) => item.id === section.sourceId);
  if (!source) throw new BiographyRejected('Section cites an unknown source');
  if (!Array.isArray(section.evidence) || !section.evidence.length || section.evidence.length > 4) throw new BiographyRejected('Each section requires source quotations');
  for (const quote of section.evidence) {
    if (typeof quote !== 'string' || normalizeText(quote).length < 20 || quote.length > 500 || !normalizeText(source.text).includes(normalizeText(quote))) throw new BiographyRejected('Evidence quotation is absent from fetched source: ' + String(quote).slice(0, 120));
  }
  const proof = normalizeText(section.evidence.join(' '));
  validateTemporalClaims(section,source);
  const assertions: [RegExp, RegExp, string][] = [
    [/ดัดแปลง|สร้างจาก|adaptation|adapted/i, /adapt|ดัดแปลง|สร้างจาก|based on|原作/i, 'unverified adaptation'],
    [/อย่างกว้างขวาง|ทั่วโลก|ทั่วประเทศ/, /worldwide|globally|nationally|widely|ทั่วโลก|ทั่วประเทศ|อย่างกว้างขวาง/i, 'unverified reach'],
    [/ยอดนิยม|เพลงฮิต|ได้รับความนิยม/, /popular|\bhit\b|chart|ยอดนิยม|เพลงฮิต|ความนิยม/i, 'unverified popularity'],
    [/จุดเปลี่ยนสำคัญ/, /turning point|milestone|จุดเปลี่ยน/i, 'unverified milestone'],
    [/ฐานแฟน|แฟนคลับ.*เติบโต/, /fan\s*base|fans|แฟนคลับ|ฐานแฟน/i, 'unverified fanbase'],
  ];
  for (const [claim, support, reason] of assertions) {
    if (claim.test(heading + ' ' + body) && !support.test(proof)) throw new BiographyRejected('Unsupported editorial claim in ' + heading + ': ' + reason);
  }
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
