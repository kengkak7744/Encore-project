import { Router } from 'express';
import { one, query } from '../db.js';
import { config } from '../config.js';
import { imageCreditJoin, imageCreditSelect } from '../artist-audit.js';

import { getConcertMonitor } from '../concert-scheduler.js';
import { concertMonitorCsv, concertMonitorMarkdown } from '../concert-monitor.js';

export const publicRoutes = Router();

function pageNumber(value: unknown, max = 100) {
  const number = Number(value || 1);
  return Number.isSafeInteger(number) ? Math.max(1, Math.min(number, max)) : 1;
}

function searchTerm(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

publicRoutes.get('/artists', async (req, res) => {
  const page = pageNumber(req.query.page);
  const term = searchTerm(req.query.q);
  const kind = searchTerm(req.query.kind);
  const params: unknown[] = [];
  const where: string[] = [];
  if (term) {
    params.push('%' + term + '%');
    where.push('(a.name ILIKE $' + params.length + ' OR a.name_en ILIKE $' + params.length + ')');
  }
  if (['band', 'solo', 'member'].includes(kind)) {
    params.push(kind);
    where.push('a.kind = $' + params.length);
  }
  const filter = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const count = await one<{ total: string }>('SELECT count(*)::text AS total FROM artists a ' + filter, params);
  params.push((page - 1) * 20);
  const items = await query(
    'SELECT a.id, a.slug, a.name, a.name_en, a.kind, a.bio, a.image_url, a.genres, a.popularity_rank, a.verified_at, ' + imageCreditSelect + ', ' +
    "(SELECT count(*)::integer FROM concert_artists ca JOIN concerts c ON c.id = ca.concert_id WHERE ca.artist_id = a.id AND (COALESCE(c.ends_at,c.starts_at) >= now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) AND c.status = 'scheduled') AS upcoming_count, " +
    "COALESCE((SELECT json_agg(json_build_object('source_url', s.source_url, 'label', s.label, 'checked_at', s.checked_at) ORDER BY s.label) FROM artist_sources s WHERE s.artist_id = a.id), '[]'::json) AS sources " +
    'FROM artists a ' + imageCreditJoin + ' ' + filter + ' ORDER BY a.popularity_rank ASC NULLS LAST, a.name ASC LIMIT 20 OFFSET $' + params.length,
    params,
  );
  res.json({ items, page, total: Number(count?.total || 0), pageSize: 20 });
});

publicRoutes.get('/artists/:slug', async (req, res) => {
  const artist = await one('SELECT a.*, ' + imageCreditSelect + ' FROM artists a ' + imageCreditJoin + ' WHERE a.slug = $1', [req.params.slug]);
  if (!artist) { res.status(404).json({ error: 'ไม่พบศิลปิน' }); return; }
  const accounts = await query('SELECT platform, handle, url, verified_at, last_checked_at, last_success_at, last_error FROM social_accounts WHERE artist_id = $1 AND verified_at IS NOT NULL ORDER BY platform', [artist.id]);
  const sources = await query('SELECT source_url, label, checked_at FROM artist_sources WHERE artist_id = $1 ORDER BY label', [artist.id]);
  const biography = await query('SELECT position, heading, body, source_url, source_label, checked_at, generated_model FROM artist_biography_sections WHERE artist_id = $1 ORDER BY position', [artist.id]);
  const members = await query('SELECT a.id, a.slug, a.name, a.kind, a.image_url, ' + imageCreditSelect + ' FROM artist_memberships am JOIN artists a ON a.id = am.member_id ' + imageCreditJoin + ' WHERE am.band_id = $1 ORDER BY a.name', [artist.id]);
  const bands = await query('SELECT a.id, a.slug, a.name, a.kind, a.image_url, ' + imageCreditSelect + ' FROM artist_memberships am JOIN artists a ON a.id = am.band_id ' + imageCreditJoin + ' WHERE am.member_id = $1 ORDER BY a.name', [artist.id]);
  const upcoming = await query("SELECT c.id, c.slug, c.title, c.starts_at, c.time_tba, c.venue, c.city, c.country_code, c.status, c.image_url, c.price_min, c.currency, c.last_verified_at FROM concert_artists ca JOIN concerts c ON c.id = ca.concert_id WHERE ca.artist_id = $1 AND (COALESCE(c.ends_at,c.starts_at) >= now() OR c.starts_at IS NULL OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) ORDER BY c.starts_at ASC NULLS LAST LIMIT 12", [artist.id]);
  res.json({ ...artist, accounts, sources, biography, members, bands, upcoming });
});

publicRoutes.get('/concerts', async (req, res) => {
  const page = pageNumber(req.query.page);
  const term = searchTerm(req.query.q);
  const city = searchTerm(req.query.city);
  const country = searchTerm(req.query.country).toUpperCase();
  const artistId = searchTerm(req.query.artistId);
  const minPrice = !req.query.minPrice ? NaN : Number(req.query.minPrice);
  const maxPrice = !req.query.maxPrice ? NaN : Number(req.query.maxPrice);
  const status = searchTerm(req.query.status);
  const params: unknown[] = [];
  const where: string[] = [];
  if (term) { params.push('%' + term + '%'); where.push('(c.title ILIKE $' + params.length + ' OR c.venue ILIKE $' + params.length + ')'); }
  if (city) { params.push('%' + city + '%'); where.push('c.city ILIKE $' + params.length); }
  if (/^[A-Z]{2}$/.test(country)) { params.push(country); where.push('c.country_code = $' + params.length); }
  if (/^[0-9a-f-]{36}$/i.test(artistId)) { params.push(artistId); where.push('EXISTS (SELECT 1 FROM concert_artists ca WHERE ca.concert_id = c.id AND ca.artist_id = $' + params.length + ')'); }
  if (Number.isFinite(minPrice) && minPrice >= 0) { params.push(minPrice); where.push('COALESCE(c.price_max,c.price_min) >= $' + params.length); }
  if (Number.isFinite(maxPrice) && maxPrice > 0) { params.push(maxPrice); where.push('COALESCE(c.price_min,c.price_max) <= $' + params.length); }
  if (['scheduled', 'postponed', 'cancelled', 'completed'].includes(status)) { params.push(status); where.push('c.status = $' + params.length); }
  else if (!req.query.includePast) where.push("(COALESCE(c.ends_at,c.starts_at) >= now() OR c.starts_at IS NULL OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date))");
  const filter = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const count = await one<{ total: string }>('SELECT count(*)::text AS total FROM concerts c ' + filter, params);
  params.push((page - 1) * 20);
  const items = await query(
    'SELECT c.*, COALESCE((SELECT json_agg(json_build_object(\'id\', a.id, \'name\', a.name, \'slug\', a.slug)) FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id WHERE ca.concert_id = c.id), \'[]\'::json) AS artists, ' +
    'COALESCE((SELECT json_agg(json_build_object(\'source\', cs.source_name, \'url\', cs.source_url, \'fetchedAt\', cs.fetched_at)) FROM concert_sources cs WHERE cs.concert_id = c.id), \'[]\'::json) AS sources ' +
    'FROM concerts c ' + filter + ' ORDER BY c.starts_at ASC NULLS LAST, c.title ASC LIMIT 20 OFFSET $' + params.length,
    params,
  );
  res.json({ items, page, total: Number(count?.total || 0), pageSize: 20 });
});

publicRoutes.get('/concerts/:id', async (req, res) => {
  const concert = await one('SELECT * FROM concerts WHERE id::text = $1 OR slug = $1', [req.params.id]);
  if (!concert) { res.status(404).json({ error: 'ไม่พบคอนเสิร์ต' }); return; }
  const artists = await query('SELECT a.id, a.slug, a.name, a.kind, a.image_url, ' + imageCreditSelect + ' FROM concert_artists ca JOIN artists a ON a.id = ca.artist_id ' + imageCreditJoin + ' WHERE ca.concert_id = $1 ORDER BY a.name', [concert.id]);
  const sources = await query('SELECT source_name, source_url, source_role, fetched_at FROM concert_sources WHERE concert_id = $1 ORDER BY CASE source_role WHEN \'organizer\' THEN 0 WHEN \'ticket\' THEN 1 ELSE 2 END, fetched_at DESC', [concert.id]);
  const performances = await query('SELECT id,starts_at,ends_at,time_tba,status,source_url,is_current,performance_label FROM concert_performances WHERE concert_id=$1 ORDER BY starts_at', [concert.id]);
  res.json({ ...concert, artists, sources, performances });
});

publicRoutes.get('/news', async (req, res) => {
  const requestedPage = pageNumber(req.query.page, Number.MAX_SAFE_INTEGER);
  const artistId = searchTerm(req.query.artistId);
  const params: unknown[] = [];
  const where: string[] = [];
  if (/^[0-9a-f-]{36}$/i.test(artistId)) { params.push(artistId); where.push('n.artist_id = $' + params.length); }
  const filter = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = await one<{ count: string }>('SELECT count(*)::text AS count FROM news_items n ' + filter, params);
  const totalItems = Number(total?.count || 0);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(totalItems / 20)));
  const user = res.locals.user as { id: string } | null;
  params.push(user?.id || null);
  const userParam = '$' + params.length;
  params.push(config.socialStaleAfterMinutes);
  const staleParam = '$' + params.length;
  params.push((page - 1) * 20);
  const items = await query(
    'SELECT n.*, a.name AS artist_name, a.slug AS artist_slug, (f.user_id IS NOT NULL) AS followed, (n.last_verified_at < now() - ' + staleParam + '::integer * interval \'1 minute\') AS stale FROM news_items n JOIN artists a ON a.id = n.artist_id ' +
    'LEFT JOIN follows f ON f.artist_id = n.artist_id AND f.user_id = ' + userParam + ' ' + filter +
    ' ORDER BY (f.user_id IS NOT NULL) DESC, n.published_at DESC NULLS LAST, n.id DESC LIMIT 20 OFFSET $' + params.length,
    params,
  );
  res.json({ items, total: totalItems, page, pageSize: 20 });
});

