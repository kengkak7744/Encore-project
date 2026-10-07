'use client';
import { useState } from 'react';
import { api, type Concert } from '../lib/api';
import { useSessionReset } from './use-data';
import { checked,emptyPrice,kindLabels,money,priceCandidates,priceUnits,providerLinks,safeLink,type PriceDraft,type PriceUnit,type TravelKind } from '../lib/trip-prices';

const priceLabels: Record<string,string> = { user: 'ราคาที่ผู้ใช้กรอก',live: 'ราคาสด',observed: 'ราคาที่พบ',estimate: 'ราคาประมาณ',unavailable: 'ไม่มีราคา' };
type ManualPrices = Partial<Record<TravelKind,{ amount: number; currency: string; unit: PriceUnit; sourceUrl: string | null }>>;
type Inputs = { concertId: string; origin: string; people: number; nights: number; rooms: number; distanceKm: number; checkInDate: string; transport: TravelKind | 'none'; manualPrices: ManualPrices };
type Estimate = { concert: { title: string; destination: string }; people: number; nights: number; stay?: { checkIn: string | null; checkOut: string | null; rooms: number }; items: { kind: TravelKind; label: string; amount: number | null; currency: string; priceType: string; note: string; sourceUrl?: string | null; searchUrl?: string; provider?: string; observedAt?: string; enteredAt?: string; validUntil?: string }[]; summary?: { totals: { amount: number; currency: string }[]; complete: boolean; missingKinds: TravelKind[] }; saved?: { updated_at: string } | null; disclaimer: string; generatedAt: string };

