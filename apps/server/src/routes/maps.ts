import { Router } from 'express';
import { config } from '../config.js';
import { one } from '../db.js';
import { requireUser,revalidateUser } from '../auth.js';
import { autocomplete,embedLink,exploreRoute,mapLink,mapsText,MapsError,nearby,nearbyAt,placeId } from '../google-maps.js';
import { sourceLocation,locationTarget,physicalVenue,deliveryVenue } from '../concert-location.js';

export const mapsRoutes=Router();
function sessionToken(value: unknown) {
  if (value===undefined || value===null || value==='')return undefined;
  if (typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new MapsError(400,'INVALID_SESSION','กรุณาค้นหาสถานที่ใหม่');
  return value;
}
async function concertLocation(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new MapsError(400,'INVALID_CONCERT','กรุณาเลือกคอนเสิร์ตใหม่');
  const concert=await one<{venue: string|null;city: string|null;country_code: string;venue_location:any}>('SELECT venue,city,country_code,venue_location FROM concerts WHERE id=$1',[id]);
  if(!concert)throw new MapsError(404,'NO_CONCERT','ไม่พบคอนเสิร์ต');
  const raw=concert.venue_location;
  const nonPhysical=deliveryVenue(concert.venue)||!!concert.venue&&!physicalVenue(concert.venue)&&/online|stream|ttm\s*live|virtual|ออนไลน์/i.test(concert.venue);
  const location=nonPhysical?null:sourceLocation(raw,raw?.sourceUrl,raw?.checkedAt,concert.country_code);
  return {concert,location,nonPhysical,destination:location?.address || [concert.venue,concert.city,concert.country_code==='TH'?'Thailand':concert.country_code].filter(Boolean).join(', ')};
}
mapsRoutes.get('/maps/config',async (_req,res)=>{
  const budget=await one<{requests:number;blocked_until:Date|null}>("SELECT requests,blocked_until FROM google_maps_budget WHERE day=(now() AT TIME ZONE 'Asia/Bangkok')::date");
  res.json({embed:!!config.googleMapsEmbedKey,places:!!config.googlePlacesKey,routes:config.googleRoutesEnabled&&!!config.googleRoutesKey,authenticated:!!res.locals.user,dailyLimit:config.googleMapsDailyLimit,dailyUsed:budget?.requests || 0,blockedUntil:budget?.blocked_until || null});
});
mapsRoutes.get('/concerts/:id/map',async(req,res)=>{
  const {location,nonPhysical,destination}=await concertLocation(String(req.params.id));
  const id=req.query.placeId===undefined?undefined:placeId(req.query.placeId);
  const target=nonPhysical?null:id?'place_id:'+id:locationTarget(location);
  res.json({destination:nonPhysical?null:destination,precise:!!target,nonPhysical,location:id?null:location,hasCoordinates:!!location&&location.latitude!==null&&location.longitude!==null,
    embedUrl:target?embedLink(target,id || location?.placeId || undefined):null,
    url:target?mapLink(location?.latitude!==null&&location?.longitude!==null&&location&&!id&&!location.placeId?location.latitude+','+location.longitude:destination,id || location?.placeId || undefined):null,
    note:nonPhysical?'รายการส่งสินค้าหรือออนไลน์ ไม่มีสถานที่จัดจริงสำหรับแผนที่':!target?'ต้นทางยังไม่มีที่อยู่หรือพิกัดที่ชัดเจน กรุณาค้นหาและเลือกยืนยันสถานที่ก่อนใช้แผนที่':'ใช้ที่อยู่/พิกัดตามต้นทาง โปรดตรวจประกาศล่าสุดก่อนเดินทาง'});
});
mapsRoutes.post('/maps/autocomplete',requireUser,async(req,res)=>{
  const input=mapsText(req.body?.input);
  if(input.length<3)throw new MapsError(400,'SHORT_QUERY','พิมพ์อย่างน้อย 3 ตัวอักษร');
  const token=sessionToken(req.body?.sessionToken);
  if(!token)throw new MapsError(400,'INVALID_SESSION','กรุณาค้นหาสถานที่ใหม่');
  const country=String(req.body?.country || '');
  if(country && !/^[A-Z]{2}$/.test(country))throw new MapsError(400,'INVALID_COUNTRY','กรุณาตรวจประเทศของสถานที่');
  const suggestions=await autocomplete(input,token,country);
  if(!await revalidateUser(req,res))return;
  res.json({suggestions,attribution:'Google Maps'});
});
mapsRoutes.post('/maps/routes',requireUser,async(req,res)=>{
  const origin=mapsText(req.body?.origin),mode=String(req.body?.mode || 'DRIVE');
  if(!['DRIVE','WALK','TRANSIT'].includes(mode))throw new MapsError(400,'INVALID_MODE','กรุณาเลือกขับรถ เดิน หรือขนส่งสาธารณะ');
  const {location,nonPhysical,destination}=await concertLocation(String(req.body?.concertId || ''));
  if(nonPhysical)throw new MapsError(400,'VENUE_NONPHYSICAL','รายการนี้ไม่มีสถานที่จัดจริงสำหรับวางเส้นทาง');
  const destinationId=req.body?.destinationId?placeId(req.body.destinationId):undefined;
  if(!locationTarget(location)&&!destinationId)throw new MapsError(400,'VENUE_UNKNOWN','ต้นทางยังไม่มีที่อยู่หรือพิกัด กรุณาเลือกยืนยันสถานที่จัดก่อนตรวจเส้นทาง');
  const originId=req.body?.originId?placeId(req.body.originId):undefined;
  const departure=req.body?.departure ? String(req.body.departure) : undefined;
  if(departure){
    const date=Date.parse(departure),difference=date-Date.now();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(departure)||!Number.isFinite(date)||difference< -60000 || difference>100*86400000 || mode==='WALK')throw new MapsError(400,'INVALID_DATE','เวลาออกเดินทางต้องเป็นเวลาปัจจุบันถึง 100 วันข้างหน้า และไม่ใช้กับการเดิน');
  }
  const coordinates=!destinationId&&!location?.placeId&&location?.latitude!==null&&location?.longitude!==null&&location?{latitude:location.latitude,longitude:location.longitude}:undefined;
  const route=await exploreRoute({origin,originId,destination,destinationId:destinationId || location?.placeId || undefined,destinationCoordinates:coordinates,mode,departure,originToken:sessionToken(req.body?.originToken),destinationToken:sessionToken(req.body?.destinationToken)});
  if(!await revalidateUser(req,res))return;
  res.json({...route,mode,attribution:'Google Maps',note:'ระยะทางและเวลาเป็นข้อมูลวางแผน อาจเปลี่ยนตามการจราจร/ตารางเดินรถ ค่าโดยสารขนส่งสาธารณะมีเฉพาะเมื่อ Google ส่งข้อมูลครบ ไม่ใช่ราคาตั๋วรถทัวร์หรือโรงแรม และไม่เติมงบให้อัตโนมัติ'});
});
mapsRoutes.post('/maps/nearby',requireUser,async(req,res)=>{
  const category=String(req.body?.category || ''),radius=Number(req.body?.radius ?? 1500);
  if(!['hotel','restaurant','parking'].includes(category)||![1000,1500,3000,5000].includes(radius))throw new MapsError(400,'INVALID_SEARCH','กรุณาตรวจประเภทสถานที่และรัศมี');
  const info=req.body?.concertId?await concertLocation(String(req.body.concertId)):null;
  if(info?.nonPhysical)throw new MapsError(400,'VENUE_NONPHYSICAL','รายการนี้ไม่มีสถานที่จัดจริงสำหรับค้นสถานที่ใกล้งาน');
  const location=info?.location;
  const coordinates=location&&location.latitude!==null&&location.longitude!==null?{latitude:location.latitude,longitude:location.longitude}:null;
  const items=req.body?.placeId?await nearby(placeId(req.body.placeId),category,radius,sessionToken(req.body?.sessionToken)):coordinates?await nearbyAt(coordinates,category,radius):location?.placeId?await nearby(location.placeId,category,radius):(()=>{throw new MapsError(400,'VENUE_UNKNOWN','กรุณาเลือกสถานที่จัดก่อนค้นสถานที่ใกล้งาน');})();
  if(!await revalidateUser(req,res))return;
  res.json({items,checkedAt:new Date().toISOString(),radius,attribution:'Google Maps',note:'เป็นสถานที่ใกล้พิกัดที่คุณเลือก ยังไม่ยืนยันราคาห้องพัก ห้องว่าง หรือที่จอดว่าง โปรดตรวจต้นทางก่อนเดินทาง'});
});
mapsRoutes.use((error:unknown,_req:import('express').Request,res:import('express').Response,next:import('express').NextFunction)=>{
  if(error instanceof MapsError){res.status(error.status).json({code:error.code,error:error.message});return;}next(error);
});
