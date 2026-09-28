'use client';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import { useData } from '../../components/use-data';
import { date, type News, type Page } from '../../lib/api';
import Link from 'next/link';

export default function NewsPage() {
  const result = useData<Page<News>>('/news');
  return <div className="container page"><div className="page-heading"><span className="eyebrow">FROM THE SOURCE</span><h1>ข่าวจากศิลปิน<br/><em>ที่คุณติดตาม</em></h1><p>โพสต์จากบัญชีที่ระบบเข้าถึงได้ พร้อมลิงก์ต้นทาง ข่าวจากศิลปินที่ติดตามจะแสดงก่อน</p></div>{result.error && <p className="notice error">{result.error}</p>}{result.loading && <p className="loading">กำลังโหลดข่าว...</p>}<div className="news-grid">{result.data?.items.map((item) => <article key={item.id} className="news-card"><div className="news-card-top"><span className="eyebrow">{item.platform.toUpperCase()} · {item.followed ? 'กำลังติดตาม' : 'ศิลปิน'}{item.stale ? ' · อาจล้าสมัย' : ''}</span><span>{date(item.published_at)}</span></div><h2><Link href={'/artists/' + item.artist_slug}>{item.artist_name}</Link></h2><p>{item.summary || item.body || 'โพสต์นี้ไม่มีข้อความที่ระบบอ่านได้ เปิดต้นทางเพื่อดูเนื้อหา'}</p><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-link">ดูโพสต์ต้นทาง <ArrowUpRight size={16}/></a></article>)}</div>{result.data?.items.length === 0 && <div className="empty"><Newspaper size={35}/><p>ยังไม่มีโพสต์ที่ดึงอัตโนมัติได้ ตรวจสถานะการเชื่อมต่อของ X, Facebook และ Instagram ที่ <Link href="/status">หน้าสถานะ</Link></p></div>}</div>;
}
