import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {createApp} from './app.js';
import {pool} from './db.js';
import {config} from './config.js';
import {ollamaQueue} from './ollama-queue.js';
import {enrichKnowledge,relevantKnowledge} from './knowledge.js';
import {runScheduledAI} from './worker-maintenance.js';

test('Project audit regressions: proxy users, maps, manual budgets, indexing and bounded feeds',{skip:!process.env.INGEST_TEST_DATABASE_URL},async t=>{
  assert.match(new URL(process.env.INGEST_TEST_DATABASE_URL!).pathname,/^\/encore_ingest_test\w*$/);
  const db=new pg.Client({connectionString:process.env.INGEST_TEST_DATABASE_URL});await db.connect();
  const before={...config},realFetch=globalThis.fetch,server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+(server.address() as any).port;
  let googleCalls=0,googleDestination:any=null,embeddingFails=false,opposite=false,selection:any={intent:'unknown'};
  const candidateRows:number[]=[],cookies:Record<string,string>={},users:Record<string,string>={};
  const request=async(path:string,body?:unknown,who='a',headers:Record<string,string>={})=>{
    const response=await realFetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookies[who] || '',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json() as any};
  };
  try{
    await db.query('BEGIN');await db.query('CREATE SCHEMA project_fixes_fixture');await db.query('SET LOCAL search_path TO project_fixes_fixture,public');
    for(const file of(await readdir(new URL('../sql/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
    t.mock.method(pool,'query',async(sql:string,args:unknown[])=>{const result=await db.query(sql,args);if(sql.includes('artist_ids,genres,author_key'))candidateRows.push(result.rows.length);return result;});
    t.mock.method(pool,'connect',async()=>({query:db.query.bind(db),release(){}}));
    t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
    t.mock.method(globalThis,'fetch',async(input:unknown,options?:RequestInit)=>{
      const url=String(input);
      if(url.startsWith('https://routes.googleapis.com/')){googleCalls++;googleDestination=JSON.parse(String(options?.body)).destination;return Response.json({routes:[{distanceMeters:420000,duration:'3600s'}]});}
      if(url.endsWith('/api/ps'))return Response.json({models:[]});
      if(url.endsWith('/api/embed'))return embeddingFails?new Response('',{status:503}):Response.json({embeddings:[Array(1024).fill(opposite?-0.1:0.1)]});
      if(url.endsWith('/api/chat'))return Response.json({message:{content:JSON.stringify(selection)}});
      throw Error('Unexpected external request blocked by fixture');
    });
    Object.assign(config,{googleRoutesEnabled:true,googleRoutesKey:'fixture-private-key',googleMapsDailyLimit:100,agodaEnabled:false});
    for(const who of ['a','b','c']){
      users[who]=(await db.query("INSERT INTO users(email,display_name,password_hash)VALUES($1,$1,'unused')RETURNING id",[who+'@fixture.test'])).rows[0].id;
      const token=randomUUID();cookies[who]='artist_session='+token;
      await db.query("INSERT INTO sessions(token_hash,user_id,expires_at)VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),users[who]]);
    }
    const artist=(await db.query("INSERT INTO artists(slug,name,kind)VALUES('fixture-milli','MILLI','solo')RETURNING id")).rows[0].id;
    const show=(await db.query("INSERT INTO concerts(slug,title,venue,city,price_min,starts_at,venue_location,official_url)VALUES('fixture-show','Fixture show','Ambiguous hall','Bangkok',1500,'2099-01-15T12:00Z',$1,'https://organizer.example/show')RETURNING id",[JSON.stringify({address:null,latitude:13.75,longitude:100.5,placeId:null,sourceUrl:'https://organizer.example/show',checkedAt:new Date().toISOString()})])).rows[0].id;
    await db.query('INSERT INTO concert_artists(concert_id,artist_id)VALUES($1,$2)',[show,artist]);

    await t.test('Protected quotas belong to each session user, not the proxy or forged forwarding headers',async()=>{
      for(let i=0;i<20;i++)assert.equal((await request('/chat',{message:'fixture'},'a',{'X-Forwarded-For':'198.51.100.'+i})).status,200);
      assert.equal((await request('/chat',{message:'fixture'},'a',{'X-Forwarded-For':'203.0.113.9'})).status,429);
      assert.equal((await request('/chat',{message:'fixture'},'b')).status,200);
      for(let i=0;i<5;i++)assert.equal((await request('/trip-estimates',{concertId:'bad'},'a')).status,400);
      assert.equal((await request('/trip-estimates',{concertId:'bad'},'a')).status,429);
      assert.equal((await request('/trip-estimates',{concertId:'bad'},'c')).status,400);
    });
    await t.test('Different login identities behind the same proxy do not share the small auth bucket',async()=>{
      for(let i=0;i<25;i++)assert.equal((await request('/auth/register',{email:'fan'+i+'@fixture.test',password:'x'},'',{'X-Forwarded-For':'198.51.100.1'})).status,400);
      for(let i=0;i<20;i++)assert.equal((await request('/auth/register',{email:'target@fixture.test',password:'x'},'',{'X-Forwarded-For':'198.51.100.'+i})).status,400);
      assert.equal((await request('/auth/register',{email:'target@fixture.test',password:'x'},'',{'X-Forwarded-For':'192.0.2.1'})).status,429);
    });
    await t.test('Manual/default trips make no provider calls; explicit routing shares the budget and source coordinates',async()=>{
      const manual=await request('/trip-estimates',{concertId:show,origin:'Chiang Mai',distanceKm:123,useExternalProviders:true},'b');
      assert.equal(manual.body.distanceKmUsed,123);assert.equal(googleCalls,0);
      const local=await request('/trip-estimates',{concertId:show,origin:'Chiang Mai'},'b');assert.equal(local.status,200);assert.equal(googleCalls,0);
      const routed=await request('/trip-estimates',{concertId:show,origin:'Chiang Mai',useExternalProviders:true},'b');assert.equal(routed.body.distanceKmUsed,420);
      assert.deepEqual(googleDestination,{location:{latLng:{latitude:13.75,longitude:100.5}}});
      assert.equal((await db.query('SELECT requests FROM google_maps_budget')).rows[0].requests,1);
      await db.query('UPDATE google_maps_budget SET requests=100');
      const capped=await request('/trip-estimates',{concertId:show,origin:'Other city',useExternalProviders:true},'b');assert.equal(capped.body.distanceKmUsed,null);assert.equal(googleCalls,1);
    });
    await t.test('All external map links keep the same source or manually selected destination as the request',async()=>{
      await db.query('UPDATE google_maps_budget SET requests=0');
      const routed=await request('/maps/routes',{concertId:show,origin:'Bangkok',mode:'DRIVE'},'c');assert.equal(routed.status,200);
      assert.equal(new URL(routed.body.url).searchParams.get('destination'),'13.75,100.5');
      const map=await request('/concerts/'+show+'/map',undefined,'');assert.equal(new URL(map.body.url).searchParams.get('query'),'13.75,100.5');
    });
    await t.test('Indexing gives news a turn, drains beyond 100, skips unchanged data and replaces versions atomically',async()=>{
      await db.query("INSERT INTO concerts(slug,title,starts_at)SELECT 'fixture-'||i,'Fixture concert '||i,'2099-12-15T12:00Z' FROM generate_series(1,100)i");
      await db.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at)SELECT $1,'instagram','https://www.instagram.com/p/fixture'||i,'Fixture album news '||i,now() FROM generate_series(1,24)i",[artist]);
      assert.equal(await enrichKnowledge(),20);
      const first=(await db.query("SELECT count(*)::int n FROM knowledge_chunks WHERE source_type='news'")).rows[0].n;assert.equal(first,10);
      for(let i=0;i<6;i++)await enrichKnowledge();
      assert.equal((await db.query('SELECT count(*)::int n FROM knowledge_chunks')).rows[0].n,125);
      assert.equal(await enrichKnowledge(),0);
      await db.query("UPDATE concerts SET title='Corrected fixture' WHERE id=$1",[show]);
      assert.equal(await enrichKnowledge(),1);
      assert.equal((await db.query('SELECT count(*)::int n FROM knowledge_chunks WHERE source_id=$1',[show])).rows[0].n,1);
    });
    await t.test('Chat uses vector retrieval for content searches, cites actual records and rejects hidden/stale/irrelevant matches',async()=>{
      selection={intent:'search',artist:'MILLI'};
      const answer=await request('/chat',{message:'ค้นข้อความข่าวอัลบั้ม MILLI'},'b');assert.equal(answer.status,200);assert.ok(answer.body.answer.includes('Fixture album news'));assert.ok(answer.body.sources.length>0);
      await db.query("UPDATE news_items SET hidden=true WHERE artist_id=$1",[artist]);
      await db.query("UPDATE concerts SET title='Changed after embedding' WHERE id=$1",[show]);
      assert.deepEqual(await relevantKnowledge('album',{artistId:artist}),[]);
      await db.query('UPDATE news_items SET hidden=false WHERE artist_id=$1',[artist]);
      opposite=true;assert.deepEqual(await relevantKnowledge('unrelated',{artistId:artist}),[]);opposite=false;
      embeddingFails=true;await assert.rejects(runScheduledAI());
      assert.ok((await db.query("SELECT last_error FROM worker_task_state WHERE name='ai'")).rows[0].last_error);embeddingFails=false;
    });
    await t.test('For You bounds expensive candidates, preserves old archive pages and reuses snapshots without reranking',async()=>{
      await db.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at)SELECT $1,'instagram','https://www.instagram.com/p/archive'||i,'Archive news '||i,now()-i*interval '1 day' FROM generate_series(1,3000)i",[artist]);
      const first=await request('/feed',undefined,'c');assert.equal(first.status,200);assert.equal(first.body.total,3024);
      assert.ok(candidateRows.at(-1)!<=540);const beforeQueries=candidateRows.length;
      const second=await request('/feed?page=2&snapshot='+first.body.snapshot,undefined,'c');assert.equal(second.status,200);assert.equal(candidateRows.length,beforeQueries);
      const keys=new Set(first.body.items.map((item:any)=>item.id));assert.ok(second.body.items.every((item:any)=>!keys.has(item.id)));
      const last=await request('/feed?page='+Math.ceil(first.body.total/15)+'&snapshot='+first.body.snapshot,undefined,'c');assert.ok(last.body.items.some((item:any)=>item.body==='Archive news 3000'));
      const hidden=first.body.items[0].id;await db.query('UPDATE news_items SET hidden=true WHERE id=$1',[hidden]);
      const refreshed=await request('/feed?snapshot='+first.body.snapshot,undefined,'c');assert.ok(refreshed.body.items.every((item:any)=>item.id!==hidden));
    });
  }finally{Object.assign(config,before);await db.query('ROLLBACK');await db.end();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('Concert currency formatting retains currency and unknown/free/invalid states',async()=>{
  const {price}=await import(new URL('../../web/lib/api.ts',import.meta.url).href);
  assert.match(price(100,'USD'),/USD/);assert.ok(!price(100,'USD').includes('฿'));
  assert.match(price(0,'THB'),/THB/);assert.match(price(100,'XXX'),/ไม่ทราบสกุลเงิน/);
  for(const amount of [null,undefined,NaN,Infinity,-1])assert.equal(price(amount,'THB'),'ยังไม่ประกาศราคา');
});
