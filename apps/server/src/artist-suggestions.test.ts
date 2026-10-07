import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile,readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { rankArtistSuggestions } from './artist-suggestions.js';
import { createApp } from './app.js';
import { pool } from './db.js';

function artist(id: string,genres: string[] = [],family: string[] = [],rank: number | null = null) {
  return { id,name: id,slug: id,kind: 'solo',genres,family_ids: family,popularity_rank: rank,image_url: null,image_review: null,image_credit: null };
}
test('An explicit band relationship outranks popular unrelated genre matches; followed artists are excluded',() => {
  const items=rankArtistSuggestions([artist('band',['Rock'],['band','member']),artist('member',[],['band']),artist('popular',['ROCK'],[],1)],
    [{artist_id:'band',weight:1,attended:false,engaged:false}],new Set(['band']),[]);
  assert.deepEqual(items.map(a=>a.id),['member','popular']); assert.match(items[0].reason,/band/);
});
test('Genre matching normalizes case, spaces and duplicate labels; unsupported popularity ranks do not win',() => {
  const items=rankArtistSuggestions([artist('anchor',['T-Pop']),artist('fit',['t pop','T-POP']),artist('unrelated',['Jazz'],[],-1)],
    [{artist_id:'anchor',weight:1,attended:false,engaged:false}],new Set(['anchor']),[]);
  assert.equal(items[0].id,'fit'); assert.match(items[0].reason,/แนวเพลง/);
});
test('Attendance and engagement personalize a user without follows; peer evidence needs three accounts',() => {
  const catalog=[artist('attended',['Rock']),artist('engaged',['Jazz']),artist('popular',['Pop'],[],1),artist('peer',['Folk'])];
  const interests=[{artist_id:'attended',weight:0.7,attended:true,engaged:false},{artist_id:'engaged',weight:0.6,attended:false,engaged:true}];
  const weak=rankArtistSuggestions(catalog,interests,new Set(),[{artist_id:'peer',supporters:2,strength:50}]);
  assert.equal(weak[0].id,'attended'); assert.match(weak.find(a=>a.id==='engaged')!.reason,/โพสต์/); assert.equal(weak.find(a=>a.id==='peer')!.reason,'ลองทำความรู้จัก');
  const strong=rankArtistSuggestions(catalog,[],new Set(),[{artist_id:'peer',supporters:3,strength:1}]); assert.equal(strong[0].id,'peer');
});
test('Diversity favors another relevant artist over a repeated family; output stays deterministic and contains no scoring histories',() => {
  const catalog=[artist('anchor',['Rock'],['anchor','member-a','member-b']),artist('member-a',['Rock'],['anchor']),artist('member-b',['Rock'],['anchor']),artist('other',['Rock'],[],1)];
  const args: Parameters<typeof rankArtistSuggestions>=[catalog,[{artist_id:'anchor',weight:1,attended:false,engaged:false}],new Set(['anchor']),[],3];
  const result=rankArtistSuggestions(...args); assert.equal(result[0].id,'member-a'); assert.equal(result[1].id,'other'); assert.deepEqual(rankArtistSuggestions(...args),result);
  assert.ok(result.every(a=>!('family_ids' in a) && !('score' in a) && a.reasons.length<=2));
  assert.equal(rankArtistSuggestions([],[],new Set(),[]).length,0); assert.equal(rankArtistSuggestions(catalog,[],new Set(catalog.map(a=>a.id)),[]).length,0);
});

