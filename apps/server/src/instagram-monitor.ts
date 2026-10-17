import { one, query } from './db.js';
import { config } from './config.js';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { instagramDiscoveryHeadroom, instagramMediaAllowed, instagramSchedulingSpacing } from './instagram-policy.js';
import type { InstagramUsage } from './instagram-budget.js';
import {chooseInstagramEnrichment,instagramEnrichmentMode} from './instagram-enrichment.js';

export type InstagramMonitorAccount = {
  slug: string; handle: string|null; last_success_at: Date|string|null;
  last_checked_at: Date|string|null; next_sync_at: Date|string|null;
  instagram_failures: number; last_error: string|null;
};
export type InstagramMonitorRun = {
  started_at: Date|string; finished_at: Date|string|null; status: string;
  metrics: {mode?: string;artistSlug?: string;requests?: number;usageAfter?: {totalTime?: number;callCount?: number;cpuTime?: number}};
};
const time=(value: Date|string|null)=>value?new Date(value).getTime():NaN;

export type InstagramMonitorJob = {
  slug: string; needs_text: boolean; reason: string; requested_at: Date|string;
  not_before: Date|string; failures: number; last_error: string|null;
};
export type InstagramMonitorBudget = {
  spacing_seconds: number; paused_until: Date|string|null; usage: InstagramUsage|null;
  usage_checked_at: Date|string|null; checks_since_media: number;content_jobs_since_refresh?:number;
};

// Explain eligibility from the same stored controls as the worker. This never reserves a slot.
export function buildInstagramQueue(accounts: InstagramMonitorAccount[],jobs: InstagramMonitorJob[],runs: InstagramMonitorRun[],budget: InstagramMonitorBudget|null,now=Date.now()) {
  const eligible=accounts.filter(account=>account.instagram_failures===0 || !account.next_sync_at || time(account.next_sync_at)<=now);
  const spacing=instagramSchedulingSpacing(budget?.spacing_seconds,budget?.usage_checked_at,now);
  const headroom=instagramDiscoveryHeadroom(eligible.map(account=>account.last_success_at),spacing,now);
  const discovery=eligible.some(account=>!account.next_sync_at || time(account.next_sync_at)<=now) || !headroom.allowEnrichment;
  const bySlug=new Map(accounts.map(account=>[account.slug,account]));
  const allowMedia=instagramMediaAllowed(budget?.usage||null,budget?.usage_checked_at||null,now,config.instagramMediaMaxUsagePercent,Math.min(config.instagramDetailMaxUsagePercent,config.instagramUsagePausePercent-15));
  const allowDetail=instagramMediaAllowed(budget?.usage||null,budget?.usage_checked_at||null,now,config.instagramDetailMaxUsagePercent);
  const items=jobs.filter(job=>bySlug.has(job.slug)).map(job=>{
    const account=bySlug.get(job.slug)!;
    const allowed=instagramMediaAllowed(budget?.usage||null,budget?.usage_checked_at||null,now,
      job.needs_text?config.instagramDetailMaxUsagePercent:config.instagramMediaMaxUsagePercent,
      job.needs_text?config.instagramDetailMaxUsagePercent:Math.min(config.instagramDetailMaxUsagePercent,config.instagramUsagePausePercent-15));
    const blocker=account.instagram_failures>0
      ? time(account.next_sync_at)>now?'account_backoff':'awaiting_discovery_recovery'
      : !account.last_success_at?'awaiting_discovery'
      : time(job.not_before)>now?'job_backoff'
      : time(budget?.paused_until||null)>now?'provider_cooldown'
      : !allowed?'usage_guard'
      : !headroom.allowEnrichment?'discovery_priority'
      : discovery&&(budget?.checks_since_media||0)<5?'discovery_spacing':null;
    return {...job,handle:account.handle,mode:instagramEnrichmentMode(job,allowMedia&&allowDetail),
      ageMinutes:Math.max(0,Math.round((now-time(job.requested_at))/60_000)),blocker,
      retryAt:blocker==='account_backoff'?account.next_sync_at:blocker==='job_backoff'?job.not_before:blocker==='provider_cooldown'?budget?.paused_until:null};
  }).sort((a,b)=>time(a.requested_at)-time(b.requested_at)||a.slug.localeCompare(b.slug));
  const lastMode=runs.filter(run=>run.status==='success'&&run.finished_at&&time(run.finished_at)<=now&&['detail','media'].includes(run.metrics.mode||''))
    .sort((a,b)=>time(b.started_at)-time(a.started_at))[0]?.metrics.mode||null;
  const selected=chooseInstagramEnrichment(items.filter(job=>job.blocker===null),allowMedia&&allowDetail,lastMode,budget?.content_jobs_since_refresh||0);
  const recent=runs.filter(run=>run.status==='success'&&run.finished_at&&time(run.finished_at)<=now&&time(run.finished_at)>=now-3_600_000);
  return {pendingText:items.filter(job=>job.mode==='detail').length,pendingMedia:items.filter(job=>job.mode==='media').length,
    combinedTextMediaJobs:items.filter(job=>job.needs_text&&job.mode==='media').length,
    pendingContent:items.filter(job=>job.reason!=='refresh').length,pendingRefresh:items.filter(job=>job.reason==='refresh').length,
    scheduling:{spacingSeconds:spacing,slotSeconds:headroom.slotSeconds,
      headroomSeconds:Number.isFinite(headroom.slackSeconds)?Math.floor(headroom.slackSeconds):null,
      discoveryDue:discovery,allowEnrichment:headroom.allowEnrichment,
      discoveryChecksSinceEnrichment:budget?.checks_since_media||0,minimumDiscoveryChecks:5,
      contentJobsSinceRefresh:budget?.content_jobs_since_refresh||0,maximumContentBurst:2,nextEligibleSlug:selected?.slug||null},
    failedJobs:items.filter(job=>job.failures>0).length,blockedAccounts:items.filter(job=>job.blocker==='account_backoff'||job.blocker==='awaiting_discovery_recovery').length,
    completedTextLastHour:recent.filter(run=>run.metrics.mode==='detail').length,
    completedMediaLastHour:recent.filter(run=>run.metrics.mode==='media').length,
    note:'Eligibility is a snapshot, not an execution time or completion guarantee. Discovery deadlines, shared request slots and alternating enrichment still apply. Queue age is time since the first request; it is not the age of every media URL. No Graph calls are made by this report.',items};
}

