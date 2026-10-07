'use client';
import { useState } from 'react';
import { ArrowUpRight, ImageOff } from 'lucide-react';
import { concertImageUrl, type Concert } from '../lib/api';
import styles from './concert-poster.module.css';

export function ConcertPoster({ concert }: { concert: Concert }) {
  const [failedUrl,setFailedUrl] = useState<string | null>(null);
  if (!concert.image_url) return null;
  const imageUrl = concertImageUrl(concert)!;
  const source = concert.sources?.find(s => s.source_url || s.url);
  const sourceUrl = concert.image_source_url || source?.source_url || source?.url;
  return <figure className={'concert-poster '+styles.poster}>
    {failedUrl===concert.image_url ? <div className={styles.unavailable} role="status"><ImageOff size={30} aria-hidden="true"/><p>รูปโปสเตอร์ไม่พร้อมใช้งาน</p></div>
      : <a href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={'เปิดภาพขนาดเต็ม: '+concert.title}>
        <img src={imageUrl} alt={'ภาพประกอบ '+concert.title} onError={() => setFailedUrl(concert.image_url!)} decoding="async"/>
      </a>}
    <figcaption>ภาพประกอบงาน{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">ดูข้อมูลต้นทาง <ArrowUpRight size={14}/></a>}</figcaption>
  </figure>;
}
