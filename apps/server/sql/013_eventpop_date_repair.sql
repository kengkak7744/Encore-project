-- Preserve source evidence for impossible far-future dates, including imported
-- historical pages whose source metadata incorrectly announces the year 2126.
CREATE TABLE IF NOT EXISTS concert_date_archive (
  concert_id uuid PRIMARY KEY,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO concert_date_archive(concert_id,reason,snapshot)
SELECT c.id,'Eventpop source year >= 2100; requires corrected announcement',jsonb_build_object(
  'concert',to_jsonb(c),
  'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM concert_sources s WHERE s.concert_id=c.id),'[]'::jsonb),
  'performances',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM concert_performances p WHERE p.concert_id=c.id),'[]'::jsonb),
  'artists',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM concert_artists a WHERE a.concert_id=c.id),'[]'::jsonb),
  'knowledge',COALESCE((SELECT jsonb_agg(to_jsonb(k)) FROM knowledge_chunks k WHERE k.source_type='concert' AND k.source_id=c.id),'[]'::jsonb))
FROM concerts c WHERE c.starts_at >= '2100-01-01' AND NOT c.manual_override
  AND EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name='Eventpop')
  AND NOT EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name<>'Eventpop')
  AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.concert_id=c.id)
ON CONFLICT(concert_id) DO NOTHING;
DELETE FROM knowledge_chunks k USING concert_date_archive a WHERE k.source_type='concert' AND k.source_id=a.concert_id
  AND EXISTS(SELECT 1 FROM concerts c WHERE c.id=a.concert_id AND NOT c.manual_override AND c.starts_at >= '2100-01-01')
  AND NOT EXISTS(SELECT 1 FROM attendance t WHERE t.concert_id=a.concert_id);
DELETE FROM concerts c USING concert_date_archive a WHERE c.id=a.concert_id AND NOT c.manual_override AND c.starts_at >= '2100-01-01'
  AND NOT EXISTS(SELECT 1 FROM attendance t WHERE t.concert_id=c.id);
