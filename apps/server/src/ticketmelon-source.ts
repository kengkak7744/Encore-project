import * as cheerio from 'cheerio';
import {deliveryVenue} from './concert-location.js';
import type {ConcertEvent,PageReview} from './concert-types.js';
import {announcedNightlifeMusic} from './concert-music.js';
import {nonMusicCategories,episodicScreening} from './concert-page-evidence.js';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const thaiCountry=(value:string)=>['th','thailand','thailande','ไทย','ประเทศไทย'].includes(normalize(value));
const unknownVenue=/^(?:tba|tbd|to be announced|unknown|ยังไม่ประกาศ|รอประกาศ)$/i;

/** Recover only explicit current event-location cues, never biographies, tags or organizer addresses. */
function programLocations(markup:string){
  const $=cheerio.load(markup);
  $('script,style').remove();
  $('br').replaceWith('\n');
  $('p,li,h1,h2,h3,h4').append('\n');
  const program=$.root().text();
  const found:{country:string;city:string;snippet:string}[]=[];
  for(const match of program.matchAll(/(?:^|\n)[^\n]{0,140}\bas we return to (Pattaya) for (?:our|this) [^\n.!?]{0,60}\bedition\b[^\n.!?]*/gim)){
    const snippet=match[0].trim();
    if(!/\b(?:previously|last year|past tour|was|were)\b/i.test(snippet))found.push({country:'TH',city:'Pattaya',snippet:snippet.slice(0,200)});
  }
  for(const match of program.matchAll(/(?:^|\n)\s*(?:📍\s*)?\[?\s*Venue\s*[:—–-]\s*(?:TBA|to be announced)\s*\]?\s*,?\s*(Kuala Lumpur|Kuching\s*,\s*Sarawak)\b/gim)){
    found.push({country:'MY',city:/^Kuching/i.test(match[1])?'Kuching':'Kuala Lumpur',snippet:match[0].trim().replace(/\s+/g,' ').slice(0,200)});
  }
  return found;
}

/** Venue country components take precedence over localized address text. */
export function ticketmelonCountry(venue:Record<string,any>):string|null {
  const components=Array.isArray(venue.address_components)?venue.address_components.filter((item:unknown)=>Array.isArray(record(item).types)&&record(item).types.includes('country')):[];
  if(components.length){
    if(components.length!==1)return null;
    const country=record(components[0]);
    const code=text(country.short_name).toUpperCase();
    if(/^[A-Z]{2}$/.test(code))return code;
    return thaiCountry(text(country.long_name))?'TH':null;
  }
  const address=normalize(text(venue.formatted_address)||text(venue.address));
  if(/(?:^|[\s,])(?:thailand|thailande|ประเทศไทย|ไทย)$/.test(address))return 'TH';
  const countries:Record<string,string>={indonesia:'ID',philippines:'PH',malaysia:'MY',vietnam:'VN',singapore:'SG',taiwan:'TW',usa:'US','united states':'US',japan:'JP','hong kong':'HK',cambodia:'KH',laos:'LA',australia:'AU','south korea':'KR'};
  const last=address.split(',').at(-1)?.trim().replace(/\s+\d{4,6}$/,'')||'';
  return countries[last]||null;
}