export function buildInstagramMonitor(accounts: InstagramMonitorAccount[],runs: InstagramMonitorRun[],spacingSeconds: number,now=Date.now()) {
  const hourly=new Map<string,{hour:string;discovery:number;detail:number;media:number;failures:number;maxTotalTime:number|null}>();
  const successes=new Map<string,number[]>();
  for(const run of runs) {
    const at=time(run.started_at);
    if(!Number.isFinite(at)||at>now||at<now-24*3_600_000)continue;
    const hour=new Date(Math.floor(at/3_600_000)*3_600_000).toISOString();
    const row=hourly.get(hour)||{hour,discovery:0,detail:0,media:0,failures:0,maxTotalTime:null};
    const mode=run.metrics.mode;
    if(mode==='discovery'||mode==='detail'||mode==='media')row[mode]++;
    if(run.status==='failed')row.failures++;
    const total=run.metrics.usageAfter?.totalTime;
    if(typeof total==='number'&&Number.isFinite(total))row.maxTotalTime=Math.max(row.maxTotalTime||0,total);
    hourly.set(hour,row);
    // Text/media checks do not prove that discovery visited this account.
    if(mode==='discovery'&&run.status==='success'&&run.finished_at&&run.metrics.artistSlug) {
      const values=successes.get(run.metrics.artistSlug)||[];
      values.push(at);successes.set(run.metrics.artistSlug,values);
    }
  }
  const items=accounts.map(account=>{
    const age=Number.isFinite(time(account.last_success_at))?Math.max(0,(now-time(account.last_success_at))/60_000):null;
    const checked=successes.get(account.slug)?.sort((a,b)=>a-b)||[];
    const gaps=checked.slice(1).map((value,index)=>(value-checked[index])/60_000);
    return {...account,ageMinutes:age===null?null:Math.round(age*10)/10,
      hourlyDeadlineAt:Number.isFinite(time(account.last_success_at))?new Date(time(account.last_success_at)+3_600_000).toISOString():null,
      fresh:age!==null&&time(account.last_success_at)<=now&&age<=60,
      backoff:account.instagram_failures>0&&time(account.next_sync_at)>now,
      successfulDiscoveryChecks24h:checked.length,
      maximumRecordedGapMinutes:gaps.length?Math.round(Math.max(...gaps)*10)/10:null};
  });
  const fresh=items.filter(account=>account.fresh).length;
  const eligible=items.filter(account=>!account.backoff).length;
  const checkedLastHour=runs.filter(run=>run.metrics.mode==='discovery'&&run.status==='success'&&run.finished_at&&time(run.started_at)>=now-3_600_000&&time(run.started_at)<=now);
  return {generatedAt:new Date(now).toISOString(),targetMinutes:60,accounts:items.length,freshAccounts:fresh,
    neverSucceeded:items.filter(account=>account.last_success_at===null).length,
    backoffAccounts:items.filter(account=>account.backoff).length,
    observedUniqueAccountsLastHour:new Set(checkedLastHour.map(run=>run.metrics.artistSlug).filter(Boolean)).size,
    spacingSeconds,minimumFullPassMinutes:Math.round(items.length*spacingSeconds/60*10)/10,
    hourlyCapacity:{eligibleAccounts:eligible,requestSlotsPerHour:Math.floor(3600/(spacingSeconds+2)),
      plannedPassMinutes:Math.round(eligible*(spacingSeconds+2)/60*10)/10,
      canFitEligibleAccounts:eligible*(spacingSeconds+2)<=3600,
      canFitAllAccounts:items.length*(spacingSeconds+2)<=3600,
      checkIntervalMinutes:config.instagramCheckIntervalMinutes,probeLimit:config.instagramProbeLimit},
    maximumSpacingForFullPassSeconds:items.length?Math.floor(3600/items.length):null,
    verdict:fresh===items.length&&items.length>0?'snapshot_fresh':'needs_review',
    capacityNote:'Hourly capacity reserves two seconds per slot for scheduling/response overhead; longer requests, failures and provider cooldowns may still miss deadlines. Backoff accounts remain in the freshness denominator. Discovery may run before next_sync_at to reserve the tail of the queue. Text/media use spare capacity only. A fresh snapshot does not establish sustained hourly freshness.',
    hourly:[...hourly.values()].sort((a,b)=>a.hour.localeCompare(b.hour)),
    items:items.sort((a,b)=>Number(a.fresh)-Number(b.fresh)||(b.ageMinutes??Infinity)-(a.ageMinutes??Infinity)||a.slug.localeCompare(b.slug))};
}

