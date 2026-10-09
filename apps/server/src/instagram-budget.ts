import { pool, one, query } from './db.js';
import { config } from './config.js';
import { instagramPacing } from './instagram-policy.js';

export type InstagramUsage = { callCount: number | null; totalTime: number | null; cpuTime: number | null; regainMinutes: number | null };
export function instagramUsage(headers: Headers): InstagramUsage | null {
  const values: Record<string, unknown>[] = [];
  for (const name of ['x-app-usage', 'x-business-use-case-usage']) {
    try {
      const raw = headers.get(name);
      if (!raw || raw.length > 32_768) continue;
      const parsed = JSON.parse(raw);
      if (name === 'x-app-usage' && parsed && typeof parsed === 'object') values.push(parsed);
      else if (parsed && typeof parsed === 'object') for (const entries of Object.values(parsed)) {
        if (Array.isArray(entries)) for (const entry of entries) if (entry && typeof entry === 'object') values.push(entry);
      }
    } catch { /* Malformed or missing optional headers must not erase a recorded cooldown. */ }
  }
  const maximum = (key: string) => {
    const valid = values.map(value => value[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    return valid.length ? Math.max(...valid) : null;
  };
  const result = { callCount: maximum('call_count'), totalTime: maximum('total_time'), cpuTime: maximum('total_cputime'), regainMinutes: maximum('estimated_time_to_regain_access') };
  return Object.values(result).every(value => value === null) ? null : result;
}

export function instagramCooldown(headers: Headers, rateLimited: boolean, consecutiveLimits = 0) {
  const usage = instagramUsage(headers);
  const percent = Math.max(usage?.callCount || 0, usage?.totalTime || 0, usage?.cpuTime || 0);
  let minutes = percent >= 90 ? 60 : percent >= config.instagramUsagePausePercent ? 30 : 0;
  if (rateLimited) minutes = Math.max(minutes, config.instagramRateLimitCooldownMinutes * 2 ** Math.min(consecutiveLimits, 3));
  minutes = Math.max(minutes, usage?.regainMinutes || 0);
  const retry = headers.get('retry-after');
  if (retry) {
    const seconds = /^\d+(\.\d+)?$/.test(retry.trim()) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
    if (Number.isFinite(seconds)) minutes = Math.max(minutes, seconds / 60);
  }
  return { usage, minutes: Math.min(10_080, Math.max(0, minutes)), reason: rateLimited ? 'Instagram API rate limit' : 'Instagram usage high (' + percent + '%)' };
}

export type InstagramBudget = {
  beforeRequest(): Promise<void>;
  observe(response: Response, rateLimited: boolean): Promise<void>;
  paused(): Promise<boolean>;
};

// A session lock covers scheduled and manual syncs, including their network calls.
export async function withInstagramBudget<T>(work: (budget: InstagramBudget) => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(6210418) AS locked')).rows[0].locked;
    if (!locked) return null;
    const state = (await client.query(`SELECT (paused_until>now() OR next_request_at>now()) AS waiting FROM instagram_sync_budget WHERE id=1`)).rows[0];
    if (state?.waiting) return null;
    let reserved = false;
    return await work({
      beforeRequest: async () => {
        // Scheduled discovery, text and media each reserve one request slot.
        await query(`UPDATE instagram_sync_budget SET last_request_at=now(),next_request_at=CASE WHEN $2 THEN next_request_at
          ELSE now()+(CASE WHEN NOT $3 THEN $1
            WHEN usage_checked_at>=now()-interval '15 minutes' AND usage_checked_at<=now() THEN GREATEST($4,spacing_seconds)
            ELSE GREATEST($1,spacing_seconds) END)::integer*interval '1 second' END WHERE id=1`,
          [config.instagramRequestSpacingSeconds,reserved,config.instagramAdaptivePacingEnabled,Math.min(config.instagramRequestSpacingSeconds,config.instagramMinSpacingSeconds)]);
        reserved = true;
      },
      observe: async (response, rateLimited) => {
        const state = await one<{ consecutive_limits: number; spacing_seconds: number; healthy_responses: number }>('SELECT consecutive_limits,spacing_seconds,healthy_responses FROM instagram_sync_budget WHERE id=1');
        const cooldown = instagramCooldown(response.headers, rateLimited, state?.consecutive_limits || 0);
        const paced = instagramPacing(cooldown.usage,state?.spacing_seconds || config.instagramRequestSpacingSeconds,state?.healthy_responses || 0);
        const pacing = response.ok && cooldown.minutes===0 ? paced : { seconds: Math.max(config.instagramRequestSpacingSeconds,paced.seconds),healthy: 0 };
        await query(`UPDATE instagram_sync_budget SET usage=CASE WHEN $1::jsonb IS NULL THEN usage ELSE $1::jsonb END,
          usage_checked_at=CASE WHEN $1::jsonb IS NULL THEN usage_checked_at ELSE now() END,
          consecutive_limits=CASE WHEN $2 THEN consecutive_limits+1 WHEN $3=0 THEN 0 ELSE consecutive_limits END,
          paused_until=CASE WHEN $3>0 THEN GREATEST(paused_until,now()+$3::double precision*interval '1 minute') ELSE paused_until END,
          pause_reason=CASE WHEN $3>0 THEN $4 ELSE pause_reason END,
          spacing_seconds=$5,healthy_responses=$6,
          next_request_at=GREATEST(next_request_at,last_request_at+$5::integer*interval '1 second') WHERE id=1`,
          [cooldown.usage ? JSON.stringify(cooldown.usage) : null,rateLimited,cooldown.minutes,cooldown.reason,pacing.seconds,pacing.healthy]);
      },
      paused: async () => !!(await one<{ paused: boolean }>('SELECT paused_until>now() AS paused FROM instagram_sync_budget WHERE id=1'))?.paused,
    });
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(6210418)');
    client.release();
  }
}
