import { config } from './config.js';
import type { InstagramUsage } from './instagram-budget.js';

export function completeUsage(usage: InstagramUsage | null | undefined) {
  const fields = [usage?.callCount,usage?.totalTime,usage?.cpuTime];
  return fields.every(value => typeof value==='number' && Number.isFinite(value) && value>=0)
    ? Math.max(...fields as number[]) : null;
}

export function instagramPacing(usage: InstagramUsage | null, previous: number, healthy: number) {
  const base = config.instagramRequestSpacingSeconds;
  const minimum = Math.min(base,config.instagramMinSpacingSeconds);
  const clamp = (value: number) => Math.min(600,Math.max(minimum,value));
  if (!config.instagramAdaptivePacingEnabled) return { seconds: base,healthy: 0 };
  const percent = completeUsage(usage);
  if (percent===null) return { seconds: clamp(Math.max(base,previous)),healthy: 0 };
  // Leave 15 percentage points below the pause guard for steady discovery.
  // Moderate time usage must not force a 100-account pass beyond an hour.
  if (percent>=config.instagramUsagePausePercent-5) return { seconds: clamp(Math.max(base,minimum*2)),healthy: 0 };
  if (percent>=config.instagramUsagePausePercent-10) return { seconds: clamp(Math.max(base,minimum*1.5)),healthy: 0 };
  if (percent>=config.instagramUsagePausePercent-15) return { seconds: clamp(Math.max(minimum+5,previous)),healthy: 0 };
  // Recover from a slowdown without accumulating ever-longer intervals on each response.
  const faster = previous>base ? Math.max(base,previous-15) : previous-5;
  return healthy+1>=3 ? { seconds: clamp(faster),healthy: 0 } : { seconds: clamp(previous),healthy: healthy+1 };
}

export function instagramDiscoveryHeadroom(
  lastSuccesses: (Date|string|null)[],spacingSeconds: number,now=Date.now(),
) {
  // Plan every eligible account, including those not yet due. Considering just
  // the oldest account lets optional work push the tail of a large queue late.
  const deadlines=lastSuccesses.map(value=>value===null ? now : new Date(value).getTime()+60*60_000).sort((a,b)=>a-b);
  const slotSeconds=Math.max(30,spacingSeconds)+2; // worker tick and query/response margin
  const slackSeconds=deadlines.length ? Math.min(...deadlines.map((deadline,index)=>(deadline-now)/1000-(index+1)*slotSeconds)) : Infinity;
  return { slotSeconds,slackSeconds,allowEnrichment:slackSeconds>=slotSeconds+15 };
}

export function instagramSchedulingSpacing(stored: number | null | undefined,checkedAt: Date | string | null | undefined,now=Date.now()) {
  const age=checkedAt ? now-new Date(checkedAt).getTime() : Infinity;
  return config.instagramAdaptivePacingEnabled && age>=0 && age<=15*60_000
    ? stored || config.instagramRequestSpacingSeconds
    : Math.max(stored || 0,config.instagramRequestSpacingSeconds);
}

export function instagramMediaAllowed(usage: InstagramUsage | null, checkedAt: Date | string | null, now = Date.now(), ceiling = config.instagramMediaMaxUsagePercent, callCeiling = ceiling) {
  const percent = completeUsage(usage);
  const age = checkedAt ? now-new Date(checkedAt).getTime() : Infinity;
  return percent!==null && age>=0 && age<=15*60_000 && usage!.callCount!<callCeiling && Math.max(usage!.totalTime!,usage!.cpuTime!)<ceiling;
}

export function instagramRetryMinutes(error: unknown, failures: number) {
  const message = error instanceof Error ? error.message : '';
  const unavailable = /Graph HTTP (?:400|401|403)|account unavailable|username is invalid|token expired|token\/account ID missing|username required/.test(message)
    && !/\(codes (?:4|17|32|613|80004)(?:\/|\))/.test(message);
  const multiplier = 2**Math.min(4,Math.max(0,failures-1));
  return Math.min(unavailable ? 48*60 : 4*60,(unavailable ? 6*60 : 30)*multiplier);
}
