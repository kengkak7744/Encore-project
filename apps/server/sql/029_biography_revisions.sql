CREATE TABLE biography_revision_requests (
  id bigserial PRIMARY KEY,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  expected_updated_at timestamptz NOT NULL,
  previous_sections jsonb NOT NULL CHECK(jsonb_typeof(previous_sections)='array'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
  completed_run_id bigint REFERENCES biography_runs(id) ON DELETE SET NULL,
  finished_at timestamptz
);
CREATE UNIQUE INDEX biography_revision_pending_artist ON biography_revision_requests(artist_id) WHERE status='pending';
