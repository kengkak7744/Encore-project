'use client';
import { useEffect,useRef,useState } from 'react';
import { api,type Concert } from '../lib/api';
import { checked,money } from '../lib/trip-prices';
import { useData,useSessionReset } from './use-data';
import { PlaceInput,type PlaceChoice } from './place-input';
import './concert-location.css';

type Settings={embed:boolean;places:boolean;routes:boolean;authenticated:boolean;dailyLimit:number;dailyUsed:number;blockedUntil:string|null};
type MapInfo={destination:string|null;precise:boolean;embedUrl:string|null;url:string|null;nonPhysical:boolean;hasCoordinates:boolean;location:Concert['venue_location'];note:string};
type RouteInfo={distanceKm:number|null;durationMinutes:number|null;fare:{amount:number;currency:string}|null;transit:{line:string;from:string;to:string;departure:string|null;arrival:string|null}[];checkedAt:string;url:string;note:string};
type NearbyInfo={items:{id:string;name:string;address:string|null;url:string;attributions?:{provider:string;url:string|null}[]}[];checkedAt:string;note:string};
export function ConcertLocation({concert,originValue,onOriginChange}:{concert:Concert;originValue?:string;onOriginChange?:(value:string)=>void}) {
  const settings=useData<Settings>('/maps/config'),epoch=useRef(0),requestId=useRef(0);
  const [origin,setOrigin]=useState(originValue || ''),[originPlace,setOriginPlace]=useState<PlaceChoice|null>(null);
  const sourceVenue=concert.venue_location?.address || concert.venue || '';
  const [venue,setVenue]=useState(sourceVenue),[venuePlace,setVenuePlace]=useState<PlaceChoice|null>(null);
  const [map,setMap]=useState<MapInfo|null>(null),[mapError,setMapError]=useState(''),[showMap,setShowMap]=useState(false);
  const [mode,setMode]=useState('DRIVE'),[departure,setDeparture]=useState(''),[category,setCategory]=useState('hotel'),[radius,setRadius]=useState('1500');
  const [route,setRoute]=useState<RouteInfo|null>(null),[nearby,setNearby]=useState<NearbyInfo|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  useEffect(()=>{if(originValue!==undefined&&originValue!==origin){setOrigin(originValue);setOriginPlace(null);setRoute(null);epoch.current++;}},[originValue]);
  useEffect(()=>{
    let current=true;setMap(null);setMapError('');
    void api<MapInfo>('/concerts/'+concert.id+'/map'+(venuePlace?'?placeId='+encodeURIComponent(venuePlace.id):'')).then(value=>{if(current)setMap(value);}).catch(err=>{if(current)setMapError(err.message);});
    return()=>{current=false;};
  },[concert.id,venuePlace?.id]);
  useSessionReset(()=>{epoch.current++;requestId.current++;setOrigin(originValue || '');setOriginPlace(null);setVenue(sourceVenue);setVenuePlace(null);setRoute(null);setNearby(null);setError('');setBusy('');setDeparture('');});
  function changed(){epoch.current++;setRoute(null);setNearby(null);setError('');}
  async function explore(kind:'routes'|'nearby') {
    const generation=epoch.current,request=++requestId.current;setBusy(kind);setError('');
    if(kind==='routes')setRoute(null);else setNearby(null);
    const originToken=originPlace?.sessionToken,destinationToken=venuePlace?.sessionToken;
    // A completed Details request ends an autocomplete session; don't reuse it.
    if(kind==='routes'&&originPlace)setOriginPlace({...originPlace,sessionToken:undefined});
    if(venuePlace)setVenuePlace({...venuePlace,sessionToken:undefined});
    try {
      const body=kind==='routes'?{concertId:concert.id,origin,originId:originPlace?.id,destinationId:venuePlace?.id,originToken,destinationToken,mode,...(departure&&mode!=='WALK'?{departure:new Date(departure+'+07:00').toISOString()}: {})}:{concertId:concert.id,placeId:venuePlace?.id,category,radius:Number(radius),sessionToken:destinationToken};
      const result=await api<RouteInfo|NearbyInfo>('/maps/'+kind,{method:'POST',body:JSON.stringify(body)});
      if(generation!==epoch.current||request!==requestId.current)return;
      if(kind==='routes')setRoute(result as RouteInfo);else setNearby(result as NearbyInfo);
    }catch(err){if(generation===epoch.current&&request===requestId.current)setError((err as Error).message);}
    finally{if(request===requestId.current){setBusy('');void settings.reload();}}
  }
  const active=settings.data?.authenticated&&settings.data.places&&!map?.nonPhysical;
  const sourceSelected=venue===sourceVenue&&!venuePlace;
  const routeReady=!map?.nonPhysical&&(!!venuePlace || sourceSelected&&!!map?.precise);
  const nearbyReady=!map?.nonPhysical&&(!!venuePlace || sourceSelected&&(!!map?.hasCoordinates || !!map?.location?.placeId));
  const destination=map?.destination || [concert.venue,concert.city,concert.country_code].filter(Boolean).join(', ');
  const sourceLocation=map?.location;
  const linkDestination=!venuePlace&&sourceLocation?.latitude!==null&&sourceLocation?.longitude!==null&&sourceLocation&&!sourceLocation.placeId?sourceLocation.latitude+','+sourceLocation.longitude:venuePlace?.text || destination;
  const fallback=new URL('https://www.google.com/maps/dir/');fallback.searchParams.set('api','1');fallback.searchParams.set('destination',linkDestination);if(origin.trim())fallback.searchParams.set('origin',origin);if(originPlace)fallback.searchParams.set('origin_place_id',originPlace.id);const destinationId=venuePlace?.id || sourceLocation?.placeId;if(destinationId)fallback.searchParams.set('destination_place_id',destinationId);fallback.searchParams.set('travelmode',mode==='DRIVE'?'driving':mode==='WALK'?'walking':'transit');
  const inputs=<>
    <PlaceInput label="ต้นทางสำหรับเส้นทาง" value={origin} selected={originPlace} enabled={!!active} country={concert.country_code==='TH'?'TH':''} onChange={value=>{changed();setOrigin(value);onOriginChange?.(value);}} onSelect={value=>{changed();setOriginPlace(value);}}/>
    <PlaceInput label="ค้นหาและยืนยันสถานที่จัด" value={venue} selected={venuePlace} enabled={!!active} country={concert.country_code} onChange={value=>{changed();setVenue(value);setVenuePlace(null);}} onSelect={value=>{changed();setVenuePlace(value);}}/>
  </>;
  return <section className="location-panel" aria-label="แผนที่และการเดินทาง"><h2>แผนที่และการเดินทาง</h2>
    <p className="fine-print">{map?.nonPhysical?'รายการนี้ไม่มีสถานที่จัดจริง':destination || 'ยังไม่ระบุสถานที่จัด'}</p>
    {map?.note&&<p className="fine-print">{map.note}</p>}
    {map?.location&&<p className="fine-print">{map.location.address&&<>ที่อยู่ตามต้นทาง: {map.location.address} · </>}<a href={map.location.sourceUrl} target="_blank" rel="noreferrer">ตรวจแหล่งที่อยู่/พิกัด ↗</a> · ตรวจ {checked(map.location.checkedAt)}</p>}
    {map?.url&&<div className="location-actions"><a className="button secondary" target="_blank" rel="noreferrer" href={map.url}>ดูสถานที่ใน Google Maps ↗</a>{map.embedUrl&&<button type="button" className="button secondary" onClick={()=>setShowMap(!showMap)}>{showMap?'ซ่อนแผนที่':'แสดงแผนที่'}</button>}</div>}
    {showMap&&map?.embedUrl&&<iframe title={'แผนที่ '+concert.title} src={map.embedUrl} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
    {!settings.data?.embed&&<p className="fine-print">แผนที่ในเว็บยังไม่พร้อม เปิดดูสถานที่ผ่าน Google Maps ได้</p>}{mapError&&<p className="fine-print error-text">{mapError}</p>}
    {!map?.nonPhysical&&<details className="location-details"><summary>ค้นสถานที่ / ตรวจเส้นทาง / สถานที่ใกล้งาน</summary>
      {!settings.data?.authenticated&&<p className="fine-print">เข้าสู่ระบบเพื่อค้นสถานที่และตรวจข้อมูลผ่าน Google · ลิงก์ Google Maps เปิดได้ทั่วไป</p>}
      {settings.data?.authenticated&&!settings.data.places&&<p className="fine-print">ตัวเลือกสถานที่จาก Google ยังไม่พร้อม กรอกต้นทางเองและเปิดเส้นทางได้</p>}
      {settings.data?.authenticated&&!settings.data.routes&&<p className="fine-print">ตัวตรวจเส้นทางยังไม่พร้อม ใช้ปุ่มเปิดเส้นทางใน Google Maps ได้</p>}
      {inputs}
      <div className="location-route-options"><label>การเดินทางบนแผนที่<select aria-label="การเดินทางบนแผนที่" value={mode} onChange={event=>{changed();setMode(event.target.value);}}><option value="DRIVE">ขับรถ</option><option value="WALK">เดิน</option><option value="TRANSIT">ขนส่งสาธารณะ</option></select></label>{mode!=='WALK'&&<label>ออกเดินทาง (เวลาไทย ถ้าไม่ระบุใช้ตอนตรวจ)<input type="datetime-local" value={departure} onChange={event=>{changed();setDeparture(event.target.value);}}/></label>}</div>
      <div className="location-actions"><button className="button secondary" type="button" disabled={!!busy||!settings.data?.authenticated||!settings.data.routes||!origin.trim()||!routeReady} onClick={()=>void explore('routes')}>{busy==='routes'?'กำลังตรวจ…':'ตรวจเส้นทางและเวลา'}</button><a className="button secondary" href={routeReady?fallback.href:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(destination)} target="_blank" rel="noreferrer">{routeReady?'เปิดเส้นทางใน Google Maps ↗':'ค้นสถานที่ใน Google Maps ↗'}</a></div>
      {route&&<div className="location-result" role="status"><strong>{route.distanceKm===null?'ไม่มีข้อมูลระยะทาง':route.distanceKm.toLocaleString()+' กม.'} · {route.durationMinutes===null?'ไม่มีข้อมูลเวลา':route.durationMinutes+' นาที'}</strong><p>{mode==='TRANSIT'?(route.fare?'ค่าโดยสารที่ Google ประเมิน '+money(route.fare.amount,route.fare.currency):'ยังไม่มีข้อมูลค่าโดยสารครบเส้นทาง'):'ราคาการเดินทางยังต้องตรวจหรือกรอกเอง'}</p>{route.transit.length>0&&<ul>{route.transit.map((step,index)=><li key={index}>{step.line}: {step.from} → {step.to}</li>)}</ul>}<small><span className="maps-attribution" translate="no">Google Maps</span> · ตรวจ {checked(route.checkedAt)}</small><p className="fine-print">{route.note}</p></div>}
      <h3>สถานที่ใกล้งาน</h3><p className="fine-print">ใช้พิกัดตามต้นทาง หรือเลือกยืนยันสถานที่จัดจาก Google · ผลค้นหาไม่ใช่ราคาหรือการยืนยันห้อง/ที่จอดว่าง</p>
      <div className="location-route-options"><label>ประเภทสถานที่<select aria-label="ประเภทสถานที่ใกล้งาน" value={category} onChange={event=>{changed();setCategory(event.target.value);}}><option value="hotel">โรงแรม</option><option value="restaurant">ร้านอาหาร</option><option value="parking">ที่จอดรถ</option></select></label><label>รัศมี<select aria-label="รัศมีค้นหา" value={radius} onChange={event=>{changed();setRadius(event.target.value);}}>{['1000','1500','3000','5000'].map(value=><option value={value} key={value}>{Number(value)/1000} กม.</option>)}</select></label></div>
      <button className="button secondary" type="button" disabled={!!busy||!active||!nearbyReady} onClick={()=>void explore('nearby')}>{busy==='nearby'?'กำลังค้น…':'ค้นสถานที่ใกล้งาน'}</button>
      {nearby&&<div className="location-result" role="status">{nearby.items.length?<ul>{nearby.items.map(place=><li key={place.id}><a href={place.url} target="_blank" rel="noreferrer">{place.name} ↗</a>{place.address&&<small>{place.address}</small>}{place.attributions?.map((credit,index)=><small key={index}>{credit.url?<a href={credit.url} target="_blank" rel="noreferrer">{credit.provider}</a>:credit.provider}</small>)}</li>)}</ul>:<p>ไม่พบสถานที่ในรัศมีที่เลือก ลองเพิ่มรัศมีหรือเปลี่ยนประเภท</p>}<small><span className="maps-attribution" translate="no">Google Maps</span> · ตรวจ {checked(nearby.checkedAt)}</small><p className="fine-print">{nearby.note}</p></div>}
      {error&&<p className="notice error" role="alert">{error}</p>}
      <p className="fine-print">ตรวจเมื่อกดปุ่ม · ผลค้นหา Google ไม่ได้บันทึกในงบหรือฐานคอนเสิร์ต · ขีดจำกัดระบบ {settings.data?.dailyUsed ?? '—'}/{settings.data?.dailyLimit ?? '—'} คำขอ/วัน (เวลาไทย)</p>
    </details>}
  </section>;
}
