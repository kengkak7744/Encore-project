import express from 'express';
import { config } from './config.js';
import { attachUser } from './auth.js';
import { migrate } from './migrate.js';
import { publicRoutes } from './routes/public.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { assistantRoutes } from './routes/assistant.js';

await migrate();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
const recent = new Map<string, { count: number; until: number }>();
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/auth/') && req.path !== '/api/chat' && req.path !== '/api/trip-estimates') { next(); return; }
  const key = (req.ip || 'unknown') + ':' + req.path;
  const now = Date.now(); const entry = recent.get(key);
  const current = !entry || entry.until < now ? { count: 0, until: now + 60000 } : entry;
  current.count++; recent.set(key, current);
  if (current.count > (req.path === '/api/trip-estimates' ? 5 : 20)) { res.status(429).json({ error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' }); return; }
  next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin && origin !== config.webOrigin) { res.status(403).json({ error: 'Origin ไม่ได้รับอนุญาต' }); return; }
  }
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', attachUser, publicRoutes, accountRoutes, assistantRoutes);
app.use('/api/admin', attachUser, adminRoutes);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const pgCode = (error as { code?: string })?.code;
  if (pgCode === '23505') { res.status(409).json({ error: 'ข้อมูลซ้ำ' }); return; }
  if (pgCode === '23503') { res.status(400).json({ error: 'ไม่พบข้อมูลอ้างอิง' }); return; }
  res.status(500).json({ error: 'ระบบขัดข้อง กรุณาลองใหม่' });
});
app.listen(config.port, () => console.log('API listening on ' + config.port));
