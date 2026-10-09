import { Router } from 'express';
import { getDataUsage } from '../data-usage.js';
import { getInstagramMonitor } from '../instagram-monitor.js';
import { requireAdmin } from '../auth.js';
import { one, query } from '../db.js';
import { ArtistEditError, editArtist } from '../artist-editor.js';
import { managementRoutes, createManagedArtist, accountInput, changeArtistCollection } from '../admin-management.js';
import { saveManagedConcert, saveManagedPerformance } from '../admin-concerts.js';

export const adminRoutes = Router();
adminRoutes.use(requireAdmin);
adminRoutes.get('/instagram-monitor',async (_req,res)=>{res.json(await getInstagramMonitor());});
adminRoutes.use(managementRoutes);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

adminRoutes.post('/artists', async (req, res) => {
  res.status(201).json(await createManagedArtist(req.body || {}));
});

adminRoutes.patch('/artists/:id', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  try { res.json(await editArtist(req.params.id as string,req.body || {})); }
  catch (error) { if (error instanceof ArtistEditError) { res.status(error.status).json({ error: error.message }); return; } throw error; }
});

adminRoutes.put('/artists/:id/accounts', async (req, res) => {
  if (!uuid.test(req.params.id as string)) throw new ArtistEditError('รหัสไม่ถูกต้อง');
  if (!await one('SELECT id FROM artists WHERE id=$1',[req.params.id])) throw new ArtistEditError('ไม่พบศิลปิน',404);
  const input = accountInput({ ...req.body,verified: req.body?.verified ?? true });
  const account = await changeArtistCollection(req.params.id as string,async client => (await client.query('INSERT INTO social_accounts(artist_id, platform, handle, url, external_id, verified_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END) ON CONFLICT(artist_id, platform, url) DO UPDATE SET handle = EXCLUDED.handle, external_id = EXCLUDED.external_id, verified_at = EXCLUDED.verified_at RETURNING *', [req.params.id, input.platform, input.handle, input.url, input.externalId, input.verified])).rows[0]);
  res.json(account);
});

adminRoutes.put('/artists/:id/members/:memberId', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !uuid.test(req.params.memberId as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  const band = await one('SELECT kind FROM artists WHERE id=$1',[req.params.id]), member = await one('SELECT kind FROM artists WHERE id=$1',[req.params.memberId]);
  if (!band || !member) throw new ArtistEditError('ไม่พบศิลปิน',404);
  if (band.kind !== 'band' || member.kind === 'band' || req.params.id === req.params.memberId) throw new ArtistEditError('เลือกวงและสมาชิกให้ถูกต้อง');
  await changeArtistCollection(req.params.id as string,async client => { await client.query('INSERT INTO artist_memberships(band_id, member_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.params.memberId]); });
  res.json({ ok: true });
});

adminRoutes.put('/artists/:id/sources', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  let source: URL;
  try { source = new URL(req.body?.url); if (source.protocol !== 'https:' || source.username || source.password) throw Error(); }
  catch { res.status(400).json({ error: 'ต้องใช้ URL แหล่งข้อมูล HTTPS' }); return; }
  const label = String(req.body?.label || source.hostname).trim().slice(0, 160);
  await changeArtistCollection(req.params.id as string,async client => { await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT(artist_id,source_url) DO UPDATE SET label=$3,checked_at=now()', [req.params.id, source.toString(), label]); });
  res.json({ ok: true });
});

adminRoutes.get('/biography-runs', async (_req, res) => {
  const items = await query('SELECT r.*,a.name AS artist_name,a.slug AS artist_slug FROM biography_runs r JOIN artists a ON a.id=r.artist_id ORDER BY r.started_at DESC LIMIT 50');
  res.json({ items });
});

adminRoutes.post('/concerts', async (req, res) => {
  res.status(201).json(await saveManagedConcert(req.body || {}));
});

adminRoutes.patch('/concerts/:id', async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  res.json(await saveManagedConcert(req.body || {},req.params.id as string));
});

adminRoutes.put('/concerts/:id/artists/:artistId', async (req, res) => {
  if (!uuid.test(req.params.id as string) || !uuid.test(req.params.artistId as string)) { res.status(400).json({ error: 'รหัสไม่ถูกต้อง' }); return; }
  await query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.params.artistId]);
  res.json({ ok: true });
});

adminRoutes.post('/concerts/:id/performances', async (req, res) => {
  if (!uuid.test(req.params.id as string)) throw new ArtistEditError('รหัสไม่ถูกต้อง');
  res.status(201).json(await saveManagedPerformance(req.params.id as string,req.body || {}));
});

adminRoutes.patch('/concerts/:id/performances/:performanceId',async (req,res) => {
  if (!uuid.test(req.params.id as string) || !uuid.test(req.params.performanceId as string)) throw new ArtistEditError('รหัสไม่ถูกต้อง');
  res.json(await saveManagedPerformance(req.params.id as string,req.body || {},req.params.performanceId as string));
});

adminRoutes.get('/sync-runs', async (_req, res) => { res.json({ items: await query('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100') }); });

adminRoutes.get('/data-usage',async (req,res) => {
  const period = req.query.period ?? '24h';
  if ((period !== '24h' && period !== '7d') || Object.keys(req.query).some(key => key !== 'period')) { res.status(400).json({ error: 'เลือกช่วง 24h หรือ 7d' }); return; }
  res.json(await getDataUsage(period));
});
