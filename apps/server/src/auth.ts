import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { one, query } from './db.js';

const scrypt = promisify(scryptCallback);
const cookieName = 'artist_session';
const sessionDays = 30;

export type User = { id: string; email: string; display_name: string; role: 'user' | 'admin' };

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ':' + derived.toString('hex');
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function cookieToken(req: Request) {
  const entry = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(cookieName + '='));
  try { return entry ? decodeURIComponent(entry.slice(cookieName.length + 1)) : null; }
  catch { return null; }
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await query('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval \'30 days\')', [tokenHash(token), userId]);
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export async function clearSession(req: Request, res: Response) {
  const token = cookieToken(req);
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
  res.clearCookie(cookieName, { path: '/' });
}

export async function attachUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = cookieToken(req);
    res.locals.user = token ? await one<User>(
      'SELECT users.id, users.email, users.display_name, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1 AND sessions.expires_at > now()',
      [tokenHash(token)],
    ) : null;
    if (!res.locals.user && (req.headers.cookie || '').split(';').some(part => part.trim().startsWith(cookieName + '='))) {
      res.clearCookie(cookieName, { path: '/' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

// Long requests must recheck the session after waiting for AI or a provider.
export async function revalidateUser(req: Request, res: Response) {
  const token = cookieToken(req);
  const user = token ? await one<User>(
    'SELECT users.id, users.email, users.display_name, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1 AND sessions.expires_at > now()',
    [tokenHash(token)],
  ) : null;
  if (!user || user.id !== res.locals.user?.id) {
    res.locals.user = null;
    res.clearCookie(cookieName, { path: '/' });
    res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    return false;
  }
  res.locals.user = user;
  return true;
}

export function requireUser(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) { res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); return; }
  next();
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.user) { res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); return; }
  if (res.locals.user.role !== 'admin') { res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' }); return; }
  next();
}
