import { one, pool, query } from './db.js';
import { syncNews } from './ingest.js';

// Fetch and save through the same ingestion path as the hourly worker.
try {
  const slug = process.argv[2];
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Usage: npm run instagram:sync -- [artist-slug]');
  if (slug && !await one('SELECT id FROM artists WHERE slug=$1', [slug])) throw new Error('Artist not found');
  await syncNews({ platform: 'instagram', artistSlug: slug });
  const rows = await query(`SELECT a.slug,a.name,s.handle,s.last_checked_at,s.last_success_at,s.last_error,
    CASE WHEN s.id IS NULL THEN 'unconfigured' WHEN s.last_error IS NOT NULL THEN 'failed'
      WHEN s.last_success_at IS NULL THEN 'unchecked' ELSE 'success' END AS status,
    (SELECT count(*)::int FROM news_items n WHERE n.artist_id=a.id AND n.platform='instagram') AS posts,
    (SELECT count(*)::int FROM news_items n WHERE n.artist_id=a.id AND n.platform='instagram' AND jsonb_array_length(n.media_items)>0) AS posts_with_media
    FROM artists a LEFT JOIN social_accounts s ON s.artist_id=a.id AND s.platform='instagram' AND s.verified_at IS NOT NULL
    WHERE ($1::text IS NULL OR a.slug=$1) ORDER BY a.slug`, [slug || null]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), artists: rows }, null, 2));
  if (rows.some((row) => row.status !== 'success')) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Instagram sync failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
