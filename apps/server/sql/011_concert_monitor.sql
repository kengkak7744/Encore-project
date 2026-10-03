ALTER TABLE concerts ADD COLUMN IF NOT EXISTS price_note text;
ALTER TABLE concert_performances ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS cycle_id bigint;
ALTER TABLE sync_runs DROP CONSTRAINT IF EXISTS sync_runs_status_check;
ALTER TABLE sync_runs ADD CONSTRAINT sync_runs_status_check CHECK(status IN ('running','success','partial','failed','skipped'));

CREATE TABLE IF NOT EXISTS concert_discovery_cursors (
  source_name text PRIMARY KEY,
  cursor_offset integer NOT NULL DEFAULT 0,
  catalog_size integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz
);
CREATE TABLE IF NOT EXISTS concert_sync_cycles (
  id bigserial PRIMARY KEY,
  scheduled_at timestamptz UNIQUE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','failed')),
  error text
);
ALTER TABLE sync_runs ADD CONSTRAINT sync_runs_cycle_fk FOREIGN KEY(cycle_id) REFERENCES concert_sync_cycles(id);
CREATE INDEX IF NOT EXISTS sync_runs_cycle_idx ON sync_runs(cycle_id,source_name);

CREATE TABLE IF NOT EXISTS concert_monitor_windows (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK(ends_at > started_at),
  created_at timestamptz NOT NULL DEFAULT now()
);
