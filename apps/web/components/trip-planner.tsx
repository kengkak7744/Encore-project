'use client';
import { useState } from 'react';
import { api, type Concert } from '../lib/api';
import { useSessionReset } from './use-data';
import { checked,emptyPrice,kindLabels,money,priceCandidates,priceUnits,safeLink,type PriceDraft,type PriceUnit,type TravelKind } from '../lib/trip-prices';
import { tripCheckout,tripDate,tripSearchLink } from '../lib/trip-search';
import { ConcertLocation } from './concert-location';

const priceLabels: Record<string,string> = { user: 'ราคาที่ผู้ใช้กรอก',live: 'ราคาสด',observed: 'ราคาที่พบ',estimate: 'ราคาประมาณ',unavailable: 'ไม่มีราคา' };
type ManualPrices = Partial<Record<TravelKind,{ amount: number; currency: string; unit: PriceUnit; sourceUrl: string | null }>>;
type Inputs = { concertId: string; origin: string; people: number; nights: number; rooms: number; distanceKm: number; checkInDate: string; transport: TravelKind | 'none'; manualPrices: ManualPrices };
type Estimate = { concert: { title: string; destination: string }; people: number; nights: number; stay?: { checkIn: string | null; checkOut: string | null; rooms: number }; items: { kind: TravelKind; label: string; amount: number | null; currency: string; priceType: string; note: string; sourceUrl?: string | null; searchUrl?: string; provider?: string; observedAt?: string; enteredAt?: string; validUntil?: string }[]; summary?: { totals: { amount: number; currency: string }[]; complete: boolean; missingKinds: TravelKind[] }; saved?: { updated_at: string } | null; disclaimer: string; generatedAt: string };

