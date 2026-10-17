'use client';
import Link from 'next/link';
import { useData } from '../../../components/use-data';
import { date } from '../../../lib/api';

type Run = { id: string; artist_name: string; artist_slug: string; status: string; model: string; started_at: string; error?: string; source_errors: { url: string; error: string }[]; source_documents: { url: string; label: string; text: string; publishedAt?:string|null; fetchedAt?:string }[]; draft?: { review?: { reason: string; checks: { index: number; supported: boolean; reason: string }[] }; sections?: { heading: string; body: string; evidence: string[] }[] } };
type Revision = { id:string; artist_name:string; artist_slug:string; reason:string; status:string; requested_at:string; completed_run_id:string|null };
const publicationDate = (value?:string|null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value)) : 'ไม่ทราบ';
export default function BiographyRunsPage() {
  const me = useData<{ user: { role: string } }>('/me');
  const runs = useData<{ items: Run[]; revisions:Revision[] }>('/admin/biography-runs', 60_000);
  if (me.loading) return <p className="loading">กำลังตรวจสิทธิ์...</p>;
  if (me.data?.user.role !== 'admin') return <div className="container page"><p className="notice error">หน้านี้สำหรับผู้ดูแลเท่านั้น</p></div>;
  return <div className="container page">
    <Link href="/admin">กลับไปจัดการข้อมูล</Link>
    <div className="page-heading"><h1>ผลเพิ่มประวัติอัตโนมัติ</h1><p>ตรวจร่าง หลักฐาน และเหตุผลของ 50 ครั้งล่าสุด ทำช่วง 23:00–00:00 รวมสูงสุด 10 ครั้งต่อคืน</p></div>
    {runs.error && <p className="notice error">{runs.error}</p>}
    {!!runs.data?.revisions?.length && <section className="panel"><h2>คำขอแก้ประวัติ AI เดิม</h2><p>เก็บข้อความเดิมไว้จนร่างใหม่ผ่านการตรวจ งานที่ admin แก้แล้วจะยกเลิกคำขออัตโนมัติ</p>
      {runs.data.revisions.map(request=><details key={request.id}><summary>{request.artist_name} · {request.status}</summary><p>{request.reason}</p><p>ขอเมื่อ {date(request.requested_at)}{request.completed_run_id && ' · งาน '+request.completed_run_id}</p><Link href={'/artists/'+request.artist_slug}>เปิดโปรไฟล์</Link></details>)}
    </section>}
    {runs.data?.items.map(run=><details key={run.id} className="section">
      <summary>{run.artist_name} · {run.status} · {date(run.started_at)}</summary>
      <p>โมเดล {run.model} · <Link href={'/artists/'+run.artist_slug}>เปิดโปรไฟล์</Link></p>
      {run.error && <p className="notice error">{run.error}</p>}
      {run.draft?.sections?.map((section,index)=><article key={index}><h3>{section.heading}</h3><p>{section.body}</p><p className="muted">หลักฐาน: {section.evidence?.join(' / ')}</p></article>)}
      {run.source_documents.map(source=><details key={source.url}><summary>{source.label}</summary><a href={source.url} target="_blank" rel="noopener noreferrer">เปิดแหล่งข้อมูล</a><p>วันที่บทความ: {publicationDate(source.publishedAt)} · อ่านเว็บ: {source.fetchedAt ? date(source.fetchedAt) : 'ไม่ทราบ'}</p><p>{source.text}</p></details>)}
      {run.source_errors.map((error,index)=><p key={index} className="error-text">{error.url}: {error.error}</p>)}
    </details>)}
    {runs.data?.items.length===0 && <p className="empty">ยังไม่มีงาน ศิลปินที่มีประวัติแล้วจะไม่เข้าคิว ยกเว้นคำขอแก้ประวัติ AI ที่ระบุไว้</p>}
  </div>;
}
