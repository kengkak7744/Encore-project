-- Retain complete imported evidence before removing unreferenced non-music
-- performances. Never delete attendance, trip budgets, reviews or admin edits.
CREATE TABLE IF NOT EXISTS concert_scope_archive (
  concert_id uuid PRIMARY KEY,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
LOCK TABLE concerts,concert_sources,attendance,trip_budgets,concert_reviews IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE candidate record;
BEGIN
  FOR candidate IN
    SELECT c.id FROM concerts c WHERE NOT c.manual_override
      AND EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name='ThaiTicketMajor'
        AND s.source_url ~ '^https://([a-z0-9-]+\.)*thaiticketmajor\.com/performance/[^/]+\.html$'
        AND s.raw_data->>'title' ~* '\mfan\s+screening\M|\mscreening\s+(ep\.?|episode)\s*[0-9]+\M|\m(first|final)\s+ep(isode)?\M|^การแสดงโขน')
      AND NOT EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name<>'ThaiTicketMajor')
      AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.concert_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM trip_budgets t WHERE t.concert_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM concert_reviews r WHERE r.concert_id=c.id)
    FOR UPDATE OF c
  LOOP
    INSERT INTO concert_scope_archive(concert_id,reason,snapshot)
    SELECT c.id,'Explicit TTM screening/episode premiere or khon; outside music catalog',jsonb_build_object(
      'concert',to_jsonb(c),
      'sources',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM concert_sources s WHERE s.concert_id=c.id),'[]'::jsonb),
      'performances',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM concert_performances p WHERE p.concert_id=c.id),'[]'::jsonb),
      'artists',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM concert_artists a WHERE a.concert_id=c.id),'[]'::jsonb),
      'knowledge',COALESCE((SELECT jsonb_agg(to_jsonb(k)) FROM knowledge_chunks k WHERE k.source_type='concert' AND k.source_id=c.id),'[]'::jsonb))
    FROM concerts c WHERE c.id=candidate.id ON CONFLICT(concert_id) DO NOTHING;
    DELETE FROM knowledge_chunks WHERE source_type='concert' AND source_id=candidate.id;
    DELETE FROM concerts WHERE id=candidate.id;
  END LOOP;
END $$;
