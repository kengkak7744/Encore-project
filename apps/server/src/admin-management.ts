import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool, one, query } from './db.js';
import { ArtistEditError } from './artist-editor.js';
import type { PoolClient } from 'pg';

export const managementRoutes = Router();
export const validId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const platforms: Record<string,string[]> = { x: ['x.com','twitter.com'],facebook: ['facebook.com','fb.com'],instagram: ['instagram.com'],website: [],youtube: ['youtube.com','youtu.be'],tiktok: ['tiktok.com'] };
export function managementText(value: unknown, label: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ArtistEditError(label + 'ไม่ถูกต้อง');
  return value.trim();
}
export function accountInput(input: Record<string,unknown>) {
  const platform = String(input.platform || '');
  if (!Object.hasOwn(platforms,platform)) throw new ArtistEditError('แพลตฟอร์มไม่ถูกต้อง');
  const raw = managementText(input.url,'URL',2048);
  let url: URL;
  try { url = new URL(raw); } catch { throw new ArtistEditError('ต้องใช้ HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || url.hostname === 'localhost' || /(^|\.)(localhost|local|internal|test)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new ArtistEditError('ต้องใช้ HTTPS URL สาธารณะ');
  if (platforms[platform].length && !platforms[platform].some(host => url.hostname === host || url.hostname.endsWith('.'+host))) throw new ArtistEditError('URL ไม่ตรงกับแพลตฟอร์ม');
  const parts = url.pathname.split('/').filter(Boolean);
  if (platform !== 'website' && (!parts.length || (platform === 'instagram' && (parts.length !== 1 || !/^[a-zA-Z0-9._]+$/.test(parts[0]) || ['p','reel','reels','stories','explore','accounts'].includes(parts[0].toLowerCase()))) || (platform === 'x' && (parts.length !== 1 || !/^[a-zA-Z0-9_]+$/.test(parts[0]) || ['home','search','i','intent','explore'].includes(parts[0].toLowerCase()))))) throw new ArtistEditError('ใช้ลิงก์โปรไฟล์บัญชี ไม่ใช่ลิงก์โพสต์');
  if (input.verified !== undefined && typeof input.verified !== 'boolean') throw new ArtistEditError('สถานะตรวจบัญชีไม่ถูกต้อง');
  if (platform==='tiktok' && (parts.length!==1 || !/^@[a-zA-Z0-9._]+$/.test(parts[0]))) throw new ArtistEditError('ใช้ลิงก์โปรไฟล์ TikTok');
  if (platform==='youtube' && !((parts.length===1 && /^@[a-zA-Z0-9._-]+$/.test(parts[0])) || (parts.length===2 && ['channel','c','user'].includes(parts[0])))) throw new ArtistEditError('ใช้ลิงก์ช่อง YouTube');
  if (platform==='instagram' || platform==='x') {
    url.hostname = platform==='instagram' ? 'www.instagram.com' : 'x.com';
    parts[0] = parts[0].toLowerCase(); url.pathname='/'+parts[0]+'/'; url.search='';
  }
  url.hash = '';
  const handle = platform === 'website' ? null : parts[0];
  const externalId = input.externalId ? managementText(input.externalId,'รหัสบัญชี',200) : null;
  return { platform,url: url.href,handle,externalId,verified: input.verified === true };
}
export function automaticSlug(name: string, supplied?: unknown, accounts: { handle: string | null }[] = []) {
  if (supplied !== undefined && supplied !== '') {
    const value = managementText(supplied,'Slug');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new ArtistEditError('Slug ไม่ถูกต้อง');
    return value;
  }
  const latin = name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80).replace(/-$/,'');
  const handle = accounts.map(row => row.handle?.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).find(Boolean);
  return latin || handle || 'artist-'+randomUUID().slice(0,8);
}
export async function createManagedArtist(body: Record<string,unknown>) {
  const name = managementText(body.name,'ชื่อศิลปิน');
  const kind = body.kind ?? 'solo';
  if (!['solo','band','member'].includes(String(kind))) throw new ArtistEditError('ประเภทศิลปินไม่ถูกต้อง');
  if (body.accounts !== undefined && (!Array.isArray(body.accounts) || body.accounts.length > 12)) throw new ArtistEditError('ช่องทางโซเชียลไม่ถูกต้อง');
  const accounts = (Array.isArray(body.accounts) ? body.accounts : []).map(value => {
    if (!value || typeof value !== 'object') throw new ArtistEditError('ช่องทางโซเชียลไม่ถูกต้อง');
    return accountInput(value);
  });
  if (new Set(accounts.map(row => row.platform+':'+row.url)).size !== accounts.length) throw new ArtistEditError('ช่องทางโซเชียลซ้ำ');
  const nameEn = body.nameEn ? managementText(body.nameEn,'ชื่อภาษาอังกฤษ') : null;
  const genres = body.genres ?? [];
  if (!Array.isArray(genres) || genres.length > 20) throw new ArtistEditError('แนวเพลงไม่ถูกต้อง');
  const validGenres = genres.map(value => managementText(value,'แนวเพลง',100));
  if (body.imageUrl || body.bio) throw new ArtistEditError('เพิ่มประวัติและภาพพร้อมหลักฐานผ่านหน้าแก้ไขหลังสร้างโปรไฟล์');
  const base = automaticSlug(name,body.slug,accounts);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize creation to keep generated slugs and duplicate checks atomic.
    await client.query('SELECT pg_advisory_xact_lock(6210422)');
    if ((await client.query('SELECT id FROM artists WHERE lower(btrim(name))=lower($1)',[name])).rowCount) throw new ArtistEditError('มีศิลปินชื่อนี้แล้ว กรุณาค้นหาเพื่อแก้ไข',409);
    for (const account of accounts) if ((await client.query('SELECT id FROM social_accounts WHERE platform=$1 AND url=$2',[account.platform,account.url])).rowCount) throw new ArtistEditError('บัญชีนี้อยู่ในโปรไฟล์อื่นแล้ว กรุณาตรวจชื่อศิลปิน',409);
    let slug = base, suffix = 2;
    while ((await client.query('SELECT id FROM artists WHERE slug=$1',[slug])).rowCount) {
      if (body.slug) throw new ArtistEditError('Slug ซ้ำ',409);
      slug = base+'-'+suffix++;
    }
    const artist = (await client.query('INSERT INTO artists(slug,name,name_en,kind,genres,catalog_manual_override) VALUES($1,$2,$3,$4,$5,true) RETURNING *',[slug,name,nameEn,kind,validGenres])).rows[0];
    for (const account of accounts) {
      await client.query('INSERT INTO social_accounts(artist_id,platform,handle,url,external_id,verified_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END)',[artist.id,account.platform,account.handle,account.url,account.externalId,account.verified]);
      if (account.verified && account.platform === 'website') await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3)',[artist.id,account.url,'เว็บไซต์ทางการ']);
    }
    await client.query('COMMIT');
    return artist;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function id(value: unknown) { if (typeof value !== 'string' || !validId.test(value)) throw new ArtistEditError('รหัสไม่ถูกต้อง'); return value; }
export async function changeArtistCollection<T>(artistId: string, action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await client.query('SELECT id FROM artists WHERE id=$1 FOR UPDATE',[artistId])).rowCount) throw new ArtistEditError('ไม่พบศิลปิน',404);
    const result = await action(client);
    await client.query('UPDATE artists SET catalog_manual_override=true,updated_at=now() WHERE id=$1',[artistId]);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
