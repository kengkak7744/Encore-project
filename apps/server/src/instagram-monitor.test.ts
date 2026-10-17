import assert from 'node:assert/strict';
import test from 'node:test';
import {buildInstagramMonitor,buildInstagramQueue,type InstagramMonitorAccount,type InstagramMonitorRun,type InstagramMonitorJob,type InstagramMonitorBudget} from './instagram-monitor.js';

test('Queue reports combined content work and the same persistent refresh reservation as the worker',()=>{
  const now=Date.parse('2026-10-17T00:00:00Z');
  const accounts:InstagramMonitorAccount[]=['refresh','new'].map(slug=>({slug,handle:slug,last_success_at:new Date(now),last_checked_at:new Date(now),next_sync_at:new Date(now+55*60000),instagram_failures:0,last_error:null}));
  const jobs:InstagramMonitorJob[]=[{slug:'refresh',reason:'refresh',needs_text:false,requested_at:new Date(now-12*3600000),not_before:new Date(now),failures:0,last_error:null},
    {slug:'new',reason:'new-post',needs_text:true,requested_at:new Date(now-600000),not_before:new Date(now),failures:0,last_error:null}];
  const budget:InstagramMonitorBudget={spacing_seconds:30,paused_until:null,usage:{callCount:35,totalTime:34,cpuTime:0,regainMinutes:null},usage_checked_at:new Date(now),checks_since_media:5,content_jobs_since_refresh:0};
  const content=buildInstagramQueue(accounts,jobs,[],budget,now);
  assert.equal(content.pendingText,0);assert.equal(content.pendingMedia,2);assert.equal(content.combinedTextMediaJobs,1);
  assert.equal(content.pendingContent,1);assert.equal(content.pendingRefresh,1);assert.equal(content.scheduling.nextEligibleSlug,'new');
  assert.equal(buildInstagramQueue(accounts,jobs,[],{...budget,content_jobs_since_refresh:2},now).scheduling.nextEligibleSlug,'refresh');
  const text=buildInstagramQueue(accounts,jobs,[],{...budget,usage:{...budget.usage!,totalTime:45}},now);
  assert.equal(text.pendingText,1);assert.equal(text.combinedTextMediaJobs,0);assert.equal(text.scheduling.nextEligibleSlug,'new');
});

test('Instagram report keeps inaccessible accounts in the denominator and exposes actual capacity',()=>{
  const now=Date.parse('2026-10-09T12:00:00Z');
  const account=(slug:string,minutes:number|null):InstagramMonitorAccount=>({slug,handle:slug,last_success_at:minutes===null?null:new Date(now-minutes*60_000),last_checked_at:null,next_sync_at:null,instagram_failures:0,last_error:null});
  const accounts=Array.from({length:100},(_,index)=>account('artist-'+index,index<51?20:index<98?90:null));
  accounts[99].instagram_failures=3;accounts[99].next_sync_at=new Date(now+3_600_000);
  const run=(minutes:number,mode:string,status='success'):InstagramMonitorRun=>({started_at:new Date(now-minutes*60_000),finished_at:new Date(now-minutes*60_000+1000),status,metrics:{mode,artistSlug:'artist-0'}});
  const result=buildInstagramMonitor(accounts,[run(10,'discovery'),run(80,'discovery'),run(5,'media'),run(6,'detail'),run(1,'discovery','failed')],90,now);
  assert.equal(result.accounts,100);assert.equal(result.freshAccounts,51);assert.equal(result.neverSucceeded,2);assert.equal(result.backoffAccounts,1);
  assert.equal(result.minimumFullPassMinutes,150);assert.equal(result.maximumSpacingForFullPassSeconds,36);
  assert.equal(result.hourlyCapacity.eligibleAccounts,99);assert.equal(result.hourlyCapacity.canFitAllAccounts,false);
  assert.equal(buildInstagramMonitor(accounts,[],30,now).hourlyCapacity.canFitAllAccounts,true);
  assert.equal(result.items.find(row=>row.slug==='artist-0')?.hourlyDeadlineAt,new Date(now+40*60_000).toISOString());
  assert.equal(result.observedUniqueAccountsLastHour,1);assert.equal(result.verdict,'needs_review');
  assert.equal(result.items.find(row=>row.slug==='artist-0')?.maximumRecordedGapMinutes,70);
  assert.equal(result.hourly.reduce((n,row)=>n+row.failures,0),1);
  assert.equal(result.items[0].fresh,false);
});

