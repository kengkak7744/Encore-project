'use client';
import { useState } from 'react';
import { useData } from './use-data';
import { date } from '../lib/api';

type Coverage = { source: string; catalog: number; checked: number; parsed: number; empty: number; failed: number; pending: number; excluded?:number; listingFallback: number; observedAt: string | null; stale: boolean; verdict: string;
  pages: { url: string; outcome: string; checkedAt: string | null; error: string | null; listingFallback: boolean;reason?:string;ingestionMode?:string;evidence?:Record<string,unknown> }[] };
const reviewReasons:Record<string,string>={outside_thailand:'สถานที่อยู่นอกประเทศไทย',outside_supported_music_categories:'ไม่เข้าเกณฑ์ประเภทเพลงที่ระบบรองรับ',outside_supported_music_genres:'ประเภทงานไม่เข้าเกณฑ์ดนตรี',product_delivery:'จัดส่งสินค้า ไม่ใช่สถานที่แสดง',episodic_screening:'กิจกรรมชมซีรีส์',not_public:'ต้นทางซ่อนจากเว็บ',non_music_performance:'การแสดงโขนหรือชมซีรีส์',online_event:'งานออนไลน์',implausible_source_date:'วันที่ต้นทางผิดปกติ',unverified_country_or_venue:'ยังไม่ยืนยันประเทศหรือสถานที่',unverified_country:'ยังไม่ยืนยันประเทศ',unparsed_announced_schedule:'ยังอ่านรอบแสดงไม่ได้',unparsed_announced_schedule_or_venue:'ยังยืนยันรอบแสดงหรือสถานที่ไม่ได้',unverified_music_category:'ยังยืนยันประเภทดนตรีไม่ได้',invalid_event_date:'วันแสดงไม่ครบหรือผิดปกติ',missing_event_data:'ไม่พบข้อมูลรายละเอียดงาน',missing_event_identity:'ยังยืนยันตัวงานไม่ได้',unverified_publication_status:'ยังยืนยันสถานะเผยแพร่ไม่ได้',unsupported_or_missing_currency:'สกุลเงินไม่ครบหรือไม่รองรับ'};
type Monitor = { reason?: string | null; startedAt: string; endsAt: string; elapsedHours: number; checked: number; elapsedExpectedChecks: number; issues: number; verdict: string; cadenceVerdict: string; cadenceIssues: number;
  daily: { day: number; expected: number; checked: number; success: number; partial: number; failed: number; missing: number; other: number }[];
  rows: { source: string; status: string; startedAt: string | null; scheduledAt: string; metrics: { discovered?: number; attempted?: number; pending?: number; fetchFailures?: number } }[];
  coverage?: Coverage[]; supplementalCoverage?: Coverage[] };
