import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createApp } from './app.js';
import { pool } from './db.js';

test('Community feed, uploads and concert reviews through actual HTTP and PostgreSQL', { skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  assert.match(url.pathname,/^\/encore_ingest_test[\w]*$/);
  const schema = 'community_' + randomUUID().replaceAll('-','');
  const setup = new pg.Client({ connectionString: url.href }); await setup.connect();
  const database = new pg.Pool({ connectionString: url.href,options: '-c search_path='+schema+',public' });
  const cookies: Record<string,string> = {}, users: Record<string,string> = {};
  const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const address = server.address(); if (!address || typeof address==='string') throw Error('Missing address');
  const origin = 'http://127.0.0.1:'+address.port;
  const request = async (path: string,method = 'GET',role = '',body?: unknown,headers: Record<string,string> = {}) => {
    const response = await fetch(origin+'/api'+path,{ method,headers: { 'content-type': 'application/json',...(role ? { cookie: cookies[role] } : {}),...headers },...(body===undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status,body: text ? JSON.parse(text) : null,headers: response.headers };
  };
  const upload = (role: string,data: Buffer,type = 'image/png',rights = true) => fetch(origin+'/api/feed/uploads',{ method: 'POST',headers: { 'content-type': type,...(role ? { cookie: cookies[role] } : {}),...(rights ? { 'x-media-rights': 'confirmed' } : {}) },body: new Uint8Array(data) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTQAAAABJRU5ErkJggg==','base64');
  const mp4 = Buffer.alloc(64); mp4.writeUInt32BE(24,0); mp4.write('ftypisom',4,'ascii');
  let artistA: string,artistB: string,artistC: string,past: string,future: string,cancelled: string,ongoing: string,multi: string,tba: string;
  let post: string, media: string, related: string, comment: string;
  try {
    await setup.query('CREATE SCHEMA '+schema); await setup.query('SET search_path TO '+schema+',public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,args: unknown[]) => database.query(sql,args));
    t.mock.method(pool,'connect',() => database.connect());
    for (const role of ['a','b','c','admin','expired']) {
      const token = randomUUID();
      users[role] = (await database.query('INSERT INTO users(email,display_name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',[role+'@example.test','Fan '+role,'test-only',role==='admin' ? 'admin' : 'user'])).rows[0].id;
      await database.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),users[role]]);
      cookies[role] = 'artist_session='+token;
    }
    await database.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",[users.expired]);
    const artist = async (name: string,genres: string[]) => (await database.query("INSERT INTO artists(slug,name,kind,genres) VALUES($1,$1,'band',$2) RETURNING id",[name,genres])).rows[0].id as string;
    artistA=await artist('Alpha',['Rock']); artistB=await artist('Beta',['Rock']); artistC=await artist('Gamma',['Jazz']);
    await request('/me/follows/'+artistA,'PUT','a'); await request('/me/follows/'+artistB,'PUT','b'); await request('/me/follows/'+artistA,'PUT','c');
    await database.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at) VALUES($1,'instagram','https://www.instagram.com/p/AlphaFixture/','Official Alpha',now()-interval '2 days'),($2,'instagram','https://www.instagram.com/p/BetaFixture/','Official Beta',now())",[artistA,artistB]);
    const show = async (slug: string,starts: string,ends: string | null,status = 'scheduled',timeTba = false) => (await database.query('INSERT INTO concerts(slug,title,starts_at,ends_at,status,time_tba) VALUES($1,$1,$2,$3,$4,$5) RETURNING id',[slug,starts,ends,status,timeTba])).rows[0].id as string;
    past=await show('Past','2020-01-01T10:00Z','2020-01-01T14:00Z');
    future=await show('Future','2099-01-01T10:00Z',null);
    cancelled=await show('Cancelled','2020-01-01T10:00Z',null,'cancelled');
    ongoing=await show('Ongoing',new Date(Date.now()-3600000).toISOString(),new Date(Date.now()+3600000).toISOString());
    multi=await show('Multiple','2020-01-01T10:00Z','2020-01-01T14:00Z');
    await database.query("INSERT INTO concert_performances(concert_id,starts_at,is_current) VALUES($1,'2099-01-01T11:00Z',true)",[multi]);
    tba=await show('TBA',new Date().toISOString(),null,'scheduled',true);
    await database.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[future,artistA]);

    await t.test('Only authenticated owners can upload; file type, size and rights are checked; drafts remain private',async () => {
      for (const role of ['','expired']) assert.equal((await upload(role,png)).status,401);
      assert.equal((await upload('a',png,'image/png',false)).status,400);
      assert.equal((await upload('a',Buffer.from('<script>alert(1)</script>'),'image/png')).status,400);
      assert.equal((await upload('a',Buffer.alloc(32),'image/svg+xml')).status,400);
      const oversized = Buffer.alloc(6*1024*1024+1); png.copy(oversized); assert.equal((await upload('a',oversized)).status,413);
      const result = await upload('a',png); assert.equal(result.status,201); const payload = await result.json(); media=payload.id;
      assert.equal(payload.url,'/api/feed/media/'+media);
      assert.equal((await fetch(origin+'/api/feed/media/'+media)).status,404);
      assert.equal((await fetch(origin+'/api/feed/media/'+media,{ headers: { cookie: cookies.b } })).status,404);
      const owned = await fetch(origin+'/api/feed/media/'+media,{ headers: { cookie: cookies.a } }); assert.equal(owned.status,200); assert.deepEqual(Buffer.from(await owned.arrayBuffer()),png);
      assert.equal((await request('/feed/uploads/'+media,'DELETE','b')).status,404);
    });
    await t.test('Post validation is atomic; foreign uploads and spoofed owners cannot be used',async () => {
      assert.equal((await request('/feed/posts','POST','',{ body: 'Denied' })).status,401);
      for (const input of [{ body: '' },{ body: 'x'.repeat(3001) },{ body: 'bad tag',artistIds: [randomUUID()] },{ body: 'duplicate tags',artistIds: [artistA,artistA] },{ body: 'bad media',uploadIds: [randomUUID()] }]) assert.equal((await request('/feed/posts','POST','b',input)).status,400);
      assert.equal((await request('/feed/posts','POST','b',{ body: 'stolen',uploadIds: [media] })).status,400);
      assert.equal((await database.query('SELECT count(*)::int n FROM community_posts')).rows[0].n,0);
      const created = await request('/feed/posts','POST','a',{ body: 'Alpha fan photo',artistIds: [artistA],uploadIds: [media],userId: users.b,hidden: true });
      assert.equal(created.status,201); post=created.body.id;
      assert.equal((await request('/feed/posts/'+post,'PATCH','b',{ body: 'hijacked' })).status,404);
      assert.equal((await request('/feed/posts/'+post,'DELETE','admin')).status,404);
      const row = (await database.query('SELECT user_id,hidden FROM community_posts WHERE id=$1',[post])).rows[0]; assert.equal(row.user_id,users.a); assert.equal(row.hidden,false);
      const replay = await request('/feed/posts','POST','a',{ body: 'reused file',uploadIds: [media] }); assert.equal(replay.status,400);
      const second = await request('/feed/posts','POST','c',{ body: 'Shared interests fan',artistIds: [artistC] }); assert.equal(second.status,201); related=second.body.id;
    });
    await t.test('Following is strict; For You includes shared-interest fans; public responses never expose email, tokens or follow lists',async () => {
      assert.equal((await request('/feed?tab=following')).status,401);
      const following = await request('/feed?tab=following','GET','a'); assert.equal(following.status,200); assert.equal(following.body.total,2);
      assert.ok(following.body.items.every((item: any) => item.followed)); assert.ok(!following.body.items.some((item: any) => item.id===related || item.artist_name==='Beta'));
      const mixed = await request('/feed','GET','a'); assert.equal(mixed.status,200); assert.equal(mixed.body.items[0].id,post);
      const fan = mixed.body.items.find((item: any) => item.id===related); assert.equal(fan.reason,'แฟนเพลงที่มีความสนใจร่วมกัน');
      const other = await request('/feed?tab=following','GET','b'); assert.equal(other.body.total,1); assert.equal(other.body.items[0].artist_name,'Beta');
      const guest = await request('/feed'); assert.equal(guest.body.personalized,false);
      for (const result of [mixed,guest]) {
        const text = JSON.stringify(result.body); assert.ok(!text.includes('@example.test')); assert.ok(!text.includes('password_hash')); assert.ok(!text.includes('token')); assert.ok(!text.includes('follows'));
        assert.match(result.headers.get('cache-control') || '',/no-store/); assert.match(result.headers.get('vary') || '',/Cookie/);
      }
      const sidebar = await request('/feed/sidebar','GET','a'); assert.ok(!sidebar.body.artists.some((a: any) => a.id===artistA)); assert.ok(sidebar.body.concerts.some((c: any) => c.id===future)); assert.ok(!sidebar.body.concerts.some((c: any) => c.id===cancelled || c.id===past));
    });
    await t.test('Public uploaded images and videos support HEAD and byte ranges; invalid ranges are rejected',async () => {
      const full = await fetch(origin+'/api/feed/media/'+media); assert.equal(full.status,200); assert.equal(full.headers.get('content-type'),'image/png'); assert.deepEqual(Buffer.from(await full.arrayBuffer()),png);
      const head = await fetch(origin+'/api/feed/media/'+media,{ method: 'HEAD' }); assert.equal(head.status,200); assert.equal(Number(head.headers.get('content-length')),png.length); assert.equal((await head.arrayBuffer()).byteLength,0);
      const video = await upload('b',mp4,'video/mp4'); assert.equal(video.status,201); const id=(await video.json()).id;
      assert.equal((await request('/feed/posts','POST','b',{ body: 'Video fixture',artistIds: [artistB],uploadIds: [id] })).status,201);
      const part = await fetch(origin+'/api/feed/media/'+id,{ headers: { range: 'bytes=8-15' } }); assert.equal(part.status,206); assert.equal(part.headers.get('content-range'),'bytes 8-15/64'); assert.deepEqual(Buffer.from(await part.arrayBuffer()),mp4.subarray(8,16));
      const suffix = await fetch(origin+'/api/feed/media/'+id,{ headers: { range: 'bytes=-4' } }); assert.equal(suffix.status,206); assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),mp4.subarray(60));
      for (const range of ['bytes=70-80','bytes=8-2','bytes=0-1,5-6','bytes=-0']) assert.equal((await fetch(origin+'/api/feed/media/'+id,{ headers: { range } })).status,416);
    });
    await t.test('Likes are idempotent, comments are owner-controlled, and post edits preserve media',async () => {
      assert.equal((await request('/feed/posts/'+post+'/like','PUT')).status,401);
      for (let i=0;i<2;i++) assert.equal((await request('/feed/posts/'+post+'/like','PUT','b')).status,200);
      assert.equal((await database.query('SELECT count(*)::int n FROM community_likes WHERE post_id=$1',[post])).rows[0].n,1);
      const result = await request('/feed/posts/'+post+'/comments','POST','b',{ body: 'Loved this moment' }); assert.equal(result.status,201); comment=result.body.id;
      assert.equal((await request('/feed/comments/'+comment,'DELETE','a')).status,404);
      assert.equal((await request('/feed/posts/'+post,'PATCH','a',{ body: 'Updated photo caption' })).status,200);
      const item = (await request('/feed','GET','a')).body.items.find((item: any) => item.id===post); assert.equal(item.body,'Updated photo caption'); assert.equal(item.media[0].id,media); assert.equal(item.comments,1); assert.equal(item.likes,1);
      assert.equal((await request('/feed/posts/'+post+'/comments')).body.items[0].author.display_name,'Fan b');
    });
    await t.test('Reviews require attendance and a finished event, including last current performance and TBA day',async () => {
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','',{ rating: 5,body: 'Denied' })).status,401);
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','a',{ rating: 5,body: 'Not attended' })).status,403);
      await request('/me/attendance/'+past,'PUT','a');
      for (const id of [future,cancelled,ongoing,multi,tba]) {
        await database.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[users.a,id]);
        const state = await request('/concerts/'+id+'/reviews','GET','a'); assert.equal(state.body.ended,false); assert.equal(state.body.canReview,false);
        assert.equal((await request('/concerts/'+id+'/reviews/me','PUT','a',{ rating: 5,body: 'Too early' })).status,409);
      }
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','a',{ rating: 0,body: 'Invalid' })).status,400);
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','a',{ rating: 5,body: 'Great sound',userId: users.b })).status,200);
      const publicList = await request('/concerts/'+past+'/reviews'); assert.equal(publicList.body.total,1); assert.equal(publicList.body.average,'5.0'); assert.equal(publicList.body.mine,null); assert.equal(publicList.body.canReview,false);
      const mine = await request('/concerts/'+past+'/reviews','GET','a'); assert.equal(mine.body.mine.body,'Great sound'); assert.equal(mine.body.canReview,true);
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','a',{ rating: 4,body: 'Updated review' })).status,200);
      assert.equal((await request('/concerts/'+past+'/reviews')).body.total,1);
      await request('/concerts/'+past+'/reviews/me','DELETE','b'); assert.equal((await request('/concerts/'+past+'/reviews')).body.total,1);
    });
    await t.test('Moderation hides posts/media/comments/reviews and prevents user edits restoring hidden content',async () => {
      const review = (await request('/concerts/'+past+'/reviews','GET','a')).body.mine.id;
      assert.equal((await request('/admin/community')).status,401); assert.equal((await request('/admin/community','GET','a')).status,403);
      for (const [kind,id] of [['post',post],['comment',comment],['review',review]]) {
        assert.equal((await request('/admin/community/'+kind+'/'+id,'PATCH','b',{ hidden: true })).status,403);
        assert.equal((await request('/admin/community/'+kind+'/'+id,'PATCH','admin',{ hidden: true })).status,200);
      }
      assert.equal((await fetch(origin+'/api/feed/media/'+media)).status,404);
      assert.ok(!(await request('/feed')).body.items.some((item: any) => item.id===post));
      assert.equal((await request('/feed/posts/'+post+'/comments')).status,404);
      assert.equal((await request('/feed/posts/'+post+'/like','PUT','b')).status,404);
      assert.equal((await request('/feed/posts/'+post,'PATCH','a',{ body: 'restore' })).status,409);
      assert.equal((await request('/concerts/'+past+'/reviews')).body.total,0); assert.equal((await request('/concerts/'+past+'/reviews')).body.average,null);
      assert.equal((await request('/concerts/'+past+'/reviews/me','PUT','a',{ rating: 5,body: 'restore' })).status,409);
      for (const [kind,id] of [['post',post],['comment',comment],['review',review]]) assert.equal((await request('/admin/community/'+kind+'/'+id,'PATCH','admin',{ hidden: false })).status,200);
      assert.equal((await request('/concerts/'+past+'/reviews')).body.total,1); assert.equal((await fetch(origin+'/api/feed/media/'+media)).status,200);
    });
    await t.test('All new protected mutations reject expired sessions and foreign origins without writes',async () => {
      const variants: [string,string,unknown][] = [
        ['/feed/posts','POST',{ body: 'expired' }],['/feed/posts/'+post,'PATCH',{ body: 'expired' }],['/feed/posts/'+post,'DELETE',undefined],
        ['/feed/posts/'+post+'/like','PUT',undefined],['/feed/posts/'+post+'/like','DELETE',undefined],['/feed/posts/'+post+'/comments','POST',{ body: 'expired' }],
        ['/feed/comments/'+comment,'DELETE',undefined],['/feed/uploads/'+media,'DELETE',undefined],
        ['/concerts/'+past+'/reviews/me','PUT',{ rating: 5,body: 'expired' }],['/concerts/'+past+'/reviews/me','DELETE',undefined],
        ['/admin/community/post/'+post,'PATCH',{ hidden: true }],
      ];
      for (const [path,method,body] of variants) assert.equal((await request(path,method,'expired',body)).status,401,path);
      assert.equal((await request('/feed?tab=following','GET','expired')).status,401);
      assert.equal((await request('/admin/community','GET','expired')).status,401);
      assert.equal((await request('/feed/posts','POST','a',{ body: 'wrong origin' },{ origin: 'https://example.test' })).status,403);
    });
    await t.test('Pagination retains old news; user deletion cascades media/interactions; removing attendance removes the review',async () => {
      await database.query("INSERT INTO community_posts(user_id,body,created_at) SELECT $1,'Old fixture '||n,now()-interval '10 days' FROM generate_series(1,20) n",[users.c]);
      const first = await request('/feed'); assert.equal(first.body.items.length,15); const last = await request('/feed?page=99999'); assert.equal(last.body.page,2); assert.equal(last.body.items.length,last.body.total-15);
      const all = [...first.body.items,...last.body.items]; assert.equal(new Set(all.map((item: any) => item.kind+item.id)).size,all.length); assert.ok(all.some((item: any) => item.artist_name==='Alpha'));
      assert.equal((await request('/feed/comments/'+comment,'DELETE','b')).status,200);
      assert.equal((await request('/feed/posts/'+post,'DELETE','a')).status,200);
      assert.equal((await fetch(origin+'/api/feed/media/'+media)).status,404);
      assert.equal((await database.query('SELECT count(*)::int n FROM community_likes WHERE post_id=$1',[post])).rows[0].n,0);
      await request('/me/attendance/'+past,'DELETE','a'); assert.equal((await request('/concerts/'+past+'/reviews')).body.total,0);
    });
    await t.test('Diverse For You pagination survives new posts, rechecks moderation, and rejects another viewer or expired session window',async () => {
      const delta=await artist('Delta',['ROCK']);
      await database.query("UPDATE artists SET kind='member' WHERE id=$1",[delta]);
      await database.query('INSERT INTO artist_memberships(band_id,member_id) VALUES($1,$2)',[artistA,delta]);
      const epsilon=await artist('Epsilon',['Jazz']);
      const signal=await request('/feed/posts','POST','c',{ body: 'Epsilon interest fixture',artistIds: [epsilon] });
      await request('/feed/posts/'+signal.body.id+'/like','PUT','a');
      for (const [artist,index] of [artistA,artistB,artistC,delta,epsilon].map((id,index) => [id,index] as const))
        await database.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at) SELECT $1,'instagram','https://example.test/diverse-'||$2::text||'-'||n,'Diversity fixture '||n,now()-n*interval '1 hour' FROM generate_series(1,12) n",[artist,index]);
      const first=await request('/feed','GET','a');assert.equal(first.status,200);assert.ok(first.body.snapshot);
      const initial=first.body.items,token=first.body.snapshot,keys=new Set(initial.map((i: any) => i.kind+':'+i.id));
      const inserted=(await database.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at) VALUES($1,'instagram','https://example.test/new-after-window','Arrived after snapshot',now()) RETURNING id",[artistA])).rows[0].id;
      const all=[...initial];
      for(let page=2;page<=Math.ceil(first.body.total/15);page++) {
        const result=await request('/feed?page='+page+'&snapshot='+token,'GET','a');assert.equal(result.body.snapshot,token);
        for(const entry of result.body.items) {const key=entry.kind+':'+entry.id;assert.ok(!keys.has(key));keys.add(key);all.push(entry);}
      }
      assert.equal(keys.size,first.body.total);assert.ok(!all.some(i=>i.id===inserted));
      assert.ok(all.some(i=>i.artist_name==='Delta' && /วงหรือสมาชิก/.test(i.reason)));
      assert.ok(all.some(i=>i.artist_name==='Epsilon' && /โพสต์ที่คุณสนใจ/.test(i.reason)));
      assert.ok((await request('/feed','GET','a')).body.total>first.body.total);
      const hidden=initial.find((i: any)=>i.kind==='news');assert.ok(hidden);
      assert.equal((await request('/admin/news/'+hidden.id,'PATCH','admin',{ hidden: true })).status,200);
      const afterHide=await request('/feed?snapshot='+token,'GET','a');assert.ok(!afterHide.body.items.some((i: any)=>i.id===hidden.id));
      const other=await request('/feed?page=2&snapshot='+token,'GET','b');assert.equal(other.body.page,1);assert.equal(other.body.snapshotReset,true);assert.notEqual(other.body.snapshot,token);
      assert.ok(!other.body.items.some((i: any)=>/วงหรือสมาชิก/.test(i.reason)));
      const expired=await request('/feed?page=2&snapshot='+token,'GET','expired');assert.equal(expired.body.personalized,false);assert.equal(expired.body.page,1);assert.equal(expired.body.snapshotReset,true);
      const malformed=await request('/feed?page=2&snapshot=invalid','GET','a');assert.equal(malformed.body.page,1);assert.equal(malformed.body.snapshotReset,true);
      const response=JSON.stringify(other.body);for(const secret of ['author_key','artist_ids','engagement','expires','viewer'])assert.ok(!response.includes('"'+secret+'"'));
    });
  } finally {
    server.close(); server.closeAllConnections(); await once(server,'close');
    t.mock.restoreAll(); await database.end();
    await setup.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'); await setup.end(); await pool.end();
  }
});
