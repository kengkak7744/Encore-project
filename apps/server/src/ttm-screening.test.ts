import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {parseEvents,saveEvent} from './ingest.js';
import {reviewTtm} from './concert-page-review.js';
import {hasExclusionEvidence} from './concert-page-evidence.js';
import {discoverConcertSource} from './concert-discovery.js';
import {pool} from './db.js';
import {parseTtmPhysicalDetail} from './ttm-detail.js';

const page='https://www.thaiticketmajor.com/performance/halfway-mr-fanboy-screenig-ep8.html';
const title='HALFWAY MR. FANBOY SCREENING EP.8';
const detail='<h1 class="title">'+title+'</h1><script type="application/ld+json">'+JSON.stringify({
  '@type':'MusicEvent',name:title,url:page,startDate:'2027-10-17T21:30:00+07:00',location:{name:'MGI HALL'}
})+'</script>';

test('TTM episode screening is excluded despite generic MusicEvent JSON-LD',()=>{
  assert.equal(reviewTtm(detail,page)?.outcome,'excluded');
  assert.equal(hasExclusionEvidence(reviewTtm(detail,page)!),true);
  assert.deepEqual(parseEvents(detail,page),[]);
  const physical='<link rel="canonical" href="'+page+'"><h1 class="title">'+title+'</h1><section id="section-event-round"><div class="event-detail-item"><div class="box-txt"><a class="venue">MGI HALL</a></div><div class="box-event-list"><div class="row"><div class="col-label"><div class="date">17 ตุลาคม 2570</div></div><div class="col-btn"><span class="item-show">21:30</span></div></div></div></div></section>';
  assert.deepEqual(parseTtmPhysicalDetail(physical,page),[]);
  assert.equal(reviewTtm('<h1>SCREENING EP8</h1>',page)?.outcome,'excluded');
  assert.equal(reviewTtm('<h1>SCREENING Episode 8</h1>',page)?.outcome,'excluded');
  assert.equal(reviewTtm('<h1>Band Concert EP.8</h1>',page),undefined);
  assert.equal(reviewTtm('<h1>Unknown performance</h1>',page),undefined);
  assert.equal(reviewTtm('<h1>'+title+'</h1>','https://example.com/performance/show.html'),undefined);
});

test('TTM import guard, actual discovery and archive repair preserve unrelated and user data',{skip:!process.env.INGEST_TEST_DATABASE_URL},async(t)=>{
  const client=new pg.Client({connectionString:process.env.INGEST_TEST_DATABASE_URL});await client.connect();
  try{
    await client.query('BEGIN');await client.query('CREATE SCHEMA ttm_screening_fixture');await client.query('SET LOCAL search_path TO ttm_screening_fixture,public');
    const dir=new URL('../sql/',import.meta.url);
    for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql:string,params:unknown[])=>client.query(sql,params));
    assert.equal(await saveEvent('ThaiTicketMajor',{title,url:page,startsAt:'2027-10-17T14:30:00Z'}),false);
    assert.equal((await client.query('SELECT count(*)::int n FROM concerts')).rows[0].n,0);
    t.mock.method(globalThis,'fetch',async(input:string|URL)=>{
      const url=new URL(input);
      if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\n');
      return new Response(url.pathname==='/concert/'?'<a href="'+page+'">'+title+'</a>':detail,{headers:{'content-type':'text/html'}});
    });
    const result=await discoverConcertSource({name:'ThaiTicketMajor',url:'https://www.thaiticketmajor.com/concert/',host:'thaiticketmajor.com',linkPattern:/\/(concert|performance)\//});
    assert.deepEqual(result.events,[]);assert.equal(result.metrics.excludedPages,1);
    assert.equal(result.metrics.fetchFailures,0);assert.equal(hasExclusionEvidence(result.metrics.pages![0]),true);
    const user=(await client.query("INSERT INTO users(email,password_hash,display_name) VALUES('fixture@example.com','fixture','Fixture') RETURNING id")).rows[0].id;
    const ids=new Map<string,string>();
    for(const kind of ['unreferenced','attended','trip','manual','mixed','concert','unknown']){
      const eventTitle=kind==='concert'?'Band Concert EP.8':kind==='unknown'?'Mr. Fanboy EP. 11 Presented by Monday Moist':title;
      const id=(await client.query('INSERT INTO concerts(slug,title,manual_override) VALUES($1,$2,$3) RETURNING id',[kind,eventTitle,kind==='manual'])).rows[0].id;ids.set(kind,id);
      await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url,raw_data) VALUES($1,'ThaiTicketMajor',$2,$3)",[id,'https://www.thaiticketmajor.com/performance/'+kind+'.html',JSON.stringify({title:eventTitle})]);
      if(kind==='attended'){
        await client.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2)',[user,id]);
        await client.query("INSERT INTO concert_reviews(user_id,concert_id,rating,body) VALUES($1,$2,4,'Saved review')",[user,id]);
      }
      if(kind==='trip')await client.query("INSERT INTO trip_budgets(user_id,concert_id,inputs,estimate) VALUES($1,$2,'{}','{}')",[user,id]);
      if(kind==='mixed')await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url) VALUES($1,'Organizer','https://example.com/live')",[id]);
      if(kind==='unreferenced'){
        await client.query("INSERT INTO concert_performances(concert_id,starts_at,source_url) VALUES($1,'2027-10-17',$2)",[id,page]);
        await client.query("INSERT INTO knowledge_chunks(source_type,source_id,content,content_hash) VALUES('concert',$1,'Old screening document','fixture-hash')",[id]);
      }
    }
    const protectedBefore=(await client.query("SELECT slug,to_jsonb(c) row FROM concerts c WHERE slug<>'unreferenced' ORDER BY slug")).rows;
    const repair=await readFile(new URL('030_ttm_non_music_archive.sql',dir),'utf8');await client.query(repair);
    assert.deepEqual((await client.query("SELECT slug,to_jsonb(c) row FROM concerts c ORDER BY slug")).rows,protectedBefore);
    const archived=(await client.query('SELECT snapshot FROM concert_scope_archive WHERE concert_id=$1',[ids.get('unreferenced')])).rows[0].snapshot;
    assert.equal(archived.sources.length,1);assert.equal(archived.performances.length,1);assert.equal(archived.knowledge.length,1);
    assert.equal((await client.query('SELECT count(*)::int n FROM knowledge_chunks WHERE source_id=$1',[ids.get('unreferenced')])).rows[0].n,0);
    for(const table of ['attendance','trip_budgets','concert_reviews'])assert.equal((await client.query('SELECT count(*)::int n FROM '+table)).rows[0].n,1);
    await client.query(repair);assert.equal((await client.query('SELECT count(*)::int n FROM concert_scope_archive')).rows[0].n,1);
  }finally{t.mock.restoreAll();await client.query('ROLLBACK');await client.end();await pool.end();}
});
