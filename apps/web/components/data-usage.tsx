'use client';
import { useState } from 'react';
import { useData } from './use-data';
import styles from './data-usage.module.css';

type Percent = { used: number | null; remaining: number | null };
type Source = {
  source_name: string; category: string; enabled: boolean | null;
  last_started_at: string | null; last_success_at: string | null;
  runs: number; succeeded: number; partial: number; failed: number; skipped: number; running: number;
  requests: number | null; unmetered_runs: number; items_seen: number; items_changed: number;
};
type Usage = {
  updatedAt: string; sources: Source[];
  recent: { source_name: string; category: string; started_at: string; status: string; items_seen: number; items_changed: number }[];
  instagram: null | {
    checkedAt: string | null; paused: boolean; pausedUntil: string | null;
    nextRequestAt: string | null; accounts: number; pendingAccounts: number; freshAccounts: number;
    call: Percent; time: Percent; cpu: Percent;
  };
};
const number = (value: number) => value.toLocaleString('th-TH',{ maximumFractionDigits: 2 });
const date = (value: string | null) => value ? new Date(value).toLocaleString('th-TH',{ timeZone: 'Asia/Bangkok' }) : 'ยังไม่มีข้อมูล';
const category = (value: string) => ({ concert: 'คอนเสิร์ต',news: 'ข่าว',travel: 'เดินทาง' }[value] || value);
const status = (value: string) => ({ success: 'สำเร็จ',partial: 'ได้บางส่วน',failed: 'ล้มเหลว',skipped: 'ข้าม',running: 'กำลังทำงาน' }[value] || value);

