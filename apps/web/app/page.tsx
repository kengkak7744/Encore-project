'use client';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleDot, Search, Sparkles } from 'lucide-react';
import { useData } from '../components/use-data';
import { ArtistCard, ConcertCard } from '../components/cards';
import type { Artist, Concert, Page } from '../lib/api';

export default function Home() {
  const artists = useData<Page<Artist>>('/artists');
  const concerts = useData<Page<Concert>>('/concerts');
  return <>
    <section className="hero"><div className="container hero-content"><div className="hero-copy"><span className="hero-kicker"><CircleDot size={14}/> YOUR MUSIC, YOUR MOMENTS</span><h1>ทุกโมเมนต์<br/>ของศิลปินที่รัก<br/><em>อยู่ที่นี่</em></h1><p>ตามข่าว ค้นหาคอนเสิร์ต และวางแผนทริปในที่เดียว ข้อมูลมีแหล่งอ้างอิงและเวลาตรวจล่าสุดให้คุณตัดสินใจได้เอง</p><div className="hero-actions"><Link className="button primary" href="/concerts"><Search size={18}/> ค้นหาคอนเสิร์ต</Link><Link className="button ghost" href="/artists">สำรวจศิลปิน <ArrowRight size={17}/></Link></div></div><div className="hero-visual"><div className="vinyl"><div className="vinyl-label"><span>ENCORE</span><strong>PLAY IT<br/>AGAIN</strong><small>SIDE A · 2026</small></div></div><div className="floating-note note-one">♪</div><div className="floating-note note-two">✦</div><div className="hero-sticker">LIVE<br/>FOR<br/>MUSIC</div></div></div></section>
    <section className="feature-strip"><div className="container"><span><CalendarDays size={20}/> คอนเสิร์ตจากหลายแหล่ง</span><span><CircleDot size={20}/> ตรวจข้อมูลทุกชั่วโมง</span><span><Sparkles size={20}/> ผู้ช่วยวางแผนทริป</span></div></section>
    <section className="section container"><div className="section-heading"><div><span className="eyebrow">DISCOVER</span><h2>ศิลปินที่น่าติดตาม</h2></div><Link href="/artists" className="text-link">ดูศิลปินทั้งหมด <ArrowRight size={17}/></Link></div>{artists.error && <p className="notice error">{artists.error}</p>}<div className="artist-grid">{artists.data?.items.slice(0, 8).map((artist) => <ArtistCard key={artist.id} artist={artist}/>)}</div>{artists.loading && <p className="loading">กำลังโหลดศิลปิน...</p>}</section>
    <section className="section section-tint"><div className="container"><div className="section-heading"><div><span className="eyebrow">UP NEXT</span><h2>คอนเสิร์ตที่กำลังจะมา</h2></div><Link href="/concerts" className="text-link">ดูทั้งหมด <ArrowRight size={17}/></Link></div>{concerts.error && <p className="notice error">{concerts.error}</p>}<div className="concert-grid">{concerts.data?.items.slice(0, 4).map((concert) => <ConcertCard key={concert.id} concert={concert}/>)}</div>{concerts.data?.items.length === 0 && <p className="empty">ยังไม่มีงานที่ดึงได้ในขณะนี้ ตรวจสถานะแหล่งข้อมูลได้ที่ <Link href="/status">หน้าสถานะ</Link></p>}</div></section>
    <section className="cta container"><div><span className="eyebrow">MADE FOR FANS</span><h2>ให้เพลงพาเราไปเจอกัน</h2><p>ติดตามศิลปินที่ชอบ บันทึกงานที่เคยไป และให้ผู้ช่วยช่วยวางแผนคอนเสิร์ตถัดไป</p></div><Link className="button primary" href="/account">เริ่มใช้งาน <ArrowRight size={18}/></Link></section>
  </>;
}
