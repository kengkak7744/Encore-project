'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type Artist, type EditableArtist, type Page } from '../../../lib/api';
import { useData, useSessionReset } from '../../../components/use-data';
import { ArtistEditor } from '../../../components/artist-editor';

type ConcertItem = { id: string; title: string; venue?: string; city?: string; status?: string; price_min?: string | null };
export default function EditPage() {
  const me = useData<{ user: { id: string; role: string } }>('/me');
  const [kind,setKind] = useState<'artists' | 'concerts'>('artists');
  const [slug,setSlug] = useState(''),[artist,setArtist] = useState<EditableArtist | null>(null),[concert,setConcert] = useState<ConcertItem | null>(null);
  const [search,setSearch] = useState(''),[loading,setLoading] = useState(false),[saving,setSaving] = useState(false),[message,setMessage] = useState('');
  const [name,setName] = useState(''),[venue,setVenue] = useState(''),[city,setCity] = useState(''),[status,setStatus] = useState('scheduled'),[priceMin,setPriceMin] = useState('');
  const [platform,setPlatform] = useState('x'),[accountUrl,setAccountUrl] = useState(''),[externalId,setExternalId] = useState('');
  const sequence = useRef(0);
  const found = useData<Page<Artist>>('/artists?' + new URLSearchParams({ q: search }));
  function clear() { sequence.current++; setArtist(null); setConcert(null); setSlug(''); setSearch(''); setName(''); setVenue(''); setCity(''); setPriceMin(''); setAccountUrl(''); setExternalId(''); setMessage(''); setLoading(false); setSaving(false); }
  useSessionReset(clear);
  useEffect(() => { if (me.data?.user.role !== 'admin') clear(); },[me.data?.user.id,me.data?.user.role]);
  async function load(value = slug) {
    const request = ++sequence.current; setLoading(true); setMessage(''); setArtist(null); setConcert(null);
    try {
      if (kind === 'artists') { const data = await api<EditableArtist>('/artists/' + encodeURIComponent(value.trim())); if (request === sequence.current) { setArtist(data); setSlug(data.slug); } }
      else { const data = await api<ConcertItem>('/concerts/' + encodeURIComponent(value.trim())); if (request === sequence.current) { setConcert(data); setName(data.title); setVenue(data.venue || ''); setCity(data.city || ''); setStatus(data.status || 'scheduled'); setPriceMin(data.price_min || ''); } }
    } catch (error) { if (request === sequence.current) setMessage((error as Error).message); }
    finally { if (request === sequence.current) setLoading(false); }
  }
  async function saveConcert(event: React.FormEvent) {
    event.preventDefault(); if (!concert || saving) return; setSaving(true); setMessage('');
    try { await api('/admin/concerts/' + concert.id,{ method: 'PATCH',body: JSON.stringify({ title: name,venue,city,status,priceMin: priceMin ? Number(priceMin) : null }) }); setMessage('บันทึกการแก้ไขแล้ว'); }
    catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }
  async function saveAccount(event: React.FormEvent) {
    event.preventDefault(); if (!artist || saving) return; setSaving(true); setMessage('');
    try { await api('/admin/artists/' + artist.id + '/accounts',{ method: 'PUT',body: JSON.stringify({ platform,url: accountUrl,externalId: externalId || null }) }); setMessage('เพิ่มบัญชีทางการแล้ว'); setAccountUrl(''); }
    catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }
  if (me.loading) return <p className="loading">กำลังตรวจสิทธิ์...</p>;
  if (me.data?.user.role !== 'admin') return <div className="container page"><p className="notice error">หน้านี้สำหรับผู้ดูแลเท่านั้น</p></div>;
  return <div className="container page">
    <div className="page-heading"><span className="eyebrow">ADMIN</span><h1>แก้ไขข้อมูล</h1><p><Link href="/admin" className="text-link">← กลับหน้าผู้ดูแล</Link></p></div>
    <div className="admin-editor-layout">
      <section className="panel"><h2>ค้นหารายการ</h2>
        <form className="budget-form" onSubmit={event => { event.preventDefault(); void load(); }}>
          <label>ประเภท<select value={kind} onChange={event => { clear(); setKind(event.target.value as 'artists' | 'concerts'); }}><option value="artists">ศิลปิน</option><option value="concerts">คอนเสิร์ต</option></select></label>
          <label>Slug<input value={slug} onChange={event => setSlug(event.target.value)} placeholder="จาก URL ของรายการ" required/></label>
          <button className="button primary" disabled={loading}>{loading ? 'กำลังโหลด...' : 'โหลดข้อมูล'}</button>
        </form>
        {kind === 'artists' && <><h3 className="spaced">เลือกศิลปินจากชื่อ</h3><label className="editor-search">ค้นหาศิลปินเพื่อแก้ไข<input value={search} onChange={event => setSearch(event.target.value)} placeholder="เช่น Aheye, BUS"/></label>
          {found.loading && <p className="loading">กำลังค้นหา...</p>}{found.error && <p className="notice error">{found.error}</p>}
          <div className="editor-artist-list">{found.data?.items.map(row => <button key={row.id} type="button" disabled={loading} onClick={() => void load(row.slug)}>{row.name}<small>{row.slug}</small></button>)}</div>
          {!found.loading && found.data?.items.length === 0 && <p className="empty">ไม่พบศิลปิน</p>}
          {!!found.data?.total && found.data.total > 20 && <p className="muted">แสดง20รายการแรก พิมพ์ชื่อเพื่อค้นหาที่เหลือ</p>}
        </>}
      </section>
      <div>
        {artist && <ArtistEditor key={artist.id} artist={artist} onSaved={setArtist} onReload={() => void load(artist.slug)}/>}
        {artist && <section className="panel spaced"><h3>บัญชีทางการที่ตรวจแล้ว</h3><form className="budget-form" onSubmit={saveAccount}>
          <label>แพลตฟอร์ม<select value={platform} onChange={event => setPlatform(event.target.value)}><option value="x">X</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="website">เว็บไซต์</option></select></label>
          <label>HTTPS URL<input type="url" value={accountUrl} onChange={event => setAccountUrl(event.target.value)} required/></label>
          <label>Page/Business ID (ถ้ามีสิทธิ์ API)<input value={externalId} onChange={event => setExternalId(event.target.value)}/></label><button className="button secondary" disabled={saving}>เพิ่มบัญชี</button>
        </form></section>}
        {concert && <section className="panel"><h2>{concert.title}</h2><form className="budget-form" onSubmit={saveConcert}>
          <label>ชื่อ<input value={name} onChange={event => setName(event.target.value)} required/></label>
          <label>สถานที่<input value={venue} onChange={event => setVenue(event.target.value)}/></label><label>เมือง<input value={city} onChange={event => setCity(event.target.value)}/></label>
          <label>สถานะ<select value={status} onChange={event => setStatus(event.target.value)}><option value="scheduled">ตามกำหนด</option><option value="postponed">เลื่อน</option><option value="cancelled">ยกเลิก</option><option value="completed">จบแล้ว</option></select></label>
          <label>ราคาต่ำสุด<input type="number" min="0" value={priceMin} onChange={event => setPriceMin(event.target.value)}/></label><button className="button primary" disabled={saving}>บันทึกแก้ไข</button>
        </form></section>}
        {!artist && !concert && <p className="empty">เลือกศิลปินหรือโหลดรายการเพื่อเริ่มแก้ไข</p>}
      </div>
    </div>{message && <p className="notice" role="status">{message}</p>}
  </div>;
}
