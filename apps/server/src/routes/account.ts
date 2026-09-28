import { Router } from 'express';
import { clearSession, createSession, hashPassword, requireUser, verifyPassword, type User } from '../auth.js';
import { one, query } from '../db.js';

export const accountRoutes = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

accountRoutes.post('/auth/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.displayName || '').trim();
  const password = String(req.body?.password || '');
  if (!emailPattern.test(email) || name.length < 2 || name.length > 80 || password.length < 10 || password.length > 128) {
    res.status(400).json({ error: 'ตรวจอีเมล ชื่อ และรหัสผ่านอย่างน้อย 10 ตัวอักษร' }); return;
  }
  const existing = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) { res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' }); return; }
  const user = await one<User>('INSERT INTO users(email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name, role', [email, name, await hashPassword(password)]);
  await createSession(res, user!.id);
  res.status(201).json({ user });
});

accountRoutes.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const row = await one<User & { password_hash: string }>('SELECT id, email, display_name, role, password_hash FROM users WHERE email = $1', [email]);
  if (!row || !await verifyPassword(password, row.password_hash)) { res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }); return; }
  await createSession(res, row.id);
  const { password_hash: _hidden, ...user } = row;
  res.json({ user });
});

accountRoutes.post('/auth/logout', async (req, res) => { await clearSession(req, res); res.json({ ok: true }); });

accountRoutes.get('/me', requireUser, async (_req, res) => {
  const user = res.locals.user as User;
  const [follows, attendance] = await Promise.all([
    query('SELECT a.id, a.name, a.slug, a.image_url, a.kind FROM follows f JOIN artists a ON a.id = f.artist_id WHERE f.user_id = $1 ORDER BY a.name', [user.id]),
    query('SELECT c.id, c.title, c.slug, c.starts_at, c.venue, c.city FROM attendance at JOIN concerts c ON c.id = at.concert_id WHERE at.user_id = $1 ORDER BY c.starts_at DESC NULLS LAST', [user.id]),
  ]);
  res.json({ user, follows, attendance });
});

accountRoutes.put('/me/follows/:id', requireUser, async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสศิลปินไม่ถูกต้อง' }); return; }
  const row = await one('INSERT INTO follows(user_id, artist_id) SELECT $1, id FROM artists WHERE id = $2 ON CONFLICT DO NOTHING RETURNING artist_id', [(res.locals.user as User).id, req.params.id]);
  if (!row && !await one('SELECT 1 FROM artists WHERE id = $1', [req.params.id])) { res.status(404).json({ error: 'ไม่พบศิลปิน' }); return; }
  res.json({ ok: true });
});

accountRoutes.delete('/me/follows/:id', requireUser, async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสศิลปินไม่ถูกต้อง' }); return; }
  await query('DELETE FROM follows WHERE user_id = $1 AND artist_id = $2', [(res.locals.user as User).id, req.params.id]);
  res.json({ ok: true });
});

accountRoutes.put('/me/attendance/:id', requireUser, async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสคอนเสิร์ตไม่ถูกต้อง' }); return; }
  const row = await one("INSERT INTO attendance(user_id, concert_id) SELECT $1, id FROM concerts WHERE id = $2 AND starts_at < now() AND (NOT time_tba OR (starts_at AT TIME ZONE 'Asia/Bangkok')::date < (now() AT TIME ZONE 'Asia/Bangkok')::date) ON CONFLICT DO NOTHING RETURNING concert_id", [(res.locals.user as User).id, req.params.id]);
  if (!row && !await one('SELECT 1 FROM concerts WHERE id = $1', [req.params.id])) { res.status(404).json({ error: 'ไม่พบคอนเสิร์ต' }); return; }
  if (!row && !await one('SELECT 1 FROM attendance WHERE user_id=$1 AND concert_id=$2', [(res.locals.user as User).id, req.params.id])) { res.status(400).json({ error: 'บันทึกงานที่เคยไปได้หลังวันแสดง' }); return; }
  res.json({ ok: true });
});

accountRoutes.delete('/me/attendance/:id', requireUser, async (req, res) => {
  if (!uuid.test(req.params.id as string)) { res.status(400).json({ error: 'รหัสคอนเสิร์ตไม่ถูกต้อง' }); return; }
  await query('DELETE FROM attendance WHERE user_id = $1 AND concert_id = $2', [(res.locals.user as User).id, req.params.id]);
  res.json({ ok: true });
});