function PriceEntry({ kind,value,onChange }: { kind: TravelKind; value: PriceDraft; onChange: (value: PriceDraft) => void }) {
  const [text,setText] = useState('');
  useSessionReset(() => setText(''));
  const candidates = priceCandidates(text);
  const provider = providerLinks[kind];
  return <fieldset className="manual-price"><legend>{kindLabels[kind]}</legend>
    {provider && <a className="text-link" href={provider.url} target="_blank" rel="noreferrer">ค้นราคาบน {provider.name} ↗</a>}
    <div className="form-row"><label>ราคาที่คุณพบ<input aria-label={'ราคา'+kindLabels[kind]} type="number" min="0" max="100000000" step="0.01" value={value.amount} onChange={e => onChange({ ...value,amount: e.target.value })} placeholder="เว้นว่าง ใช้ข้อมูล/ค่าประมาณ"/></label><label>สกุลเงิน<select aria-label={'สกุลเงิน'+kindLabels[kind]} value={value.currency} onChange={e => onChange({ ...value,currency: e.target.value })}>{[...new Set(['THB','USD','EUR','GBP','JPY','SGD','CNY','KRW','AUD','MYR',value.currency])].map(code => <option key={code}>{code}</option>)}</select></label></div>
    <label>หน่วยราคา<select aria-label={'หน่วยราคา'+kindLabels[kind]} value={value.unit} onChange={e => onChange({ ...value,unit: e.target.value as PriceUnit })}>{priceUnits[kind].map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
    <label>ลิงก์แหล่งราคา (ถ้ามี)<input type="url" value={value.sourceUrl} onChange={e => onChange({ ...value,sourceUrl: e.target.value })} placeholder="https://..."/></label>
    <details><summary>ช่วยเติมจากข้อความที่คัดลอก</summary><label>วางข้อความราคา<textarea maxLength={5000} value={text} onChange={e => setText(e.target.value)} placeholder="เช่น THB 1,250.50 หรือ 1,250 บาท"/></label>
      <p className="fine-print">อ่านข้อความในเครื่องคุณ ไม่ดึงเว็บต้นทาง เลือกยอดที่ต้องการแล้วตรวจวันเดินทาง จำนวนคน/ห้อง หน่วยราคา และค่าธรรมเนียม</p>
      <div className="price-candidates">{candidates.map(candidate => <button type="button" className="button secondary" key={candidate.currency+candidate.amount} onClick={() => onChange({ ...value,amount: String(candidate.amount),currency: candidate.currency })}>ใช้ {money(candidate.amount,candidate.currency)}</button>)}</div>
      {text && !candidates.length && <p className="fine-print">ยังไม่พบจำนวนเงินที่ระบุสกุลชัดเจน กรุณากรอกราคาเอง</p>}
    </details>
  </fieldset>;
}

export function TripPlanner({ concerts,initialConcertId }: { concerts: Concert[]; initialConcertId: string }) {
  const [concertId,setConcertId] = useState(initialConcertId),[origin,setOrigin] = useState('กรุงเทพมหานคร');
  const [people,setPeople] = useState(1),[nights,setNights] = useState(1),[rooms,setRooms] = useState(1);
  const [distanceKm,setDistanceKm] = useState(''),[checkInDate,setCheckInDate] = useState('');
  const [transport,setTransport] = useState<TravelKind | 'none'>('bus');
  const [prices,setPrices] = useState<Partial<Record<TravelKind,PriceDraft>>>({});
  const [estimate,setEstimate] = useState<Estimate | null>(null),[error,setError] = useState(''),[busy,setBusy] = useState(false),[savedAt,setSavedAt] = useState('');
  useSessionReset(() => {
    setOrigin('กรุงเทพมหานคร'); setPeople(1); setNights(1); setRooms(1);
    setDistanceKm(''); setCheckInDate(''); setTransport('bus'); setPrices({});
    setEstimate(null); setSavedAt(''); setError('');
  });
  const entries: TravelKind[] = ['ticket',...(transport==='none' ? [] : [transport]),...(nights ? ['hotel' as const] : [])];
  function changed() { setEstimate(null); setSavedAt(''); setError(''); }
  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const manualPrices: ManualPrices = {};
    for (const [kind,value] of Object.entries(prices)) if (value?.amount.trim()!=='' && value) manualPrices[kind as TravelKind] = { amount: Number(value.amount),currency: value.currency,unit: value.unit,sourceUrl: value.sourceUrl || null };
    changed(); setBusy(true);
    try {
      const result = await api<Estimate>('/trip-estimates',{ method: 'POST',body: JSON.stringify({ concertId,origin,people,nights,rooms,distanceKm: Number(distanceKm),checkInDate,transport,manualPrices,save: submitter?.value==='save' }) });
      setEstimate(result); setSavedAt(result.saved?.updated_at || '');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function load() {
    if (!concertId) { setError('กรุณาเลือกคอนเสิร์ต'); return; }
    changed(); setBusy(true);
    try {
      const row = await api<{ inputs: Inputs; estimate: Estimate; updated_at: string }>('/me/trip-budgets/'+concertId);
      const input = row.inputs; setOrigin(input.origin); setPeople(input.people); setNights(input.nights); setRooms(input.rooms); setDistanceKm(String(input.distanceKm || '')); setCheckInDate(input.checkInDate); setTransport(input.transport);
      const restored: Partial<Record<TravelKind,PriceDraft>> = {};
      for (const [kind,value] of Object.entries(input.manualPrices)) if (value) restored[kind as TravelKind] = { ...value,amount: String(value.amount),sourceUrl: value.sourceUrl || '' };
      setPrices(restored); setEstimate(row.estimate); setSavedAt(row.updated_at);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="assistant-panel"><div className="panel-heading"><h2>วางแผนงบทริป</h2></div>
    <p className="fine-print">เปิดเว็บต้นทางแล้วกรอกราคาที่เลือก เว้นว่างเพื่อใช้ข้อมูลหรือค่าประมาณ ราคาที่กรอกใช้กับทริปของคุณเท่านั้น</p>
    <form className="budget-form" onSubmit={calculate} onChange={changed}>
      <fieldset className="trip-fields" disabled={busy}>
      <label>คอนเสิร์ต<select aria-label="คอนเสิร์ต" required value={concertId} onChange={e => { setConcertId(e.target.value); setPrices({}); }}><option value="">เลือกคอนเสิร์ต</option>{concerts.map(concert => <option key={concert.id} value={concert.id}>{concert.title}</option>)}</select></label>
      <label>เมืองต้นทาง<input required maxLength={80} value={origin} onChange={e => setOrigin(e.target.value)}/></label>
      <label>วิธีเดินทาง<select aria-label="วิธีเดินทาง" value={transport} onChange={e => setTransport(e.target.value as TravelKind | 'none')}>{(['bus','train','flight','car','none'] as const).map(kind => <option key={kind} value={kind}>{kind==='none' ? 'ไม่เดินทางระหว่างเมือง' : kindLabels[kind]}</option>)}</select></label>
      <label>ระยะทางเที่ยวเดียว (กม.) สำหรับงบประมาณรถ/รถไฟ<input type="number" min="0" max="3000" step="0.1" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} placeholder="ถ้าทราบ"/></label>
      <div className="form-row"><label>จำนวนคน<input required type="number" min="1" max="10" step="1" value={people} onChange={e => { const value=Number(e.target.value); setPeople(value); setRooms(Math.max(1,Math.ceil(value/2))); }}/></label><label>จำนวนคืน<input required type="number" min="0" max="14" step="1" value={nights} onChange={e => { const value=Number(e.target.value); setNights(value); if (!value) setPrices(previous => ({ ...previous,hotel: undefined })); }}/></label></div>
      {!!nights && <><label>จำนวนห้อง<input required type="number" min="1" max={people} step="1" value={rooms} onChange={e => setRooms(Number(e.target.value))}/></label><label>วันที่เข้าพัก (งานไทยใช้วันคอนเสิร์ตถ้าไม่ระบุ)<input type="date" value={checkInDate} onChange={e => setCheckInDate(e.target.value)}/></label></>}
      {entries.map(kind => <PriceEntry key={kind} kind={kind} value={prices[kind] || emptyPrice(kind)} onChange={value => { changed(); setPrices(previous => ({ ...previous,[kind]: value })); }}/>) }
      <div className="trip-actions"><button className="button primary" disabled={busy} type="submit" value="calculate">{busy ? 'กำลังทำงาน…' : 'คำนวณงบ'}</button><button className="button secondary" disabled={busy} type="submit" value="save">บันทึกงบของฉัน</button><button className="button secondary" disabled={busy} type="button" onClick={load}>โหลดงบที่บันทึก</button></div>
      </fieldset>
    </form>
    {error && <p className="notice error">{error}</p>}
    {savedAt && <p className="notice">งบที่บันทึก {checked(savedAt)} · กดคำนวณเพื่อตรวจข้อมูลใหม่</p>}
    {estimate && <div className="budget-results"><h3>{estimate.concert.title}</h3>{estimate.stay?.checkIn && <p className="fine-print">เข้าพัก {estimate.stay.checkIn} ถึง {estimate.stay.checkOut} · {estimate.stay.rooms} ห้อง · {estimate.people} คน</p>}
      {estimate.items.map(item => <div key={item.kind} className="budget-line"><span>{item.label}<small>{priceLabels[item.priceType] || item.priceType} · {item.note}</small>{item.enteredAt && <small>กรอกเมื่อ {checked(item.enteredAt)}</small>}{item.observedAt && <small>ตรวจราคา {checked(item.observedAt)}{item.validUntil ? ` · ตรวจใหม่หลัง ${checked(item.validUntil)}` : ''}</small>}{safeLink(item.sourceUrl || item.searchUrl) && <small><a href={safeLink(item.sourceUrl || item.searchUrl)!} target="_blank" rel="noreferrer">{item.sourceUrl ? 'แหล่งราคา' : 'ค้นบน '+item.provider}</a></small>}</span><strong>{item.amount===null ? '—' : money(item.amount,item.currency)}</strong></div>)}
      {estimate.summary && <div className="trip-total"><h3>{estimate.summary.complete ? 'ยอดรวมทริป' : 'ยอดรวมเฉพาะรายการที่มีราคา'}</h3>{estimate.summary.totals.map(total => <p key={total.currency}><strong>{money(total.amount,total.currency)}</strong></p>)}{!estimate.summary.complete && <p className="fine-print">ยังไม่มีราคา: {estimate.summary.missingKinds.map(kind => kindLabels[kind]).join(', ')}</p>}{estimate.summary.totals.length>1 && <p className="fine-print">แยกยอดตามสกุลเงิน ยังไม่แปลงอัตราแลกเปลี่ยน</p>}</div>}
      <p className="fine-print">คำนวณเมื่อ {checked(estimate.generatedAt)}</p><p className="fine-print">{estimate.disclaimer}</p></div>}
  </section>;
}
