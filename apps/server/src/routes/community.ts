import { Router } from 'express';
import { requireAdmin, requireUser, revalidateUser, type User } from '../auth.js';
import { one, query } from '../db.js';
import { communityId, communityPage, communitySidebar, communityText, concertReviewState, getCommunityFeed, saveCommunityPost, saveConcertReview, storeCommunityUpload } from '../community.js';

export const communityRoutes = Router();
const user = (res: { locals: Record<string,any> }) => res.locals.user as User | null;
const writes = new Map<string,{ count: number; until: number }>();
communityRoutes.use((req,res,next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method) || !req.path.startsWith('/feed/') || !user(res)) { next(); return; }
  const key = user(res)!.id, now = Date.now(), previous = writes.get(key);
  const entry = !previous || previous.until<=now ? { count: 0,until: now+60000 } : previous;
  entry.count++; writes.set(key,entry);
  if (writes.size>1000) for (const [id,value] of writes) if (value.until<=now) writes.delete(id);
  if (entry.count>30) { res.status(429).json({ error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' }); return; }
  next();
});

communityRoutes.get('/feed',async (req,res) => {
  const tab = req.query.tab==='following' ? 'following' : 'for-you';
  if (tab==='following' && !user(res)) { res.status(401).json({ error: 'เข้าสู่ระบบเพื่อดูศิลปินที่ติดตาม' }); return; }
  res.json(await getCommunityFeed(user(res)?.id || null,tab,communityPage(req.query.page),typeof req.query.snapshot==='string' ? req.query.snapshot : undefined));
});
communityRoutes.get('/feed/sidebar',async (_req,res) => res.json(await communitySidebar(user(res)?.id || null)));
communityRoutes.post('/feed/uploads',requireUser,async (req,res) => {
  if (req.get('x-media-rights')!=='confirmed') { res.status(400).json({ error: 'ยืนยันว่าคุณมีสิทธิ์เผยแพร่ไฟล์ก่อนอัปโหลด' }); return; }
  if (!await revalidateUser(req,res)) return;
  res.status(201).json(await storeCommunityUpload(user(res)!.id,req.body,(req.get('content-type') || '').split(';')[0]));
});
communityRoutes.delete('/feed/uploads/:id',requireUser,async (req,res) => {
  const removed = await one('DELETE FROM community_uploads WHERE id=$1 AND user_id=$2 AND post_id IS NULL RETURNING id',[communityId(req.params.id),user(res)!.id]);
  if (!removed) { res.status(404).json({ error: 'ไม่พบไฟล์ร่างของคุณ' }); return; }
  res.json({ ok: true });
});
communityRoutes.get('/feed/media/:id',async (req,res) => {
  const id = communityId(req.params.id);
  const media = await one<{ content_type: string; byte_size: number }>(`SELECT m.content_type,m.byte_size FROM community_uploads m LEFT JOIN community_posts p ON p.id=m.post_id
    WHERE m.id=$1 AND ((m.post_id IS NULL AND m.user_id=$2) OR (m.post_id IS NOT NULL AND NOT p.hidden))`,[id,user(res)?.id || null]);
  if (!media) { res.status(404).json({ error: 'ไม่พบสื่อ' }); return; }
  const total = media.byte_size, range = req.get('range');
  let start = 0,end = total-1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) { res.setHeader('Content-Range','bytes */'+total); res.status(416).end(); return; }
    if (!match[1]) { const suffix=Number(match[2]); start=Math.max(0,total-suffix); if (!suffix) start=total; }
    else { start=Number(match[1]); if (match[2]) end=Math.min(total-1,Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>=total || end<start) { res.setHeader('Content-Range','bytes */'+total); res.status(416).end(); return; }
  }
  const length = end-start+1;
  if (req.method!=='HEAD') {
    const bytes = await one<{ data: Buffer }>('SELECT substring(data FROM $2::int FOR $3::int) AS data FROM community_uploads WHERE id=$1',[id,start+1,length]);
    if (!bytes) { res.status(404).json({ error: 'ไม่พบสื่อ' }); return; }
    res.locals.mediaData = bytes.data;
  }
  res.setHeader('Content-Type',media.content_type); res.setHeader('Content-Length',length);
  res.setHeader('Accept-Ranges','bytes'); res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Disposition','inline');
  if (range) { res.status(206); res.setHeader('Content-Range',`bytes ${start}-${end}/${total}`); }
  if (req.method==='HEAD') res.end(); else res.end(res.locals.mediaData);
});
communityRoutes.post('/feed/posts',requireUser,async (req,res) => res.status(201).json(await saveCommunityPost(user(res)!.id,req.body || {})));
communityRoutes.patch('/feed/posts/:id',requireUser,async (req,res) => res.json(await saveCommunityPost(user(res)!.id,req.body || {},communityId(req.params.id))));
communityRoutes.delete('/feed/posts/:id',requireUser,async (req,res) => {
  const deleted = await one('DELETE FROM community_posts WHERE id=$1 AND user_id=$2 RETURNING id',[communityId(req.params.id),user(res)!.id]);
  if (!deleted) { res.status(404).json({ error: 'ไม่พบโพสต์ของคุณ' }); return; }
  res.json({ ok: true });
});
async function visiblePost(id: string) {
  return one('SELECT id FROM community_posts WHERE id=$1 AND NOT hidden',[id]);
}
for (const method of ['put','delete'] as const) communityRoutes[method]('/feed/posts/:id/like',requireUser,async (req,res) => {
  const id = communityId(req.params.id);
  if (!await visiblePost(id)) { res.status(404).json({ error: 'ไม่พบโพสต์' }); return; }
  if (method==='put') await query('INSERT INTO community_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,user(res)!.id]);
  else await query('DELETE FROM community_likes WHERE post_id=$1 AND user_id=$2',[id,user(res)!.id]);
  res.json({ ok: true });
});
communityRoutes.get('/feed/posts/:id/comments',async (req,res) => {
  const id = communityId(req.params.id);
  if (!await visiblePost(id)) { res.status(404).json({ error: 'ไม่พบโพสต์' }); return; }
  const total = (await one<{ total: number }>('SELECT count(*)::int total FROM community_comments WHERE post_id=$1 AND NOT hidden',[id]))!.total;
  const page = Math.min(communityPage(req.query.page),Math.max(1,Math.ceil(total/10)));
  const items = await query(`SELECT cc.id,cc.body,cc.created_at,(cc.user_id=$2) AS own,json_build_object('id',u.id,'display_name',u.display_name) AS author
    FROM community_comments cc JOIN users u ON u.id=cc.user_id WHERE cc.post_id=$1 AND NOT cc.hidden ORDER BY cc.created_at DESC,cc.id DESC LIMIT 10 OFFSET $3`,[id,user(res)?.id || null,(page-1)*10]);
  res.json({ items,total,page,pageSize: 10 });
});
communityRoutes.post('/feed/posts/:id/comments',requireUser,async (req,res) => {
  const id = communityId(req.params.id), body = communityText(req.body?.body,1000);
  if (!await visiblePost(id)) { res.status(404).json({ error: 'ไม่พบโพสต์' }); return; }
  res.status(201).json(await one('INSERT INTO community_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id',[id,user(res)!.id,body]));
});
communityRoutes.delete('/feed/comments/:id',requireUser,async (req,res) => {
  const row = await one('DELETE FROM community_comments WHERE id=$1 AND user_id=$2 RETURNING id',[communityId(req.params.id),user(res)!.id]);
  if (!row) { res.status(404).json({ error: 'ไม่พบความคิดเห็นของคุณ' }); return; }
  res.json({ ok: true });
});

communityRoutes.get('/concerts/:id/reviews',async (req,res) => {
  const id = communityId(req.params.id), userId = user(res)?.id || null;
  const state = await concertReviewState(id,userId);
  const summary = (await one<{ total: number; average: string | null }>('SELECT count(*)::int total,round(avg(rating),1)::text AS average FROM concert_reviews WHERE concert_id=$1 AND NOT hidden',[id]))!;
  const page = Math.min(communityPage(req.query.page),Math.max(1,Math.ceil(summary.total/10)));
  const items = await query(`SELECT r.id,r.rating,r.body,r.created_at,r.updated_at,(r.user_id=$2) AS own,json_build_object('id',u.id,'display_name',u.display_name) AS author
    FROM concert_reviews r JOIN users u ON u.id=r.user_id WHERE r.concert_id=$1 AND NOT r.hidden ORDER BY r.created_at DESC,r.id DESC LIMIT 10 OFFSET $3`,[id,userId,(page-1)*10]);
  const mine = userId ? await one('SELECT id,rating,body,hidden,updated_at FROM concert_reviews WHERE concert_id=$1 AND user_id=$2',[id,userId]) : null;
  res.json({ items,...summary,page,pageSize: 10,...state,mine });
});
communityRoutes.put('/concerts/:id/reviews/me',requireUser,async (req,res) => res.json(await saveConcertReview(communityId(req.params.id),user(res)!.id,req.body?.rating,req.body?.body)));
communityRoutes.delete('/concerts/:id/reviews/me',requireUser,async (req,res) => {
  await query('DELETE FROM concert_reviews WHERE concert_id=$1 AND user_id=$2',[communityId(req.params.id),user(res)!.id]); res.json({ ok: true });
});

const moderationTables = { post: 'community_posts',comment: 'community_comments',review: 'concert_reviews' } as const;
communityRoutes.get('/admin/community',requireAdmin,async (req,res) => {
  const kind = req.query.kind==='review' ? 'review' : req.query.kind==='comment' ? 'comment' : 'post';
  const table = moderationTables[kind], term = typeof req.query.q==='string' ? req.query.q.trim().slice(0,100) : '';
  const filter = '(p.body ILIKE $1 OR u.display_name ILIKE $1)';
  const total = (await one<{ total: number }>(`SELECT count(*)::int total FROM ${table} p JOIN users u ON u.id=p.user_id WHERE ${filter}`,['%'+term+'%']))!.total;
  const page = Math.min(communityPage(req.query.page),Math.max(1,Math.ceil(total/20)));
  const items = await query(`SELECT p.id,p.body,p.hidden,p.created_at,u.display_name AS author_name,
    ${kind==='review' ? 'p.rating,c.title AS concert_title,c.slug AS concert_slug' : kind==='comment' ? 'p.post_id' : "COALESCE((SELECT json_agg(json_build_object('url','/api/feed/media/'||m.id::text,'type',m.content_type)) FROM community_uploads m WHERE m.post_id=p.id),'[]'::json) AS media"}
    FROM ${table} p JOIN users u ON u.id=p.user_id ${kind==='review' ? 'JOIN concerts c ON c.id=p.concert_id' : ''} WHERE ${filter} ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET $2`,['%'+term+'%',(page-1)*20]);
  res.json({ items,total,page,pageSize: 20,kind });
});
communityRoutes.patch('/admin/community/:kind/:id',requireAdmin,async (req,res) => {
  const table = moderationTables[req.params.kind as keyof typeof moderationTables];
  if (!table || typeof req.body?.hidden!=='boolean') { res.status(400).json({ error: 'ข้อมูลการจัดการไม่ถูกต้อง' }); return; }
  const row = await one(`UPDATE ${table} SET hidden=$2 WHERE id=$1 RETURNING id,hidden`,[communityId(req.params.id),req.body.hidden]);
  if (!row) { res.status(404).json({ error: 'ไม่พบรายการ' }); return; }
  res.json(row);
});
