'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, date, type Artist, type Concert, type EditableArtist, type Page } from '../lib/api';
import { useData } from './use-data';
import { ArtistEditor } from './artist-editor';

const platforms = [['instagram','Instagram'],['facebook','Facebook'],['x','X'],['youtube','YouTube'],['tiktok','TikTok'],['website','เว็บไซต์']];
type Account = { id: string; platform: string; url: string; external_id?: string; verified_at?: string; last_error?: string };
type SocialDraft = { platform: string; url: string };
type Changed = { onChange: () => void };
function PlatformOptions() { return <>{platforms.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</>; }
function Pager({ page,total,onPage }: { page: number; total?: number; onPage: (page: number) => void }) {
  return <div className="admin-pagination"><button type="button" className="button secondary" disabled={page<=1} onClick={() => onPage(page-1)}>ก่อนหน้า</button><span>หน้า {page} · {total ?? 0} รายการ</span><button type="button" className="button secondary" disabled={page*20>=(total || 0)} onClick={() => onPage(page+1)}>ถัดไป</button></div>;
}
function useAction() {
  const [busy,setBusy] = useState(false),[message,setMessage] = useState(''),[error,setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current=true; return () => { active.current=false; }; },[]);
  async function run(action: () => Promise<void>, success = 'บันทึกแล้ว') {
    if (busy || !active.current) return;
    setBusy(true); setMessage(''); setError('');
    try { await action(); if (active.current) setMessage(success); }
    catch (failure) { if (active.current) setError((failure as Error).message); }
    finally { if (active.current) setBusy(false); }
  }
  return { busy,run,feedback: <>{message && <p className="notice" role="status">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}</> };
}
export function ArtistManagement({ onChange }: Changed) {
  const [q,setQ] = useState(''),[page,setPage] = useState(1),[selected,setSelected] = useState<EditableArtist | null>(null);
  const [name,setName] = useState(''),[kind,setKind] = useState('solo'),[verified,setVerified] = useState(false);
  const [socials,setSocials] = useState<SocialDraft[]>([{ platform: 'instagram',url: '' }]);
  const list = useData<Page<Artist>>('/artists?'+new URLSearchParams({ q,page: String(page) }));
  const action = useAction(), sequence = useRef(0);
  useEffect(() => () => { sequence.current++; },[]);
  async function select(slug: string) {
    const request = ++sequence.current;
    await action.run(async () => { const artist = await api<EditableArtist>('/artists/'+encodeURIComponent(slug)); if (request===sequence.current) setSelected(artist); },'โหลดข้อมูลแล้ว');
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const created = await api<Artist>('/admin/artists',{ method: 'POST',body: JSON.stringify({ name,kind,accounts: socials.filter(row => row.url.trim()).map(row => ({ ...row,verified })) }) });
      setName(''); setSocials([{ platform: 'instagram',url: '' }]); setVerified(false);
      setSelected(await api<EditableArtist>('/artists/'+created.slug)); void list.reload(); onChange();
    },'สร้างศิลปินแล้ว ระบบจะพิจารณาเพิ่มประวัติในรอบ 23:00–00:00 เมื่อมีหลักฐานเพียงพอ');
  }
  return <><div className="admin-editor-layout"><section className="panel"><h2>รายชื่อศิลปิน</h2><label className="editor-search">ค้นหาศิลปิน<input value={q} onChange={event => { setQ(event.target.value); setPage(1); }}/></label>
    {list.loading && <p>กำลังโหลด...</p>}{list.error && <p className="notice error" role="alert">{list.error}</p>}
    <div className="editor-artist-list">{list.data?.items.map(artist => <button type="button" key={artist.id} disabled={action.busy} onClick={() => void select(artist.slug)}>{artist.name}<small>{artist.kind==='band' ? 'วงดนตรี' : artist.kind==='member' ? 'สมาชิกวง' : 'ศิลปินเดี่ยว'} · {artist.slug}</small></button>)}</div>
    {!list.loading && !list.data?.items.length && <p className="empty">ไม่พบศิลปิน</p>}<Pager page={page} total={list.data?.total} onPage={setPage}/></section>
    <section className="panel"><h2>เพิ่มศิลปิน</h2><p className="muted">กรอกชื่อกับลิงก์บัญชี ระบบสร้าง URL โปรไฟล์ให้เอง ประเภทเลือกได้และแก้ภายหลังได้</p>
      <form className="budget-form" onSubmit={create}><fieldset className="editor-fields" disabled={action.busy}>
        <label>ชื่อศิลปิน / วง<input value={name} maxLength={200} required onChange={event => setName(event.target.value)} placeholder="เช่น ชื่อศิลปินหรือชื่อวง"/></label>
        <label>ประเภทศิลปิน<select value={kind} onChange={event => setKind(event.target.value)}><option value="solo">ศิลปินเดี่ยว</option><option value="band">วงดนตรี</option><option value="member">สมาชิกวง</option></select></label>
        {socials.map((row,index) => <div className="admin-social-row" key={index}><label>แพลตฟอร์ม {index+1}<select value={row.platform} onChange={event => setSocials(rows => rows.map((value,i) => i===index ? { ...value,platform: event.target.value } : value))}><PlatformOptions/></select></label><label>ลิงก์โซเชียล {index+1}<input type="url" value={row.url} placeholder="https://www.instagram.com/username/" onChange={event => setSocials(rows => rows.map((value,i) => i===index ? { ...value,url: event.target.value } : value))}/></label><button type="button" className="button secondary" aria-label={'เอาช่องทาง '+(index+1)+' ออก'} disabled={socials.length===1} onClick={() => setSocials(rows => rows.filter((_,i) => i!==index))}>เอาออก</button></div>)}
        <button type="button" className="button secondary" disabled={socials.length>=12} onClick={() => setSocials(rows => [...rows,{ platform: 'instagram',url: '' }])}>เพิ่มช่องทางโซเชียล</button>
        <label className="editor-confirm"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)}/>ฉันตรวจแล้วว่าลิงก์ทั้งหมดเป็นบัญชีทางการของศิลปินนี้</label>
        <p className="muted">บัญชีที่ยังไม่ยืนยันเก็บไว้ให้ตรวจต่อ Instagram ที่ยืนยันใช้รอบดึงและข้อจำกัด usage เดิม YouTube/TikTok เก็บเป็นลิงก์โปรไฟล์</p>
        <button className="button primary">{action.busy ? 'กำลังบันทึก...' : 'สร้างศิลปิน'}</button>
      </fieldset></form></section></div>{action.feedback}
    {selected && <ArtistSettings key={selected.id} artist={selected} onSaved={setSelected} onReload={() => void select(selected.slug)} onChange={() => { void list.reload(); onChange(); }}/>}</>;
}
function ArtistSettings({ artist,onSaved,onReload,onChange }: { artist: EditableArtist; onSaved: (value: EditableArtist) => void; onReload: () => void } & Changed) {
  const [kind,setKind] = useState(artist.kind),[nameEn,setNameEn] = useState(artist.name_en || ''),[genres,setGenres] = useState(artist.genres.join(', '));
  const [platform,setPlatform] = useState('instagram'),[url,setUrl] = useState(''),[externalId,setExternalId] = useState(''),[verified,setVerified] = useState(false),[editingId,setEditingId] = useState('');
  const [sourceUrl,setSourceUrl] = useState(''),[sourceLabel,setSourceLabel] = useState(''),[memberSearch,setMemberSearch] = useState(''),[memberId,setMemberId] = useState('');
  const accounts = useData<{ items: Account[] }>('/admin/artists/'+artist.id+'/accounts');
  const members = useData<Page<Artist>>('/artists?'+new URLSearchParams({ q: memberSearch }));
  const action = useAction();
  useEffect(() => { setKind(artist.kind); setNameEn(artist.name_en || ''); setGenres(artist.genres.join(', ')); },[artist]);
  const path = '/admin/artists/'+artist.id;
  async function refresh() { onSaved(await api<EditableArtist>('/artists/'+artist.slug)); void accounts.reload(); onChange(); }
  function saveAccount(event: React.FormEvent) {
    event.preventDefault(); void action.run(async () => {
      await api(path+'/accounts'+(editingId ? '/'+editingId : ''),{ method: editingId ? 'PATCH' : 'PUT',body: JSON.stringify({ platform,url,externalId,verified }) });
      setUrl(''); setExternalId(''); setVerified(false); setEditingId(''); await refresh();
    });
  }
  return <section className="spaced"><div className="page-heading"><h2>จัดการ {artist.name}</h2><Link className="text-link" href={'/artists/'+artist.slug}>ดูหน้าโปรไฟล์ ↗</Link></div>
    <div className="admin-editor-layout"><section className="panel"><h3>ข้อมูลโปรไฟล์</h3><form className="budget-form" onSubmit={event => { event.preventDefault(); void action.run(async () => { await api(path,{ method: 'PATCH',body: JSON.stringify({ kind,nameEn,genres: genres.split(',').map(value => value.trim()).filter(Boolean),editVersion: artist.edit_version }) }); await refresh(); }); }}><fieldset className="editor-fields" disabled={action.busy}>
      <label>ชื่อภาษาอังกฤษ<input value={nameEn} maxLength={200} onChange={event => setNameEn(event.target.value)}/></label><label>ประเภทโปรไฟล์<select value={kind} onChange={event => setKind(event.target.value)}><option value="solo">ศิลปินเดี่ยว</option><option value="band">วงดนตรี</option><option value="member">สมาชิกวง</option></select></label><label>แนวเพลง (คั่นด้วย ,)<input value={genres} onChange={event => setGenres(event.target.value)}/></label><button className="button primary">บันทึกข้อมูลโปรไฟล์</button></fieldset></form></section>
    <section className="panel"><h3>ช่องทางโซเชียล</h3>{accounts.error && <p className="notice error">{accounts.error}</p>}<div className="admin-records">{accounts.data?.items.map(row => <div className="admin-record" key={row.id}><div><strong>{row.platform} · {row.verified_at ? 'ตรวจแล้ว' : 'รอตรวจ'}</strong><a href={row.url} target="_blank" rel="noreferrer">{row.url}</a>{row.last_error && <small>{row.last_error}</small>}</div><div className="editor-actions"><button type="button" disabled={action.busy} onClick={() => { setEditingId(row.id); setPlatform(row.platform); setUrl(row.url); setExternalId(row.external_id || ''); setVerified(!!row.verified_at); }}>แก้บัญชี</button><button type="button" disabled={action.busy} onClick={() => { if (window.confirm('เอาบัญชีนี้ออก? ข่าวที่เก็บไว้จะยังอยู่')) void action.run(async () => { await api(path+'/accounts/'+row.id,{ method: 'DELETE' }); await refresh(); }); }}>เอาบัญชีออก</button></div></div>)}</div>
      <form className="budget-form spaced" onSubmit={saveAccount}><fieldset className="editor-fields" disabled={action.busy}><label>แพลตฟอร์มบัญชี<select value={platform} disabled={!!editingId} onChange={event => setPlatform(event.target.value)}><PlatformOptions/></select></label><label>URL บัญชี<input type="url" required value={url} onChange={event => setUrl(event.target.value)}/></label><label>Page / Business ID (ถ้ามี)<input value={externalId} onChange={event => setExternalId(event.target.value)}/></label><label className="editor-confirm"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)}/>ตรวจว่าเป็นบัญชีทางการแล้ว</label><div className="editor-actions"><button className="button primary">{editingId ? 'บันทึกบัญชี' : 'เพิ่มบัญชี'}</button>{editingId && <button type="button" onClick={() => { setEditingId(''); setUrl(''); setExternalId(''); setVerified(false); }}>ยกเลิกแก้บัญชี</button>}</div></fieldset></form>
    </section></div>
    <div className="admin-editor-layout spaced"><section className="panel"><h3>สมาชิกและวง</h3>{artist.bands?.map(band => <p key={band.id}>สมาชิกของ {band.name}</p>)}<div className="admin-records">{artist.members?.map(member => <div className="admin-record" key={member.id}><Link href={'/artists/'+member.slug}>{member.name}</Link><button type="button" className="button secondary" disabled={action.busy} onClick={() => { if (window.confirm('เอาความสัมพันธ์สมาชิกนี้ออก?')) void action.run(async () => { await api(path+'/members/'+member.id,{ method: 'DELETE' }); await refresh(); }); }}>เอาสมาชิกออก</button></div>)}</div>{artist.kind==='band' ? <form className="budget-form spaced" onSubmit={event => { event.preventDefault(); void action.run(async () => { await api(path+'/members/'+memberId,{ method: 'PUT' }); setMemberId(''); await refresh(); }); }}><label>ค้นหาสมาชิก<input value={memberSearch} onChange={event => { setMemberSearch(event.target.value); setMemberId(''); }}/></label><label>เลือกสมาชิก<select required value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">เลือกศิลปิน</option>{members.data?.items.filter(row => row.id!==artist.id && row.kind!=='band').map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="button secondary" disabled={action.busy}>เพิ่มสมาชิก</button></form> : <p className="muted">เพิ่มความสัมพันธ์จากโปรไฟล์วงที่ศิลปินเป็นสมาชิก</p>}</section>
    <section className="panel"><h3>แหล่งข้อมูลประวัติ</h3><div className="admin-records">{artist.sources?.map(source => <div className="admin-record" key={source.source_url}><a href={source.source_url} target="_blank" rel="noreferrer">{source.label}</a><button type="button" className="button secondary" disabled={action.busy} onClick={() => { if (window.confirm('เอาแหล่งนี้ออกจากรายการแหล่งข้อมูล? อ้างอิงในประวัติเดิมจะยังอยู่')) void action.run(async () => { await api(path+'/sources',{ method: 'DELETE',body: JSON.stringify({ url: source.source_url }) }); await refresh(); }); }}>เอาแหล่งออก</button></div>)}</div><form className="budget-form spaced" onSubmit={event => { event.preventDefault(); void action.run(async () => { await api(path+'/sources',{ method: 'PUT',body: JSON.stringify({ url: sourceUrl,label: sourceLabel }) }); setSourceUrl(''); setSourceLabel(''); await refresh(); }); }}><label>URL แหล่งข้อมูล<input type="url" value={sourceUrl} required onChange={event => setSourceUrl(event.target.value)}/></label><label>ชื่อแหล่งข้อมูล<input value={sourceLabel} required maxLength={160} onChange={event => setSourceLabel(event.target.value)}/></label><button className="button secondary" disabled={action.busy}>เพิ่มแหล่งข้อมูล</button></form></section></div>
    {action.feedback}<div className="spaced"><ArtistEditor key={artist.id} artist={artist} onSaved={saved => { onSaved({ ...artist,...saved }); onChange(); }} onReload={onReload}/></div>
  </section>;
}

