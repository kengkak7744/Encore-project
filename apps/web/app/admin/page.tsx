'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../../components/use-data';

type Me = { user: { role: string } };
export default function AdminPage() {
  const me = useData<Me>('/me'); const [type, setType] = useState<'artist' | 'concert'>('artist'); const [slug, setSlug] = useState(''); const [name, setName] = useState(''); const [kind, setKind] = useState('solo'); const [city, setCity] = useState(''); const [date, setDate] = useState(''); const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) { event.preventDefault(); try { if (type === 'artist') await api('/admin/artists', { method: 'POST', body: JSON.stringify({ slug, name, kind }) }); else await api('/admin/concerts', { method: 'POST', body: JSON.stringify({ slug, title: name, city, startsAt: date || null }) }); setMessage('บันทึกสำเร็จ'); setSlug(''); setName(''); } catch (err) { setMessage((err as Error).message); } }
  if (me.loading) return <p className="loading">กำลังตรวจสิทธิ์...</p>;
  if (me.data?.user.role !== 'admin') return <div className="container page"><p className="notice error">หน้านี้สำหรับผู้ดูแลเท่านั้น</p></div>;
  return <div className="container page"><div className="page-heading"><span className="eyebrow">ADMIN</span><h1>จัดการข้อมูล</h1><p>เพิ่มรายการที่ตกหล่นและแก้ไขข้อมูลผ่าน API ผู้ดูแล</p></div><div className="auth-box"><div className="auth-switch"><button className={type === 'artist' ? 'active' : ''} onClick={() => setType('artist')}>เพิ่มศิลปิน</button><button className={type === 'concert' ? 'active' : ''} onClick={() => setType('concert')}>เพิ่มคอนเสิร์ต</button></div><form onSubmit={submit}><label>Slug (a-z, 0-9, -)<input value={slug} onChange={(e) => setSlug(e.target.value)} required/></label><label>{type === 'artist' ? 'ชื่อศิลปิน' : 'ชื่อคอนเสิร์ต'}<input value={name} onChange={(e) => setName(e.target.value)} required/></label>{type === 'artist' ? <label>ประเภท<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="solo">ศิลปินเดี่ยว</option><option value="band">วงดนตรี</option><option value="member">สมาชิกวง</option></select></label> : <><label>เมือง<input value={city} onChange={(e) => setCity(e.target.value)}/></label><label>วันเวลา<input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}/></label></>}<button className="button primary">บันทึก</button></form>{message && <p className="inline-message">{message}</p>}</div></div>;
}
