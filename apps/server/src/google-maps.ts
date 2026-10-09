import { config } from './config.js';
import { one,query } from './db.js';

export class MapsError extends Error {
  constructor(public status: number,public code: string,message: string) { super(message); }
}
export function placeId(value: unknown) {
  if (typeof value!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new MapsError(400,'INVALID_PLACE','กรุณาเลือกสถานที่ใหม่');
  return value;
}
export function mapsText(value: unknown) {
  if (typeof value!=='string' || !value.trim() || value.trim().length>160) throw new MapsError(400,'INVALID_LOCATION','กรุณาตรวจชื่อสถานที่ (ไม่เกิน 160 ตัวอักษร)');
  return value.trim();
}
export function mapLink(destination: string,id?: string,origin?: string,mode='driving',originId?: string) {
  const url=new URL('https://www.google.com/maps/'+(origin ? 'dir/' : 'search/'));
  url.searchParams.set('api','1');
  if (origin) { url.searchParams.set('origin',origin);url.searchParams.set('destination',destination);url.searchParams.set('travelmode',mode);if(id)url.searchParams.set('destination_place_id',id); }
  else { url.searchParams.set('query',destination);if(id)url.searchParams.set('query_place_id',id); }
  if(origin && originId)url.searchParams.set('origin_place_id',originId);
  return url.href;
}
export function embedLink(destination: string,id?: string) {
  if (!config.googleMapsEmbedKey) return null;
  const url=new URL('https://www.google.com/maps/embed/v1/place');
  url.searchParams.set('key',config.googleMapsEmbedKey);url.searchParams.set('q',id ? 'place_id:'+id : destination);
  return url.href;
}

async function google(kind: string,path: string,key: string,body?: unknown,fields?: string) {
  if (!key) throw new MapsError(503,'NOT_CONFIGURED','บริการนี้ยังไม่พร้อม กรุณาใช้ลิงก์ Google Maps หรือกรอกสถานที่เอง');
  const reserved=await one(`INSERT INTO google_maps_budget(day,requests,by_kind) VALUES((now() AT TIME ZONE 'Asia/Bangkok')::date,1,jsonb_build_object($2::text,1))
    ON CONFLICT(day) DO UPDATE SET requests=google_maps_budget.requests+1,
    by_kind=jsonb_set(google_maps_budget.by_kind,ARRAY[$2::text],to_jsonb(COALESCE((google_maps_budget.by_kind->>$2)::int,0)+1))
    WHERE google_maps_budget.requests<$1 AND (google_maps_budget.blocked_until IS NULL OR google_maps_budget.blocked_until<=now()) RETURNING requests`,[config.googleMapsDailyLimit,kind]);
  if (!reserved) throw new MapsError(429,'DAILY_LIMIT','พักการค้นหา Google ชั่วคราว กรุณาใช้ลิงก์ต้นทางหรือกรอกเอง');
  let response: Response;
  try {
    response=await fetch(path,{method:body===undefined ? 'GET' : 'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,...(fields?{'X-Goog-FieldMask':fields}: {})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(config.googleRoutesTimeoutMs)});
  } catch { throw new MapsError(503,'PROVIDER_UNAVAILABLE','Google ไม่ตอบกลับ กรุณาลองใหม่หรือเปิด Google Maps'); }
  if (response.status===429) {
    await query("UPDATE google_maps_budget SET blocked_until=now()+interval '10 minutes' WHERE day=(now() AT TIME ZONE 'Asia/Bangkok')::date");
    throw new MapsError(429,'PROVIDER_LIMIT','Google จำกัดการเรียก ระบบพัก 10 นาที กรุณาเปิด Google Maps แทน');
  }
  if (response.status===403 || response.status===401) throw new MapsError(503,'PROVIDER_ACCESS','Google ยังไม่อนุญาตบริการนี้ กรุณาเปิด Google Maps แทน');
  if (!response.ok) throw new MapsError(503,'PROVIDER_UNAVAILABLE','ยังอ่านข้อมูลจาก Google ไม่ได้ กรุณาเปิด Google Maps แทน');
  try { return await response.json() as any; } catch { throw new MapsError(503,'INVALID_RESPONSE','ข้อมูลจาก Google ไม่พร้อมใช้งาน'); }
}

export async function autocomplete(input: string,token: string,country: string) {
  const data=await google('autocomplete','https://places.googleapis.com/v1/places:autocomplete',config.googlePlacesKey,{input,sessionToken:token,languageCode:'th',...(country ? {includedRegionCodes:[country.toLowerCase()]} : {})},'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
  return (Array.isArray(data.suggestions)?data.suggestions:[]).flatMap((s:any)=>{
    const p=s.placePrediction;return p && typeof p.placeId==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(p.placeId) && typeof p.text?.text==='string' ? [{id:p.placeId,text:p.text.text.slice(0,500)}] : [];
  }).slice(0,5);
}
export async function placeLocation(id: string,token?: string) {
  const url=new URL('https://places.googleapis.com/v1/places/'+placeId(id));url.searchParams.set('languageCode','th');if(token)url.searchParams.set('sessionToken',token);
  const place=await google('details',url.href,config.googlePlacesKey,undefined,'id,location');
  const {latitude,longitude}=place.location || {};
  if (!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180) throw new MapsError(503,'NO_LOCATION','ยังไม่พบพิกัดของสถานที่นี้ กรุณาเลือกใหม่');
  return {latitude,longitude};
}
export async function nearby(id: string,category: string,radius: number,token?: string) {
  const location=await placeLocation(id,token);
  return nearbyAt(location,category,radius);
}
export async function nearbyAt(location: {latitude:number;longitude:number},category: string,radius: number) {
  const data=await google('nearby','https://places.googleapis.com/v1/places:searchNearby',config.googlePlacesKey,{includedTypes:[category],maxResultCount:6,rankPreference:'DISTANCE',languageCode:'th',locationRestriction:{circle:{center:location,radius}}},'places.id,places.displayName,places.formattedAddress,places.attributions');
  return (Array.isArray(data.places)?data.places:[]).flatMap((p:any)=>{
    if (typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(p.id)||typeof p.displayName?.text!=='string')return [];
    const attributions=(Array.isArray(p.attributions)?p.attributions:[]).flatMap((a:any)=>{
      if(typeof a.provider!=='string')return [];
      let url:string|null=null;try{const link=new URL(a.providerUri);if(link.protocol==='https:'&&!link.username&&!link.password)url=link.href;}catch{}
      return [{provider:a.provider,url}];
    });
    return [{id:p.id,name:p.displayName.text,address:typeof p.formattedAddress==='string'?p.formattedAddress:null,url:mapLink(p.displayName.text,p.id),attributions}];
  }).slice(0,6);
}

export async function exploreRoute(input: {origin: string;originId?: string;destination: string;destinationId?: string;destinationCoordinates?:{latitude:number;longitude:number};mode: string;departure?: string;originToken?: string;destinationToken?: string}) {
  if (!config.googleRoutesEnabled) throw new MapsError(503,'NOT_CONFIGURED','ตัวคำนวณเส้นทางยังไม่พร้อม กรุณาเปิด Google Maps');
  // Complete autocomplete sessions using Details Essentials before routing.
  const origin=input.originId ? {location:{latLng:await placeLocation(input.originId,input.originToken)}} : {address:input.origin};
  const destination=input.destinationCoordinates ? {location:{latLng:input.destinationCoordinates}} : input.destinationId ? {location:{latLng:await placeLocation(input.destinationId,input.destinationToken)}} : {address:input.destination};
  const data=await google('routes','https://routes.googleapis.com/directions/v2:computeRoutes',config.googleRoutesKey,{origin,destination,travelMode:input.mode,...(input.mode==='DRIVE'?{routingPreference:'TRAFFIC_AWARE'}:{}),...(input.departure?{departureTime:input.departure}:{}),languageCode:'th'},'routes.distanceMeters,routes.duration,routes.legs.steps.transitDetails,routes.travelAdvisory.transitFare');
  const r=data.routes?.[0];
  if (!r) throw new MapsError(404,'NO_ROUTE','ไม่พบเส้นทางสำหรับวิธีเดินทาง/วันที่นี้ ลองเปลี่ยนตัวเลือกหรือเปิด Google Maps');
  const distanceKm=typeof r.distanceMeters==='number'&&Number.isFinite(r.distanceMeters)&&r.distanceMeters>=0 ? Math.round(r.distanceMeters/100)/10 : null;
  const seconds=typeof r.duration==='string'&&/^\d+(\.\d+)?s$/.test(r.duration) ? Number(r.duration.slice(0,-1)) : NaN;
  const durationMinutes=Number.isFinite(seconds)?Math.ceil(seconds/60):null;
  const money=r.travelAdvisory?.transitFare;
  const units=money?.units,nanos=money?.nanos;
  const validUnits=units===undefined || (typeof units==='string' && /^\d+$/.test(units)) || (typeof units==='number' && Number.isSafeInteger(units) && units>=0);
  const validNanos=nanos===undefined || (typeof nanos==='number' && Number.isInteger(nanos) && nanos>=0 && nanos<1e9);
  const amount=money && (units!==undefined || nanos!==undefined) && validUnits && validNanos ? Number(units ?? 0)+Number(nanos ?? 0)/1e9 : NaN;
  const fare=input.mode==='TRANSIT' && Number.isFinite(amount) && amount>=0 && /^[A-Z]{3}$/.test(money?.currencyCode || '') ? {amount,currency:money.currencyCode} : null;
  const transit=(r.legs || []).flatMap((leg:any)=>(leg.steps || []).flatMap((step:any)=>{
    const d=step.transitDetails;if(!d)return [];
    return [{line:d.transitLine?.nameShort || d.transitLine?.name || '',from:d.stopDetails?.departureStop?.name || '',to:d.stopDetails?.arrivalStop?.name || '',departure:d.stopDetails?.departureTime || null,arrival:d.stopDetails?.arrivalTime || null}];
  })).slice(0,20);
  const linkDestination=input.destinationCoordinates&&!input.destinationId?input.destinationCoordinates.latitude+','+input.destinationCoordinates.longitude:input.destination;
  return {distanceKm,durationMinutes,fare,transit,checkedAt:new Date().toISOString(),url:mapLink(linkDestination,input.destinationId,input.origin,{DRIVE:'driving',WALK:'walking',TRANSIT:'transit'}[input.mode],input.originId)};
}