// Database only: reporting does not spend a Graph slot or change its persistent budget.
export async function getInstagramMonitor() {
  const [accounts,runs,budget,jobs]=await Promise.all([
    query<InstagramMonitorAccount>(`SELECT a.slug,s.handle,s.last_success_at,s.last_checked_at,s.next_sync_at,s.instagram_failures,s.last_error
      FROM social_accounts s JOIN artists a ON a.id=s.artist_id WHERE s.platform='instagram' AND s.verified_at IS NOT NULL`),
    query<InstagramMonitorRun>(`SELECT started_at,finished_at,status,metrics FROM sync_runs
      WHERE source_name='INSTAGRAM' AND started_at>=now()-interval '24 hours' ORDER BY started_at`),
    one<InstagramMonitorBudget>('SELECT spacing_seconds,paused_until,usage,usage_checked_at,checks_since_media,content_jobs_since_refresh FROM instagram_sync_budget WHERE id=1'),
    query<InstagramMonitorJob>(`SELECT a.slug,j.needs_text,j.reason,j.requested_at,j.not_before,j.failures,j.last_error
      FROM instagram_media_jobs j JOIN social_accounts s ON s.id=j.account_id JOIN artists a ON a.id=s.artist_id
      WHERE s.platform='instagram' AND s.verified_at IS NOT NULL ORDER BY j.requested_at,a.slug`),
  ]);
  const now=Date.now();
  return {...buildInstagramMonitor(accounts,runs,budget?.spacing_seconds||60,now),budget,queue:buildInstagramQueue(accounts,jobs,runs,budget,now)};
}

export async function writeInstagramReport() {
  if(!config.concertReportDirectory)return;
  const report=await getInstagramMonitor();
  await mkdir(config.concertReportDirectory,{recursive:true});
  const body=JSON.stringify(report,null,2);
  const latest=join(config.concertReportDirectory,'instagram-monitor-latest.json');
  const temporary=latest+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,body);await rename(temporary,latest);
  // Keep the first observation in each UTC hour, including across restarts.
  const archive=join(config.concertReportDirectory,'instagram-monitor-'+report.generatedAt.slice(0,13).replaceAll(':','-')+'.json');
  try{await writeFile(archive,body,{flag:'wx'});}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
}
