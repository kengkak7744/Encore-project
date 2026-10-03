export type NewsMedia = { type: 'image' | 'video'; url: string | null; thumbnailUrl: string | null };

export const newsUpsertSql = `INSERT INTO news_items(artist_id,platform,source_url,external_id,body,image_url,published_at,media_items)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(source_url) DO UPDATE SET
  body=EXCLUDED.body,image_url=EXCLUDED.image_url,media_items=EXCLUDED.media_items,
  published_at=EXCLUDED.published_at,fetched_at=now(),last_verified_at=now(),
  summary=CASE WHEN news_items.body IS DISTINCT FROM EXCLUDED.body THEN NULL ELSE news_items.summary END`;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
}

// Keep URLs only. A video thumbnail is never substituted for its video URL.
export function instagramMedia(post: unknown): NewsMedia[] {
  const data = record(post);
  const children = record(data.children).data;
  const parts = data.media_type === 'CAROUSEL_ALBUM' && Array.isArray(children) && children.length ? children : [data];
  return parts.slice(0, 20).flatMap((item): NewsMedia[] => {
    const media = record(item);
    const type = String(media.media_type || '').toUpperCase();
    const url = httpsUrl(media.media_url), thumbnailUrl = httpsUrl(media.thumbnail_url);
    if (type === 'VIDEO') return [{ type: 'video', url, thumbnailUrl }];
    if ((type === 'IMAGE' || type === 'CAROUSEL_ALBUM') && url) return [{ type: 'image', url, thumbnailUrl: null }];
    return [];
  });
}

export function instagramFeedPosts(posts: unknown): Record<string, unknown>[] {
  if (!Array.isArray(posts)) return [];
  return posts.map(record).filter(post => {
    const product = String(post.media_product_type || '').toUpperCase();
    return (!product || product === 'FEED' || product === 'REELS') && ['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO'].includes(String(post.media_type || '').toUpperCase());
  });
}