test('Artist suggestions through real HTTP/PostgreSQL protect histories and honor current evidence',{skip:!process.env.INGEST_TEST_DATABASE_URL},async t => {
  const url=new URL(process.env.INGEST_TEST_DATABASE_URL!); assert.match(url.pathname,/^\/encore_ingest_test[\w]*$/);
  const schema='suggestions_'+randomUUID().replaceAll('-',''),setup=new pg.Client({connectionString:url.href}); await setup.connect();
  const database=new pg.Pool({connectionString:url.href,options:'-c search_path='+schema+',public'});
  const server=createApp().listen(0,'127.0.0.1'); await once(server,'listening'); const address=server.address(); if(!address || typeof address==='string') throw Error('Missing address');
  const origin='http://127.0.0.1:'+address.port,cookies:Record<string,string>={},users:Record<string,string>={};
  const get=async(role='')=>{const r=await fetch(origin+'/api/feed/sidebar',{headers:role?{cookie:cookies[role]}:{}}); assert.equal(r.status,200); return {data:await r.json(),headers:r.headers};};
  try {
    await setup.query('CREATE SCHEMA '+schema); await setup.query('SET search_path TO '+schema+',public');
    const dir=new URL('../sql/',import.meta.url); for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(f,dir),'utf8'));
    t.mock.method(pool,'query',(sql:string,args:unknown[])=>database.query(sql,args)); t.mock.method(pool,'connect',()=>database.connect());
    for(const role of ['a','b','p1','p2','p3']) {
      users[role]=(await database.query("INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,'fixture') RETURNING id",[role+'@private.example',role])).rows[0].id;
      const token=randomUUID(); cookies[role]='artist_session='+token; await database.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),users[role]]);
    }
    const add=async(name:string,genres:string[]=[],rank:number|null=null)=>(await database.query("INSERT INTO artists(name,slug,kind,genres,popularity_rank) VALUES($1,$1,'solo',$2,$3) RETURNING id",[name,genres,rank])).rows[0].id as string;
    const band=await add('band',['Rock']),member=await add('member'),popular=await add('popular',['Jazz'],1),peer=await add('peer'),seen=await add('seen',['Folk']),engaged=await add('engaged'),futureArtist=await add('future'),hiddenArtist=await add('hidden');
    await database.query("UPDATE artists SET kind='band' WHERE id=$1",[band]); await database.query('INSERT INTO artist_memberships(band_id,member_id) VALUES($1,$2)',[band,member]);
    await database.query('INSERT INTO follows(user_id,artist_id) VALUES($1,$2)',[users.a,band]);
    await t.test('A follows a band and receives its member; B/guest get independent cold-start lists',async()=>{
      const a=await get('a'),b=await get('b'),guest=await get(); assert.equal(a.data.artists[0].id,member); assert.match(a.data.artists[0].reason,/band/); assert.ok(!a.data.artists.some((x:any)=>x.id===band)); assert.equal(b.data.artists[0].id,popular); assert.deepEqual(guest.data.artists,b.data.artists);
      assert.match(a.headers.get('cache-control') || '',/no-store/); assert.match(a.headers.get('vary') || '',/Cookie/);
      const serialized=JSON.stringify(a.data); for(const value of [users.a,users.b,'private.example','supporters','strength','weight','family_ids']) assert.ok(!serialized.includes(value));
    });
    await t.test('Collaborative evidence activates at three peers and disappears when that evidence is removed',async()=>{
      for(const role of ['p1','p2','p3']) await database.query('INSERT INTO follows(user_id,artist_id) VALUES($1,$2),($1,$3)',[users[role],band,peer]);
      assert.match((await get('a')).data.artists.find((x:any)=>x.id===peer).reason,/แฟนเพลง/);
      await database.query('DELETE FROM follows WHERE user_id=$1 AND artist_id=$2',[users.p3,peer]);
      assert.ok(!(await get('a')).data.artists.some((x:any)=>x.id===peer && /แฟนเพลง/.test(x.reason)));
    });
    await t.test('Only finished attendance and visible recent engagement affect suggestions; repeats do not amplify a comment',async()=>{
      const past=(await database.query("INSERT INTO concerts(slug,title,starts_at,ends_at) VALUES('past','Past',now()-interval '2 days',now()-interval '1 day') RETURNING id")).rows[0].id;
      const future=(await database.query("INSERT INTO concerts(slug,title,starts_at) VALUES('future','Future',now()+interval '1 year') RETURNING id")).rows[0].id;
      await database.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2),($3,$4)',[past,seen,future,futureArtist]); await database.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2),($1,$3)',[users.b,past,future]);
      const post=(await database.query("INSERT INTO community_posts(user_id,body) VALUES($1,'Visible') RETURNING id",[users.p1])).rows[0].id;
      const hidden=(await database.query("INSERT INTO community_posts(user_id,body,hidden) VALUES($1,'Hidden',true) RETURNING id",[users.p1])).rows[0].id;
      await database.query('INSERT INTO community_post_artists(post_id,artist_id) VALUES($1,$2),($3,$4)',[post,engaged,hidden,hiddenArtist]);
      await database.query('INSERT INTO community_likes(user_id,post_id) VALUES($1,$2),($1,$3)',[users.b,post,hidden]);
      const first=await get('b'); assert.equal(first.data.artists[0].id,seen); assert.match(first.data.artists.find((x:any)=>x.id===engaged).reason,/โพสต์/);
      await database.query("INSERT INTO community_comments(user_id,post_id,body) SELECT $1,$2,'Repeated' FROM generate_series(1,40)",[users.b,post]);
      const repeated=await get('b'); assert.equal(repeated.data.artists[0].id,seen); for(const id of [futureArtist,hiddenArtist]) assert.ok(!repeated.data.artists.some((x:any)=>x.id===id && x.reason!=='ลองทำความรู้จัก'));
      await database.query('UPDATE community_posts SET hidden=true WHERE id=$1',[post]); assert.ok(!(await get('b')).data.artists.some((x:any)=>x.id===engaged && /โพสต์/.test(x.reason)));
      await database.query('DELETE FROM attendance WHERE user_id=$1',[users.b]); assert.equal((await get('b')).data.artists[0].id,popular);
    });
    await t.test('Following a suggestion excludes it immediately; expired sessions return only cold-start data',async()=>{
      await database.query('INSERT INTO follows(user_id,artist_id) VALUES($1,$2)',[users.a,member]); assert.ok(!(await get('a')).data.artists.some((x:any)=>x.id===member));
      await database.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[users.a]); assert.deepEqual((await get('a')).data.artists,(await get()).data.artists);
    });
  } finally {
    server.close(); server.closeAllConnections(); await once(server,'close'); t.mock.restoreAll(); await database.end(); await setup.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'); await setup.end(); await pool.end();
  }
});
