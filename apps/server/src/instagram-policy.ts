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
  if (percent>=config.instagramUsagePausePercent-10) return { seconds: clamp(base*2),healthy: 0 };
  if (percent>=50) return { seconds: clamp(Math.ceil(base*1.5)),healthy: 0 };
  if (percent>=40) return { seconds: clamp(base),healthy: 0 };
  // Recover from a slowdown without accumulating ever-longer intervals on each response.
  const faster = previous>base ? Math.max(base,previous-15) : previous-5;
  return healthy+1>=3 ? { seconds: clamp(faster),healthy: 0 } : { seconds: clamp(previous),healthy: healthy+1 };
}

export function instagramMediaAllowed(usage: InstagramUsage | null, checkedAt: Date | string | null, now = Date.now(), ceiling = config.instagramMediaMaxUsagePercent) {
  const percent = completeUsage(usage);
  const age = checkedAt ? now-new Date(checkedAt).getTime() : Infinity;
  return percent!==null && age>=0 && age<=15*60_000 && percent<ceiling;
}

export function instagramRetryMinutes(error: unknown, failures: number) {
  const message = error instanceof Error ? error.message : '';
  const unavailable = /Graph HTTP (?:400|401|403)|account unavailable|username is invalid|token expired|token\/account ID missing|username required/.test(message)
    && !/\(codes (?:4|17|32|613|80004)(?:\/|\))/.test(message);
  const multiplier = 2**Math.min(4,Math.max(0,failures-1));
  return Math.min(unavailable ? 48*60 : 4*60,(unavailable ? 6*60 : 30)*multiplier);
}