test('Queue distinguishes account recovery from job retries and never treats enrichment as discovery',()=>{
  const now=Date.parse('2026-10-11T03:00:00Z');
  const account=(slug:string,failures=0,next=now+3_000_000):InstagramMonitorAccount=>({slug,handle:slug,last_success_at:new Date(now-600_000),last_checked_at:null,next_sync_at:new Date(next),instagram_failures:failures,last_error:null});
  const job=(slug:string,needs_text=false):InstagramMonitorJob=>({slug,needs_text,reason:'refresh',requested_at:new Date(now-172_800_000),not_before:new Date(now-60_000),failures:0,last_error:null});
  const budget:InstagramMonitorBudget={spacing_seconds:30,paused_until:null,usage:{callCount:46,totalTime:34,cpuTime:0,regainMinutes:null},usage_checked_at:new Date(now),checks_since_media:5};
  const accounts=[account('tonhon',3),account('recover',1,now-1),account('retry'),account('ready')];
  const jobs=[job('tonhon',true),job('recover'),{...job('retry'),failures:1,not_before:new Date(now+60_000)},job('ready'),job('removed')];
  const run=(mode:string,end=now-1000):InstagramMonitorRun=>({started_at:new Date(end-1000),finished_at:new Date(end),status:'success',metrics:{mode,artistSlug:'ready'}});
  const original=JSON.stringify({accounts,jobs,budget});
  const result=buildInstagramQueue(accounts,jobs,[run('media'),run('detail'),run('media',now+1),{...run('media'),status:'failed'},run('media',now-3_600_001)],budget,now);
  assert.equal(result.pendingText,1);assert.equal(result.pendingMedia,3);assert.equal(result.blockedAccounts,2);assert.equal(result.failedJobs,1);
  assert.equal(result.items.find(item=>item.slug==='tonhon')?.blocker,'account_backoff');
  assert.equal(result.items.find(item=>item.slug==='recover')?.blocker,'awaiting_discovery_recovery');
  assert.equal(result.items.find(item=>item.slug==='retry')?.blocker,'job_backoff');
  assert.equal(result.items.find(item=>item.slug==='ready')?.blocker,null);
  assert.equal(result.completedTextLastHour,1);assert.equal(result.completedMediaLastHour,1);
  assert.equal(result.items[0].ageMinutes,2880);
  assert.equal(JSON.stringify({accounts,jobs,budget}),original,'Reporting must not change queues, retry times or budgets');
});

test('Queue exposes processing ceiling, incomplete usage, provider cooldown and discovery priority',()=>{
  const now=Date.parse('2026-10-11T03:00:00Z');
  const account:InstagramMonitorAccount={slug:'artist',handle:'artist',last_success_at:new Date(now-600_000),last_checked_at:null,next_sync_at:new Date(now+2_700_000),instagram_failures:0,last_error:null};
  const jobs:InstagramMonitorJob[]=[{slug:'artist',needs_text:false,reason:'refresh',requested_at:new Date(now),not_before:new Date(now),failures:0,last_error:null}];
  const budget:InstagramMonitorBudget={spacing_seconds:30,paused_until:null,usage:{callCount:46,totalTime:40,cpuTime:0,regainMinutes:null},usage_checked_at:new Date(now),checks_since_media:5};
  const blocked=(state=budget,accounts=[account])=>buildInstagramQueue(accounts,jobs,[],state,now).items[0].blocker;
  assert.equal(blocked(),'usage_guard');
  assert.equal(blocked({...budget,usage_checked_at:new Date(now-16*60_000)}),'usage_guard');
  assert.equal(blocked({...budget,usage:{...budget.usage!,cpuTime:null}}),'usage_guard');
  assert.equal(blocked({...budget,paused_until:new Date(now+60_000)}),'provider_cooldown');
  const healthy={...budget,usage:{...budget.usage!,totalTime:34}};
  assert.equal(blocked(healthy,[{...account,last_success_at:new Date(now-56*60_000),next_sync_at:new Date(now-60_000)}]),null,
    'A 55-minute due check does not block enrichment when the hourly deadline has spare slots');
  assert.equal(blocked(healthy,[{...account,last_success_at:new Date(now-59.5*60_000),next_sync_at:new Date(now-60_000)}]),'discovery_priority');
  assert.equal(blocked({...healthy,checks_since_media:1},[{...account,next_sync_at:new Date(now)}]),'discovery_spacing');
  assert.equal(blocked(healthy),null,'Call46% alone must not block media below time40% and call60%');
});

test('Queue reserves all hourly deadlines and uses the worker fallback spacing for old usage headers',()=>{
  const now=Date.parse('2026-10-14T00:00:00Z');
  const accounts:InstagramMonitorAccount[]=Array.from({length:100},(_,index)=>({slug:'artist-'+index,handle:'artist_'+index,
    last_success_at:new Date(now-56*60_000+index*33_000),last_checked_at:null,next_sync_at:new Date(now-60_000+index*33_000),instagram_failures:0,last_error:null}));
  const jobs:InstagramMonitorJob[]=[{slug:'artist-0',needs_text:false,reason:'refresh',requested_at:new Date(now-86_400_000),not_before:new Date(now),failures:0,last_error:null}];
  const budget:InstagramMonitorBudget={spacing_seconds:30,paused_until:null,usage:{callCount:38,totalTime:33,cpuTime:0,regainMinutes:null},usage_checked_at:new Date(now),checks_since_media:5};
  const ready=buildInstagramQueue(accounts,jobs,[],budget,now);
  assert.equal(ready.items[0].blocker,null);assert.equal(ready.scheduling.headroomSeconds,208);
  const tight=buildInstagramQueue(accounts.map(account=>({...account,last_success_at:new Date(now-10*60_000)})),jobs,[],budget,now);
  assert.equal(tight.items[0].blocker,'discovery_priority','A safe oldest account cannot hide an overloaded tail');
  const stale=buildInstagramQueue(accounts,jobs,[],{...budget,usage_checked_at:new Date(now-16*60_000)},now);
  assert.equal(stale.scheduling.spacingSeconds,60);assert.equal(stale.scheduling.allowEnrichment,false);
  assert.equal(stale.items[0].blocker,'usage_guard');
});
