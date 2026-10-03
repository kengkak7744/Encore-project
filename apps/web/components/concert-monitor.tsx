'use client';
import { useData } from './use-data';
import { date } from '../lib/api';

type Monitor = { startedAt: string; endsAt: string; elapsedHours: number; checked: number; elapsedExpectedChecks: number; issues: number; verdict: string; cadenceVerdict: string; cadenceIssues: number;
  daily: { day: number; expected: number; checked: number; success: number; partial: number; failed: number; missing: number; other: number }[];
  rows: { source: string; status: string; startedAt: string | null; scheduledAt: string; metrics: { discovered?: number; attempted?: number; pending?: number; fetchFailures?: number } }[] };
export function ConcertMonitorPanel() {
  const result = useData<{ report: Monitor | null }>('/status/concert-monitor',60_000);
  const report = result.data?.report;
  const latest = report ? ['ThaiTicketMajor','Eventpop','The Concert','Ticketmelon'].map(source => [...report.rows].reverse().find(row => row.source === source && row.startedAt)) : [];
  return <section className="section"><h2>ติดตามรอบคอนเสิร์ต 7 วัน</h2>{result.error && <p className="notice error">{result.error}</p>}
    {!report ? <p className="muted">รอ worker เริ่มช่วงติดตาม</p> : <>
      <p>{date(report.startedAt)} – {date(report.endsAt)} (เวลาไทย)</p>
      <p><strong>{report.verdict === 'collecting' ? 'กำลังเก็บผล ยังไม่ครบ 7 วัน' : report.verdict === 'passed' ? 'ครบ 7 วัน ทุกแหล่งสำเร็จตามรอบ' : 'ครบช่วงติดตาม มีรายการที่ต้องตรวจสอบ'}</strong></p>
      <p>ครบแล้ว {report.elapsedHours}/168 ชั่วโมง · ตรวจจริง {report.checked}/{report.elapsedExpectedChecks} รอบแหล่งข้อมูลที่ถึงกำหนดแล้ว · ต้องตรวจสอบ {report.issues} รอบ</p>
      <p className="muted">รอบตรวจตามเวลา: {report.cadenceVerdict === 'passed' ? 'ครบทุกชั่วโมง' : report.cadenceVerdict === 'needs_review' ? 'มีรอบที่ขาด ล่าช้า หรือไม่จบ' : 'กำลังติดตาม'} · ขาด/ล่าช้า/ไม่จบ {report.cadenceIssues} รอบ ผลดึงข้อมูลแต่ละแหล่งแยกอยู่ในตาราง</p>
      <p className="muted">นับเฉพาะรอบอัตโนมัติของ worker ชั่วโมงที่ยังไม่ถึงจะไม่นับว่าขาด การตรวจสำเร็จไม่ได้รับประกันว่าได้ทุกประกาศทันที</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 570, textAlign: 'left' }}><thead><tr>{['วัน','ถึงกำหนด','ตรวจจริง','สำเร็จ','บางส่วน','ผิดพลาด','ขาด','รอ/ข้าม'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{report.daily.map(day => <tr key={day.day}>{[day.day,day.expected,day.checked,day.success,day.partial,day.failed,day.missing,day.other].map((value,index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
      <p><a href="/api/status/concert-monitor.csv">ดาวน์โหลด CSV รายชั่วโมง</a> · <a href="/api/status/concert-monitor.md">ดาวน์โหลดรายงาน</a></p>
      {latest.some(Boolean) && <div className="status-list">{latest.map(row => row && <div key={row.source} className="status-item"><strong>{row.source}</strong><small>{date(row.startedAt)} · {row.status} · อ่าน {row.metrics.attempted ?? '—'}/{row.metrics.discovered ?? '—'} หน้า · รอหมุนตรวจ {row.metrics.pending ?? 0} · ดึงไม่ได้ {row.metrics.fetchFailures ?? 0}</small></div>)}</div>}
    </>}
  </section>;
}
