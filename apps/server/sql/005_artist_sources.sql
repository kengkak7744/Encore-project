CREATE TABLE IF NOT EXISTS artist_sources (
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  label text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, source_url)
);
