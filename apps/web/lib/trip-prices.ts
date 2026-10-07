export type TravelKind = 'ticket' | 'bus' | 'train' | 'flight' | 'car' | 'hotel';
export type PriceUnit = 'person' | 'person_one_way' | 'person_round_trip' | 'room_night' | 'room_stay' | 'group_total';
export type PriceDraft = { amount: string; currency: string; unit: PriceUnit; sourceUrl: string };
export const priceUnits: Record<TravelKind,{ value: PriceUnit; label: string }[]> = {
  ticket: [{ value: 'person',label: 'ต่อคน' },{ value: 'group_total',label: 'รวมทุกคนแล้ว' }],
  bus: [{ value: 'person_round_trip',label: 'ไปกลับต่อคน' },{ value: 'person_one_way',label: 'เที่ยวเดียวต่อคน (ประมาณไปกลับ ×2)' },{ value: 'group_total',label: 'รวมไปกลับทุกคนแล้ว' }],
  train: [{ value: 'person_round_trip',label: 'ไปกลับต่อคน' },{ value: 'person_one_way',label: 'เที่ยวเดียวต่อคน (ประมาณไปกลับ ×2)' },{ value: 'group_total',label: 'รวมไปกลับทุกคนแล้ว' }],
  flight: [{ value: 'person_round_trip',label: 'ไปกลับต่อคน' },{ value: 'person_one_way',label: 'เที่ยวเดียวต่อคน (ประมาณไปกลับ ×2)' },{ value: 'group_total',label: 'รวมไปกลับทุกคนแล้ว' }],
  car: [{ value: 'group_total',label: 'งบรถรวมไปกลับแล้ว' }],
  hotel: [{ value: 'room_night',label: 'ต่อห้องต่อคืน' },{ value: 'room_stay',label: 'ต่อห้องตลอดการเข้าพัก' },{ value: 'group_total',label: 'รวมทุกห้องทุกคืนแล้ว' }],
};
export const kindLabels: Record<TravelKind,string> = { ticket: 'บัตรคอนเสิร์ต',bus: 'รถทัวร์',train: 'รถไฟ',flight: 'เครื่องบิน',car: 'รถส่วนตัว',hotel: 'ที่พัก' };
export const providerLinks: Partial<Record<TravelKind,{ name: string; url: string }>> = {
  bus: { name: 'BusOnlineTicket',url: 'https://www.busonlineticket.co.th/' },train: { name: 'SRT D-Ticket',url: 'https://dticket.railway.co.th/DTicketPublicWeb/home/' },flight: { name: 'Traveloka',url: 'https://www.traveloka.com/th-th/flight' },hotel: { name: 'Agoda',url: 'https://www.agoda.com/th-th/' },
};
export function emptyPrice(kind: TravelKind): PriceDraft { return { amount: '',currency: 'THB',unit: priceUnits[kind][0].value,sourceUrl: '' }; }
export function money(amount: number,currency: string) { try { return new Intl.NumberFormat('th-TH',{ style: 'currency',currency }).format(amount); } catch { return `${amount.toLocaleString('th-TH')} ${currency}`; } }
export function safeLink(value?: string | null) { try { const url = new URL(value || ''); return url.protocol==='https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }
export function checked(value: string) { return new Intl.DateTimeFormat('th-TH',{ dateStyle: 'medium',timeStyle: 'short',timeZone: 'Asia/Bangkok' }).format(new Date(value)); }

// These are amounts copied by the user, not provider quotes. Never guess an
// unlabelled currency, a fare's unit, or which candidate is a booking total.
export function priceCandidates(text: string): { amount: number; currency: string }[] {
  const candidates = new Map<string,{ amount: number; currency: string }>();
  const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
  const currency = 'THB|USD|EUR|GBP|JPY|SGD|CNY|KRW|AUD|MYR';
  const patterns = [new RegExp('(?:\\b('+currency+')\\s*|([฿])\\s*)('+number+')(?![\\d.,/:\\-]|\\s+\\d)','giu'),new RegExp('(?<![\\d.,/:\\-])('+number+')\\s*(บาท|'+currency+')(?![A-Za-z])','giu')];
  const clipped = text.slice(0,5000);
  const matched: { start: number; end: number }[] = [];
  for (const [index,pattern] of patterns.entries()) for (const match of clipped.matchAll(pattern)) {
    const start = match.index,end = start+match[0].length;
    if (matched.some(range => start<range.end && end>range.start)) continue;
    const amount = Number((index===0 ? match[3] : match[1]).replaceAll(',',''));
    const label = index===0 ? match[1] || 'THB' : match[2];
    const code = label==='บาท' ? 'THB' : label.toUpperCase();
    if (Number.isFinite(amount) && amount>=0 && amount<=100_000_000) {
      candidates.set(code+':'+amount,{ amount,currency: code }); matched.push({ start,end });
    }
    if (candidates.size>=12) return [...candidates.values()];
  }
  return [...candidates.values()];
}
