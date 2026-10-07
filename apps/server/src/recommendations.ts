import { query } from './db.js';

export function recommendConcerts(userId: string) {
  return query<{ id: string; slug: string; title: string; starts_at: string; time_tba: boolean; followed_artist: boolean; matching_genres: number; source_url: string | null }>(`WITH tastes AS (
    SELECT unnest(a.genres) AS genre FROM follows f JOIN artists a ON a.id=f.artist_id WHERE f.user_id=$1
    UNION ALL
    SELECT unnest(a.genres) FROM attendance at JOIN concert_artists ca ON ca.concert_id=at.concert_id JOIN artists a ON a.id=ca.artist_id WHERE at.user_id=$1
  )
  SELECT c.id,c.slug,c.title,c.starts_at,c.time_tba,c.city,c.venue,c.price_min,c.price_max,c.price_note,c.currency,c.status,
    bool_or(f.user_id IS NOT NULL) AS followed_artist,count(DISTINCT t.genre)::integer AS matching_genres,
    array_agg(DISTINCT a.name) AS artists,COALESCE(cs.source_url,c.official_url) AS source_url
  FROM concerts c JOIN concert_artists ca ON ca.concert_id=c.id JOIN artists a ON a.id=ca.artist_id
  LEFT JOIN follows f ON f.artist_id=a.id AND f.user_id=$1
  LEFT JOIN tastes t ON t.genre=ANY(a.genres)
  LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id ORDER BY CASE source_role WHEN 'organizer' THEN 0 ELSE 1 END,fetched_at DESC LIMIT 1) cs ON true
  WHERE (c.starts_at>=now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date>=(now() AT TIME ZONE 'Asia/Bangkok')::date)) AND c.status='scheduled'
  GROUP BY c.id,cs.source_url HAVING bool_or(f.user_id IS NOT NULL) OR count(DISTINCT t.genre)>0
  ORDER BY bool_or(f.user_id IS NOT NULL) DESC,count(DISTINCT t.genre) DESC,c.starts_at ASC LIMIT 20`,[userId]);
}