type ConcertDetail = Concert & { official_url?: string; ends_at?: string; description?: string; edit_version?: string };
export function ConcertManagement({ onChange }: Changed) {
  const [q,setQ] = useState(''),[page,setPage] = useState(1),[selected,setSelected] = useState<ConcertDetail | null>(null),[adding,setAdding] = useState(false);
  const list = useData<Page<ConcertDetail>>('/concerts?'+new URLSearchParams({ q,page: String(page),includePast: 'true' }));
  const action = useAction();
  return <><div className="admin-editor-layout"><section className="panel"><h2>คอนเสิร์ตทั้งหมด</h2><label className="editor-search">ค้นหาคอนเสิร์ต<input value={q} onChange={event => { setQ(event.target.value); setPage(1); }}/></label><div className="editor-artist-list">{list.data?.items.map(row => <button type="button" disabled={action.busy} key={row.id} onClick={() => void action.run(async () => { setSelected(await api<ConcertDetail>('/concerts/'+row.slug)); setAdding(false); },'โหลดข้อมูลแล้ว')}>{row.title}<small>{date(row.starts_at,row.time_tba)} · {row.country_code}</small></button>)}</div>{list.error && <p className="notice error">{list.error}</p>}<Pager page={page} total={list.data?.total} onPage={setPage}/></section><section className="panel"><h2>ดูแลงานคอนเสิร์ต</h2><p>ค้นหาเพื่อแก้ชื่อ สถานที่ วันเวลา สถานะ ราคา และศิลปินที่แสดง งานเก่าทั้งหมดค้นหาได้</p><button type="button" className="button primary" onClick={() => { setAdding(true); setSelected(null); }}>เพิ่มคอนเสิร์ต</button>{action.feedback}</section></div>
    {(selected || adding) && <ConcertForm key={selected?.id || 'new'} concert={selected} onSaved={row => { setSelected(row); setAdding(false); void list.reload(); onChange(); }}/>}</>;
}
function localTime(value?: string | null) { if (!value) return ''; return new Date(new Date(value).getTime()+7*60*60*1000).toISOString().slice(0,16); }
function ConcertForm({ concert,onSaved }: { concert: ConcertDetail | null; onSaved: (row: ConcertDetail) => void }) {
  const [title,setTitle] = useState(concert?.title || ''),[venue,setVenue] = useState(concert?.venue || ''),[city,setCity] = useState(concert?.city || ''),[country,setCountry] = useState(concert?.country_code || 'TH');
  const [starts,setStarts] = useState(localTime(concert?.starts_at)),[ends,setEnds] = useState(localTime(concert?.ends_at)),[status,setStatus] = useState(concert?.status || 'scheduled'),[timeTba,setTimeTba] = useState(concert?.time_tba || false);
  const [min,setMin] = useState(concert?.price_min ?? ''),[max,setMax] = useState(concert?.price_max ?? ''),[official,setOfficial] = useState(concert?.official_url || ''),[description,setDescription] = useState(concert?.description || '');
  const [currency,setCurrency] = useState(concert?.currency || 'THB');
  const [q,setQ] = useState(''),[artistId,setArtistId] = useState('');
  const artists = useData<Page<Artist>>('/artists?'+new URLSearchParams({ q }));
  const action = useAction();
  useEffect(() => {
    if (!concert) return;
    setTitle(concert.title); setVenue(concert.venue || ''); setCity(concert.city || ''); setCountry(concert.country_code);
    setStarts(localTime(concert.starts_at)); setEnds(localTime(concert.ends_at)); setStatus(concert.status); setTimeTba(!!concert.time_tba);
    setMin(concert.price_min ?? ''); setMax(concert.price_max ?? ''); setOfficial(concert.official_url || ''); setDescription(concert.description || ''); setCurrency(concert.currency);
  },[concert]);
  async function refresh() { if (concert) onSaved(await api<ConcertDetail>('/concerts/'+concert.slug)); }
  return <section className="panel spaced"><h2>{concert ? 'แก้คอนเสิร์ต '+concert.title : 'เพิ่มงานคอนเสิร์ต'}</h2><form className="budget-form" onSubmit={event => { event.preventDefault(); void action.run(async () => {
    const body = { title,venue,city,countryCode: country,startsAt: starts ? new Date(starts+'+07:00').toISOString() : null,endsAt: ends ? new Date(ends+'+07:00').toISOString() : null,timeTba,status,priceMin: min==='' ? null : Number(min),priceMax: max==='' ? null : Number(max),currency,officialUrl: official || null,description,editVersion: concert?.edit_version };
    const saved = await api<ConcertDetail>('/admin/concerts'+(concert ? '/'+concert.id : ''),{ method: concert ? 'PATCH' : 'POST',body: JSON.stringify(body) });
    onSaved(await api<ConcertDetail>('/concerts/'+saved.slug));
  }); }}><fieldset className="editor-fields admin-form-grid" disabled={action.busy}><label>ชื่องาน<input required value={title} maxLength={500} onChange={event => setTitle(event.target.value)}/></label><label>สถานที่<input value={venue} onChange={event => setVenue(event.target.value)}/></label><label>เมือง<input value={city} onChange={event => setCity(event.target.value)}/></label><label>ประเทศ (รหัส 2 ตัว)<input required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={event => setCountry(event.target.value.toUpperCase())}/></label><label>วันเริ่ม (เวลาไทย)<input type="datetime-local" value={starts} onChange={event => setStarts(event.target.value)}/></label><label>วันสิ้นสุด (เวลาไทย)<input type="datetime-local" value={ends} onChange={event => setEnds(event.target.value)}/></label><label className="editor-confirm"><input type="checkbox" checked={timeTba} onChange={event => setTimeTba(event.target.checked)}/>ยังไม่ประกาศเวลาแสดง</label><label>สถานะงาน<select value={status} onChange={event => setStatus(event.target.value)}><option value="scheduled">ตามกำหนด</option><option value="postponed">เลื่อน</option><option value="cancelled">ยกเลิก</option><option value="completed">จบแล้ว</option></select></label><label>ราคาต่ำสุด ({currency})<input type="number" min="0" step="0.01" value={min} onChange={event => setMin(event.target.value)}/></label><label>ราคาสูงสุด ({currency})<input type="number" min="0" step="0.01" value={max} onChange={event => setMax(event.target.value)}/></label><label>สกุลเงิน<input required pattern="[A-Za-z]{3}" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())}/></label><label>ลิงก์ผู้จัด / บัตร<input type="url" value={official} onChange={event => setOfficial(event.target.value)}/></label><label>รายละเอียด<textarea value={description} maxLength={20000} rows={3} onChange={event => setDescription(event.target.value)}/></label><p className="muted">เว้นราคาเมื่อยังไม่ทราบ วันเวลาที่กรอกใช้เวลาไทย งานรอบเดียวจะปรับวันตามงาน ส่วนงานหลายรอบให้แก้แต่ละรอบด้านล่าง</p><button className="button primary">บันทึกคอนเสิร์ต</button></fieldset></form>
    {concert && <><h3 className="spaced">ศิลปินที่แสดง</h3><div className="admin-records">{concert.artists?.map(row => <div className="admin-record" key={row.id}><span>{row.name}</span><button type="button" className="button secondary" disabled={action.busy} onClick={() => { if (window.confirm('เอาศิลปินออกจากงานนี้?')) void action.run(async () => { await api('/admin/concerts/'+concert.id+'/artists/'+row.id,{ method: 'DELETE' }); await refresh(); }); }}>เอาออกจากงาน</button></div>)}</div><form className="budget-form spaced" onSubmit={event => { event.preventDefault(); void action.run(async () => { await api('/admin/concerts/'+concert.id+'/artists/'+artistId,{ method: 'PUT' }); setArtistId(''); await refresh(); }); }}><label>ค้นหาศิลปินสำหรับงาน<input value={q} onChange={event => { setQ(event.target.value); setArtistId(''); }}/></label><label>เลือกศิลปินที่แสดง<select required value={artistId} onChange={event => setArtistId(event.target.value)}><option value="">เลือกศิลปิน</option>{artists.data?.items.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="button secondary" disabled={action.busy}>เชื่อมศิลปินกับงาน</button></form><button type="button" className="button secondary spaced" disabled={action.busy} onClick={() => void action.run(refresh,'โหลดข้อมูลล่าสุดแล้ว')}>โหลดคอนเสิร์ตล่าสุด (แทนที่ร่าง)</button><PerformanceManagement concert={concert} onChange={() => void refresh()}/><Link className="text-link" href={'/concerts/'+concert.slug}>ดูหน้างาน ↗</Link></>}{action.feedback}</section>;
}
function PerformanceManagement({ concert,onChange }: { concert: ConcertDetail } & Changed) {
  const [editing,setEditing] = useState(''),[start,setStart] = useState(''),[end,setEnd] = useState(''),[label,setLabel] = useState(''),[status,setStatus] = useState('scheduled'),[current,setCurrent] = useState(true),[tba,setTba] = useState(false);
  const action = useAction();
  function reset() { setEditing(''); setStart(''); setEnd(''); setLabel(''); setStatus('scheduled'); setCurrent(true); setTba(false); }
  return <section className="spaced"><h3>รอบแสดง</h3><p className="muted">เก็บรอบเดิมไว้ได้โดยเอาเครื่องหมาย “รอบที่ใช้อยู่” ออก รอบปัจจุบันใช้คำนวณวันเริ่มและวันสิ้นสุดของงาน</p><div className="admin-records">{concert.performances?.map(row => <div className="admin-record" key={row.id}><div><strong>{row.performance_label || 'รอบแสดง'}</strong><small>{date(row.starts_at,row.time_tba)} · {row.status} · {row.is_current ? 'ใช้อยู่' : 'ประวัติเดิม'}</small></div><button type="button" className="button secondary" disabled={action.busy} onClick={() => { setEditing(row.id); setStart(localTime(row.starts_at)); setEnd(localTime(row.ends_at)); setLabel(row.performance_label || ''); setStatus(row.status); setCurrent(row.is_current); setTba(row.time_tba); }}>แก้รอบ</button></div>)}</div>
    <form className="budget-form spaced" onSubmit={event => { event.preventDefault(); void action.run(async () => {
      await api('/admin/concerts/'+concert.id+'/performances'+(editing ? '/'+editing : ''),{ method: editing ? 'PATCH' : 'POST',body: JSON.stringify({ startsAt: new Date(start+'+07:00').toISOString(),endsAt: end ? new Date(end+'+07:00').toISOString() : null,label,status,isCurrent: current,timeTba: tba }) }); reset(); onChange();
    }); }}><fieldset className="editor-fields admin-form-grid" disabled={action.busy}><label>ชื่อรอบ<input value={label} onChange={event => setLabel(event.target.value)}/></label><label>วันเวลารอบ (เวลาไทย)<input type="datetime-local" required value={start} onChange={event => setStart(event.target.value)}/></label><label>สิ้นสุดรอบ (เวลาไทย)<input type="datetime-local" value={end} onChange={event => setEnd(event.target.value)}/></label><label>สถานะรอบ<select value={status} onChange={event => setStatus(event.target.value)}><option value="scheduled">ตามกำหนด</option><option value="postponed">เลื่อน</option><option value="cancelled">ยกเลิก</option><option value="completed">จบแล้ว</option><option value="unknown">ไม่ทราบ</option></select></label><label className="editor-confirm"><input type="checkbox" checked={current} onChange={event => setCurrent(event.target.checked)}/>รอบที่ใช้อยู่</label><label className="editor-confirm"><input type="checkbox" checked={tba} onChange={event => setTba(event.target.checked)}/>ยังไม่ประกาศเวลารอบ</label><div className="editor-actions"><button className="button secondary">{editing ? 'บันทึกรอบแสดง' : 'เพิ่มรอบแสดง'}</button>{editing && <button type="button" onClick={reset}>ยกเลิกแก้รอบ</button>}</div></fieldset></form>{action.feedback}</section>;
}
type ModeratedNews = { id: string; artist_name: string; platform: string; source_url: string; body?: string; title?: string; hidden: boolean; published_at?: string };
export function NewsManagement({ onChange }: Changed) {
  const [q,setQ] = useState(''),[page,setPage] = useState(1);
  const list = useData<Page<ModeratedNews>>('/admin/news?'+new URLSearchParams({ q,page: String(page) }));
  const action = useAction();
  return <section className="panel"><h2>จัดการข่าว</h2><p className="muted">ซ่อนหรือคืนข่าวจากฟีดและคำตอบ AI โดยยังเก็บโพสต์ต้นฉบับและสื่อที่อ้างอิงไว้</p><label className="editor-search">ค้นหาข่าว / ศิลปิน<input value={q} onChange={event => { setQ(event.target.value); setPage(1); }}/></label>{list.error && <p className="notice error">{list.error}</p>}<div className="admin-records">{list.data?.items.map(row => <article className="admin-record" key={row.id}><div><strong>{row.artist_name} · {row.platform} {row.hidden ? '· ซ่อนอยู่' : ''}</strong><small>{date(row.published_at)}</small><p>{(row.body || row.title || 'โพสต์ไม่มีข้อความ').slice(0,350)}</p><a href={row.source_url} target="_blank" rel="noreferrer">ดูโพสต์ต้นทาง ↗</a></div><button type="button" disabled={action.busy} className="button secondary" onClick={() => void action.run(async () => { await api('/admin/news/'+row.id,{ method: 'PATCH',body: JSON.stringify({ hidden: !row.hidden }) }); void list.reload(); onChange(); })}>{row.hidden ? 'คืนข่าว' : 'ซ่อนข่าว'}</button></article>)}</div>{!list.loading && !list.data?.items.length && <p className="empty">ไม่พบข่าว</p>}<Pager page={page} total={list.data?.total} onPage={setPage}/>{action.feedback}</section>;
}
type ManagedUser = { id: string; email: string; display_name: string; role: string; active_sessions: number };
export function UserManagement({ userId }: { userId: string }) {
  const [q,setQ] = useState(''),[page,setPage] = useState(1);
  const list = useData<Page<ManagedUser>>('/admin/users?'+new URLSearchParams({ q,page: String(page) }));
  const action = useAction();
  return <section className="panel"><h2>บัญชีผู้ใช้และสิทธิ์</h2><p className="muted">เปลี่ยนสิทธิ์หรือออกจากระบบทุกอุปกรณ์ได้ เมื่อเปลี่ยนสิทธิ์ผู้ใช้ต้องเข้าสู่ระบบใหม่</p><label className="editor-search">ค้นหาผู้ใช้<input value={q} onChange={event => { setQ(event.target.value); setPage(1); }}/></label>{list.error && <p className="notice error">{list.error}</p>}<div className="admin-records">{list.data?.items.map(user => <div className="admin-record" key={user.id}><div><strong>{user.display_name}{user.id===userId ? ' (คุณ)' : ''}</strong><small>{user.email}</small><p>{user.role==='admin' ? 'ผู้ดูแล' : 'ผู้ใช้'} · {user.active_sessions} session ที่ยังไม่หมดอายุ</p></div><div className="editor-actions"><button type="button" disabled={action.busy || user.id===userId} onClick={() => { const role = user.role==='admin' ? 'user' : 'admin'; if (window.confirm('เปลี่ยนสิทธิ์ '+user.display_name+' เป็น '+(role==='admin' ? 'ผู้ดูแล' : 'ผู้ใช้')+' และให้ออกจากระบบทุกอุปกรณ์?')) void action.run(async () => { await api('/admin/users/'+user.id+'/role',{ method: 'PATCH',body: JSON.stringify({ role }) }); void list.reload(); }); }}>{user.role==='admin' ? 'เปลี่ยนเป็นผู้ใช้' : 'ตั้งเป็นผู้ดูแล'}</button><button type="button" disabled={action.busy} onClick={() => { if (window.confirm('ออกจากระบบทุกอุปกรณ์ของ '+user.display_name+'?')) void action.run(async () => { await api('/admin/users/'+user.id+'/sessions',{ method: 'DELETE' }); void list.reload(); }); }}>ออกจากระบบทุกอุปกรณ์</button></div></div>)}</div><Pager page={page} total={list.data?.total} onPage={setPage}/>{action.feedback}</section>;
}

