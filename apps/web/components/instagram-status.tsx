import { date } from '../lib/api';

export type InstagramStatus = {
  paused: boolean; paused_until: string | null; pause_reason: string | null;
  last_request_at: string | null; usage_checked_at: string | null;
  accounts: number; pending_accounts: number; fresh_accounts: number;
  usage: { callCount?: number | null; totalTime?: number | null; cpuTime?: number | null };
};
export function InstagramStatusPanel({ state }: { state?: InstagramStatus | null }) {
  if (!state) return null;
  const percent = (value?: number | null) => value == null ? 'ยังไม่มีข้อมูล' : value + '%';
  return <section className="section"><h2>รอบอัปเดต Instagram</h2>
    <p>{state.paused ? 'กำลังพักการเรียก API' : 'ตรวจบัญชีตามคิว'} · บัญชีที่ข้อมูลยังสด {state.fresh_accounts}/{state.accounts} · ถึงรอบตรวจ {state.pending_accounts} บัญชี</p>
    {state.paused && <p className="notice">พักเพื่อลดการใช้โควตา Instagram ถึง {date(state.paused_until)}</p>}
    <p className="muted">กระจายการตรวจทีละบัญชี หาก usage สูงจะพักและคงข่าวเดิมไว้ การเปิดหน้านี้ไม่เรียก Instagram API</p>
    <p>จำนวนคำขอ {percent(state.usage.callCount)} · เวลาประมวลผล {percent(state.usage.totalTime)} · CPU {percent(state.usage.cpuTime)}</p>
    <p className="muted">usage จาก response ล่าสุดที่มีข้อมูล {date(state.usage_checked_at)} · เรียก API ล่าสุด {date(state.last_request_at)} · ค่าที่แสดงอาจเปลี่ยนแล้วใน Meta</p>
  </section>;
}
