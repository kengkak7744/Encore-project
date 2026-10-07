ALTER TABLE concerts ADD COLUMN image_source_url text;
ALTER TABLE concerts ADD COLUMN image_checked_at timestamptz;

-- Attribute only images that match saved source evidence; do not guess ownership.
UPDATE concerts c SET image_source_url=e.source_url,image_checked_at=e.fetched_at
FROM (
  SELECT DISTINCT ON (s.concert_id) s.concert_id,s.source_url,s.fetched_at
  FROM concert_sources s JOIN concerts existing ON existing.id=s.concert_id
  WHERE existing.image_url IS NOT NULL AND s.raw_data->>'image'=existing.image_url
  ORDER BY s.concert_id,s.fetched_at DESC
) e WHERE e.concert_id=c.id;