function pagination(value: unknown) { const page = Number(value || 1); return Number.isSafeInteger(page) ? Math.max(1,Math.min(page,10000)) : 1; }
managementRoutes.get('/overview',async (_req,res) => {
  res.json(await one(`SELECT (SELECT count(*)::int FROM artists) AS artists,(SELECT count(*)::int FROM concerts) AS concerts,
    (SELECT count(*)::int FROM news_items) AS news,(SELECT count(*)::int FROM news_items WHERE hidden) AS hidden_news,
    (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM artists a WHERE NOT a.biography_manual_override AND NOT EXISTS(SELECT 1 FROM artist_biography_sections b WHERE b.artist_id=a.id)) AS pending_biographies`));
});
managementRoutes.get('/artists/:id/accounts',async (req,res) => {
  const artistId = id(req.params.id);
  if (!await one('SELECT id FROM artists WHERE id=$1',[artistId])) throw new ArtistEditError('ไม่พบศิลปิน',404);
  res.json({ items: await query('SELECT id,platform,handle,url,external_id,verified_at,last_checked_at,last_success_at,last_error FROM social_accounts WHERE artist_id=$1 ORDER BY platform,url',[artistId]) });
});
managementRoutes.patch('/artists/:id/accounts/:accountId',async (req,res) => {
  const artistId = id(req.params.id), accountId = id(req.params.accountId);
  const row = await one('SELECT * FROM social_accounts WHERE id=$1 AND artist_id=$2',[accountId,artistId]);
  if (!row) throw new ArtistEditError('ไม่พบบัญชี',404);
  const account = accountInput({ platform: row.platform,url: req.body?.url ?? row.url,externalId: req.body?.externalId ?? row.external_id,verified: req.body?.verified ?? !!row.verified_at });
  res.json(await changeArtistCollection(artistId,async client => (await client.query(`UPDATE social_accounts SET url=$3,handle=$4,external_id=$5,verified_at=CASE WHEN $6 THEN now() ELSE NULL END,
    last_checked_at=CASE WHEN url<>$3 THEN NULL ELSE last_checked_at END,last_success_at=CASE WHEN url<>$3 THEN NULL ELSE last_success_at END,
    last_error=CASE WHEN url<>$3 THEN NULL ELSE last_error END,next_sync_at=CASE WHEN url<>$3 THEN NULL ELSE next_sync_at END
    WHERE id=$1 AND artist_id=$2 RETURNING id,platform,url,verified_at`,[accountId,artistId,account.url,account.handle,account.externalId,account.verified])).rows[0]));
});
managementRoutes.delete('/artists/:id/accounts/:accountId',async (req,res) => {
  await changeArtistCollection(id(req.params.id),async client => {
    if (!(await client.query('DELETE FROM social_accounts WHERE id=$1 AND artist_id=$2 RETURNING id',[id(req.params.accountId),req.params.id])).rowCount) throw new ArtistEditError('ไม่พบบัญชี',404);
  });
  res.json({ ok: true });
});
managementRoutes.delete('/artists/:id/members/:memberId',async (req,res) => {
  await changeArtistCollection(id(req.params.id),async client => { await client.query('DELETE FROM artist_memberships WHERE band_id=$1 AND member_id=$2',[req.params.id,id(req.params.memberId)]); }); res.json({ ok: true });
});
managementRoutes.delete('/artists/:id/sources',async (req,res) => {
  const url = managementText(req.body?.url,'แหล่งข้อมูล',2048);
  await changeArtistCollection(id(req.params.id),async client => { await client.query('DELETE FROM artist_sources WHERE artist_id=$1 AND source_url=$2',[req.params.id,url]); }); res.json({ ok: true });
});
managementRoutes.delete('/concerts/:id/artists/:artistId',async (req,res) => {
  await query('DELETE FROM concert_artists WHERE concert_id=$1 AND artist_id=$2',[id(req.params.id),id(req.params.artistId)]); res.json({ ok: true });
});
managementRoutes.get('/news',async (req,res) => {
  const page = pagination(req.query.page), q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,200) : '';
  const where = "WHERE ($1='' OR a.name ILIKE '%' || $1 || '%' OR COALESCE(n.body,n.title,'') ILIKE '%' || $1 || '%')";
  const count = await one('SELECT count(*)::int AS total FROM news_items n JOIN artists a ON a.id=n.artist_id '+where,[q]);
  const items = await query('SELECT n.id,n.title,n.body,n.summary,n.source_url,n.platform,n.published_at,n.hidden,a.name AS artist_name FROM news_items n JOIN artists a ON a.id=n.artist_id '+where+' ORDER BY n.published_at DESC NULLS LAST,n.id LIMIT 20 OFFSET $2',[q,(page-1)*20]);
  res.json({ items,total: count?.total || 0,page,pageSize: 20 });
});
managementRoutes.patch('/news/:id',async (req,res) => {
  if (typeof req.body?.hidden !== 'boolean') throw new ArtistEditError('สถานะแสดงข่าวไม่ถูกต้อง');
  const news = await one('UPDATE news_items SET hidden=$2,moderated_at=now() WHERE id=$1 RETURNING id,hidden',[id(req.params.id),req.body.hidden]);
  if (!news) throw new ArtistEditError('ไม่พบข่าว',404);
  res.json(news);
});
managementRoutes.get('/users',async (req,res) => {
  const page = pagination(req.query.page), q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,200) : '';
  const where = "WHERE ($1='' OR email ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%')";
  const count = await one('SELECT count(*)::int AS total FROM users '+where,[q]);
  res.json({ items: await query('SELECT id,email,display_name,role,created_at,(SELECT count(*)::int FROM sessions s WHERE s.user_id=users.id AND s.expires_at>now()) AS active_sessions FROM users '+where+' ORDER BY created_at DESC,id LIMIT 20 OFFSET $2',[q,(page-1)*20]),total: count?.total || 0,page,pageSize: 20 });
});
managementRoutes.patch('/users/:id/role',async (req,res) => {
  const userId = id(req.params.id), role = req.body?.role;
  if (!['user','admin'].includes(role)) throw new ArtistEditError('สิทธิ์ไม่ถูกต้อง');
  if (userId === res.locals.user.id) throw new ArtistEditError('เปลี่ยนสิทธิ์บัญชีที่กำลังใช้งานไม่ได้');
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(6210423)');
    const actor = (await client.query('SELECT role FROM users WHERE id=$1',[res.locals.user.id])).rows[0];
    if (actor?.role !== 'admin') throw new ArtistEditError('ไม่มีสิทธิ์เข้าถึง',403);
    const updated = (await client.query('UPDATE users SET role=$2 WHERE id=$1 RETURNING id,role',[userId,role])).rows[0];
    if (!updated) throw new ArtistEditError('ไม่พบบัญชีผู้ใช้',404);
    await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
    await client.query('COMMIT'); res.json(updated);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
});
managementRoutes.delete('/users/:id/sessions',async (req,res) => {
  const userId = id(req.params.id);
  if (!await one('SELECT id FROM users WHERE id=$1',[userId])) throw new ArtistEditError('ไม่พบบัญชีผู้ใช้',404);
  await query('DELETE FROM sessions WHERE user_id=$1',[userId]); res.json({ ok: true });
});
