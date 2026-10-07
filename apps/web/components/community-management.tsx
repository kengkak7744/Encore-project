'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, date, type Page } from '../lib/api';
import { useData } from './use-data';
import { FeedPager } from './community-feed';

type Entry = { id: string; body: string; hidden: boolean; created_at: string; author_name: string; rating?: number; concert_title?: string; concert_slug?: string; media?: { url: string; type: string }[] };
export function CommunityManagement() {
  const [kind,setKind] = useState('post'),[query,setQuery] = useState(''),[page,setPage] = useState(1),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const list=useData<Page<Entry>>('/admin/community?'+new URLSearchParams({ kind,q: query,page: String(page) }));
  async function moderate(entry: Entry) {
    setBusy(true); setError('');
    try { await api('/admin/community/'+kind+'/'+entry.id,{ method: 'PATCH',body: JSON.stringify({ hidden: !entry.hidden }) }); await list.reload(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel"><h2>ดูแลชุมชนและรีวิว</h2><p className="muted">ซ่อนหรือคืนเนื้อหาของผู้ใช้ โดยเก็บข้อมูลเดิมไว้ การซ่อนโพสต์จะซ่อนไฟล์แนบและความคิดเห็นในฟีดด้วย</p><div className="toolbar"><div className="moderation-filter"><label htmlFor="community-kind">ชนิดเนื้อหา</label><select id="community-kind" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}><option value="post">โพสต์ผู้ใช้</option><option value="comment">ความคิดเห็น</option><option value="review">รีวิวคอนเสิร์ต</option></select></div><label>ค้นหาข้อความ / ผู้โพสต์<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label></div>
    {(error || list.error) && <p className="notice error" role="alert">{error || list.error}</p>}{list.loading && <p>กำลังโหลด...</p>}
    <div className="admin-records">{list.data?.items.map(entry => <article className="admin-record" key={entry.id}><div><strong>{entry.author_name} · {entry.hidden ? 'ซ่อนอยู่' : 'เผยแพร่'}</strong><small>{date(entry.created_at)}{entry.rating ? ' · '+entry.rating+'/5 ดาว' : ''}</small>{entry.concert_slug && <Link href={'/concerts/'+entry.concert_slug}>{entry.concert_title}</Link>}<p className="feed-body">{entry.body || 'โพสต์ไม่มีข้อความ'}</p>{!entry.hidden && !!entry.media?.length && <div className="moderation-media">{entry.media.map(media => media.type.startsWith('image/') ? <img src={media.url} alt="ไฟล์แนบโพสต์" key={media.url} loading="lazy"/> : <video key={media.url} src={media.url} controls preload="none"/>)}</div>}</div><button className="button secondary" disabled={busy} onClick={() => void moderate(entry)}>{entry.hidden ? 'คืนเนื้อหา' : 'ซ่อนเนื้อหา'}</button></article>)}</div>
    {list.data?.total===0 && <p className="empty">ไม่พบรายการ</p>}{list.data && <FeedPager page={list.data.page} total={list.data.total || 0} pageSize={20} onChange={setPage} loading={list.loading}/>}</section>;
}
