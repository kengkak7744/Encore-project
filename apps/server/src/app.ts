import express from 'express';
import { config } from './config.js';
import { attachUser, requireAdmin, requireUser } from './auth.js';
import { publicRoutes } from './routes/public.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { assistantRoutes } from './routes/assistant.js';
import { ArtistEditError } from './artist-editor.js';
import { communityRoutes } from './routes/community.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api',(_req,res,next) => {
    res.setHeader('Cache-Control','private, no-store');
    res.vary('Cookie');
    next();
  });
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
  // Only authenticated administrators can send the larger image-edit payload.
  app.use('/api/admin/artists',attachUser,requireAdmin,express.json({ limit: '3mb' }));
  // Binary media is parsed only after authentication; other JSON endpoints retain their small limit.
  app.post('/api/feed/uploads',attachUser,requireUser,express.raw({ limit: '25mb',type: ['image/jpeg','image/png','image/webp','video/mp4','video/webm'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', attachUser, publicRoutes, accountRoutes, communityRoutes, assistantRoutes);
  app.use('/api/admin', attachUser, adminRoutes);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ArtistEditError) { res.status(error.status).json({ error: error.message }); return; }
    console.error(error);
    const pgCode = (error as { code?: string })?.code;
    if ((error as { type?: string })?.type === 'entity.too.large') { res.status(413).json({ error: 'ไฟล์หรือข้อมูลใหญ่เกินกำหนด' }); return; }
    if ((error as { type?: string })?.type === 'entity.parse.failed') { res.status(400).json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' }); return; }
    if (pgCode === '23505') { res.status(409).json({ error: 'ข้อมูลซ้ำ' }); return; }
    if (pgCode === '23503') { res.status(400).json({ error: 'ไม่พบข้อมูลอ้างอิง' }); return; }
    res.status(500).json({ error: 'ระบบขัดข้อง กรุณาลองใหม่' });
  });
  return app;
}
