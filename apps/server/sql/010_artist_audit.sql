ALTER TABLE artists ADD COLUMN IF NOT EXISTS popularity_evidence jsonb;

CREATE TABLE IF NOT EXISTS artist_image_credits (
  artist_id uuid PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  source_url text NOT NULL,
  creator text NOT NULL,
  title text NOT NULL,
  license text NOT NULL,
  license_url text NOT NULL,
  photo_date text NOT NULL,
  changes text NOT NULL,
  verified_at timestamptz NOT NULL
);
