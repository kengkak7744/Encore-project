import { config } from './config.js';

const cityCodes: Record<string, string> = {
  'กรุงเทพมหานคร': 'BKK', 'กรุงเทพ': 'BKK', 'bangkok': 'BKK',
  'เชียงใหม่': 'CNX', 'chiang mai': 'CNX', 'ภูเก็ต': 'HKT', 'phuket': 'HKT',
  'หาดใหญ่': 'HDY', 'hat yai': 'HDY', 'ขอนแก่น': 'KKC', 'khon kaen': 'KKC',
  'สิงคโปร์': 'SIN', 'singapore': 'SIN', 'โตเกียว': 'TYO', 'tokyo': 'TYO',
  'โซล': 'SEL', 'seoul': 'SEL',
};
export function cityCode(city: string) { return /^[A-Za-z]{3}$/.test(city.trim()) ? city.trim().toUpperCase() : cityCodes[city.trim().toLowerCase()]; }
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
