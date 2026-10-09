'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData, useSessionReset } from '../../components/use-data';
import { ArtistManagement, ConcertManagement, NewsManagement, UserManagement } from '../../components/admin-management';
import { CommunityManagement } from '../../components/community-management';
import { DataUsage } from '../../components/data-usage';

type Overview = { artists: number; concerts: number; news: number; hidden_news: number; users: number; pending_biographies: number };
export default function AdminPage() {
  const me = useData<{ user: { id: string; role: string } }>('/me');
  const [tab,setTab] = useState('artists'),[generation,setGeneration] = useState(0);
  useSessionReset(() => { setGeneration(value => value+1); setTab('artists'); });
  if (me.loading) return <p className="loading">กำลังตรวจสิทธิ์...</p>;
  if (me.data?.user.role !== 'admin') return <div className="container page"><h1>จัดการเว็บไซต์</h1><p className="notice error">หน้านี้สำหรับผู้ดูแลเท่านั้น กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล</p><Link href="/account" className="button primary">เข้าสู่ระบบ</Link></div>;
  return <Management key={me.data.user.id+':'+generation} userId={me.data.user.id} tab={tab} setTab={setTab}/>;
}
function Management({ userId,tab,setTab }: { userId: string; tab: string; setTab: (value: string) => void }) {
  const overview = useData<Overview>('/admin/overview');
  return <div className="container page admin-management">
    <div className="page-heading"><span className="eyebrow">ADMIN MANAGEMENT</span><h1>จัดการเว็บไซต์</h1><p>เพิ่มศิลปิน ดูแลคอนเสิร์ต ข่าว และบัญชีผู้ใช้</p><div className="editor-actions"><Link className="text-link" href="/status">สถานะตัวดึงข้อมูล / รายงาน 7 วัน</Link><Link className="text-link" href="/admin/biographies">งานประวัติ AI</Link><Link className="text-link" href="/admin/edit">หน้าแก้ประวัติและรูปเดิม</Link></div></div>
    {overview.error && <p className="notice error" role="alert">{overview.error}</p>}
    <div className="admin-metrics">{[['ศิลปิน',overview.data?.artists],['คอนเสิร์ต',overview.data?.concerts],['ข่าวทั้งหมด',overview.data?.news],['ผู้ใช้',overview.data?.users]].map(([label,count]) => <div className="panel" key={label}><span>{label}</span><strong>{count ?? '—'}</strong></div>)}</div>
    <nav className="admin-tabs" aria-label="หมวดจัดการเว็บไซต์">{[['artists','ศิลปิน'],['concerts','คอนเสิร์ต'],['news','ข่าว'],['community','ชุมชน / รีวิว'],['users','ผู้ใช้'],['usage','การดึงข้อมูล / API']].map(([value,label]) => <button type="button" key={value} aria-current={tab===value ? 'page' : undefined} className={'button '+(tab===value ? 'primary' : 'secondary')} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {tab==='artists' && <ArtistManagement onChange={() => void overview.reload()}/>}
    {tab==='concerts' && <ConcertManagement onChange={() => void overview.reload()}/>}
    {tab==='news' && <NewsManagement onChange={() => void overview.reload()}/>}
    {tab==='community' && <CommunityManagement/>}
    {tab==='users' && <UserManagement userId={userId}/>}
    {tab==='usage' && <DataUsage/>}
  </div>;
}
