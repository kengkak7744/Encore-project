'use client';
import { useData } from '../../components/use-data';
import { ConcertMonitorPanel } from '../../components/concert-monitor';
import { InstagramStatusPanel, type InstagramStatus } from '../../components/instagram-status';
import { date } from '../../lib/api';

type Source = { source_name: string; category: string; last_started_at?: string; last_success_at?: string; last_error?: string; last_count: number; enabled: boolean; stale: boolean };
type Status = {
  counts: { artists: number; concerts: number; news: number }; sources: Source[]; instagram?: InstagramStatus | null;
  worker?: { booted_at: string; last_seen_at: string; stale: boolean; ai?: { last_started_at?: string; last_finished_at?: string; last_error?: string } | null } | null;
  biography?: { pending: number; published: number; state: { enabled: boolean; window_start: string; window_end: string; last_checked_at: string; last_error?: string } | null; runs: { artist_name: string; artist_slug: string; status: string; started_at: string }[] };
};
export default function StatusPage() {
  const result = useData<Status>('/status', 60_000);
  const biography = result.data?.biography;
  const labels: Record<string, string> = { running: 'กำลังทำงาน', published: 'เพิ่มประวัติแล้ว', skipped: 'ข้ามรายการ', insufficient_sources: 'หลักฐานไม่พอ', failed: 'ทำงานไม่สำเร็จ', interrupted: 'หยุดก่อนเสร็จ' };
  return <div className="container page">
    <div className="page-heading"><span className="eyebrow">DATA TRANSPARENCY</span><h1>สถานะข้อมูล</h1><p>ระบบตรวจคอนเสิร์ตทุกชั่วโมงและข่าวตามรอบที่ตั้งไว้เมื่อ worker ทำงาน หน้านี้ตรวจสถานะใหม่ทุก 1 นาทีเมื่อเปิดอยู่ รอบตรวจไม่ได้รับประกันว่าประกาศจะปรากฏทันที</p></div>
    {result.error && <p className="notice error">{result.error}</p>}
    <div className="stat-row">
      <div><strong>{result.data?.counts.artists ?? '—'}</strong><span>โปรไฟล์</span></div>
      <div><strong>{result.data?.counts.concerts ?? '—'}</strong><span>คอนเสิร์ต</span></div>
      <div><strong>{result.data?.counts.news ?? '—'}</strong><span>โพสต์ข่าว</span></div>
    </div>
    <InstagramStatusPanel state={result.data?.instagram}/>
    {result.data && <section className="section">
      <h2>รอบตรวจอัตโนมัติ</h2>
      <p className={result.data.worker && !result.data.worker.stale ? 'notice' : 'notice error'}>{result.data.worker ? `${result.data.worker.stale ? 'worker อาจหยุดทำงาน' : 'worker ติดต่อได้'} · ติดต่อครั้งล่าสุด ${date(result.data.worker.last_seen_at)}` : 'ยังไม่พบการติดต่อจาก worker'}</p>
      <p className="muted">คอนเสิร์ต ข่าว และงาน AI ทำงานแยกกัน เครื่องและ Docker ต้องเปิดอยู่เพื่อเดินรอบต่อเนื่อง เมื่อปิดเครื่อง รายงานจะเก็บรอบที่ขาดไว้</p>
      {result.data.worker?.ai?.last_error && <p className="notice error">งาน AI ไม่สำเร็จ · ลองใหม่ตามรอบชั่วโมง ข้อมูลที่เก็บไว้ยังเปิดดูได้</p>}
    </section>}
    {biography && <section className="section">
      <h2>เพิ่มประวัติอัตโนมัติ</h2>
      <p>{biography.state?.enabled ? `ทำงานทุกวัน ${biography.state.window_start}–${biography.state.window_end} (เวลาไทย)` : 'ระบบยังไม่เปิดทำงาน'} · รอประวัติ {biography.pending} โปรไฟล์ · เพิ่มด้วย AI แล้ว {biography.published} โปรไฟล์</p>
      <p className="muted">ทำทีละศิลปินที่ยังไม่มีประวัติแบ่งหัวข้อ เก็บลิงก์ต้นทาง และลองใหม่คืนถัดไปหากข้อมูลไม่พอ เครื่องและ Docker ต้องเปิดอยู่ในช่วงเวลานี้</p>
      <p className="muted">worker ติดต่อครั้งล่าสุด {date(biography.state?.last_checked_at)}{biography.state && Date.now() - new Date(biography.state.last_checked_at).getTime() > 25 * 60_000 ? ' · อาจหยุดทำงาน' : ''}</p>
      {biography.state?.last_error && <p className="notice error">{biography.state.last_error}</p>}
      <div className="status-list">{biography.runs.map((run) => <div key={run.artist_slug + run.started_at} className="status-item"><a href={'/artists/' + run.artist_slug}>{run.artist_name}</a><span>{labels[run.status] || run.status} · {date(run.started_at)}</span></div>)}</div>
    </section>}
    <ConcertMonitorPanel/>
    <h2>ผลตรวจแต่ละแหล่ง</h2>
    <div className="status-list">{result.data?.sources.map((source) => <div key={source.source_name} className="status-item">
      <div><strong>{source.source_name}</strong><small>{source.category === 'news' ? 'ข่าว' : source.category === 'travel' ? 'เดินทาง' : 'คอนเสิร์ต'} · ตรวจล่าสุด {date(source.last_started_at)}</small></div>
      <div>
        <span className={source.enabled ? 'status-dot ' + (source.last_error || source.stale ? 'bad' : 'good') : 'muted'}>{!source.enabled ? 'เลิกใช้งาน' : source.last_error ? 'ต้องตรวจสอบ' : source.stale ? 'อาจล้าสมัย' : 'ทำงานได้'}</span>
        <small>สำเร็จล่าสุด {date(source.last_success_at)} · {source.last_count} รายการ</small>
        {source.enabled && source.last_error && <small className="error-text">{source.last_error}</small>}
      </div>
    </div>)}</div>
    {result.data?.sources.length === 0 && <p className="empty">worker ยังไม่เริ่มตรวจแหล่งข้อมูล</p>}
  </div>;
}