publicRoutes.get('/status', async (_req, res) => {
  const rows = await query<{ source_name: string; category: string; last_started_at: string | null; last_success_at: string | null; last_error: string | null; last_count: number; enabled: boolean }>('SELECT source_name, category, last_started_at, last_success_at, last_error, last_count, enabled FROM source_state ORDER BY category, source_name');
  const sources = rows.map((source) => ({ ...source, stale: !source.last_success_at || Date.now() - new Date(source.last_success_at).getTime() > (source.category === 'news' ? config.socialStaleAfterMinutes : 120) * 60 * 1000 }));
  const counts = await one('SELECT (SELECT count(*)::integer FROM artists) AS artists, (SELECT count(*)::integer FROM concerts) AS concerts, (SELECT count(*)::integer FROM news_items) AS news');
  const biographyState = await one('SELECT enabled,model,window_start,window_end,max_per_night,last_checked_at,last_error FROM biography_worker_state WHERE id=1');
  const biographyCounts = await one(`SELECT
    (SELECT count(*)::integer FROM artists a WHERE NOT EXISTS (SELECT 1 FROM artist_biography_sections b WHERE b.artist_id=a.id)) AS pending,
    (SELECT count(*)::integer FROM biography_runs WHERE status='published') AS published`);
  const biographyRuns = await query('SELECT a.name AS artist_name,a.slug AS artist_slug,r.status,r.started_at,r.finished_at FROM biography_runs r JOIN artists a ON a.id=r.artist_id ORDER BY r.started_at DESC LIMIT 5');
  res.json({ sources, counts, biography: { state: biographyState, ...biographyCounts, runs: biographyRuns }, updatedAt: new Date().toISOString() });
});

publicRoutes.get('/status/concert-monitor', async (_req,res) => { res.json({ report: await getConcertMonitor() }); });
for (const extension of ['csv','md']) publicRoutes.get('/status/concert-monitor.' + extension, async (_req,res) => {
  const report = await getConcertMonitor();
  if (!report) { res.status(404).json({ error: 'Worker has not started monitoring' }); return; }
  res.setHeader('Content-Disposition','attachment; filename="concert-monitor.' + extension + '"');
  res.type(extension === 'csv' ? 'text/csv' : 'text/markdown');
  res.send(extension === 'csv' ? concertMonitorCsv(report) : concertMonitorMarkdown(report));
});
