CREATE TABLE IF NOT EXISTS artist_biography_sections (
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  heading text NOT NULL,
  body text NOT NULL,
  source_url text NOT NULL,
  source_label text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, position)
);
