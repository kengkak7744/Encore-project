import { one, query } from './db.js';
import { config } from './config.js';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

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
      fresh:age!==null&&time(account.last_success_at)<=now&&age<=60,
      backoff:account.instagram_failures>0&&time(account.next_sync_at)>now,
      successfulDiscoveryChecks24h:checked.length,
      maximumRecordedGapMinutes:gaps.length?Math.round(Math.max(...gaps)*10)/10:null};
  });
  const fresh=items.filter(account=>account.fresh).length;
  const checkedLastHour=runs.filter(run=>run.metrics.mode==='discovery'&&run.status==='success'&&run.finished_at&&time(run.started_at)>=now-3_600_000&&time(run.started_at)<=now);
  return {generatedAt:new Date(now).toISOString(),targetMinutes:60,accounts:items.length,freshAccounts:fresh,
    neverSucceeded:items.filter(account=>account.last_success_at===null).length,
    backoffAccounts:items.filter(account=>account.backoff).length,
    observedUniqueAccountsLastHour:new Set(checkedLastHour.map(run=>run.metrics.artistSlug).filter(Boolean)).size,
    spacingSeconds,minimumFullPassMinutes:Math.round(items.length*spacingSeconds/60*10)/10,
    maximumSpacingForFullPassSeconds:items.length?Math.floor(3600/items.length):null,
    verdict:fresh===items.length&&items.length>0?'snapshot_fresh':'needs_review',
    capacityNote:'The spacing calculation excludes latency, failures, cooldowns and text/media work. A fresh snapshot does not establish sustained hourly freshness.',
    hourly:[...hourly.values()].sort((a,b)=>a.hour.localeCompare(b.hour)),
    items:items.sort((a,b)=>Number(a.fresh)-Number(b.fresh)||(b.ageMinutes??Infinity)-(a.ageMinutes??Infinity)||a.slug.localeCompare(b.slug))};
}

// Database only: reporting does not spend a Graph slot or change its persistent budget.
export async function getInstagramMonitor() {
  const [accounts,runs,budget]=await Promise.all([
    query<InstagramMonitorAccount>(`SELECT a.slug,s.handle,s.last_success_at,s.last_checked_at,s.next_sync_at,s.instagram_failures,s.last_error
      FROM social_accounts s JOIN artists a ON a.id=s.artist_id WHERE s.platform='instagram' AND s.verified_at IS NOT NULL`),
    query<InstagramMonitorRun>(`SELECT started_at,finished_at,status,metrics FROM sync_runs
      WHERE source_name='INSTAGRAM' AND started_at>=now()-interval '24 hours' ORDER BY started_at`),
    one<{spacing_seconds:number;paused_until:Date|null;usage:unknown;usage_checked_at:Date|null}>('SELECT spacing_seconds,paused_until,usage,usage_checked_at FROM instagram_sync_budget WHERE id=1'),
  ]);
  return {...buildInstagramMonitor(accounts,runs,budget?.spacing_seconds||60),budget};
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