export function DataUsage() {
  const [period,setPeriod] = useState('24h');
  const { data,loading,error,reload } = useData<Usage>('/admin/data-usage?period='+period,60_000);
  const ig = data?.instagram;
  const totals = data?.sources.reduce((sum,s) => ({ runs: sum.runs+s.runs,requests: sum.requests+(s.requests ?? 0),unmetered: sum.unmetered+s.unmetered_runs }),{ runs: 0,requests: 0,unmetered: 0 });
  const oldUsage = !ig?.checkedAt || Date.now()-Date.parse(ig.checkedAt)>15*60_000;
  return <section className={styles.root} aria-label="การดึงข้อมูลและโควตา API">
    <div className={styles.toolbar}><div><h2>การดึงข้อมูล / API</h2><p>อ่านจาก log ในฐานข้อมูล อัปเดตหน้าทุก 60 วินาทีขณะเปิดอยู่ โดยไม่เรียก API ต้นทางเพิ่ม</p></div>
      <div className="editor-actions"><label>ช่วงรายงาน<select value={period} onChange={event => setPeriod(event.target.value)}><option value="24h">24 ชั่วโมงล่าสุด</option><option value="7d">7 วันล่าสุด</option></select></label><button className="button secondary" type="button" onClick={() => void reload()}>รีเฟรช</button></div></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {loading && <p className="loading">กำลังอ่านรายงาน...</p>}
    {data && <>
      <p className="muted">ข้อมูล ณ {date(data.updatedAt)} (เวลาไทย)</p>
      <div className="admin-metrics"><div className="panel"><span>รอบดึงข้อมูล</span><strong>{number(totals!.runs)}</strong></div><div className="panel"><span>คำขอ HTTP/API ที่บันทึกไว้</span><strong>{number(totals!.requests)}</strong></div><div className="panel"><span>รอบที่ไม่ได้บันทึกจำนวนคำขอ</span><strong>{number(totals!.unmetered)}</strong></div><div className="panel"><span>แหล่งข้อมูลในรายงาน</span><strong>{data.sources.length}</strong></div></div>
      <p className="muted">หนึ่งรอบอาจเรียกหลายคำขอ จำนวนคำขอที่บันทึกไว้จึงไม่ใช่ยอดการใช้งานทั้งหมดของแอป และไม่รวมคำขอที่ระบบอื่นไม่ได้ลง sync log</p>
      <section className="panel"><h3>Instagram — โควตาล่าสุดที่ Meta ส่งกลับ</h3>
        <p>เหลือเป็นเปอร์เซ็นต์ของแต่ละตัวชี้วัด ไม่ใช่จำนวนครั้งที่เรียกได้ และไม่ได้คำนวณจากจำนวนศิลปิน</p>
        <div className={styles.quotas}>{([['Call count',ig?.call],['Total time',ig?.time],['CPU time',ig?.cpu]] as const).map(([label,metric]) => <div key={label} className={styles.quota}><h4>{label}</h4><strong>เหลือ {metric?.remaining == null ? 'ไม่ทราบ' : number(metric.remaining)+'%'}</strong><p>ใช้แล้ว {metric?.used == null ? 'ไม่ทราบ' : number(metric.used)+'%'}</p>{metric?.used != null && <progress aria-label={label+' usage'} value={Math.min(metric.used,100)} max={100}/>}</div>)}</div>
        <p className={oldUsage ? 'notice' : 'muted'}>บันทึกโควตาเมื่อ {date(ig?.checkedAt ?? null)}{oldUsage ? ' — ไม่มีค่าล่าสุดภายใน 15 นาที ตัวเลขอาจเปลี่ยนแล้ว' : ''}</p>
        <p>{!ig ? 'ยังไม่มีสถานะการเรียก' : ig.paused ? 'พักการเรียกจนถึง '+date(ig.pausedUntil) : 'ไม่มี cooldown ที่ยังมีผลในฐานข้อมูล'} · ช่องเรียกถัดไป {date(ig?.nextRequestAt ?? null)}</p>
        <p>บัญชียืนยัน {ig?.accounts ?? '—'} · รอถึงรอบตรวจ {ig?.pendingAccounts ?? '—'} · ตรวจสำเร็จในช่วงความสดที่ตั้งไว้ {ig?.freshAccounts ?? '—'}</p>
        <p className="muted">Meta จำกัด call / time / CPU แยกกัน ตัวใดสูงก็ทำให้ระบบพักได้ ตัวเลขนี้เป็น snapshot ของแอป ไม่ใช่โควตารายศิลปินหรือรายช่วงรายงาน</p>
      </section>
      <div className={styles.tableWrap}><table className={styles.table}><caption>แยกตามแหล่งข้อมูล — {period==='7d' ? '7 วันล่าสุด' : '24 ชั่วโมงล่าสุด'}</caption><thead><tr><th>แหล่ง / หมวด</th><th>รอบดึง</th><th>ผลการดึง</th><th>คำขอ HTTP/API</th><th>รายการที่ตรวจ / เปลี่ยน</th><th>โควตาคงเหลือ</th><th>เวลาตรวจ</th></tr></thead><tbody>{data.sources.map(s => <tr key={s.category+':'+s.source_name}><td><strong>{s.source_name}</strong><small>{category(s.category)} · {s.enabled===true ? 'เปิดใช้งาน' : s.enabled===false ? 'ปิดใช้งาน' : 'ไม่มีสถานะแหล่ง'}</small></td><td>{number(s.runs)}</td><td>สำเร็จ {s.succeeded}<small>บางส่วน {s.partial} · ล้มเหลว {s.failed}<br/>ข้าม {s.skipped} · ทำงาน {s.running}</small></td><td>{s.requests===null ? 'ยังไม่ทราบ' : number(s.requests)}{s.unmetered_runs>0 && <small>ไม่ได้บันทึก {s.unmetered_runs} รอบ</small>}</td><td>{number(s.items_seen)} / {number(s.items_changed)}</td><td>{/instagram/i.test(s.source_name) ? 'ดูค่าจาก Meta ด้านบน' : 'ยังไม่ได้บันทึกโควตาจากต้นทาง'}</td><td>เริ่ม {date(s.last_started_at)}<small>สำเร็จ {date(s.last_success_at)}</small></td></tr>)}</tbody></table></div>
      <p className="muted">รายการที่ตรวจ/เปลี่ยนเป็นยอดรวมจากรอบดึง อาจนับรายการเดิมหลายครั้ง การตรวจครบหลายรอบไม่ได้ยืนยันว่าครบทุกงาน รายงานนี้เป็นช่วงย้อนหลังแบบเลื่อนเวลา; <a href="/status">รายงานตรวจรับคอนเสิร์ต 7 วัน</a> ใช้ช่วงติดตามเดิม</p>
      <section className="panel"><h3>รอบล่าสุด (สูงสุด 30 รอบในช่วงที่เลือก)</h3>{!data.recent.length && <p>ยังไม่มีรอบดึงในช่วงนี้</p>}<ul className={styles.recent}>{data.recent.map((run,index) => <li key={run.started_at+':'+index}><strong>{run.source_name}</strong><span>{category(run.category)} · {status(run.status)}</span><time>{date(run.started_at)}</time></li>)}</ul></section>
    </>}
  </section>;
}
