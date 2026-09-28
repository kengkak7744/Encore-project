'use client';
import { useData } from '../../components/use-data';
import { date } from '../../lib/api';

type Source = { source_name: string; category: string; last_started_at?: string; last_success_at?: string; last_error?: string; last_count: number; enabled: boolean; stale: boolean };
type Status = { counts: { artists: number; concerts: number; news: number }; sources: Source[] };
export default function StatusPage() {
  const result = useData<Status>('/status', 60_000);
  return <div className="container page"><div className="page-heading"><span className="eyebrow">DATA TRANSPARENCY</span><h1>สถานะข้อมูล</h1><p>ระบบตรวจคอนเสิร์ตทุกชั่วโมงและข่าวตามรอบที่ตั้งไว้เมื่อ worker ทำงาน หน้านี้ตรวจสถานะใหม่ทุก 1 นาทีเมื่อเปิดอยู่ รอบตรวจไม่ได้รับประกันว่าประกาศจะปรากฏทันที</p></div>{result.error && <p className="notice error">{result.error}</p>}<div className="stat-row"><div><strong>{result.data?.counts.artists ?? '—'}</strong><span>โปรไฟล์</span></div><div><strong>{result.data?.counts.concerts ?? '—'}</strong><span>คอนเสิร์ต</span></div><div><strong>{result.data?.counts.news ?? '—'}</strong><span>โพสต์ข่าว</span></div></div><h2>ผลตรวจแต่ละแหล่ง</h2><div className="status-list">{result.data?.sources.map((source) => <div key={source.source_name} className="status-item"><div><strong>{source.source_name}</strong><small>{source.category === 'news' ? 'ข่าว' : source.category === 'travel' ? 'เดินทาง' : 'คอนเสิร์ต'} · ตรวจล่าสุด {date(source.last_started_at)}</small></div><div><span className={'status-dot ' + (source.last_error || source.stale ? 'bad' : 'good')}>{source.last_error ? 'ต้องตรวจสอบ' : source.stale ? 'อาจล้าสมัย' : 'ทำงานได้'}</span><small>สำเร็จล่าสุด {date(source.last_success_at)} · {source.last_count} รายการ</small>{source.last_error && <small className="error-text">{source.last_error}</small>}</div></div>)}</div>{result.data?.sources.length === 0 && <p className="empty">worker ยังไม่เริ่มตรวจแหล่งข้อมูล</p>}</div>;
}
