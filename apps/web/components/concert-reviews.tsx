'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { api, date, type ReviewPage, type Viewer } from '../lib/api';
import { useData, useSessionReset } from './use-data';
import { FeedPager } from './community-feed';

export function ConcertReviews({ concertId }: { concertId: string }) {
  const [page,setPage] = useState(1),[body,setBody] = useState(''),[rating,setRating] = useState(5),[busy,setBusy] = useState(false),[error,setError] = useState(''),[message,setMessage] = useState('');
  const me=useData<Viewer>('/me'),result=useData<ReviewPage>('/concerts/'+concertId+'/reviews?page='+page);
  const active=useRef(true);
  useEffect(() => { active.current=true; return () => { active.current=false; }; },[]);
  useSessionReset(() => { setBody(''); setRating(5); setPage(1); setMessage(''); setError(''); });
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail===concertId) { void result.reload(); void me.reload(); } };
    window.addEventListener('encore-attendance-change',changed);
    return () => window.removeEventListener('encore-attendance-change',changed);
  },[concertId,result.reload,me.reload]);
  useEffect(() => { setBody(result.data?.mine?.body || ''); setRating(result.data?.mine?.rating || 5); },[me.data?.user.id,result.data?.mine?.id,result.data?.mine?.updated_at]);
  async function action(task: () => Promise<unknown>,success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await task(); if (!active.current) return; setMessage(success); await Promise.all([result.reload(),me.reload()]); }
    catch (failure) { if (active.current) setError((failure as Error).message); } finally { if (active.current) setBusy(false); }
  }
  const state=result.data;
  return <section className="concert-reviews section" aria-label="รีวิวคอนเสิร์ต"><div className="review-heading"><div><span className="eyebrow">FROM THE FANS</span><h2>รีวิวจากคนที่ไปงาน</h2><p>ประสบการณ์จากแฟนเพลง ไม่ใช่คะแนนความคุ้มค่าหรือข้อมูลจากผู้จัด</p></div><div className="review-average"><Star size={23} fill="currentColor"/><strong>{state?.average || '—'}</strong><small>{state?.total || 0} รีวิว</small></div></div>
    {result.error && <p className="notice error" role="alert">{result.error}</p>}{result.loading && <p className="loading">กำลังโหลดรีวิว...</p>}
    {state && <div className="review-composer">{!me.data ? <p><Link href="/account">เข้าสู่ระบบ</Link>เพื่อบันทึกการเข้าร่วมและรีวิวคอนเสิร์ต</p> : !state.ended ? <p>เปิดรับรีวิวหลังงานและรอบแสดงล่าสุดจบแล้ว หากไม่ทราบเวลาจบจะเปิดวันถัดไปตามเวลาไทย งานที่เลื่อนหรือยกเลิกยังไม่เปิดรับรีวิว</p> : !state.attended ? <><p>ไปงานนี้มาแล้ว? บันทึกการเข้าร่วมก่อนเล่าประสบการณ์ของคุณ</p><button className="button secondary" disabled={busy} onClick={() => void action(() => api('/me/attendance/'+concertId,{ method: 'PUT' }),'บันทึกว่าเคยไปงานนี้แล้ว')}>บันทึกว่าเคยไปงานนี้</button></> : state.mine?.hidden ? <p>รีวิวของคุณถูกซ่อนโดยผู้ดูแล กรุณาติดต่อผู้ดูแลก่อนแก้ไข</p> : state.canReview && <form onSubmit={event => { event.preventDefault(); void action(() => api('/concerts/'+concertId+'/reviews/me',{ method: 'PUT',body: JSON.stringify({ rating,body }) }),'บันทึกรีวิวแล้ว'); }}><fieldset disabled={busy} className="review-fields"><legend>{state.mine ? 'แก้ไขรีวิวของคุณ' : 'คุณรู้สึกอย่างไรกับงานนี้?'}</legend><div className="review-stars" role="radiogroup" aria-label="คะแนนรีวิว">{[1,2,3,4,5].map(value => <label key={value}><input type="radio" name={'rating-'+concertId} value={value} checked={rating===value} onChange={() => setRating(value)} aria-label={'ให้ '+value+' ดาว'}/><Star size={26} fill={value<=rating ? 'currentColor' : 'none'}/></label>)}<span>{rating} / 5</span></div><label htmlFor={'review-text-'+concertId}>ข้อความรีวิว</label><textarea id={'review-text-'+concertId} required maxLength={3000} rows={4} value={body} onChange={event => setBody(event.target.value)} placeholder="บรรยากาศ การแสดง เสียง หรือโมเมนต์ที่ประทับใจ..."/><div className="review-form-actions"><button className="button primary" disabled={!body.trim()}>{busy ? 'กำลังบันทึก...' : state.mine ? 'บันทึกการแก้ไขรีวิว' : 'เผยแพร่รีวิว'}</button>{state.mine && <button className="button secondary" type="button" onClick={() => { if (window.confirm('ลบรีวิวของคุณ?')) void action(() => api('/concerts/'+concertId+'/reviews/me',{ method: 'DELETE' }),'ลบรีวิวแล้ว'); }}>ลบรีวิวของฉัน</button>}</div><small>หนึ่งรีวิวต่อคน แก้ไขได้ · หากลบบันทึกการเข้าร่วม รีวิวจะถูกลบด้วย</small></fieldset></form>}</div>}
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <div className="review-list">{state?.items.map(review => <article key={review.id} className="review-card"><header><div><strong>{review.author.display_name}{review.own ? ' · คุณ' : ''}</strong><small>{date(review.created_at)}{review.updated_at!==review.created_at ? ' · แก้ไขแล้ว' : ''}</small></div><span className="review-rating" aria-label={review.rating+' จาก 5 ดาว'}><Star size={16} fill="currentColor"/>{review.rating}/5</span></header><p>{review.body}</p><small className="review-attended">บันทึกว่าเคยไปงานนี้ · ผู้ใช้ระบุเอง</small></article>)}</div>
    {state?.total===0 && <p className="empty">ยังไม่มีรีวิวที่เผยแพร่สำหรับงานนี้</p>}{state && (state.total || 0)>10 && <FeedPager page={state.page} total={state.total || 0} pageSize={10} onChange={setPage}/>}</section>;
}
