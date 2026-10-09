export type VenueLocation = {
  address: string|null; latitude: number|null; longitude: number|null; placeId: string|null;
  sourceUrl: string; checkedAt: string;
};
export function physicalVenue(name: string|null|undefined) {
  return !!name?.trim() && !/^(product\s+delivery|delivery|online|live\s*stream(?:ing)?|ttm\s*live|virtual(?:\s+event)?|tba|tbd|จัดส่งสินค้า|ส่งสินค้า|ออนไลน์|ยังไม่ระบุสถานที่)$/i.test(name.trim());
}
export function deliveryVenue(name: string|null|undefined){return /^(product\s+delivery|delivery|จัดส่งสินค้า|ส่งสินค้า)$/i.test(name?.trim() || '');}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
export function sourceLocation(value: unknown,sourceUrl: string,checkedAt: string,country='TH'): VenueLocation|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  let address=text(data.address)?.slice(0,1000) || null;
  // Country/city-only metadata is not a street address.
  if(address&&/^(?:bangkok|กรุงเทพมหานคร|กรุงเทพ|thailand|ประเทศไทย|ไทย|TH)(?:\s*,\s*(?:thailand|ประเทศไทย|ไทย|TH))?$/i.test(address))address=null;
  const number=(n:unknown)=>typeof n==='number'||typeof n==='string'&&n.trim()?Number(n):NaN;
  let latitude=number(data.latitude),longitude=number(data.longitude);
  const valid=Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180&&!(latitude===0&&longitude===0)&&
    (country!=='TH'||latitude>=5.5&&latitude<=20.5&&longitude>=97.3&&longitude<=105.7);
  if(!valid){latitude=NaN;longitude=NaN;}
  const id=text(data.placeId),placeId=id&&/^[A-Za-z0-9_-]{1,200}$/.test(id)?id:null;
  if(!address&&!valid&&!placeId)return null;
  try{const url=new URL(sourceUrl);if(url.protocol!=='https:'||url.username||url.password)return null;}catch{return null;}
  if(!Number.isFinite(Date.parse(checkedAt)))return null;
  return {address,latitude:valid?latitude:null,longitude:valid?longitude:null,placeId,sourceUrl,checkedAt};
}
export function locationTarget(location: VenueLocation|null) {
  if(!location)return null;
  if(location.placeId)return 'place_id:'+location.placeId;
  if(location.latitude!==null&&location.longitude!==null)return location.latitude+','+location.longitude;
  // A source's "venue, city, country" label still does not identify a street address.
  return location.address&&/\d|\b(?:road|street|avenue|soi|lane)\b|ถนน|แขวง|ตำบล|อำเภอ|\b(?:rd|st)\./i.test(location.address)?location.address:null;
}
// Read public source map URLs only; never follow arbitrary links or short redirects.
export function mapCoordinates(raw: unknown) {
  if(typeof raw!=='string')return {};
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||!['www.google.com','google.com','maps.google.com'].includes(url.hostname)||!url.pathname.startsWith('/maps')&&url.hostname!=='maps.google.com')return {};
    const query=url.searchParams.get('query') || url.searchParams.get('q') || url.searchParams.get('ll') || '';
    const match=query.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    const placeId=url.searchParams.get('query_place_id') || (query.startsWith('place_id:')?query.slice(9):null);
    return {...(match?{latitude:Number(match[1]),longitude:Number(match[2])}:{}),...(placeId?{placeId}: {})};
  }catch{return {};}
}
