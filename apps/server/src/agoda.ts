import { createHash } from 'node:crypto';
import { config } from './config.js';
import { cityCode } from './travel.js';

export type HotelRequest = { destination: string; checkIn: string; checkOut: string; nights: number; rooms: number; adults: number; travellerCountry: string };
export type HotelQuote = { amount: number; currency: 'THB'; observedAt: string; validUntil: string; sourceUrl: string; live: boolean };
let tokenCache: { key: string; token: string; until: number } | null = null;
const quotes = new Map<string,{ until: number; quote: HotelQuote | null }>();

function partnerUrl(value: string, landing = false) {
  try {
    const url = new URL(value);
    return url.protocol==='https:' && (url.hostname==='agoda.com' || url.hostname.endsWith('.agoda.com')) && !url.username && !url.password && (landing || !url.search && !url.hash) ? url.href : null;
  } catch { return null; }
}
function properties(destination: string): number[] {
  try {
    const mapping = JSON.parse(config.agodaPropertyIds) as Record<string,unknown>;
    const ids = mapping[cityCode(destination) || destination];
    return Array.isArray(ids) ? [...new Set(ids.filter((id): id is number => Number.isSafeInteger(id) && id>0))].slice(0,100) : [];
  } catch { return []; }
}
export function agodaReady() {
  return !!(config.agodaEnabled && config.agodaClientId && config.agodaClientSecret && partnerUrl(config.agodaTokenUrl) && partnerUrl(config.agodaSearchUrl));
}

// The current product assigns endpoints during onboarding. Never infer a hostname
// or reuse the legacy Lite endpoint with this demand JSON schema.
export async function hotelQuote(request: HotelRequest): Promise<HotelQuote | null> {
  if (!agodaReady() || !/^[A-Z]{2}$/.test(request.travellerCountry) || request.nights<1 || request.rooms<1 || request.adults<request.rooms) return null;
  const ids = properties(request.destination);
  if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(request.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(request.checkOut) || request.checkOut<=request.checkIn) return null;
  const tokenUrl = partnerUrl(config.agodaTokenUrl)!, searchUrl = partnerUrl(config.agodaSearchUrl)!;
  const authKey = createHash('sha256').update(JSON.stringify([tokenUrl,searchUrl,config.agodaClientId,config.agodaClientSecret,config.agodaEnvironment])).digest('hex');
  const key = JSON.stringify([authKey,ids,request]);
  const previous = quotes.get(key);
  if (previous && previous.until>Date.now()) return previous.quote;
  if (!tokenCache || tokenCache.key!==authKey || tokenCache.until<=Date.now()) {
    const response = await fetch(tokenUrl,{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ clientId: config.agodaClientId,clientSecret: config.agodaClientSecret }),signal: AbortSignal.timeout(10_000),redirect: 'error' });
    if (!response.ok) throw Error('Agoda authorization HTTP '+response.status);
    const data = await response.json() as { success?: boolean; token?: unknown };
    if (data.success!==true || typeof data.token!=='string' || !data.token) throw Error('Agoda authorization unavailable');
    tokenCache = { key: authKey,token: data.token,until: Date.now()+55*60_000 };
  }
  const response = await fetch(searchUrl,{ method: 'POST',headers: { 'Content-Type': 'application/json','X-Auth-Token': 'Bearer '+tokenCache.token },body: JSON.stringify({ criteria: { propertyIds: ids,checkIn: request.checkIn,checkOut: request.checkOut,rooms: request.rooms,adults: request.adults,children: 0,language: 'th-th',currency: 'THB',userCountry: request.travellerCountry },features: { ratesPerProperty: 3,extra: ['content','metaSearch','rateDetail','surchargeDetail','taxDetail'] } }),signal: AbortSignal.timeout(12_000),redirect: 'error' });
  if (!response.ok) throw Error('Agoda search HTTP '+response.status);
  const data = await response.json() as { properties?: { rooms?: { rate?: { currency?: string }; totalPayment?: { inclusive?: unknown; minSellPrice?: unknown; refSellAmount?: unknown }; landingUrl?: string }[] }[] };
  const offers = (Array.isArray(data.properties) ? data.properties : []).flatMap(property => Array.isArray(property.rooms) ? property.rooms : [])
    .filter(room => room.rate?.currency==='THB' && typeof room.totalPayment?.inclusive==='number' && Number.isFinite(room.totalPayment.inclusive) && room.totalPayment.inclusive>0
      // Restricted retail/floor scopes need confirmation in the partner agreement.
      // Do not display an unrestricted lower price by guessing their units.
      && room.totalPayment.minSellPrice==null && room.totalPayment.refSellAmount==null && !!partnerUrl(room.landingUrl || '',true))
    .sort((a,b) => Number(a.totalPayment!.inclusive)-Number(b.totalPayment!.inclusive));
  const chosen = offers[0];
  const until = Date.now()+15*60_000;
  const quote: HotelQuote | null = chosen ? { amount: Math.round(Number(chosen.totalPayment!.inclusive)*100)/100,currency: 'THB',observedAt: new Date().toISOString(),validUntil: new Date(until).toISOString(),sourceUrl: partnerUrl(chosen.landingUrl!,true)!,live: config.agodaEnvironment==='production' } : null;
  if (quotes.size>=100) quotes.delete(quotes.keys().next().value!);
  quotes.set(key,{ until,quote });
  return quote;
}
