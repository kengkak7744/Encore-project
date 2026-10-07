ALTER TABLE artists ADD COLUMN biography_manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE artists ADD COLUMN image_manual_override boolean NOT NULL DEFAULT false;

CREATE TABLE artist_image_uploads (
  id uuid PRIMARY KEY,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 12 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artist_image_uploads_artist_idx ON artist_image_uploads(artist_id);
