'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { ArtistProfileCard } from '../../components/cards';
import { useData } from '../../components/use-data';
import type { Artist, Page } from '../../lib/api';

export default function ArtistsPage() {
  const [q, setQ] = useState(''); const [kind, setKind] = useState(''); const [page, setPage] = useState(1);
  const result = useData<Page<Artist>>('/artists?' + new URLSearchParams({ q, kind, page: String(page) }));
  return <div className="container page"><div className="page-heading"><span className="eyebrow">THE ARTISTS</span><h1>รู้จักศิลปิน<br/><em>ให้มากขึ้น</em></h1><p>อ่านประวัติสั้น แนวเพลง และแหล่งอ้างอิงของวง ศิลปินเดี่ยว และสมาชิกวงได้จากหน้านี้</p></div><div className="toolbar"><label className="search-field"><Search size={19}/><input aria-label="ค้นหาศิลปิน" placeholder="ค้นหาศิลปิน..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }}/></label><select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }} aria-label="ประเภทศิลปิน"><option value="">ทุกประเภท</option><option value="band">วงดนตรี</option><option value="solo">ศิลปินเดี่ยว</option><option value="member">สมาชิกวง</option></select></div>{result.error && <p className="notice error">{result.error}</p>}{result.loading && <p className="loading">กำลังโหลด...</p>}<div className="artist-profile-grid">{result.data?.items.map((artist) => <ArtistProfileCard key={artist.id} artist={artist}/>)}</div>{result.data?.items.length === 0 && <p className="empty">ไม่พบศิลปินที่ตรงกับคำค้น</p>}<nav className="pager" aria-label="แบ่งหน้าศิลปิน"><button disabled={result.loading || page === 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button><span aria-live="polite">หน้า {page} จาก {Math.max(1, Math.ceil((result.data?.total || 0) / 20))}</span><button disabled={result.loading || !!result.error || page * 20 >= (result.data?.total || 0)} onClick={() => setPage(page + 1)}>ถัดไป</button></nav></div>;
}