function PriceEntry({ kind,value,onChange,quick,search }: { kind: TravelKind; value: PriceDraft; onChange: (value: PriceDraft) => void; quick: boolean; search: ReturnType<typeof tripSearchLink> }) {
  const [text,setText] = useState('');
  useSessionReset(() => setText(''));
  const candidates = priceCandidates(text);
  const unitLabel = priceUnits[kind].find(unit => unit.value===value.unit)?.label;
  return <fieldset className="manual-price"><legend>{kindLabels[kind]}</legend>
    {search && <><a className="text-link" href={search.url} target="_blank" rel="noreferrer">ค้นราคาบน {search.name} ↗</a><small className="fine-print">{search.specific ? 'เปิดหน้าเมือง/เส้นทางให้แล้ว' : 'เปิดเว็บไซต์ผู้ให้บริการ'} · เลือกวันและจำนวนคน/ห้องบนต้นทาง</small></>}
    <label>ราคาที่คุณพบ<input aria-label={'ราคา'+kindLabels[kind]} type="number" min="0" max="100000000" step="0.01" value={value.amount} onChange={e => onChange({ ...value,amount: e.target.value })} placeholder="เว้นว่าง ใช้ข้อมูล/ค่าประมาณ"/></label>
    <small className="fine-print">{value.currency} · {unitLabel} · ตรวจว่ารวมค่าธรรมเนียมแล้วหรือไม่</small>
    <details open={quick ? undefined : true}><summary>ปรับหน่วยราคา / สกุลเงิน / แหล่งราคา</summary><div className="trip-detail-fields">
    <label>สกุลเงิน<select aria-label={'สกุลเงิน'+kindLabels[kind]} value={value.currency} onChange={e => onChange({ ...value,currency: e.target.value })}>{[...new Set(['THB','USD','EUR','GBP','JPY','SGD','CNY','KRW','AUD','MYR',value.currency])].map(code => <option key={code}>{code}</option>)}</select></label>
    <label>หน่วยราคา<select aria-label={'หน่วยราคา'+kindLabels[kind]} value={value.unit} onChange={e => onChange({ ...value,unit: e.target.value as PriceUnit })}>{priceUnits[kind].map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
    <label>ลิงก์แหล่งราคา (ถ้ามี)<input type="url" value={value.sourceUrl} onChange={e => onChange({ ...value,sourceUrl: e.target.value })} placeholder="https://..."/></label>
    </div></details>
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
  const [quick,setQuick] = useState(true),[copyNotice,setCopyNotice] = useState('');
  const [estimate,setEstimate] = useState<Estimate | null>(null),[error,setError] = useState(''),[busy,setBusy] = useState(false),[savedAt,setSavedAt] = useState('');
  useSessionReset(() => {
    setOrigin('กรุงเทพมหานคร'); setPeople(1); setNights(1); setRooms(1);
    setDistanceKm(''); setCheckInDate(''); setTransport('bus'); setPrices({});
    setEstimate(null); setSavedAt(''); setError(''); setQuick(true); setCopyNotice('');
  });
  const selected = concerts.find(concert => concert.id===concertId);
  const searchDate = checkInDate || tripDate(selected),checkOut = tripCheckout(searchDate,nights);
  const searchDetails = [selected ? 'คอนเสิร์ต: '+selected.title : '', 'ต้นทาง: '+origin, 'ปลายทาง: '+(selected?.city || 'ยังไม่ทราบเมือง'),selected?.venue ? 'สถานที่จัด: '+selected.venue : '', 'วิธีเดินทาง: '+(transport==='none' ? 'ไม่เดินทางระหว่างเมือง' : kindLabels[transport]), 'จำนวนคน: '+people, searchDate ? 'วันที่เริ่มทริปที่เลือก: '+searchDate : 'ยังไม่ทราบวันที่เริ่มทริป', nights ? `ที่พัก: ${rooms} ห้อง / ${nights} คืน${checkOut ? ' / เช็กเอาต์ '+checkOut : ''}` : 'ไม่พักค้างคืน'].filter(Boolean).join('\n');
  const draftFor = (kind: TravelKind) => prices[kind] || { ...emptyPrice(kind),...(kind!=='ticket' ? { unit: 'group_total' as const } : { currency: selected?.currency || 'THB' }) };
  const entries: TravelKind[] = ['ticket',...(transport==='none' ? [] : [transport]),...(nights ? ['hotel' as const] : [])];
  function changed() { setEstimate(null); setSavedAt(''); setError(''); setCopyNotice(''); }
  async function copy() {
    try { await navigator.clipboard.writeText(searchDetails); setCopyNotice('คัดลอกข้อมูลทริปแล้ว'); }
    catch { setCopyNotice('คัดลอกไม่สำเร็จ เลือกข้อความด้านบนแล้วคัดลอกเองได้'); }
  }
  async function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const manualPrices: ManualPrices = {};
    for (const [kind,value] of Object.entries(prices)) if (value?.amount.trim()!=='' && value) manualPrices[kind as TravelKind] = { amount: Number(value.amount),currency: value.currency,unit: value.unit,sourceUrl: value.sourceUrl || null };
    changed(); setBusy(true);
    try {
      const result = await api<Estimate>('/trip-estimates',{ method: 'POST',body: JSON.stringify({ concertId,origin,people,nights,rooms,distanceKm: Number(distanceKm),checkInDate: searchDate,transport,manualPrices,useExternalProviders: false,save: submitter?.value==='save' }) });
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
    <p className="fine-print">เลือกต้นทาง คน และวิธีเดินทาง แล้วค้นราคาที่คุณต้องการ เว้นว่างเพื่อใช้ข้อมูลหรือค่าประมาณ ราคาที่กรอกใช้กับทริปของคุณเท่านั้น</p>
    <div className="trip-mode" aria-label="รูปแบบการกรอก"><button type="button" aria-pressed={quick} onClick={() => setQuick(true)}>กรอกแบบเร็ว</button><button type="button" aria-pressed={!quick} onClick={() => setQuick(false)}>กรอกแบบละเอียด</button></div>
    <form className="budget-form" onSubmit={calculate} onChange={changed}>
      <fieldset className="trip-fields" disabled={busy}>
      <label>คอนเสิร์ต<select aria-label="คอนเสิร์ต" required value={concertId} onChange={e => { setConcertId(e.target.value); setPrices({}); setCheckInDate(''); }}><option value="">เลือกคอนเสิร์ต</option>{concerts.map(concert => <option key={concert.id} value={concert.id}>{concert.title}</option>)}</select></label>
      {selected && <div className="trip-destination"><strong>{selected.city || 'ยังไม่ทราบเมือง'}{selected.venue ? ' · '+selected.venue : ''}</strong><small>{searchDate ? `วันที่เริ่มทริปที่เสนอ ${searchDate}${nights && checkOut ? ' ถึง '+checkOut : ''} · แก้วันได้ในรายละเอียดทริป` : 'ยังไม่ทราบวันที่ · ระบุวันในรายละเอียดทริป'}</small></div>}
      <label>เมืองต้นทาง<input required maxLength={80} value={origin} onChange={e => setOrigin(e.target.value)}/></label>
      <label>วิธีเดินทาง<select aria-label="วิธีเดินทาง" value={transport} onChange={e => setTransport(e.target.value as TravelKind | 'none')}>{(['bus','train','flight','car','none'] as const).map(kind => <option key={kind} value={kind}>{kind==='none' ? 'ไม่เดินทางระหว่างเมือง' : kindLabels[kind]}</option>)}</select></label>
      <label>จำนวนคน<input required type="number" min="1" max="10" step="1" value={people} onChange={e => { const value=Number(e.target.value); setPeople(value); setRooms(Math.max(1,Math.ceil(value/2))); }}/></label>
      <label>การพักค้างคืน<select aria-label="การพักค้างคืน" value={nights===0 ? 'day' : nights===1 ? 'one' : 'custom'} onChange={e => { const value=e.target.value==='day' ? 0 : e.target.value==='one' ? 1 : 2; setNights(value); if (!value) setPrices(previous => ({ ...previous,hotel: undefined })); }}><option value="day">กลับวันเดียว ไม่พักค้างคืน</option><option value="one">พัก 1 คืน</option><option value="custom">กำหนดจำนวนคืนเอง</option></select></label>
      <small className="fine-print">{nights ? `${people} คน · ${rooms} ห้อง · ${nights} คืน` : `${people} คน · ไม่พักค้างคืน`} · แก้ห้องและวันได้ในรายละเอียดทริป</small>
      <details className="trip-advanced" open={!quick || nights>1 || !searchDate ? true : undefined}><summary>ปรับรายละเอียดทริป</summary><div className="trip-detail-fields">
      <label>จำนวนคืน<input required type="number" min="0" max="14" step="1" value={nights} onChange={e => { const value=Number(e.target.value); setNights(value); if (!value) setPrices(previous => ({ ...previous,hotel: undefined })); }}/></label>
      {!!nights && <label>จำนวนห้อง<input required type="number" min="1" max={people} step="1" value={rooms} onChange={e => setRooms(Number(e.target.value))}/></label>}
      <label>วันที่เริ่มทริป / เข้าพัก<input type="date" value={searchDate} onChange={e => setCheckInDate(e.target.value)}/></label>
      <label>ระยะทางเที่ยวเดียว (กม.) สำหรับงบประมาณรถ/รถไฟ<input type="number" min="0" max="3000" step="0.1" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} placeholder="ถ้าทราบ"/></label>
      </div></details>
      {selected && <div className="trip-search-details"><h3>ข้อมูลพร้อมใช้ค้นราคา</h3><pre>{searchDetails}</pre><button className="button secondary" type="button" onClick={copy}>คัดลอกข้อมูลทริป</button><p className="fine-print" role="status">{copyNotice || 'เปิดเว็บต้นทางแล้วเลือกวันและตัวเลือกตามข้อมูลนี้ ราคายังต้องเลือกจากต้นทางเอง'}</p></div>}
      {selected && <p className="fine-print">{selected.price_min!=null && !selected.price_note ? `บัตรอ้างอิงเริ่มต้น ${money(Number(selected.price_min),selected.currency)} ต่อคน${selected.price_max ? ' · สูงสุดที่พบ '+money(Number(selected.price_max),selected.currency) : ''} ไม่ใช่ราคาสดหรือการยืนยันว่าบัตรที่เลือกมีราคานี้` : selected.price_note || 'ยังไม่มีราคาบัตร · กรอกเพิ่มได้ในตัวเลือกบัตร'}</p>}
      {entries.map(kind => kind==='ticket' && quick ? <details className="trip-advanced" key={kind}><summary>กรอกราคาบัตรที่เลือก (ถ้ามี)</summary><PriceEntry kind={kind} quick={quick} search={null} value={draftFor(kind)} onChange={value => { changed(); setPrices(previous => ({ ...previous,[kind]: value })); }}/></details> : <PriceEntry key={kind} kind={kind} quick={quick} search={tripSearchLink(kind,origin,selected)} value={draftFor(kind)} onChange={value => { changed(); setPrices(previous => ({ ...previous,[kind]: value })); }}/>) }
      <div className="trip-actions"><button className="button primary" disabled={busy} type="submit" value="calculate">{busy ? 'กำลังทำงาน…' : 'คำนวณงบ'}</button><button className="button secondary" disabled={busy} type="submit" value="save">บันทึกงบของฉัน</button><button className="button secondary" disabled={busy} type="button" onClick={load}>โหลดงบที่บันทึก</button></div>
      </fieldset>
    </form>
    {selected && <ConcertLocation key={selected.id} concert={selected} originValue={origin} onOriginChange={value=>{changed();setOrigin(value);}}/>}
    {error && <p className="notice error">{error}</p>}
    {savedAt && <p className="notice">งบที่บันทึก {checked(savedAt)} · กดคำนวณเพื่อตรวจข้อมูลใหม่</p>}
    {estimate && <div className="budget-results"><h3>{estimate.concert.title}</h3>{estimate.stay?.checkIn && <p className="fine-print">เข้าพัก {estimate.stay.checkIn} ถึง {estimate.stay.checkOut} · {estimate.stay.rooms} ห้อง · {estimate.people} คน</p>}
      {estimate.items.map(item => <div key={item.kind} className="budget-line"><span>{item.label}<small>{priceLabels[item.priceType] || item.priceType} · {item.note}</small>{item.enteredAt && <small>กรอกเมื่อ {checked(item.enteredAt)}</small>}{item.observedAt && <small>ตรวจราคา {checked(item.observedAt)}{item.validUntil ? ` · ตรวจใหม่หลัง ${checked(item.validUntil)}` : ''}</small>}{safeLink(item.sourceUrl || item.searchUrl) && <small><a href={safeLink(item.sourceUrl || item.searchUrl)!} target="_blank" rel="noreferrer">{item.sourceUrl ? 'แหล่งราคา' : 'ค้นบน '+item.provider}</a></small>}</span><strong>{item.amount===null ? '—' : money(item.amount,item.currency)}</strong></div>)}
      {estimate.summary && <div className="trip-total"><h3>{estimate.summary.complete ? 'ยอดรวมทริป' : 'ยอดรวมเฉพาะรายการที่มีราคา'}</h3>{estimate.summary.totals.map(total => <p key={total.currency}><strong>{money(total.amount,total.currency)}</strong></p>)}{!estimate.summary.complete && <p className="fine-print">ยังไม่มีราคา: {estimate.summary.missingKinds.map(kind => kindLabels[kind]).join(', ')}</p>}{estimate.summary.totals.length>1 && <p className="fine-print">แยกยอดตามสกุลเงิน ยังไม่แปลงอัตราแลกเปลี่ยน</p>}</div>}
      <p className="fine-print">คำนวณเมื่อ {checked(estimate.generatedAt)}</p><p className="fine-print">{estimate.disclaimer}</p></div>}
  </section>;
}
