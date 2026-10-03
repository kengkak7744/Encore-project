CREATE TABLE biography_runs (
  id bigserial PRIMARY KEY,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  window_date date NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','published','skipped','insufficient_sources','failed','interrupted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  source_documents jsonb NOT NULL DEFAULT '[]',
  source_errors jsonb NOT NULL DEFAULT '[]',
  draft jsonb,
  error text,
  UNIQUE (artist_id, window_date)
);
CREATE INDEX biography_runs_started_idx ON biography_runs(started_at DESC);

CREATE TABLE biography_worker_state (
  id integer PRIMARY KEY CHECK (id = 1),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL,
  model text NOT NULL,
  window_start text NOT NULL,
  window_end text NOT NULL,
  max_per_night integer NOT NULL,
  last_error text
);

ALTER TABLE artist_biography_sections ADD COLUMN generated_model text;
ALTER TABLE artist_biography_sections ADD COLUMN generation_run_id bigint REFERENCES biography_runs(id) ON DELETE SET NULL;
ALTER TABLE artist_biography_sections ADD COLUMN evidence jsonb;