export function analyzeTicketmelon(markup:string,pageUrl:string):{events:ConcertEvent[];review?:PageReview} {
  const url=new URL(pageUrl);
  const review=(outcome:'excluded'|'empty',reason:string,evidence:PageReview['evidence'])=>({events:[],review:{outcome,reason,evidence}});
  if(url.hostname!=='www.ticketmelon.com'||!/^\/[^/]+\/[^/]+\/?$/.test(url.pathname))return review('empty','unsupported_url',{});
  const embedded=cheerio.load(markup)('script#__NEXT_DATA__').html();
  let event:Record<string,any>;
  try{event=record(record(record(record(JSON.parse(embedded||'')).props).pageProps).event);}catch{return review('empty','missing_event_data',{});}
  const title=text(event.name),venue=record(event.venue),currency=text(record(event.currency).code).toUpperCase(),status=text(event.status).toLowerCase();
  const categories:string[]=(Array.isArray(event.categories)?event.categories:[]).filter((item:unknown):item is string=>typeof item==='string');
  const structuredCountry=ticketmelonCountry(venue);
  const locations=programLocations(text(event.description));
  const countries=new Set(locations.map(location=>location.country));
  const conflicting=countries.size>1||!!structuredCountry&&locations.some(location=>location.country!==structuredCountry);
  const hasCountryComponents=Array.isArray(venue.address_components)&&venue.address_components.some((item:unknown)=>Array.isArray(record(item).types)&&record(item).types.includes('country'));
  const country=conflicting?null:structuredCountry||(!hasCountryComponents&&countries.size===1?locations[0].country:null);
  const evidence={title:title.slice(0,200),categories,country:country||'unknown',currency,status,venue:text(venue.name).slice(0,200),hidden:event.is_hide_web===true,
    ...(locations.length?{descriptionLocation:locations.map(location=>location.snippet).join(' | ').slice(0,400)}:{}),
    ...(conflicting?{structuredCountry:structuredCountry||'unknown',descriptionCountries:[...countries]}:{})};
  if(!title)return review('empty','missing_event_identity',evidence);
  if(event.is_hide_web===true)return review('excluded','not_public',evidence);
  if(deliveryVenue(text(venue.name)))return review('excluded','product_delivery',evidence);
  if(conflicting)return review('empty','conflicting_country_evidence',evidence);
  if(country&&country!=='TH')return review('excluded','outside_thailand',evidence);
  if(episodicScreening.test(title))return review('excluded','episodic_screening',evidence);
  const musicCategory=categories.some(item=>/music|concert|ดนตรี|คอนเสิร์ต/i.test(item));
  const program=cheerio.load(text(event.description)).text();
  const nightlifeMusic=categories.includes('Nightlife')&&categories.every(item=>['Nightlife','Lifestyle','Fashion'].includes(item))&&announcedNightlifeMusic(title+' '+program);
  if(!musicCategory&&!nightlifeMusic){
    return categories.length&&categories.every(item=>nonMusicCategories.test(item))?review('excluded','outside_supported_music_categories',evidence):review('empty','unverified_music_category',evidence);
  }
  if(country!=='TH')return review('empty','unverified_country',evidence);
  if(!/^[A-Z]{3}$/.test(currency))return review('empty','unsupported_or_missing_currency',evidence);
  if(!['publish','cancelled','canceled','postponed'].includes(status))return review('empty','unverified_publication_status',evidence);
  const startsAtMs=Number(event.show_starttime),endsAtMs=Number(event.show_endtime);
  if(event.show_starttime==null||!Number.isFinite(startsAtMs)||startsAtMs<Date.parse('2020-01-01')||startsAtMs>Date.parse(`${new Date().getUTCFullYear()+6}-01-01`))return review('empty','invalid_event_date',evidence);
  const artists=Array.isArray(event.artist_tag)?event.artist_tag:[];
  const venueName=text(venue.name),address=text(venue.formatted_address)||text(venue.address);
  const knownVenue=venueName&&!unknownVenue.test(venueName)?venueName:null;
  const knownAddress=address&&!unknownVenue.test(address)?address:null;
  const city=locations.find(location=>location.country===country)?.city;
  return {events:[{title,url:url.origin+url.pathname,startsAt:new Date(startsAtMs).toISOString(),endsAt:Number.isFinite(endsAtMs)&&endsAtMs>startsAtMs?new Date(endsAtMs).toISOString():null,
    venue:knownVenue,venueLocation:knownVenue||knownAddress?{address:knownAddress,latitude:venue.latitude,longitude:venue.longitude,placeId:text(venue.place_id)||null}:null,...(city?{city}:{}),country:'TH',image:text(event.img_poster)||null,priceMin:null,priceMax:null,currency,
    status:['cancelled','canceled'].includes(status)?'cancelled':status==='postponed'?'postponed':'scheduled',artist:text(record(artists[0]).artist)||null}]};
}

export function parseTicketmelon(markup:string,pageUrl:string){return analyzeTicketmelon(markup,pageUrl).events;}
