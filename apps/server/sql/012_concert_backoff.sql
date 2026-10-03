CREATE TABLE IF NOT EXISTS concert_source_backoff (
  source_name text PRIMARY KEY,
  retry_after timestamptz NOT NULL,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
