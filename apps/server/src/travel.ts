import { config } from './config.js';

const cityCodes: Record<string, string> = {
  'กรุงเทพมหานคร': 'BKK', 'กรุงเทพ': 'BKK', 'bangkok': 'BKK',
  'เชียงใหม่': 'CNX', 'chiang mai': 'CNX', 'ภูเก็ต': 'HKT', 'phuket': 'HKT',
  'หาดใหญ่': 'HDY', 'hat yai': 'HDY', 'ขอนแก่น': 'KKC', 'khon kaen': 'KKC',
  'สิงคโปร์': 'SIN', 'singapore': 'SIN', 'โตเกียว': 'TYO', 'tokyo': 'TYO',
  'โซล': 'SEL', 'seoul': 'SEL',
};
function code(city: string) { return /^[A-Za-z]{3}$/.test(city) ? city.toUpperCase() : cityCodes[city.toLowerCase()]; }
type Quote = { amount: number; currency: string; observedAt: string; sourceUrl: string; live: boolean };
const baseUrl = config.amadeusEnvironment === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
let tokenCache: { token: string; until: number } | null = null;
async function token() {
  if (!config.amadeusClientId || !config.amadeusClientSecret) throw new Error('Amadeus credentials missing');
  if (tokenCache && tokenCache.until > Date.now()) return tokenCache.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: config.amadeusClientId, client_secret: config.amadeusClientSecret });
  const response = await fetch(baseUrl + '/v1/security/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Amadeus authorization failed: HTTP ' + response.status);
  const data = await response.json() as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}
async function get(path: string, parameters: Record<string, string>) {
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Amadeus HTTP ' + response.status);
  return response.json() as Promise<any>;
}
const quoteCache = new Map<string, { expires: number; quote: Quote | null }>();
async function cached(key: string, load: () => Promise<Quote | null>) {
  const previous = quoteCache.get(key);
  if (previous && previous.expires > Date.now()) return previous.quote;
  const quote = await load();
  quoteCache.set(key, { expires: Date.now() + 15 * 60 * 1000, quote });
  return quote;
}
function day(date: Date) { return date.toISOString().slice(0, 10); }

const routeCache = new Map<string, { distanceKm: number; observedAt: string; until: number }>();
export async function drivingDistance(origin: string, destination: string) {
  if (!config.googleRoutesEnabled || !config.googleRoutesKey || !origin.trim() || !destination.trim()) return null;
  const key = `${origin.trim().toLocaleLowerCase()}|${destination.trim().toLocaleLowerCase()}`;
  const previous = routeCache.get(key);
  if (previous && previous.until > Date.now()) return { distanceKm: previous.distanceKm, observedAt: previous.observedAt };
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googleRoutesKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
    body: JSON.stringify({ origin: { address: origin.slice(0, 120) }, destination: { address: destination.slice(0, 120) }, travelMode: 'DRIVE' }),
    signal: AbortSignal.timeout(config.googleRoutesTimeoutMs),
  });
  if (!response.ok) throw new Error('Google Routes HTTP ' + response.status);
  const data = await response.json() as { routes?: { distanceMeters?: number }[] };
  const meters = data.routes?.[0]?.distanceMeters;
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return null;
  const result = { distanceKm: Math.round(meters / 100) / 10, observedAt: new Date().toISOString() };
  if (routeCache.size >= 200) routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(key, { ...result, until: Date.now() + 24 * 60 * 60 * 1000 });
  return result;
}

export async function flightQuote(origin: string, destination: string, showDate: Date, people: number): Promise<Quote | null> {
  const from = code(origin), to = code(destination);
  if (!from || !to || from === to || !config.amadeusClientId) return null;
  const depart = new Date(showDate.getTime() - 86400000), back = new Date(showDate.getTime() + 86400000);
  if (depart.getTime() < Date.now() + 86400000) return null;
  return cached(['flight', from, to, day(depart), people].join(':'), async () => {
    const data = await get('/v2/shopping/flight-offers', { originLocationCode: from, destinationLocationCode: to, departureDate: day(depart), returnDate: day(back), adults: String(people), max: '5', currencyCode: 'THB' });
    const prices: number[] = (data.data || []).map((item: any) => Number(item.price?.grandTotal)).filter((n: number) => Number.isFinite(n) && n > 0);
    return prices.length ? { amount: Math.min(...prices), currency: 'THB', observedAt: new Date().toISOString(), sourceUrl: 'https://developers.amadeus.com/self-service/category/flights/api-doc/flight-offers-search', live: config.amadeusEnvironment === 'production' } : null;
  });
}

export async function hotelQuote(destination: string, showDate: Date, nights: number, rooms: number): Promise<Quote | null> {
  const city = code(destination);
  if (!city || nights < 1 || !config.amadeusClientId) return null;
  const checkIn = new Date(showDate.getTime() - 86400000), checkOut = new Date(checkIn.getTime() + nights * 86400000);
  if (checkIn.getTime() < Date.now() + 86400000) return null;
  return cached(['hotel', city, day(checkIn), nights, rooms].join(':'), async () => {
    const list = await get('/v1/reference-data/locations/hotels/by-city', { cityCode: city });
    const ids = (list.data || []).slice(0, 20).map((hotel: any) => hotel.hotelId).filter(Boolean);
    if (!ids.length) return null;
    const data = await get('/v3/shopping/hotel-offers', { hotelIds: ids.join(','), checkInDate: day(checkIn), checkOutDate: day(checkOut), roomQuantity: String(rooms), currency: 'THB' });
    const prices: number[] = (data.data || []).flatMap((hotel: any) => (hotel.offers || []).map((offer: any) => Number(offer.price?.total))).filter((n: number) => Number.isFinite(n) && n > 0);
    return prices.length ? { amount: Math.min(...prices), currency: 'THB', observedAt: new Date().toISOString(), sourceUrl: 'https://developers.amadeus.com/self-service/category/hotels/api-doc/hotel-search', live: config.amadeusEnvironment === 'production' } : null;
  });
}
