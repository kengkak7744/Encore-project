'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type EditableArtist } from '../lib/api';
import { ArtistPortrait } from './artist-portrait';
import { useSessionReset } from './use-data';

type SectionDraft = { key: string; heading: string; body: string; sourceUrl: string; sourceLabel: string };
type Props = { artist: EditableArtist; onSaved: (artist: EditableArtist) => void; onReload: () => void };
const sectionsFor = (artist: EditableArtist): SectionDraft[] => (artist.biography || []).map(row => ({ key: String(row.position),heading: row.heading,body: row.body,sourceUrl: row.source_url,sourceLabel: row.source_label }));
const publicUrl = (value: string) => {
  if (/^\/(?:artist-images\/[a-z0-9._-]+\.(?:png|jpg|jpeg|webp)|api\/artist-images\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : ''; } catch { return ''; }
};

export function ArtistEditor({ artist,onSaved,onReload }: Props) {
  const active = useRef(true);
  useSessionReset(() => { active.current = false; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; },[]);
  const [name,setName] = useState(artist.name),[bio,setBio] = useState(artist.bio || '');
  const [sections,setSections] = useState(sectionsFor(artist));
  const [imageMode,setImageMode] = useState('keep'),[file,setFile] = useState<File | null>(null),[preview,setPreview] = useState('');
  const [url,setUrl] = useState(artist.image_url || ''),[creator,setCreator] = useState(''),[title,setTitle] = useState(''),[source,setSource] = useState('');
  const [rights,setRights] = useState('own'),[license,setLicense] = useState(''),[licenseUrl,setLicenseUrl] = useState(''),[photoDate,setPhotoDate] = useState('ไม่ทราบวันถ่าย'),[caption,setCaption] = useState(''),[changes,setChanges] = useState('');
  const [confirmed,setConfirmed] = useState(false),[saving,setSaving] = useState(false),[message,setMessage] = useState(''),[error,setError] = useState('');
  useEffect(() => {
    setName(artist.name); setBio(artist.bio || ''); setSections(sectionsFor(artist)); setImageMode('keep'); setFile(null); setUrl(artist.image_url || '');
    const credit = artist.image_credit;
    setCreator(credit?.creator || ''); setTitle(credit?.title || 'ภาพโปรไฟล์ ' + artist.name);
    setSource(credit?.source_url.startsWith('https:') ? credit.source_url : '');
    setRights(credit?.license.startsWith('ภาพถ่ายเอง') ? 'own' : credit?.license.startsWith('ได้รับอนุญาต') ? 'permission' : credit ? 'license' : 'own');
    setLicense(credit?.license || ''); setLicenseUrl(credit?.license_url || ''); setPhotoDate(credit?.photo_date || 'ไม่ทราบวันถ่าย');
    setCaption(artist.image_review?.caption || ''); setChanges(credit?.changes || 'แสดงภาพเต็มโดยไม่ตัดหรือแต่งภาพ'); setConfirmed(false);
  },[artist]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(file); setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  },[file]);
  function changeSection(index: number,field: keyof Omit<SectionDraft,'key'>,value: string) {
    setSections(rows => rows.map((row,n) => n === index ? { ...row,[field]: value } : row));
  }
  function move(index: number,direction: number) {
    setSections(rows => { const next = [...rows]; [next[index],next[index+direction]] = [next[index+direction],next[index]]; return next; });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError(''); setMessage('');
    try {
      const body: Record<string,unknown> = { name,editVersion: artist.edit_version };
      if (bio !== (artist.bio || '')) body.bio = bio;
      const draft = sections.map(({ key,...row }) => row);
      const original = sectionsFor(artist).map(({ key,...row }) => row);
      if (JSON.stringify(draft) !== JSON.stringify(original)) body.biography = draft;
      if (imageMode === 'remove') body.image = null;
      if (imageMode === 'upload' || imageMode === 'url') {
        let upload;
        if (imageMode === 'upload') {
          if (!file) throw Error('กรุณาเลือกไฟล์รูป');
          const data = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(Error('อ่านไฟล์รูปไม่สำเร็จ')); reader.readAsDataURL(file); });
          if (!active.current) return;
          upload = { contentType: file.type,data };
        }
        body.image = { ...(upload ? { file: upload } : { url }),creator,title,sourceUrl: source,rights,license,licenseUrl,photoDate,caption,changes,confirmRights: confirmed };
      }
      const saved = await api<EditableArtist>('/admin/artists/' + artist.id,{ method: 'PATCH',body: JSON.stringify(body) });
      if (active.current) { onSaved({ ...artist,...saved }); setMessage('บันทึกประวัติและรูปโปรไฟล์แล้ว'); }
    } catch (failure) { setError((failure as Error).message); }
    finally { setSaving(false); }
  }
  return <section className="panel artist-editor">
    <h2>แก้ไข {artist.name}</h2>
    <p><Link href={'/artists/' + artist.slug} target="_blank" className="text-link">ดูหน้าโปรไฟล์ ↗</Link></p>
    <form className="budget-form" onSubmit={save}>
      <fieldset disabled={saving} className="editor-fields">
        <legend className="sr-only">ข้อมูลศิลปิน</legend>
        <label>ชื่อศิลปิน<input value={name} maxLength={200} onChange={event => setName(event.target.value)} required/></label>
        <label>ประวัติสั้น<textarea aria-label="ประวัติสั้น" value={bio} maxLength={10000} onChange={event => setBio(event.target.value)} rows={4}/></label>
        <h3>ประวัติเป็นหัวข้อ</h3>
        <p className="muted">แก้เนื้อหาและแหล่งอ้างอิง เพิ่ม ลบ หรือจัดลำดับหัวข้อได้ เมื่อบันทึกจะถือว่าผู้ดูแลตรวจทานประวัติชุดนี้แล้ว</p>
        {sections.map((section,index) => <fieldset className="editor-section" key={section.key}>
          <legend>หัวข้อที่ {index + 1}</legend>
          <label>หัวข้อ {index + 1}<input value={section.heading} maxLength={300} onChange={event => changeSection(index,'heading',event.target.value)} required/></label>
          <label>เนื้อหาหัวข้อ {index + 1}<textarea aria-label={'เนื้อหาหัวข้อ ' + (index + 1)} value={section.body} maxLength={20000} rows={6} onChange={event => changeSection(index,'body',event.target.value)} required/></label>
          <label>URL แหล่งข้อมูลหัวข้อ {index + 1}<input type="url" value={section.sourceUrl} onChange={event => changeSection(index,'sourceUrl',event.target.value)} placeholder="https://..." required/></label>
          <label>ชื่อแหล่งข้อมูลหัวข้อ {index + 1}<input value={section.sourceLabel} maxLength={200} onChange={event => changeSection(index,'sourceLabel',event.target.value)} required/></label>
          <div className="editor-actions">
            <button type="button" disabled={index === 0} onClick={() => move(index,-1)} aria-label={'เลื่อนหัวข้อ ' + (index+1) + ' ขึ้น'}>ขึ้น</button>
            <button type="button" disabled={index === sections.length-1} onClick={() => move(index,1)} aria-label={'เลื่อนหัวข้อ ' + (index+1) + ' ลง'}>ลง</button>
            <button type="button" onClick={() => setSections(rows => rows.filter((_,n) => n !== index))} aria-label={'ลบหัวข้อ ' + (index+1)}>ลบหัวข้อ</button>
          </div>
        </fieldset>)}
        {!sections.length && <p className="notice">ไม่มีหัวข้อประวัติ หัวข้อที่ผู้ดูแลลบแล้วบันทึกจะไม่ถูกเติมกลับอัตโนมัติ</p>}
        <button className="button secondary" type="button" disabled={sections.length >= 30} onClick={() => setSections(rows => [...rows,{ key: crypto.randomUUID(),heading: '',body: '',sourceUrl: '',sourceLabel: '' }])}>เพิ่มหัวข้อประวัติ</button>
        <h3>รูปโปรไฟล์</h3>
        <label>จัดการรูป<select aria-label="จัดการรูป" value={imageMode} onChange={event => { setImageMode(event.target.value); setConfirmed(false); setError(''); }}>
          <option value="keep">คงรูปเดิม</option><option value="upload">อัปโหลดจากเครื่อง</option><option value="url">ใช้ URL / แก้เครดิตรูป</option><option value="remove">ลบรูปโปรไฟล์</option>
        </select></label>
        {imageMode === 'keep' && <div className="editor-preview"><ArtistPortrait artist={artist} detail/></div>}
        {imageMode === 'remove' && <p className="notice">บันทึกแล้วจะแสดงสัญลักษณ์แทนรูป</p>}
        {imageMode === 'upload' && <label>ไฟล์รูป JPG, PNG หรือ WebP (ไม่เกิน 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const selected = event.target.files?.[0]; setFile(null); setConfirmed(false); setError('');
          if (!selected) return;
          if (selected.size > 2097152 || !['image/jpeg','image/png','image/webp'].includes(selected.type)) { setError('เลือกไฟล์ JPG, PNG หรือ WebP ไม่เกิน 2 MB'); event.target.value = ''; return; }
          setFile(selected);
        }}/></label>}
        {imageMode === 'url' && <label>URL รูปโปรไฟล์<input value={url} onChange={event => { setUrl(event.target.value); setConfirmed(false); }} placeholder="https://..." required/></label>}
        {['upload','url'].includes(imageMode) && <>
          {(imageMode === 'upload' ? preview : publicUrl(url)) && <div className="editor-preview"><img src={imageMode === 'upload' ? preview : publicUrl(url)} alt="ตัวอย่างรูปโปรไฟล์ก่อนบันทึก"/></div>}
          <label>สิทธิ์ใช้ภาพ<select aria-label="สิทธิ์ใช้ภาพ" value={rights} onChange={event => setRights(event.target.value)}><option value="own">ภาพถ่ายเอง</option><option value="permission">ได้รับอนุญาตจากเจ้าของภาพ</option><option value="license">มีใบอนุญาตใช้ซ้ำ</option></select></label>
          <label>ชื่อผู้ถ่าย / เจ้าของภาพ<input value={creator} maxLength={200} onChange={event => setCreator(event.target.value)} required/></label>
          <label>ชื่อภาพ<input value={title} maxLength={500} onChange={event => setTitle(event.target.value)} required/></label>
          <label>แหล่งภาพ HTTPS (ถ้ามี)<input type="url" value={source} onChange={event => setSource(event.target.value)} placeholder="https://..."/></label>
          {rights === 'license' && <label>ชื่อใบอนุญาต<input value={license} maxLength={200} onChange={event => setLicense(event.target.value)} placeholder="เช่น CC BY 4.0" required/></label>}
          <label>{rights === 'license' ? 'URL ใบอนุญาต' : 'URL หลักฐานอนุญาต (ถ้ามี)'}<input type="url" value={licenseUrl} onChange={event => setLicenseUrl(event.target.value)} placeholder="https://..." required={rights === 'license'}/></label>
          <label>วันถ่าย / ช่วงเวลาของภาพ<input value={photoDate} maxLength={120} onChange={event => setPhotoDate(event.target.value)} required/></label>
          <label>คำอธิบายภาพ<input value={caption} maxLength={1000} onChange={event => setCaption(event.target.value)} placeholder="ระบุเมื่อเป็นภาพเก่า ภาพวง หรือมีบุคคลอื่นร่วมภาพ"/></label>
          <label>การปรับภาพ<textarea aria-label="การปรับภาพ" value={changes} maxLength={1000} rows={2} onChange={event => setChanges(event.target.value)}/></label>
          <label className="editor-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/>ฉันตรวจแล้วว่ามีสิทธิ์ใช้ภาพนี้และข้อมูลเครดิตถูกต้อง</label>
        </>}
        <button className="button primary" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึกแก้ไข'}</button>
      </fieldset>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <button type="button" className="text-link editor-reload" disabled={saving} onClick={onReload}>โหลดข้อมูลล่าสุด (แทนที่ร่างในฟอร์ม)</button>
  </section>;
}