export function ConcertMonitorPanel() {
  const [windowId,setWindowId] = useState('');
  const [coverageMode,setCoverageMode] = useState('current');
  const query = windowId ? '?windowId='+encodeURIComponent(windowId) : '';
  const result = useData<{ report: Monitor | null; windows: { id: string | number; started_at: string; ends_at: string; reason?: string | null }[] }>('/status/concert-monitor'+query,60_000);
  const report = result.data?.report;
  const current=useData<{generatedAt:string;coverage:Coverage[]}>('/status/concert-coverage',60_000);
  const coverage = coverageMode==='current'?current.data?.coverage:coverageMode === 'manual' ? report?.supplementalCoverage : report?.coverage;
  const latest = report ? ['ThaiTicketMajor','Eventpop','The Concert','Ticketmelon'].map(source => [...report.rows].reverse().find(row => row.source === source && row.startedAt)) : [];
  return <section className="section"><h2>ติดตามรอบคอนเสิร์ต 7 วัน</h2>{result.error && <p className="notice error">{result.error}</p>}
    {!!result.data?.windows?.length && <label>ช่วงติดตาม <select value={windowId} onChange={event => setWindowId(event.target.value)}>
      <option value="">ช่วงล่าสุด</option>{result.data.windows.map(window => <option key={window.id} value={window.id}>{date(window.started_at)} – {date(window.ends_at)}</option>)}
    </select></label>}
    {!report ? <p className="muted">รอ worker เริ่มช่วงติดตาม</p> : <>
      <p>{date(report.startedAt)} – {date(report.endsAt)} (เวลาไทย)</p>
      {report.reason && <p className="muted">{report.reason}</p>}
      <p><strong>{report.verdict === 'collecting' ? 'กำลังเก็บผล ยังไม่ครบ 7 วัน' : report.verdict === 'passed' ? 'ครบ 7 วัน ทุกแหล่งสำเร็จตามรอบ' : 'ครบช่วงติดตาม มีรายการที่ต้องตรวจสอบ'}</strong></p>
      <p>ครบแล้ว {report.elapsedHours}/168 ชั่วโมง · ตรวจจริง {report.checked}/{report.elapsedExpectedChecks} รอบแหล่งข้อมูลที่ถึงกำหนดแล้ว · ต้องตรวจสอบ {report.issues} รอบ</p>
      <p className="muted">รอบตรวจตามเวลา: {report.cadenceVerdict === 'passed' ? 'ครบทุกชั่วโมง' : report.cadenceVerdict === 'needs_review' ? 'มีรอบที่ขาด ล่าช้า หรือไม่จบ' : 'กำลังติดตาม'} · ขาด/ล่าช้า/ไม่จบ {report.cadenceIssues} รอบ ผลดึงข้อมูลแต่ละแหล่งแยกอยู่ในตาราง</p>
      <p className="muted">นับเฉพาะรอบอัตโนมัติของ worker ชั่วโมงที่ยังไม่ถึงจะไม่นับว่าขาด การตรวจสำเร็จไม่ได้รับประกันว่าได้ทุกประกาศทันที</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 570, textAlign: 'left' }}><thead><tr>{['วัน','ถึงกำหนด','ตรวจจริง','สำเร็จ','บางส่วน','ผิดพลาด','ขาด','รอ/ข้าม'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{report.daily.map(day => <tr key={day.day}>{[day.day,day.expected,day.checked,day.success,day.partial,day.failed,day.missing,day.other].map((value,index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
      <p><a href={'/api/status/concert-monitor.csv'+query}>ดาวน์โหลด CSV รายชั่วโมง</a> · <a href={'/api/status/concert-monitor.md'+query}>ดาวน์โหลดรายงาน</a></p>
      {latest.some(Boolean) && <div className="status-list">{latest.map(row => row && <div key={row.source} className="status-item"><strong>{row.source}</strong><small>{date(row.startedAt)} · {row.status} · อ่าน {row.metrics.attempted ?? '—'}/{row.metrics.discovered ?? '—'} หน้า · รอหมุนตรวจ {row.metrics.pending ?? 0} · ดึงไม่ได้ {row.metrics.fetchFailures ?? 0}</small></div>)}</div>}
      {!!report.coverage?.length && <>
        <h3 className="spaced">ความครอบคลุมรายหน้า</h3>
        <label>หลักฐาน coverage <select aria-label="หลักฐาน coverage" value={coverageMode} onChange={event => setCoverageMode(event.target.value)}><option value="current">ผลล่าสุด 24 ชั่วโมง (แยกจากผล 7 วัน)</option><option value="scheduled">รอบอัตโนมัติในช่วง 7 วัน</option><option value="manual">ตรวจเสริมในช่วง 7 วัน</option></select></label>
        {coverageMode==='current'&&<><p className="notice">ผลล่าสุดรวมรอบอัตโนมัติและตรวจเสริมใน24ชั่วโมง อัปเดตทุก60วินาทีจากฐานข้อมูล ไม่เรียกเว็บต้นทางและไม่เปลี่ยนผลตรวจรับ7วัน</p>{current.error&&<p className="notice error">{current.error}</p>}{current.loading&&<p className="muted">กำลังอ่านหลักฐานล่าสุด</p>}</>}
        {coverageMode === 'manual' && <p className="notice">ผลตรวจเสริมแยกจากรอบอัตโนมัติ ไม่เพิ่มจำนวนรอบหรือทำให้เกณฑ์ 7 วันผ่าน</p>}
        <p className="muted">นับ URL ไม่ซ้ำจากรายการต้นทางล่าสุด และผลตรวจล่าสุดของแต่ละ URL ในช่วงที่เลือก การตัดออกต้องมีเหตุผลและหลักฐานต้นทาง ข้อมูลไม่พอยังคงรอตรวจ และอ่านเฉพาะหน้ารวมไม่ถือว่าตรวจรายละเอียดสำเร็จ</p>
        <div className="status-list">{coverage?.map(source => <div key={source.source} className="status-item concert-coverage-source">
          <strong>{source.source}</strong>
          <small>{source.verdict === 'untracked' ? 'ยังไม่มีหลักฐานรายหน้า รอรอบใหม่' : `${date(source.observedAt)} · ตรวจแล้ว ${source.checked}/${source.catalog} URL · อ่านได้ ${source.parsed} · นอกขอบเขตพร้อมหลักฐาน ${source.excluded||0} · ข้อมูลไม่พอ ${source.empty} · ดึงไม่ได้ ${source.failed} · รอหมุนตรวจ ${source.pending}`}</small>
          {source.stale && source.verdict !== 'untracked' && <p className="notice">ผลรายการต้นทางอาจล้าสมัย</p>}
          {!!source.listingFallback && <p className="muted">อ่านเฉพาะหน้ารวม {source.listingFallback} URL ยังตรวจรายละเอียดไม่ได้</p>}
          {source.pages.some(page => !['parsed','excluded'].includes(page.outcome)) && <details><summary>ดูรายการที่ต้องตรวจต่อ</summary><ul>{source.pages.filter(page => !['parsed','excluded'].includes(page.outcome)).slice(0,20).map(page => <li key={page.url}><a href={page.url} target="_blank" rel="noopener noreferrer">{new URL(page.url).pathname}</a> · {page.outcome === 'failed' ? 'ดึงไม่ได้' : page.outcome === 'empty' ? 'ข้อมูลไม่พอ' : 'รอหมุนตรวจ'}{page.reason?' · '+(reviewReasons[page.reason]||page.reason):''}{page.listingFallback ? ' · อ่านเฉพาะหน้ารวมได้' : ''}{page.ingestionMode==='manual'?' · ตรวจเสริม':''}{page.error && <small>{page.error}</small>}</li>)}</ul><p className="muted">แสดง20รายการแรก ดาวน์โหลด CSV เพื่อดูทุก URL</p></details>}
          {!!source.excluded&&<details><summary>ดูเหตุผลรายการนอกขอบเขต ({source.excluded})</summary><ul>{source.pages.filter(page=>page.outcome==='excluded').slice(0,20).map(page=><li key={page.url}><a href={page.url} target="_blank" rel="noopener noreferrer">{typeof page.evidence?.title==='string'?page.evidence.title:new URL(page.url).pathname}</a> · {reviewReasons[page.reason||'']||page.reason} · {date(page.checkedAt)}{page.ingestionMode==='manual'?' · ตรวจเสริม':''}</li>)}</ul><p className="muted">แสดง20รายการแรก CSVมีเหตุผลและหลักฐานทุก URL</p></details>}
        </div>)}</div>
        <p><a href={coverageMode==='current'?'/api/status/concert-coverage.csv':'/api/status/concert-monitor.csv?view=coverage' + (coverageMode === 'manual' ? '&scope=manual' : '') + (windowId ? '&windowId='+encodeURIComponent(windowId) : '')}>ดาวน์โหลดหลักฐานราย URL</a></p>
      </>}
    </>}
  </section>;
}
