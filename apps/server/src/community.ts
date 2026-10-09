import { pool, one, query } from './db.js';
import { ArtistEditError } from './artist-editor.js';
import { suggestArtists } from './artist-suggestions.js';
import { config } from './config.js';
import { FeedSnapshots, rankForYou, type FeedCandidate } from './feed-ranking.js';

export const communityUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function communityId(value: unknown) {
  if (typeof value !== 'string' || !communityUuid.test(value)) throw new ArtistEditError('รหัสรายการไม่ถูกต้อง',400);
  return value;
}
export function communityText(value: unknown, max = 3000, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new ArtistEditError('กรุณากรอกข้อความไม่เกิน ' + max + ' ตัวอักษร');
  return value.trim();
}
function ids(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) throw new ArtistEditError('จำนวนรายการไม่ถูกต้อง');
  const unique = [...new Set(value.map(communityId))];
  if (unique.length !== value.length) throw new ArtistEditError('มีรายการซ้ำ');
  return unique;
}
export function communityPage(value: unknown) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page,100000) : 1;
}
export function mediaType(data: Buffer, declared: string) {
  const types: Record<string,boolean> = {
    'image/jpeg': data.length >= 4 && data.subarray(0,3).equals(Buffer.from([255,216,255])),
    'image/png': data.length >= 24 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/webp': data.length >= 12 && data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP',
    'video/mp4': data.length >= 24 && data.toString('ascii',4,8)==='ftyp' && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV)/.test(data.toString('ascii',8,12)),
    'video/webm': data.length >= 12 && data.subarray(0,4).equals(Buffer.from([26,69,223,163])) && data.subarray(0,256).includes(Buffer.from('webm')),
  };
  if (!types[declared]) throw new ArtistEditError('ใช้ไฟล์ JPG, PNG, WebP, MP4 หรือ WebM ที่ถูกต้องเท่านั้น');
  const max = declared.startsWith('image/') ? 6 * 1024 * 1024 : 25 * 1024 * 1024;
  if (data.length > max) throw new ArtistEditError(declared.startsWith('image/') ? 'รูปต้องไม่เกิน 6 MB' : 'วิดีโอต้องไม่เกิน 25 MB',413);
  return declared;
}

