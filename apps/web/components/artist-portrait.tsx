'use client';
import { useState } from 'react';
import { Music2 } from 'lucide-react';
import type { Artist } from '../lib/api';

export function ArtistPortrait({ artist, detail = false }: { artist: Artist; detail?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = artist.image_url;
  const cleared = !!source && !!artist.image_credit;
  const failed = cleared && failedUrl===source;
  const caption = artist.image_review?.caption || 'ภาพประกอบโปรไฟล์ ' + artist.name;
  return <div className={(detail ? 'detail-avatar' : 'artist-avatar') + ' artist-portrait'}>
    {cleared && !failed ? <img src={source!} alt={caption} style={{ objectFit: 'contain' }} onError={() => setFailedUrl(source!)} />
      : <div className="artist-portrait-placeholder" role="img" aria-label={artist.name + ': ' + (failed ? 'โหลดภาพไม่สำเร็จ' : 'ยังไม่มีภาพที่ตรวจสิทธิ์แล้ว')}>
        <Music2 size={detail ? 64 : 28} aria-hidden="true" />
        <span>{failed ? 'ภาพไม่พร้อม' : 'รอสิทธิ์ภาพ'}</span>
      </div>}
  </div>;
}
