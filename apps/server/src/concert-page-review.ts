import * as cheerio from 'cheerio';
import {eventpopThailandLocation} from './concert-parsers.js';
import type {PageReview} from './concert-types.js';
import {announcedLiveMusic} from './concert-music.js';
import {nonMusicGenres,ttmNonMusicPerformance} from './concert-page-evidence.js';

/** Only explicit source metadata can resolve an empty page as excluded. */
export function reviewEventpop(markup:string):PageReview {
  const $=cheerio.load(markup);
  const title=($('#event-title h2,#event-title h3').first().text()||$('meta[property="og:title"]').attr('content')||'').trim().slice(0,200);
  const location=($('meta[property="og:location"]').attr('content')||'').trim();
  const start=$('meta[property="og:start_time"]').attr('content')||'';
  const evidence={title,location:location.slice(0,200),announcedStart:start.slice(0,80)};
  if(!title)return{outcome:'empty',reason:'missing_event_identity',evidence};
  if(/^(online|virtual|on.?demand)$/i.test(location))return{outcome:'excluded',reason:'online_event',evidence};
  const year=Number(start.match(/^\d{4}/)?.[0]);
  if(year>new Date().getUTCFullYear()+5)return{outcome:'empty',reason:'implausible_source_date',evidence};
  if(!location||/^(tba|to be announced)$/i.test(location))return{outcome:'empty',reason:'unverified_country_or_venue',evidence};
  if(!eventpopThailandLocation(location))return{outcome:'empty',reason:'unverified_country',evidence};
  return{outcome:'empty',reason:'unparsed_announced_schedule',evidence};
}

export function reviewTtm(markup:string,page:string):PageReview|undefined {
  if(!new URL(page).pathname.startsWith('/performance/'))return undefined;
  const $=cheerio.load(markup);
  const title=($('h1.title').first().text()||$('h1').first().text()).replace(/\s+/g,' ').trim().slice(0,200);
  if(ttmNonMusicPerformance(title,page))return{outcome:'excluded',reason:'non_music_performance',evidence:{title,path:new URL(page).pathname}};
}

export function reviewTheConcert(value:unknown):PageReview {
  const data=(value as {data?:{id?:unknown;name?:unknown;description?:unknown;attributes?:{code?:string;items?:{name?:unknown}[]}[];venue?:{country?:{name?:unknown}}}})?.data;
  const title=typeof data?.name==='string'?data.name.slice(0,200):'';
  const country=typeof data?.venue?.country?.name==='string'?data.venue.country.name:'';
  const genres=(Array.isArray(data?.attributes)?data.attributes:[]).filter(item=>item.code==='genre').flatMap(item=>Array.isArray(item.items)?item.items:[]).map(item=>typeof item.name==='string'?item.name:'').filter(Boolean);
  const evidence={title,country,genres};
  if(!Number.isSafeInteger(data?.id)||!title)return{outcome:'empty',reason:'missing_event_identity',evidence};
  const program=typeof data?.description==='string'?cheerio.load(data.description).text():'';
  if(genres.length&&genres.every(genre=>nonMusicGenres.test(genre))&&!announcedLiveMusic(program))return{outcome:'excluded',reason:'outside_supported_music_genres',evidence};
  return{outcome:'empty',reason:'unparsed_announced_schedule_or_venue',evidence};
}
