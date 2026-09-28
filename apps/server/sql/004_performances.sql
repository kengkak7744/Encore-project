CREATE TABLE IF NOT EXISTS concert_performances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  time_tba boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','postponed','cancelled','completed','unknown')),
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concert_id, starts_at)
);
CREATE INDEX IF NOT EXISTS concert_performances_starts_idx ON concert_performances(starts_at);
INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url)
SELECT c.id,c.starts_at,c.ends_at,c.time_tba,c.status,cs.source_url
FROM concerts c LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id ORDER BY fetched_at DESC LIMIT 1) cs ON true
WHERE c.starts_at IS NOT NULL
ON CONFLICT(concert_id,starts_at) DO NOTHING;
