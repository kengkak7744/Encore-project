import {biographyContextYears,calendarYear} from './biography-dates.js';

const affiliation=/สังกัด|ค่ายเพลง|เซ็นสัญญา|(?:ใน|กับ|ภายใต้|จาก|ย้ายไป|ออกจาก)\s*ค่าย/;
const affiliationProof=/สังกัด|ค่าย|เซ็นสัญญา|\bunder\b|\blabel\b|sign(?:ed|ing)?|partnership|join(?:ed|ing)?|所属|レーベル/i;
const unrelatedEvent=/เกิด|\bborn\b|birth|ปล่อย|เปิดตัว|ก่อตั้ง|รับบท|\breleas|\bdebut|\bformed\b/i;
const clauses=(text:string)=>text.replace(/(?:พ\.ศ\.|ค\.ศ\.|[ก-๙]{1,2}\.[ก-๙]{1,2}\.)/g,value=>value.replaceAll('.','\u2024'))
  .split(/[;。!?\n]+|\.(?!\d)/).map(value=>value.replaceAll('\u2024','.')).filter(Boolean);

export function biographyHasAffiliation(text:string) {return affiliation.test(text);}
export function biographyAffiliationYears(proof:string,publishedAt?:string|null) {
  const years=new Set<number>();
  if(publishedAt&&Number.isFinite(Date.parse(publishedAt)))years.add(Number(publishedAt.slice(0,4)));
  for(const clause of clauses(proof))if(affiliationProof.test(clause)&&!unrelatedEvent.test(clause))for(const year of biographyContextYears(clause))years.add(year);
  return [...years];
}

export function biographyAffiliationProblem(body:string,proof:string,publishedAt?:string|null):string|null {
  if(!biographyHasAffiliation(body))return null;
  if(!affiliationProof.test(proof))return 'Unsupported affiliation: selected evidence must establish the label relationship';
  const years=biographyAffiliationYears(proof,publishedAt);
  // Explicit article attribution scopes the paragraph, but only its actual
  // publication date can support it. Birth/release dates cannot supply this year.
  const publicationYear=publishedAt&&Number.isFinite(Date.parse(publishedAt))?Number(publishedAt.slice(0,4)):null;
  for(const clause of clauses(body).filter(biographyHasAffiliation)) {
    const article=[...clause.matchAll(/(?:ตาม|อ้างอิง(?:จาก)?)\s*บทความ(?:ปี|เมื่อปี)?\s*((?:19|20|25|26)\d{2})/g)].map(m=>calendarYear(Number(m[1])));
    if(article.length&&publicationYear!==null&&article.every(year=>year===publicationYear))continue;
    if(article.length)return 'Affiliation needs source-supported dated context: the claimed article year must match this source publication date';
    if(unrelatedEvent.test(clause)||!biographyContextYears(clause).some(year=>years.includes(year)))return 'Affiliation needs source-supported dated context for the relationship itself; a birth, release or unrelated event year cannot date it. Use a dated article attribution or omit the undated affiliation';
  }
  return null;
}

export function biographyRoleNameProblem(body:string,proof:string):string|null {
  if(/นักร้อง(?:น(?:ำ|ํา)|หลัก)|main vocalist|lead vocalist/i.test(body)&&!/นักร้อง(?:น(?:ำ|ํา)|หลัก)|main vocalist|lead vocalist|メインボーカル/i.test(proof))return 'Unsupported main vocalist role: selected evidence must establish this role; membership or performance credits alone are insufficient';
  const names=[...body.matchAll(/(?:รับบท(?:เป็น)?|ในบท(?:บาท)?|บทบาท(?:น(?:ำ|ํา))?(?:เป็น)?)\s+(?:ตัวละคร\s+)?['"“”‘’]?([\p{L}\p{M}\p{N}-]+)/gu)].map(m=>m[1]);
  if(!names.length)return null;
  // A character synopsis may say "follows Tanrak" rather than "role as".
  // Check quoted names and Thai/Latin aliases as well as the opening role name.
  names.push(...[...body.matchAll(/['"“”‘’]?([\u0e00-\u0e7f]+)['"“”‘’]?\s*\([A-Z][A-Za-z -]+\)/g)].map(m=>m[1]));
  for(const name of names) {
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(!new RegExp('(?<![\\p{L}\\p{M}\\p{N}])'+escaped+'(?![\\p{L}\\p{M}\\p{N}])','iu').test(proof))return 'Unsupported role name: preserve the character name exactly as selected evidence spells it; do not invent or shorten a Thai transliteration';
  }
  return null;
}
