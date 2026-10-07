export const travelKinds = ['ticket','bus','train','flight','car','hotel'] as const;
export type TravelKind = typeof travelKinds[number];
export type PriceUnit = 'person' | 'person_one_way' | 'person_round_trip' | 'room_night' | 'room_stay' | 'group_total';
export type ManualPrice = { amount: number; currency: string; unit: PriceUnit; sourceUrl: string | null };
export type TripItem = { kind: TravelKind; label: string; amount: number | null; currency: string; priceType: 'estimate' | 'observed' | 'live' | 'unavailable' | 'user'; note: string; sourceUrl?: string | null; searchUrl?: string; provider?: string; observedAt?: string | null; validUntil?: string; enteredAt?: string; unit?: PriceUnit; unitAmount?: number };
const currencyCodes = new Set(Intl.supportedValuesOf('currency'));
const units: Record<TravelKind,PriceUnit[]> = { ticket: ['person','group_total'],bus: ['person_one_way','person_round_trip','group_total'],train: ['person_one_way','person_round_trip','group_total'],flight: ['person_one_way','person_round_trip','group_total'],car: ['group_total'],hotel: ['room_night','room_stay','group_total'] };
const labels: Record<PriceUnit,string> = { person: 'ต่อคน',person_one_way: 'เที่ยวเดียวต่อคน คิดไปกลับ 2 เที่ยวราคาเท่ากัน',person_round_trip: 'ไปกลับต่อคน',room_night: 'ต่อห้องต่อคืน',room_stay: 'ต่อห้องตลอดการเข้าพัก',group_total: 'ยอดรวมทุกคน/ทุกห้องแล้ว' };

export class BudgetInputError extends Error {}

export function manualPrices(value: unknown): Partial<Record<TravelKind,ManualPrice>> {
  if (value===undefined) return {};
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new BudgetInputError('รูปแบบราคาที่กรอกไม่ถูกต้อง');
  const result: Partial<Record<TravelKind,ManualPrice>> = {};
  for (const [kind,input] of Object.entries(value)) {
    if (!(travelKinds as readonly string[]).includes(kind) || !input || typeof input!=='object' || Array.isArray(input)) throw new BudgetInputError('รายการราคาที่กรอกไม่ถูกต้อง');
    const price = input as Record<string,unknown>;
    const currency = typeof price.currency==='string' ? price.currency.trim().toUpperCase() : '';
    if (typeof price.amount!=='number' || !Number.isFinite(price.amount) || price.amount<0 || price.amount>100_000_000 || Math.abs(price.amount*100-Math.round(price.amount*100))>0.000001 || !currencyCodes.has(currency) || !units[kind as TravelKind].includes(price.unit as PriceUnit)) {
      throw new BudgetInputError('กรุณาตรวจจำนวนเงินไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง สกุลเงิน และหน่วยราคา');
    }
    let sourceUrl: string | null = null;
    if (price.sourceUrl!=null && price.sourceUrl!=='') {
      try {
        if (typeof price.sourceUrl!=='string' || price.sourceUrl.length>1500) throw Error();
        const url = new URL(price.sourceUrl);
        if (url.protocol!=='https:' || url.username || url.password) throw Error();
        sourceUrl=url.href;
      } catch { throw new BudgetInputError('ลิงก์แหล่งราคาต้องเป็น HTTPS'); }
    }
    result[kind as TravelKind] = { amount: Math.round(price.amount*100)/100,currency,unit: price.unit as PriceUnit,sourceUrl };
  }
  return result;
}

export function applyManualPrices(items: TripItem[],prices: Partial<Record<TravelKind,ManualPrice>>,context: { people: number; rooms: number; nights: number; enteredAt: string }): TripItem[] {
  if (context.nights===0 && prices.hotel && prices.hotel.amount>0) throw new BudgetInputError('กรุณาระบุจำนวนคืนก่อนกรอกราคาที่พัก');
  return items.map(item => {
    const price = prices[item.kind];
    if (!price) return item;
    const multiplier = price.unit==='person' || price.unit==='person_round_trip' ? context.people : price.unit==='person_one_way' ? context.people*2 : price.unit==='room_night' ? context.rooms*context.nights : price.unit==='room_stay' ? context.rooms : 1;
    // Drop timestamps and source links belonging to the provider quote being replaced.
    return { kind: item.kind,label: item.label,searchUrl: item.searchUrl,provider: item.provider,amount: Math.round(price.amount*multiplier*100)/100,currency: price.currency,priceType: 'user',unit: price.unit,unitAmount: price.amount,enteredAt: context.enteredAt,sourceUrl: price.sourceUrl,note: 'ราคาที่ผู้ใช้กรอก '+labels[price.unit]+'; ยังไม่ได้ยืนยันกับผู้ให้บริการ' };
  });
}

export function tripTotals(items: TripItem[],transport: Exclude<TravelKind,'ticket' | 'hotel'> | 'none') {
  const chosen = items.filter(item => item.kind==='ticket' || item.kind==='hotel' || item.kind===transport);
  const sums = new Map<string,number>();
  for (const item of chosen) if (item.amount!==null) sums.set(item.currency,(sums.get(item.currency) || 0)+Math.round(item.amount*100));
  return { transport,includes: chosen.map(item => item.kind),complete: chosen.every(item => item.amount!==null),missingKinds: chosen.filter(item => item.amount===null).map(item => item.kind),totals: [...sums].map(([currency,cents]) => ({ currency,amount: cents/100 })) };
}
