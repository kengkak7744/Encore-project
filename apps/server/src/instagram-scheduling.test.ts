import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {pool} from './db.js';
import {config} from './config.js';
import {syncNews} from './ingest.js';

test('IG account errors and content/refresh scheduling use the real ingestion and persistent budget',{skip:!process.env.INGEST_TEST_DATABASE_URL},async(t)=>{
  const client=new pg.Client({connectionString:process.env.INGEST_TEST_DATABASE_URL});await client.connect();
  const original={...config};Object.assign(config,{instagramGraphToken:'fixture-token',instagramGraphUserId:'123',instagramGraphTokenExpiresAt:'',instagramAdaptivePacingEnabled:true,instagramRequestSpacingSeconds:60,instagramMinSpacingSeconds:30,instagramCheckIntervalMinutes:55,instagramProbeLimit:3,instagramMediaMaxUsagePercent:40,instagramDetailMaxUsagePercent:60,instagramUsagePausePercent:75});
  try{
    await client.query('BEGIN');await client.query('CREATE SCHEMA instagram_scheduling_fixture');await client.query('SET LOCAL search_path TO instagram_scheduling_fixture,public');
    const dir=new URL('../sql/',import.meta.url);for(const file of (await readdir(dir)).filter(v=>v.endsWith('.sql')).sort())await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql:string,params:unknown[])=>client.query(sql,params));
    t.mock.method(pool,'connect',async()=>({query:client.query.bind(client),release(){}}));
    const calls:{handle:string;media:boolean;caption:boolean}[]=[];let fail='',usage=34,retryAfter='',errorCode=110,subcode=2207013,missingHeaders=false;
    t.mock.method(globalThis,'fetch',async(url:URL)=>{
      assert.equal(url.hostname,'graph.facebook.com');const fields=url.searchParams.get('fields')!;const handle=fields.match(/username\(([^)]+)\)/)![1];
      const media=fields.includes('media_url');calls.push({handle,media,caption:fields.includes('caption')});
      const headers:Record<string,string>=missingHeaders?{}:{'x-app-usage':JSON.stringify({call_count:35,total_time:usage,total_cputime:0})};if(retryAfter)headers['retry-after']=retryAfter;
      if(handle===fail)return new Response(JSON.stringify({error:{code:errorCode,error_subcode:subcode}}),{status:400,headers});
      return new Response(JSON.stringify({business_discovery:{id:'456',username:handle,media:{data:[{id:handle,permalink:'https://www.instagram.com/p/'+handle+'/',timestamp:'2026-10-16T00:00:00Z',media_type:'IMAGE',...(fields.includes('caption')?{caption:'New text'}:{}),...(media?{media_url:'https://example.com/new.jpg'}:{})}]}}}),{headers});
    });
    const reset=async()=>{
      calls.length=0;fail='';usage=34;retryAfter='';errorCode=110;subcode=2207013;missingHeaders=false;
      await client.query('TRUNCATE artists CASCADE');await client.query('TRUNCATE sync_runs');await client.query('DELETE FROM source_state');
      await client.query(`UPDATE instagram_sync_budget SET next_request_at=NULL,last_request_at=NULL,paused_until=NULL,pause_reason=NULL,usage='{"callCount":35,"totalTime":34,"cpuTime":0}',usage_checked_at=now(),consecutive_limits=0,spacing_seconds=30,healthy_responses=2,checks_since_media=5`);
      if('content_jobs_since_refresh' in (await client.query('SELECT * FROM instagram_sync_budget')).rows[0])await client.query('UPDATE instagram_sync_budget SET content_jobs_since_refresh=0');
    };
    const add=async(slug:string,reason?:string,needsText=false,age='0 hours')=>{
      const artist=(await client.query("INSERT INTO artists(slug,name,kind) VALUES($1,$1,'solo') RETURNING id",[slug])).rows[0].id;
      const account=(await client.query(`INSERT INTO social_accounts(artist_id,platform,handle,url,verified_at,last_success_at,next_sync_at,last_media_refresh_at) VALUES($1,'instagram',$2,$3,now(),now(),now()+interval '55 minutes',now()) RETURNING id`,[artist,slug,'https://www.instagram.com/'+slug+'/'])).rows[0].id;
      if(reason)await client.query('INSERT INTO instagram_media_jobs(account_id,reason,needs_text,requested_at) VALUES($1,$2,$3,now()-$4::interval)',[account,reason,needsText,age]);
      return account;
    };
    const next=async()=>{await client.query('UPDATE instagram_sync_budget SET next_request_at=NULL,checks_since_media=5');await syncNews({platform:'instagram'});};
    await t.test('a known unavailable account preserves 30-second pacing and still receives account backoff',async()=>{
      await reset();const id=await add('hers');await add('healthy');fail='hers';usage=44;
      await client.query('UPDATE social_accounts SET last_success_at=NULL,next_sync_at=now() WHERE id=$1',[id]);
      await syncNews({platform:'instagram'});
      const budget=(await client.query('SELECT * FROM instagram_sync_budget')).rows[0];
      assert.equal(budget.spacing_seconds,30);assert.equal(budget.healthy_responses,0);assert.equal(budget.usage.totalTime,44);assert.equal(budget.paused_until,null);
      const account=(await client.query("SELECT instagram_failures,last_success_at,next_sync_at>=now()+interval '359 minutes' waiting FROM social_accounts WHERE id=$1",[id])).rows[0];
      assert.equal(account.instagram_failures,1);assert.equal(account.last_success_at,null);assert.equal(account.waiting,true);
      await client.query("UPDATE social_accounts SET next_sync_at=now() WHERE handle='healthy'");await next();assert.equal(calls.at(-1)!.handle,'healthy');
    });
    await t.test('new-post media passes old refreshes but a refresh gets every third eligible turn across invocations',async()=>{
      await reset();await add('refresh_a','refresh',false,'12 hours');await add('refresh_b','refresh',false,'11 hours');
      await add('content_a','new-post',false,'20 minutes');await add('content_b','new-post',false,'10 minutes');await add('content_c','new-post',false,'5 minutes');
      await next();assert.equal(calls.at(-1)!.handle,'content_a');await next();assert.equal(calls.at(-1)!.handle,'content_b');
      assert.equal((await client.query('SELECT content_jobs_since_refresh FROM instagram_sync_budget')).rows[0].content_jobs_since_refresh,2);
      await next();assert.equal(calls.at(-1)!.handle,'refresh_a');await next();assert.equal(calls.at(-1)!.handle,'content_c');
      assert.ok(calls.every(c=>c.media));
    });
    await t.test('new post text and media complete in one below-40-percent request',async()=>{
      await reset();await add('combined','new-post',true);await next();assert.equal(calls.length,1);assert.equal(calls[0].media,true);assert.equal(calls[0].caption,true);
      const post=(await client.query('SELECT body,image_url FROM news_items')).rows[0];assert.equal(post.body,'New text');assert.equal(post.image_url,'https://example.com/new.jpg');
      assert.equal((await client.query('SELECT count(*)::int n FROM instagram_media_jobs')).rows[0].n,0);
      assert.equal((await client.query("SELECT metrics FROM sync_runs WHERE source_name='INSTAGRAM'")).rows[0].metrics.combinedTextMedia,true);
    });
    await t.test('45-percent usage keeps text-only access and retains the media job',async()=>{
      await reset();usage=45;await add('text_only','new-post',true);await client.query(`UPDATE instagram_sync_budget SET usage='{"callCount":35,"totalTime":45,"cpuTime":0}'`);await next();
      assert.equal(calls.length,1);assert.equal(calls[0].media,false);assert.equal(calls[0].caption,true);assert.equal((await client.query('SELECT needs_text FROM instagram_media_jobs')).rows[0].needs_text,false);
    });
    await t.test('known account errors still honor high usage, Retry-After and rate-limit codes',async()=>{
      for(const scenario of ['usage','retry','rate','missing','unknown','token']){
        await reset();const id=await add('blocked');fail='blocked';
        if(scenario==='usage')usage=76;if(scenario==='retry')retryAfter='7200';if(scenario==='rate'){errorCode=4;subcode=0;}
        if(scenario==='missing')missingHeaders=true;if(scenario==='unknown'){errorCode=100;subcode=0;}if(scenario==='token')errorCode=190;
        await client.query('UPDATE social_accounts SET next_sync_at=now(),last_success_at=NULL WHERE id=$1',[id]);await syncNews({platform:'instagram'});
        const budget=(await client.query('SELECT spacing_seconds,paused_until>now() paused FROM instagram_sync_budget')).rows[0];assert.ok(budget.spacing_seconds>=60);
        if(['usage','retry','rate'].includes(scenario)){assert.equal(budget.paused,true);const count=calls.length;await next();assert.equal(calls.length,count);}
      }
    });
    await t.test('failed content attempts still reserve a refresh turn and keep durable job backoff',async()=>{
      await reset();await add('old_refresh','refresh',false,'12 hours');const bad=await add('bad_content','new-post',false,'30 minutes');await add('good_content','new-post',false,'20 minutes');fail='bad_content';
      await next();assert.equal(calls.at(-1)!.handle,'bad_content');assert.equal((await client.query('SELECT failures,not_before>now() waiting FROM instagram_media_jobs WHERE account_id=$1',[bad])).rows[0].waiting,true);
      await next();assert.equal(calls.at(-1)!.handle,'good_content');await next();assert.equal(calls.at(-1)!.handle,'old_refresh');
    });
  }finally{await client.query('SELECT pg_advisory_unlock_all()');t.mock.restoreAll();Object.assign(config,original);await client.query('ROLLBACK');await client.end();await pool.end();}
});
