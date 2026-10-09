import type { Concert } from './api';
import { providerLinks,type TravelKind } from './trip-prices';

function cityKey(city: string) {
  const value = city.trim().toLowerCase();
  if (['กรุงเทพมหานคร','กรุงเทพ','bangkok'].includes(value)) return 'bangkok';
  if (['เชียงใหม่','chiang mai'].includes(value)) return 'chiang-mai';
  if (['พัทยา','pattaya'].includes(value)) return 'pattaya';
  return '';
}

// Only public city/route pages checked against the provider. Dates and party
// size remain copyable information, not undocumented provider query fields.
export function tripSearchLink(kind: TravelKind,origin: string,concert?: Concert) {
  const provider = providerLinks[kind];
  if (!provider) return null;
  const destination = concert?.country_code==='TH' ? cityKey(concert.city || '') : '';
  let url = provider.url, specific = false;
  if (kind==='hotel' && ['bangkok','chiang-mai'].includes(destination)) {
    url = `https://www.agoda.com/city/${destination}-th.html`; specific = true;
  }
  if (kind==='bus' && cityKey(origin)==='bangkok' && ['chiang-mai','pattaya'].includes(destination)) {
    url = `https://www.busonlineticket.co.th/booking/bangkok-to-${destination}-bus-tickets`; specific = true;
  }
  return { name: provider.name,url,specific };
}

export function tripDate(concert?: Concert) {
  if (concert?.country_code!=='TH' || !concert.starts_at || !Number.isFinite(Date.parse(concert.starts_at))) return '';
  return new Intl.DateTimeFormat('en-CA',{ timeZone: 'Asia/Bangkok',year: 'numeric',month: '2-digit',day: '2-digit' }).format(new Date(concert.starts_at));
}

export function tripCheckout(date: string,nights: number) {
  const parsed = new Date(date+'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date || !Number.isInteger(nights) || nights<0 || nights>14) return '';
  return new Date(parsed.getTime()+nights*86400000).toISOString().slice(0,10);
}
