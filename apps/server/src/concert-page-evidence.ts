import {deliveryVenue} from './concert-location.js';

export const nonMusicCategories=/^(Lifestyle|Health|Sports & Fitness|Travel & Outdoor|Arts|Education|Hobbies|Fashion|Nightlife|Film & Media|Charity & Causes|Business|Food & Drink|Family & Kids|Technology|Community|Religion & Spirituality|Workshop|Government|Voucher|Science & Tech)$/i;
export const nonMusicGenres=/^(Talk\s*Show|Fan\s*Meeting|Workshop|Theatre|Theater|Sport|Exhibition)$/i;
export const episodicScreening=/(?:the series|ตอนที่|episode\s*\d)/i;

/** Explicit program titles only: an EP number or the performance path alone is insufficient. */
export function ttmNonMusicPerformance(title:string,url:string) {
  let page:URL;try{page=new URL(url);}catch{return false;}
  return page.protocol==='https:'&&/(^|\.)thaiticketmajor\.com$/i.test(page.hostname)&&page.pathname.startsWith('/performance/')&&
    /\bfan\s+screening\b|\bscreening\s+(?:ep\.?|episode)\s*\d+\b|\b(?:first|final)\s+ep(?:isode)?\b|^การแสดงโขน/i.test(title);
}

/** A label alone cannot resolve a page; require the matching source fields. */
export function hasExclusionEvidence(page:{reason?:unknown;evidence?:unknown}) {
  if(!page.evidence||typeof page.evidence!=='object'||Array.isArray(page.evidence))return false;
  const evidence=page.evidence as Record<string,unknown>;
  if(typeof evidence.title!=='string'||!evidence.title.trim())return false;
  const all=(value:unknown,pattern:RegExp)=>Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&pattern.test(item));
  switch(page.reason){
    case 'outside_thailand':return typeof evidence.country==='string'&&/^[A-Z]{2}$/.test(evidence.country)&&evidence.country!=='TH';
    case 'outside_supported_music_categories':return all(evidence.categories,nonMusicCategories);
    case 'outside_supported_music_genres':return all(evidence.genres,nonMusicGenres);
    case 'product_delivery':return typeof evidence.venue==='string'&&deliveryVenue(evidence.venue);
    case 'episodic_screening':return episodicScreening.test(evidence.title);
    case 'not_public':return evidence.hidden===true;
    case 'online_event':return typeof evidence.location==='string'&&/^(online|virtual|on.?demand)$/i.test(evidence.location);
    case 'non_music_performance':return typeof evidence.path==='string'&&ttmNonMusicPerformance(evidence.title,'https://www.thaiticketmajor.com'+evidence.path);
    default:return false;
  }
}
