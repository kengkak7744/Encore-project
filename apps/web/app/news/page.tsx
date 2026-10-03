'use client';
import { useState } from 'react';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import { useData } from '../../components/use-data';
import { date, type News, type Page } from '../../lib/api';
import Link from 'next/link';
import { NewsMediaViewer } from '../../components/news-media';

export default function NewsPage() {
  const [page, setPage] = useState(1);
  const result = useData<Page<News>>('/news?page=' + page, 60_000);
  const totalPages = Math.max(1, Math.ceil((result.data?.total || 0) / 20));
  const currentPage = result.data?.page || page;
  return <div className="container page"><div className="page-heading"><span className="eyebrow">FROM THE SOURCE</span><h1>ข่าวจากศิลปิน<br/><em>ที่คุณติดตาม</em></h1><p>โพสต์จากบัญชีที่ระบบเข้าถึงได้ พร้อมลิงก์ต้นทาง ข่าวจากศิลปินที่ติดตามจะแสดงก่อน</p></div>{result.error && <p className="notice error">{result.error}</p>}{result.loading && <p className="loading">กำลังโหลดข่าว...</p>}<div className="news-grid">{result.data?.items.map((item) => <article key={item.id} className="news-card"><div className="news-card-top"><span className="eyebrow">{item.platform.toUpperCase()} · {item.followed ? 'กำลังติดตาม' : 'ศิลปิน'}{item.stale ? ' · อาจล้าสมัย' : ''}</span><span>{date(item.published_at)}</span></div><h2><Link href={'/artists/' + item.artist_slug}>{item.artist_name}</Link></h2><NewsMediaViewer item={item}/><p>{item.summary || item.body || 'โพสต์นี้ไม่มีข้อความที่ระบบอ่านได้ เปิดต้นทางเพื่อดูเนื้อหา'}</p><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-link">ดูโพสต์ต้นทาง <ArrowUpRight size={16}/></a></article>)}</div>{result.data?.items.length === 0 && <div className="empty"><Newspaper size={35}/><p>ยังไม่มีโพสต์ที่ดึงอัตโนมัติได้ ตรวจสถานะการเชื่อมต่อของ X, Facebook และ Instagram ที่ <Link href="/status">หน้าสถานะ</Link></p></div>}<nav className="pager" aria-label="แบ่งหน้าข่าว"><button disabled={result.loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button><span aria-live="polite">หน้า {currentPage} จาก {totalPages} · {result.data?.total || 0} โพสต์</span><button disabled={result.loading || !!result.error || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>ถัดไป</button></nav></div>;
}
