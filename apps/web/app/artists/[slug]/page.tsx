'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Heart, Music2 } from 'lucide-react';
import { useData } from '../../../components/use-data';
import { ArtistCard, ConcertCard } from '../../../components/cards';
import { ArtistImageAttribution, ArtistPopularity } from '../../../components/artist-evidence';
import { api, type Artist } from '../../../lib/api';

export default function ArtistDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const result = useData<Artist>('/artists/' + encodeURIComponent(slug));
  const [message, setMessage] = useState('');
  const artist = result.data;

  async function follow() {
    if (!artist) return;
    try {
      await api('/me/follows/' + artist.id, { method: 'PUT' });
      setMessage('ติดตามศิลปินแล้ว');
    } catch (error) {
      setMessage((error as Error).message + ' — เข้าสู่ระบบเพื่อใช้งาน');
    }
  }

  return <div className="container page">
    <Link href="/artists" className="back-link"><ArrowLeft size={17} /> กลับไปศิลปินทั้งหมด</Link>
    {result.error && <p className="notice error">{result.error}</p>}
    {artist && <>
      <section className="detail-hero">
        <div><div className="detail-avatar">{artist.image_url ? <img src={artist.image_url} alt="" style={artist.image_credit ? { objectFit: 'contain' } : undefined} /> : <Music2 size={70} />}</div><ArtistImageAttribution artist={artist}/></div>
        <div>
          <span className="eyebrow">{artist.kind === 'band' ? 'วงดนตรี' : artist.kind === 'member' ? 'สมาชิกวง' : 'ศิลปินเดี่ยว'}</span>
          <h1>{artist.name}</h1>
          <p>{artist.bio || artist.genres?.join(' · ') || 'ยังไม่มีรายละเอียด'}</p>
          <div className="tag-row">
            {artist.genres?.map((genre) => <span className="tag" key={genre}>{genre}</span>)}
            <span className="tag">{artist.biography?.some((section) => section.generated_model) ? 'ประวัติเรียบเรียงด้วย AI' : artist.verified_at ? 'ตรวจแหล่งประวัติแล้ว' : 'รอตรวจแหล่งประวัติ'}</span>
          </div>
          <button className="button primary" onClick={follow}><Heart size={17} /> ติดตามศิลปิน</button>
          {message && <p className="inline-message">{message}</p>}
        </div>
      </section>

      {!!artist.biography?.length && <section className="section artist-biography" aria-labelledby="artist-biography-title">
        <div className="section-heading"><h2 id="artist-biography-title">ประวัติของ {artist.name}</h2></div>
        {artist.biography.some((section) => section.generated_model) && <p className="muted">ข้อความเรียบเรียงอัตโนมัติจากแหล่งอ้างอิง ยังไม่ได้ตรวจทานโดยผู้ดูแล</p>}
        <div className="artist-biography-sections">
          {artist.biography.map((section) => <article className="artist-biography-section" key={section.position}>
            <h3>{section.heading}</h3>
            <p>{section.body}</p>
            <a href={section.source_url} target="_blank" rel="noopener noreferrer">
              แหล่งข้อมูล: {section.source_label} <ArrowUpRight size={15} />
            </a>
          </article>)}
        </div>
      </section>}

      <ArtistPopularity artist={artist}/>

      <section className="section">
        <div className="section-heading"><h2>คอนเสิร์ตของศิลปิน</h2></div>
        <div className="concert-grid">{artist.upcoming?.map((concert) => <ConcertCard key={concert.id} concert={concert} />)}</div>
        {!artist.upcoming?.length && <p className="empty">ยังไม่พบคอนเสิร์ตที่กำลังจะมาจากแหล่งที่รองรับ</p>}
      </section>

      {!!(artist.members?.length || artist.bands?.length) && <section className="section">
        <h2>{artist.members?.length ? 'สมาชิกวง' : 'วงที่สังกัด'}</h2>
        <div className="artist-grid">{[...(artist.members || []), ...(artist.bands || [])].map((member) => <ArtistCard key={member.id} artist={member} />)}</div>
      </section>}

      <section className="section">
        <h2>ช่องทางทางการ</h2>
        {artist.accounts?.length ? <div className="link-list">{artist.accounts.map((account) => <a key={account.url} href={account.url} target="_blank" rel="noopener noreferrer">{account.platform.toUpperCase()} <ArrowUpRight size={17} /></a>)}</div> : <p className="empty">ยังไม่มีบัญชีที่ตรวจยืนยันแล้ว</p>}
      </section>

      {!!artist.sources?.length && <section className="section">
        <h2>แหล่งอ้างอิงโปรไฟล์</h2>
        <div className="link-list">{artist.sources.map((source) => <a key={source.source_url} href={source.source_url} target="_blank" rel="noopener noreferrer">{source.label} <span className="muted">ตรวจ {new Date(source.checked_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</span><ArrowUpRight size={17} /></a>)}</div>
      </section>}
    </>}
  </div>;
}
