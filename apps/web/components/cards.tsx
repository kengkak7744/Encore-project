import Link from 'next/link';
import { ArrowUpRight, CalendarDays, MapPin, Music2 } from 'lucide-react';
import { type Artist, type Concert, concertImageUrl, date, price, stale } from '../lib/api';
import { ArtistImageAttribution } from './artist-evidence';
import { ArtistPortrait } from './artist-portrait';

export function ArtistCard({ artist }: { artist: Artist }) {
  return <div className="artist-card-with-credit"><Link href={'/artists/' + artist.slug} className="artist-card"><ArtistPortrait artist={artist}/><div><span className="eyebrow">{artist.kind === 'band' ? 'วงดนตรี' : artist.kind === 'member' ? 'สมาชิกวง' : 'ศิลปินเดี่ยว'}</span><h3>{artist.name}</h3><p>{artist.genres?.join(' · ') || 'ยังไม่ระบุแนวเพลง'}</p></div><ArrowUpRight size={19} className="card-arrow"/></Link><ArtistImageAttribution artist={artist}/></div>;
}

export function ArtistProfileCard({ artist }: { artist: Artist }) {
  return <article className="artist-profile-card">
    <div className="artist-profile-heading">
      <ArtistPortrait artist={artist}/>
      <div>
        <span className="eyebrow">{artist.kind === 'band' ? 'วงดนตรี' : artist.kind === 'member' ? 'สมาชิกวง' : 'ศิลปินเดี่ยว'}</span>
        <h2><Link href={'/artists/' + artist.slug}>{artist.name}</Link></h2>
        <p className="artist-profile-genres">{artist.genres?.join(' · ') || 'ยังไม่ระบุแนวเพลง'}</p>
      </div>
    </div>
    <ArtistImageAttribution artist={artist}/>
    <p className="artist-profile-bio">{artist.bio || 'ยังไม่มีประวัติที่ตรวจแหล่งข้อมูลแล้ว'}</p>
    <div className="artist-profile-sources">
      <span>แหล่งที่มา</span>
      {artist.sources?.length ? artist.sources.map((source) => <a key={source.source_url} href={source.source_url} target="_blank" rel="noopener noreferrer">{source.label} <ArrowUpRight size={14}/></a>) : <small>ยังไม่มีแหล่งอ้างอิง</small>}
    </div>
    <Link className="artist-profile-more" href={'/artists/' + artist.slug}>ดูโปรไฟล์และคอนเสิร์ต <ArrowUpRight size={16}/></Link>
  </article>;
}

export function ConcertCard({ concert }: { concert: Concert }) {
  return <Link href={'/concerts/' + concert.slug} className="concert-card"><div className="concert-art">{concert.image_url ? <img src={concertImageUrl(concert)!} alt=""/> : <Music2 size={43}/>}<span className={'status-pill ' + concert.status}>{concert.status === 'cancelled' ? 'ยกเลิก' : concert.status === 'postponed' ? 'เลื่อน' : 'กำลังจะมา'}</span></div><div className="concert-card-body"><span className="eyebrow"><CalendarDays size={13}/>{date(concert.starts_at, concert.time_tba)}</span><h3>{concert.title}</h3><p><MapPin size={14}/>{[concert.venue, concert.city].filter(Boolean).join(', ') || 'ยังไม่ระบุสถานที่'}</p><div className="card-bottom"><strong>{price(concert.price_min)}</strong><span>{stale(concert.last_verified_at) ? 'อาจล้าสมัย' : 'ตรวจข้อมูลล่าสุดแล้ว'}</span></div></div></Link>;
}
