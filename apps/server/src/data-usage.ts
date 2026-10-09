import { one, query } from './db.js';
import { config } from './config.js';

export function usagePercent(value: unknown) {
  const used = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  return { used, remaining: used === null ? null : Math.max(0,100-used) };
}

// Read only: opening the dashboard never probes a provider or reserves a sync slot.
export async function getDataUsage(period: '24h' | '7d') {
  const hours = period === '7d' ? 168 : 24;
  const [sources, recent, instagram] = await Promise.all([
    query(`WITH runs AS (
      SELECT *, CASE WHEN jsonb_typeof(metrics->'requests')='number' THEN
        CASE WHEN (metrics->>'requests')::numeric>=0 THEN (metrics->>'requests')::numeric END END AS requests
      FROM sync_runs WHERE started_at>=now()-$1::integer*interval '1 hour'
    ), totals AS (
      SELECT source_name,category,count(*)::int AS runs,
        count(*) FILTER(WHERE status='success')::int AS succeeded,
        count(*) FILTER(WHERE status='partial')::int AS partial,
        count(*) FILTER(WHERE status='failed')::int AS failed,
        count(*) FILTER(WHERE status='skipped')::int AS skipped,
        count(*) FILTER(WHERE status='running')::int AS running,
        sum(requests)::float8 AS requests,
        count(*) FILTER(WHERE requests IS NULL)::int AS unmetered_runs,
        sum(items_seen)::float8 AS items_seen,sum(items_changed)::float8 AS items_changed
      FROM runs GROUP BY source_name,category
    ) SELECT COALESCE(t.source_name,s.source_name) AS source_name,
      COALESCE(t.category,s.category) AS category,s.enabled,s.last_started_at,s.last_success_at,
      COALESCE(t.runs,0) AS runs,COALESCE(t.succeeded,0) AS succeeded,
      COALESCE(t.partial,0) AS partial,COALESCE(t.failed,0) AS failed,
      COALESCE(t.skipped,0) AS skipped,COALESCE(t.running,0) AS running,
      t.requests,COALESCE(t.unmetered_runs,0) AS unmetered_runs,
      COALESCE(t.items_seen,0) AS items_seen,COALESCE(t.items_changed,0) AS items_changed
      FROM totals t FULL JOIN source_state s ON t.source_name=s.source_name AND t.category=s.category
      ORDER BY category,source_name`,[hours]),
    query(`SELECT source_name,category,started_at,finished_at,status,items_seen,items_changed
      FROM sync_runs WHERE started_at>=now()-$1::integer*interval '1 hour'
      ORDER BY started_at DESC,id DESC LIMIT 30`,[hours]),
    one(`SELECT usage,usage_checked_at,last_request_at,next_request_at,spacing_seconds,
      COALESCE(paused_until>now(),false) AS paused,
      (SELECT count(*)::int FROM instagram_media_jobs j JOIN social_accounts s ON s.id=j.account_id WHERE s.verified_at IS NOT NULL AND j.needs_text) AS pending_text_accounts,
      (SELECT count(*)::int FROM instagram_media_jobs j JOIN social_accounts s ON s.id=j.account_id WHERE s.verified_at IS NOT NULL AND NOT j.needs_text) AS pending_media_accounts,
      (SELECT count(*)::int FROM social_accounts WHERE platform='instagram' AND verified_at IS NOT NULL AND instagram_failures>0 AND next_sync_at>now()) AS backoff_accounts,
      CASE WHEN paused_until>now() THEN paused_until END AS paused_until,
      (SELECT count(*)::int FROM social_accounts WHERE platform='instagram' AND verified_at IS NOT NULL) AS accounts,
      (SELECT count(*)::int FROM social_accounts WHERE platform='instagram' AND verified_at IS NOT NULL
        AND (next_sync_at IS NULL OR next_sync_at<=now())) AS pending_accounts,
      (SELECT count(*)::int FROM social_accounts WHERE platform='instagram' AND verified_at IS NOT NULL
        AND last_success_at>=now()-$1::integer*interval '1 minute') AS fresh_accounts
      FROM instagram_sync_budget WHERE id=1`,[config.socialStaleAfterMinutes]),
  ]);
  return {
    period,updatedAt: new Date().toISOString(),sources,recent,
    instagram: instagram ? {
      checkedAt: instagram.usage_checked_at,lastRequestAt: instagram.last_request_at,
      nextRequestAt: instagram.next_request_at,paused: instagram.paused,pausedUntil: instagram.paused_until,
      accounts: instagram.accounts,pendingAccounts: instagram.pending_accounts,freshAccounts: instagram.fresh_accounts,
      spacingSeconds: instagram.spacing_seconds,pendingTextAccounts: instagram.pending_text_accounts,
      pendingMediaAccounts: instagram.pending_media_accounts,backoffAccounts: instagram.backoff_accounts,
      call: usagePercent(instagram.usage?.callCount),time: usagePercent(instagram.usage?.totalTime),
      cpu: usagePercent(instagram.usage?.cpuTime),
    } : null,
  };
}
