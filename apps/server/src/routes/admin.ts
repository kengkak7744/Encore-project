import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { one, query } from '../db.js';

export const adminRoutes = Router();
adminRoutes.use(requireAdmin);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f-]{36}$/i;

adminRoutes.post('/artists', async (req, res) => {
  const { name, nameEn, kind, bio, imageUrl, genres, popularityRank, popularitySourceUrl } = req.body || {};
  const artistSlug = String(req.body?.slug || '').trim();
  if (!slug.test(artistSlug) || !String(name || '').trim() || !['band', 'solo', 'member'].includes(kind)) { res.status(400).json({ error: 'ข้อมูลศิลปินไม่ถูกต้อง' }); return; }
  const artist = await one('INSERT INTO artists(slug, name, name_en, kind, bio, image_url, genres, popularity_rank, popularity_source_url, verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *', [artistSlug, String(name).trim(), nameEn || null, kind, bio || null, imageUrl || null, Array.isArray(genres) ? genres : [], Number(popularityRank) || null, popularitySourceUrl || null]);
  res.status(201).json(artist);
});

adminRoutes.patch('/artists/:id', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  const allowed: Record<string, string> = { name: 'name', nameEn: 'name_en', kind: 'kind', bio: 'bio', imageUrl: 'image_url', genres: 'genres', popularityRank: 'popularity_rank', popularitySourceUrl: 'popularity_source_url' };
  const entries = Object.entries(allowed).filter(([field]) => Object.hasOwn(req.body || {}, field));
  if (!entries.length) { res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องแก้' }); return; }
  const values = entries.map(([field]) => req.body[field]);
  values.push(req.params.id);
  const artist = await one('UPDATE artists SET ' + entries.map(([, column], index) => column + ' = $' + (index + 1)).join(', ') + ', verified_at = now(), updated_at = now() WHERE id = $' + values.length + ' RETURNING *', values);
  if (!artist) { res.status(404).json({ error: 'ไม่พบศิลปิน' }); return; }
  res.json(artist);
});

adminRoutes.put('/artists/:id/accounts', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !['x', 'facebook', 'instagram', 'website'].includes(req.body?.platform)) { res.status(400).json({ error: 'ข้อมูลบัญชีไม่ถูกต้อง' }); return; }
  let url: URL;
  try { url = new URL(req.body.url); if (url.protocol !== 'https:') throw Error(); } catch { res.status(400).json({ error: 'ต้องใช้ HTTPS URL' }); return; }
  const domains: Record<string, string[]> = { x: ['x.com', 'twitter.com'], facebook: ['facebook.com', 'fb.com'], instagram: ['instagram.com'], website: [] };
  const expected = domains[req.body.platform];
  if (expected.length && !expected.some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain))) { res.status(400).json({ error: 'URL ไม่ตรงกับแพลตฟอร์ม' }); return; }
  const handle = req.body.handle || (req.body.platform === 'website' ? null : url.pathname.split('/').filter(Boolean)[0] || null);
  const account = await one('INSERT INTO social_accounts(artist_id, platform, handle, url, external_id, verified_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(artist_id, platform, url) DO UPDATE SET handle = EXCLUDED.handle, external_id = EXCLUDED.external_id, verified_at = now() RETURNING *', [req.params.id, req.body.platform, handle, url.toString(), req.body.externalId || null]);
  res.json(account);
});

adminRoutes.put('/artists/:id/members/:memberId', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !uuid.test(req.params.memberId as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  await query('INSERT INTO artist_memberships(band_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.params.memberId]);
  res.json({ ok: true });
});

adminRoutes.put('/artists/:id/sources', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  let source: URL;
  try { source = new URL(req.body?.url); if (source.protocol !== 'https:' || source.username || source.password) throw Error(); }
  catch { res.status(400).json({ error: 'ต้องใช้ URL แหล่งข้อมูล HTTPS' }); return; }
  const label = String(req.body?.label || source.hostname).trim().slice(0, 160);
  await query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT(artist_id,source_url) DO UPDATE SET label=$3,checked_at=now()', [req.params.id, source.toString(), label]);
  res.json({ ok: true });
});

adminRoutes.get('/biography-runs', async (_req, res) => {
  const items = await query('SELECT r.*,a.name AS artist_name,a.slug AS artist_slug FROM biography_runs r JOIN artists a ON a.id=r.artist_id ORDER BY r.started_at DESC LIMIT 50');
  res.json({ items });
});

adminRoutes.post('/concerts', async (req, res) => {
  const body = req.body || {};
  if (!slug.test(String(body.slug || '')) || !String(body.title || '').trim()) { res.status(400).json({ error: 'ข้อมูลคอนเสิร์ตไม่ถูกต้อง' }); return; }
  const concert = await one('INSERT INTO concerts(slug,title,description,venue,city,country_code,starts_at,ends_at,status,price_min,price_max,currency,official_url,last_verified_at,manual_override) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),true) RETURNING *', [body.slug, body.title, body.description || null, body.venue || null, body.city || null, body.countryCode || 'TH', body.startsAt || null, body.endsAt || null, body.status || 'scheduled', body.priceMin ?? null, body.priceMax ?? null, body.currency || 'THB', body.officialUrl || null]);
  res.status(201).json(concert);
});

adminRoutes.patch('/concerts/:id', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  const allowed: Record<string, string> = { title: 'title', description: 'description', venue: 'venue', city: 'city', countryCode: 'country_code', startsAt: 'starts_at', endsAt: 'ends_at', status: 'status', priceMin: 'price_min', priceMax: 'price_max', currency: 'currency', officialUrl: 'official_url' };
  const entries = Object.entries(allowed).filter(([field]) => Object.hasOwn(req.body || {}, field));
  if (!entries.length) { res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องแก้' }); return; }
  const values = entries.map(([field]) => req.body[field]); values.push(req.params.id);
  const concert = await one('UPDATE concerts SET ' + entries.map(([, column], index) => column + ' = $' + (index + 1)).join(', ') + ', manual_override = true, last_verified_at = now(), updated_at = now() WHERE id = $' + values.length + ' RETURNING *', values);
  if (!concert) { res.status(404).json({ error: 'ไม่พบคอนเสิร์ต' }); return; }
  res.json(concert);
});

adminRoutes.put('/concerts/:id/artists/:artistId', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !uuid.test(req.params.artistId as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  await query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.params.artistId]);
  res.json({ ok: true });
});

adminRoutes.post('/concerts/:id/performances', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !req.body?.startsAt || Number.isNaN(Date.parse(req.body.startsAt))) { res.status(400).json({ error: 'รอบแสดงไม่ถูกต้อง' }); return; }
  const row = await one('INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(concert_id,starts_at) DO UPDATE SET ends_at=EXCLUDED.ends_at,time_tba=EXCLUDED.time_tba,status=EXCLUDED.status,source_url=EXCLUDED.source_url,updated_at=now() RETURNING *', [req.params.id, req.body.startsAt, req.body.endsAt || null, req.body.timeTba || false, req.body.status || 'scheduled', req.body.sourceUrl || null]);
  res.status(201).json(row);
});

adminRoutes.get('/sync-runs', async (_req, res) => { res.json({ items: await query('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100') }); });
