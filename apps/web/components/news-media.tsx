'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { News, NewsMedia } from '../lib/api';

function instagramEmbedUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && match
      ? `https://www.instagram.com/${match[1]}/${match[2]}/embed/` : null;
  } catch { return null; }
}

function SourceMedia({ media, sourceUrl, label }: { media: NewsMedia; sourceUrl: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const embedUrl = instagramEmbedUrl(sourceUrl);
  const direct = !!media.url && !failed;

  if (embedded && embedUrl) return <div className="news-embed">
    <iframe src={embedUrl} title={'โพสต์ Instagram ของ ' + label} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>
    <small>หาก Instagram ไม่แสดงโพสต์ เปิดลิงก์ต้นทางด้านล่าง</small>
  </div>;

  if (direct && media.type === 'image') return <img className="news-media-image" src={media.url!} alt={'รูปจากโพสต์ของ ' + label} loading="lazy" onError={() => setFailed(true)}/>;
  if (direct && media.type === 'video') return <video className="news-media-video" src={media.url!} poster={media.thumbnailUrl || undefined} controls playsInline preload="none" aria-label={'วิดีโอจากโพสต์ของ ' + label} onError={() => setFailed(true)}/>;

  return <div className="news-media-unavailable">
    {media.thumbnailUrl && !thumbnailFailed && <img src={media.thumbnailUrl} alt={'ภาพปกวิดีโอของ ' + label} loading="lazy" onError={() => setThumbnailFailed(true)}/>}
    <div>
      {embedUrl ? <button type="button" className="button secondary" onClick={() => setEmbedded(true)}><Play size={16}/>{media.type === 'video' ? 'ดูวิดีโอจาก Instagram' : 'ดูโพสต์จาก Instagram'}</button> : <span>โหลดสื่อไม่ได้ เปิดโพสต์ต้นทางด้านล่าง</span>}
      {failed && <small>สื่อนี้โหลดไม่ได้ สามารถดูผ่านโพสต์ต้นทางได้</small>}
    </div>
  </div>;
}

export function NewsMediaViewer({ item }: { item: News }) {
  const [index, setIndex] = useState(0);
  const legacyVideo = item.platform === 'instagram' && /^https:\/\/(?:www\.)?instagram\.com\/(?:reel|tv)\//.test(item.source_url);
  const media: NewsMedia[] = item.media_items?.length ? item.media_items : legacyVideo
    ? [{ type: 'video', url: null, thumbnailUrl: item.image_url || null }] : item.image_url
    ? [{ type: 'image', url: item.image_url, thumbnailUrl: null }]
    : item.platform === 'instagram' ? [{ type: 'image', url: null, thumbnailUrl: null }] : [];
  if (!media.length) return null;
  const currentIndex = Math.min(index, media.length - 1);
  const current = media[currentIndex];
  return <div className="news-media">
    <SourceMedia key={currentIndex + ':' + current.url + ':' + current.thumbnailUrl} media={current} sourceUrl={item.source_url} label={item.artist_name}/>
    {media.length > 1 && <div className="news-media-navigation">
      <button type="button" aria-label="สื่อก่อนหน้า" disabled={currentIndex === 0} onClick={() => setIndex(currentIndex - 1)}><ChevronLeft size={19}/></button>
      <span aria-live="polite">{currentIndex + 1} / {media.length}</span>
      <button type="button" aria-label="สื่อถัดไป" disabled={currentIndex === media.length - 1} onClick={() => setIndex(currentIndex + 1)}><ChevronRight size={19}/></button>
    </div>}
  </div>;
}