export async function storeCommunityUpload(userId: string, data: Buffer, contentType: string) {
  if (!Buffer.isBuffer(data)) throw new ArtistEditError('ไม่พบไฟล์อัปโหลด');
  mediaType(data,contentType);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    // Delete only this user's abandoned uploads, never attached media or another user's data.
    await client.query("DELETE FROM community_uploads WHERE user_id=$1 AND post_id IS NULL AND created_at < now()-interval '24 hours'",[userId]);
    const usage = (await client.query("SELECT COALESCE(sum(byte_size),0)::bigint AS bytes,count(*) FILTER(WHERE post_id IS NULL)::int AS drafts FROM community_uploads WHERE user_id=$1 AND created_at>=now()-interval '24 hours'",[userId])).rows[0];
    if (Number(usage.bytes)+data.length>100*1024*1024 || usage.drafts>=12) throw new ArtistEditError('ถึงขีดจำกัดอัปโหลดแล้ว ลบไฟล์ร่างที่ไม่ใช้หรือกลับมาใหม่ภายหลัง',429);
    const row = (await client.query('INSERT INTO community_uploads(user_id,content_type,data,byte_size) VALUES($1,$2,$3,$4) RETURNING id,content_type,byte_size',[userId,contentType,data,data.length])).rows[0];
    await client.query('COMMIT');
    return { ...row,url: '/api/feed/media/' + row.id };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function saveCommunityPost(userId: string, input: Record<string,unknown>, postId?: string) {
  const body = communityText(input.body ?? '',3000,false);
  const artists = input.artistIds === undefined && postId ? null : ids(input.artistIds ?? [],5);
  const media = postId ? null : ids(input.uploadIds ?? [],4);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let post;
    if (postId) {
      post = (await client.query('SELECT id,hidden FROM community_posts WHERE id=$1 AND user_id=$2 FOR UPDATE',[postId,userId])).rows[0];
      if (!post) throw new ArtistEditError('ไม่พบโพสต์ของคุณ',404);
      if (post.hidden) throw new ArtistEditError('โพสต์นี้ถูกซ่อนโดยผู้ดูแล',409);
      if (!body && !(await client.query('SELECT 1 FROM community_uploads WHERE post_id=$1',[postId])).rowCount) throw new ArtistEditError('เพิ่มข้อความหรือไฟล์อย่างน้อยหนึ่งรายการ');
    } else {
      if (!body && !media?.length) throw new ArtistEditError('เพิ่มข้อความหรือไฟล์อย่างน้อยหนึ่งรายการ');
      post = (await client.query('INSERT INTO community_posts(user_id,body) VALUES($1,$2) RETURNING id',[userId,body])).rows[0];
    }
    if (artists) {
      if ((await client.query('SELECT id FROM artists WHERE id=ANY($1::uuid[])',[artists])).rowCount!==artists.length) throw new ArtistEditError('ไม่พบศิลปินที่แท็ก');
      await client.query('DELETE FROM community_post_artists WHERE post_id=$1',[post.id]);
      for (const id of artists) await client.query('INSERT INTO community_post_artists(post_id,artist_id) VALUES($1,$2)',[post.id,id]);
    }
    if (media?.length) {
      const owned = await client.query('SELECT id FROM community_uploads WHERE id=ANY($1::uuid[]) AND user_id=$2 AND post_id IS NULL FOR UPDATE',[media,userId]);
      if (owned.rowCount !== media.length) throw new ArtistEditError('ไฟล์ไม่ใช่ของคุณหรือถูกใช้ในโพสต์แล้ว');
      for (const [position,id] of media.entries()) await client.query('UPDATE community_uploads SET post_id=$1,position=$2 WHERE id=$3',[post.id,position,id]);
    }
    await client.query('UPDATE community_posts SET body=$1,updated_at=now() WHERE id=$2',[body,post.id]);
    await client.query('COMMIT'); return post;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Artist news and fan posts remain separate kinds; user text never enters the sourced AI knowledge index.
const feedInterests = `WITH interest_artists AS (
  SELECT artist_id,bool_or(engaged) AS engaged FROM (
    SELECT artist_id,false AS engaged FROM follows WHERE user_id=$1
    UNION ALL
    SELECT pa.artist_id,true FROM community_post_artists pa JOIN community_posts p ON p.id=pa.post_id AND NOT p.hidden
    WHERE p.created_at>=now()-interval '90 days' AND (p.user_id=$1 OR EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id=p.id AND l.user_id=$1)
      OR EXISTS(SELECT 1 FROM community_comments cc WHERE cc.post_id=p.id AND cc.user_id=$1 AND NOT cc.hidden AND cc.created_at>=now()-interval '90 days'))
  ) interests GROUP BY artist_id
),interest_genres AS (
  SELECT DISTINCT lower(regexp_replace(g,'[^[:alnum:]]','','g')) AS genre
  FROM interest_artists i JOIN artists a ON a.id=i.artist_id CROSS JOIN LATERAL unnest(a.genres) g WHERE g<>''
),related_artists AS (
  SELECT m.member_id AS artist_id FROM artist_memberships m JOIN interest_artists i ON i.artist_id=m.band_id
  UNION SELECT m.band_id FROM artist_memberships m JOIN interest_artists i ON i.artist_id=m.member_id
) `;
const feedCte = (restricted = false) => feedInterests + `,entries AS (
  SELECT n.id,'news'::text AS kind,COALESCE(n.published_at,n.fetched_at) AS published_at,
    CASE WHEN EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND artist_id=n.artist_id) THEN 3
      WHEN EXISTS(SELECT 1 FROM follows f JOIN artists fa ON fa.id=f.artist_id WHERE f.user_id=$1 AND fa.genres && a.genres) THEN 1 ELSE 0 END AS score,
    EXISTS(SELECT 1 FROM follows WHERE user_id=$1 AND artist_id=n.artist_id) AS followed,
    jsonb_build_object('id',n.id,'kind','news','artist_name',a.name,'artist_slug',a.slug,'platform',n.platform,
      'title',n.title,'body',n.body,'summary',n.summary,'source_url',n.source_url,'image_url',n.image_url,'media_items',n.media_items,
      'published_at',n.published_at,'last_verified_at',n.last_verified_at,'stale',n.last_verified_at<now()-$2::int*interval '1 minute') AS item,
    ARRAY[n.artist_id]::text[] AS artist_ids,
    ARRAY(SELECT DISTINCT lower(regexp_replace(g,'[^[:alnum:]]','','g')) FROM unnest(a.genres) g WHERE g<>'') AS genres,
    'artist:'||n.artist_id::text AS author_key,
    EXISTS(SELECT 1 FROM interest_artists i WHERE i.artist_id=n.artist_id AND i.engaged) AS engaged,
    EXISTS(SELECT 1 FROM related_artists r WHERE r.artist_id=n.artist_id) AS related,
    EXISTS(SELECT 1 FROM unnest(a.genres) g JOIN interest_genres ig ON ig.genre=lower(regexp_replace(g,'[^[:alnum:]]','','g'))) AS genre_match,
    false AS own,false AS shared,0 AS engagement,
    ARRAY(SELECT DISTINCT m.band_id::text FROM artist_memberships m WHERE m.band_id=n.artist_id OR m.member_id=n.artist_id) AS family_ids,
    CASE WHEN char_length(n.body)>=80 THEN md5(regexp_replace(lower(trim(n.body)),'[[:space:]]+',' ','g')) ELSE NULL END AS content_key
  FROM news_items n JOIN artists a ON a.id=n.artist_id WHERE NOT n.hidden${restricted?' AND n.id=ANY($3::uuid[])':''}
  UNION ALL
  SELECT p.id,'post',p.created_at,
    CASE WHEN p.user_id=$1 THEN 4
      WHEN EXISTS(SELECT 1 FROM community_post_artists pa JOIN follows f ON f.artist_id=pa.artist_id WHERE pa.post_id=p.id AND f.user_id=$1) THEN 3
      WHEN EXISTS(SELECT 1 FROM follows mine JOIN follows theirs ON theirs.artist_id=mine.artist_id WHERE mine.user_id=$1 AND theirs.user_id=p.user_id) THEN 2
      WHEN EXISTS(SELECT 1 FROM community_post_artists pa JOIN artists a ON a.id=pa.artist_id JOIN follows f ON f.user_id=$1 JOIN artists fa ON fa.id=f.artist_id WHERE pa.post_id=p.id AND a.genres && fa.genres) THEN 1 ELSE 0 END,
    EXISTS(SELECT 1 FROM community_post_artists pa JOIN follows f ON f.artist_id=pa.artist_id WHERE pa.post_id=p.id AND f.user_id=$1),
    jsonb_build_object('id',p.id,'kind','post','body',p.body,'published_at',p.created_at,'updated_at',p.updated_at,
      'author',jsonb_build_object('id',u.id,'display_name',u.display_name),'own',p.user_id=$1,
      'artists',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'slug',a.slug,'name',a.name) ORDER BY a.name) FROM community_post_artists pa JOIN artists a ON a.id=pa.artist_id WHERE pa.post_id=p.id),'[]'::jsonb),
      'media',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'url','/api/feed/media/'||m.id::text,'type',CASE WHEN m.content_type LIKE 'image/%' THEN 'image' ELSE 'video' END) ORDER BY m.position) FROM community_uploads m WHERE m.post_id=p.id),'[]'::jsonb),
      'likes',(SELECT count(*)::int FROM community_likes l WHERE l.post_id=p.id),
      'liked',EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id=p.id AND l.user_id=$1),
      'comments',(SELECT count(*)::int FROM community_comments cc WHERE cc.post_id=p.id AND NOT cc.hidden)),
    ARRAY(SELECT pa.artist_id::text FROM community_post_artists pa WHERE pa.post_id=p.id ORDER BY pa.artist_id),
    ARRAY(SELECT DISTINCT lower(regexp_replace(g,'[^[:alnum:]]','','g')) FROM community_post_artists pa JOIN artists a ON a.id=pa.artist_id CROSS JOIN LATERAL unnest(a.genres) g WHERE pa.post_id=p.id AND g<>''),
    'user:'||p.user_id::text,
    EXISTS(SELECT 1 FROM community_post_artists pa JOIN interest_artists i ON i.artist_id=pa.artist_id AND i.engaged WHERE pa.post_id=p.id),
    EXISTS(SELECT 1 FROM community_post_artists pa JOIN related_artists r ON r.artist_id=pa.artist_id WHERE pa.post_id=p.id),
    EXISTS(SELECT 1 FROM community_post_artists pa JOIN artists a ON a.id=pa.artist_id CROSS JOIN LATERAL unnest(a.genres) g JOIN interest_genres ig ON ig.genre=lower(regexp_replace(g,'[^[:alnum:]]','','g')) WHERE pa.post_id=p.id),
    p.user_id=$1,
    EXISTS(SELECT 1 FROM follows mine JOIN follows theirs ON theirs.artist_id=mine.artist_id WHERE mine.user_id=$1 AND theirs.user_id=p.user_id AND p.user_id<>$1),
    LEAST(20,(SELECT count(*) FROM community_likes l WHERE l.post_id=p.id AND l.user_id<>p.user_id)
      +(SELECT count(DISTINCT cc.user_id) FROM community_comments cc WHERE cc.post_id=p.id AND NOT cc.hidden AND cc.user_id<>p.user_id))::int,
    ARRAY(SELECT DISTINCT m.band_id::text FROM community_post_artists pa JOIN artist_memberships m ON m.band_id=pa.artist_id OR m.member_id=pa.artist_id WHERE pa.post_id=p.id),
    CASE WHEN char_length(p.body)>=80 THEN md5(regexp_replace(lower(trim(p.body)),'[[:space:]]+',' ','g')) ELSE NULL END
  FROM community_posts p JOIN users u ON u.id=p.user_id WHERE NOT p.hidden${restricted?' AND p.id=ANY($4::uuid[])':''}
) `;

const feedSnapshots = new FeedSnapshots();
export async function getCommunityFeed(userId: string | null, tab: string, requestedPage: number, token?: string) {
  if (tab==='for-you') {
    const cached=feedSnapshots.get(token,userId);
    let snapshot=cached;
    if(!snapshot){
      // Keep inexpensive identifiers for complete, stable archive pagination.
      // Only a bounded, diverse shortlist gets interest joins and reranking.
      const catalog=await query<{key:string}>(`SELECT kind||':'||id::text AS key FROM (
        SELECT 'news' AS kind,id,COALESCE(published_at,fetched_at) AS published_at FROM news_items WHERE NOT hidden
        UNION ALL SELECT 'post',id,created_at FROM community_posts WHERE NOT hidden
      ) c ORDER BY published_at DESC,id DESC`);
      const picks=await query<{id:string;kind:string}>(feedInterests+`,picks AS (
        (SELECT id,'news' AS kind FROM (SELECT id,COALESCE(published_at,fetched_at) AS published_at,
          row_number() OVER(PARTITION BY artist_id ORDER BY COALESCE(published_at,fetched_at) DESC,id DESC) AS position
          FROM news_items WHERE NOT hidden) n WHERE position<=6 ORDER BY published_at DESC,id DESC LIMIT 240)
        UNION ALL (SELECT id,'post' FROM community_posts WHERE NOT hidden ORDER BY created_at DESC,id DESC LIMIT 90)
        UNION ALL (SELECT n.id,'news' FROM news_items n WHERE NOT n.hidden AND EXISTS(
          SELECT 1 FROM interest_artists i WHERE i.artist_id=n.artist_id)
          ORDER BY COALESCE(n.published_at,n.fetched_at) DESC,n.id DESC LIMIT 120)
        UNION ALL (SELECT p.id,'post' FROM community_posts p WHERE NOT p.hidden AND (p.user_id=$1 OR EXISTS(
          SELECT 1 FROM community_post_artists pa JOIN interest_artists i ON i.artist_id=pa.artist_id WHERE pa.post_id=p.id)
          OR EXISTS(SELECT 1 FROM follows mine JOIN follows theirs ON theirs.artist_id=mine.artist_id WHERE mine.user_id=$1 AND theirs.user_id=p.user_id))
          ORDER BY p.created_at DESC,p.id DESC LIMIT 90)
      ) SELECT DISTINCT id,kind FROM picks`,[userId]);
      const visible=new Set(catalog.map(c=>c.key));
      const candidates=await query<FeedCandidate>(feedCte(true)+`SELECT kind||':'||id::text AS key,kind,published_at,artist_ids,genres,author_key,
        followed,engaged,related,genre_match,own,shared,engagement,family_ids,content_key FROM entries`,
        [userId,config.socialStaleAfterMinutes,picks.filter(p=>p.kind==='news').map(p=>p.id),picks.filter(p=>p.kind==='post').map(p=>p.id)]);
      const ranked=rankForYou(candidates.filter(c=>visible.has(c.key))),rankedKeys=new Set(ranked.map(c=>c.key));
      snapshot=feedSnapshots.create(userId,[...ranked,...catalog.filter(c=>!rankedKeys.has(c.key)).map(c=>({...c,reason:'ข่าวและโพสต์ก่อนหน้า'}))]);
    }
    const snapshotReset=!!token&&!cached,total=snapshot.entries.length;
    const page=snapshotReset?1:Math.min(requestedPage,Math.max(1,Math.ceil(total/15)));
    const slice=snapshot.entries.slice((page-1)*15,page*15),reasons=new Map(slice.map(entry=>[entry.key,entry.reason]));
    const rows=await query<{key:string;item:Record<string,unknown>}>(feedCte(true)+`SELECT kind||':'||id::text AS key,item||jsonb_build_object('followed',followed) AS item FROM entries`,
      [userId,config.socialStaleAfterMinutes,slice.filter(c=>c.key.startsWith('news:')).map(c=>c.key.slice(5)),slice.filter(c=>c.key.startsWith('post:')).map(c=>c.key.slice(5))]);
    const items=new Map(rows.map(row=>[row.key,{...row.item,reason:reasons.get(row.key)}]));
    return {items:slice.flatMap(entry=>items.has(entry.key)?[items.get(entry.key)!]:[]),total,page,pageSize:15,tab,
      personalized:!!userId,snapshot:snapshot.token,snapshotReset};
  }
  const filter = tab==='following' ? 'WHERE followed' : '';
  const args = [userId,config.socialStaleAfterMinutes];
  const count = await one<{ total: number }>(feedCte() + 'SELECT count(*)::int total FROM entries ' + filter,args);
  const total = count?.total || 0, page = Math.min(requestedPage,Math.max(1,Math.ceil(total/15)));
  const items = await query<{ item: Record<string,unknown> }>(feedCte() + `SELECT item||jsonb_build_object('followed',followed,'reason',
    CASE WHEN followed THEN 'ศิลปินที่คุณติดตาม' WHEN score=4 THEN 'โพสต์ของคุณ' WHEN kind='post' AND score=2 THEN 'แฟนเพลงที่มีความสนใจร่วมกัน' WHEN score=1 THEN 'แนวเพลงที่คุณสนใจ' ELSE 'สำรวจชุมชน' END) AS item
    FROM entries ${filter} ORDER BY ${tab==='following' ? '' : 'score DESC,'} published_at DESC,id DESC LIMIT 15 OFFSET $3`,[...args,(page-1)*15]);
  return { items: items.map(row => row.item),total,page,pageSize: 15,tab,personalized: !!userId };
}

export async function communitySidebar(userId: string | null) {
  const artists = await suggestArtists(userId);
  const concerts = await query(`SELECT c.id,c.slug,c.title,c.starts_at,c.ends_at,c.time_tba,c.venue,c.city,c.image_url,c.status,c.country_code,
    EXISTS(SELECT 1 FROM concert_artists ca JOIN follows f ON f.artist_id=ca.artist_id WHERE ca.concert_id=c.id AND f.user_id=$1) AS followed,
    (NOT c.time_tba AND c.starts_at<=now() AND c.ends_at>now()) AS happening
    FROM concerts c WHERE c.status='scheduled' AND c.starts_at IS NOT NULL AND
      (COALESCE(c.ends_at,c.starts_at)>=now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date>=(now() AT TIME ZONE 'Asia/Bangkok')::date))
    ORDER BY followed DESC,c.starts_at,c.id LIMIT 6`,[userId]);
  return { artists,concerts };
}

// With no confirmed end time, wait until the next Thai calendar day. Include every current performance.
export const reviewEnded = `(c.status IN ('scheduled','completed') AND GREATEST(
  CASE WHEN c.time_tba THEN ((c.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok'
    ELSE COALESCE(c.ends_at,((c.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') END,
  (SELECT max(CASE WHEN p.time_tba THEN ((p.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok'
    ELSE COALESCE(p.ends_at,((p.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') END)
    FROM concert_performances p WHERE p.concert_id=c.id AND p.is_current AND p.status NOT IN ('cancelled','postponed'))
) <= now())`;

export async function concertReviewState(concertId: string, userId: string | null) {
  const concert = await one(`SELECT c.id,COALESCE(${reviewEnded},false) AS ended,
    EXISTS(SELECT 1 FROM attendance at WHERE at.concert_id=c.id AND at.user_id=$2) AS attended FROM concerts c WHERE c.id=$1`,[concertId,userId]);
  if (!concert) throw new ArtistEditError('ไม่พบคอนเสิร์ต',404);
  return { ...concert,canReview: !!userId && concert.ended && concert.attended };
}

export async function saveConcertReview(concertId: string, userId: string, rating: unknown, input: unknown) {
  if (!Number.isInteger(rating) || Number(rating)<1 || Number(rating)>5) throw new ArtistEditError('เลือกคะแนน 1–5 ดาว');
  const body = communityText(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const concert = (await client.query(`SELECT c.id,COALESCE(${reviewEnded},false) AS ended FROM concerts c WHERE c.id=$1 FOR SHARE`,[concertId])).rows[0];
    if (!concert) throw new ArtistEditError('ไม่พบคอนเสิร์ต',404);
    if (!concert.ended) throw new ArtistEditError('รีวิวได้หลังงานและรอบแสดงล่าสุดจบแล้ว',409);
    if (!(await client.query('SELECT 1 FROM attendance WHERE user_id=$1 AND concert_id=$2 FOR KEY SHARE',[userId,concertId])).rowCount) throw new ArtistEditError('กรุณาบันทึกว่าเคยไปงานนี้ก่อนรีวิว',403);
    const existing = (await client.query('SELECT hidden FROM concert_reviews WHERE concert_id=$1 AND user_id=$2 FOR UPDATE',[concertId,userId])).rows[0];
    if (existing?.hidden) throw new ArtistEditError('รีวิวนี้ถูกซ่อนโดยผู้ดูแล ติดต่อผู้ดูแลก่อนแก้ไข',409);
    const review = (await client.query(`INSERT INTO concert_reviews(concert_id,user_id,rating,body) VALUES($1,$2,$3,$4)
      ON CONFLICT(concert_id,user_id) DO UPDATE SET rating=$3,body=$4,updated_at=now() RETURNING id`,[concertId,userId,rating,body])).rows[0];
    await client.query('COMMIT'); return review;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
