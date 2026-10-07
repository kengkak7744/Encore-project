ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS next_sync_at timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS last_media_refresh_at timestamptz;
UPDATE social_accounts SET next_sync_at=last_checked_at+interval '1 hour',last_media_refresh_at=last_success_at
  WHERE platform='instagram';

CREATE TABLE instagram_sync_budget (
  id integer PRIMARY KEY CHECK(id=1),
  last_request_at timestamptz,
  next_request_at timestamptz,
  paused_until timestamptz,
  pause_reason text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage_checked_at timestamptz,
  consecutive_limits integer NOT NULL DEFAULT 0
);
-- Carry recent activity across the first deployment too; never start with a clean quota.
INSERT INTO instagram_sync_budget(id,last_request_at,next_request_at,paused_until,pause_reason)
SELECT 1,max(started_at),max(started_at)+interval '1 minute',
  max(COALESCE(finished_at,started_at)) FILTER(WHERE error LIKE '%(codes 4)%')+interval '1 hour',
  CASE WHEN bool_or(error LIKE '%(codes 4)%') THEN 'Recent Instagram rate limit; initial cooldown' END
FROM sync_runs WHERE source_name='INSTAGRAM';

CREATE TABLE social_scheduler_state (
  platform text PRIMARY KEY CHECK(platform IN ('x','facebook')),
  last_started_at timestamptz
);
INSERT INTO social_scheduler_state(platform,last_started_at)
SELECT p,max(r.started_at) FROM unnest(ARRAY['x','facebook']) p
LEFT JOIN sync_runs r ON r.source_name=upper(p) GROUP BY p;
