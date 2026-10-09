ALTER TABLE social_accounts ADD COLUMN instagram_failures integer NOT NULL DEFAULT 0 CHECK(instagram_failures>=0);
ALTER TABLE news_items ADD COLUMN instagram_details_checked_at timestamptz;
UPDATE news_items SET instagram_details_checked_at=last_verified_at
WHERE platform='instagram' AND jsonb_array_length(media_items)>0;
ALTER TABLE instagram_sync_budget ADD COLUMN spacing_seconds integer NOT NULL DEFAULT 60 CHECK(spacing_seconds BETWEEN 30 AND 600);
ALTER TABLE instagram_sync_budget ADD COLUMN healthy_responses integer NOT NULL DEFAULT 0 CHECK(healthy_responses>=0);
ALTER TABLE instagram_sync_budget ADD COLUMN checks_since_media integer NOT NULL DEFAULT 0 CHECK(checks_since_media>=0);

CREATE TABLE instagram_media_jobs (
  account_id uuid PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(reason IN ('new-post','missing-detail','refresh')),
  needs_text boolean NOT NULL DEFAULT true,
  requested_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now(),
  failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
  last_error text
);
CREATE INDEX instagram_media_jobs_due_idx ON instagram_media_jobs(not_before,requested_at);
CREATE INDEX instagram_accounts_due_idx ON social_accounts(next_sync_at,last_checked_at) WHERE platform='instagram' AND verified_at IS NOT NULL;

-- Carry known unavailable accounts into the longer retry policy; preserve all history.
UPDATE social_accounts SET instagram_failures=1,
  next_sync_at=GREATEST(next_sync_at,last_checked_at+interval '6 hours')
WHERE platform='instagram' AND last_success_at IS NULL AND last_checked_at IS NOT NULL
  AND last_error LIKE 'Instagram Graph HTTP 400 (codes %'
  AND last_error ~ 'codes (100|110|190)(/|[)])';
