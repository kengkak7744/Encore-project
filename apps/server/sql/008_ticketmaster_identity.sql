CREATE TABLE ticketmaster_artist_identities (
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  attraction_id text NOT NULL UNIQUE,
  evidence_url text NOT NULL CHECK (evidence_url LIKE 'https://%'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, attraction_id)
);

-- Discovery attraction K8vZ9172buf links to bodyslamband accounts.
-- The venue explicitly identifies the performer as the Thai band (checked 2026-10-03).
INSERT INTO ticketmaster_artist_identities(artist_id,attraction_id,evidence_url)
SELECT id,'K8vZ9172buf','https://www.electricbrixton.uk.com/events/bodyslam-world-tour-2026/'
FROM artists WHERE slug='bodyslam';

-- Retain complete snapshots before withdrawing unverified legacy keyword imports.
-- User attendance, manual corrections, and concerts with another source are protected.
CREATE TABLE ticketmaster_import_archive (
  concert_id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ticketmaster_import_archive(concert_id,snapshot,reason)
SELECT c.id,jsonb_build_object(
  'concert',to_jsonb(c),
  'sources',(SELECT jsonb_agg(to_jsonb(s)) FROM concert_sources s WHERE s.concert_id=c.id),
  'artists',(SELECT jsonb_agg(to_jsonb(a)) FROM concert_artists a WHERE a.concert_id=c.id),
  'performances',(SELECT jsonb_agg(to_jsonb(p)) FROM concert_performances p WHERE p.concert_id=c.id),
  'knowledge',(SELECT jsonb_agg(to_jsonb(k)) FROM knowledge_chunks k WHERE k.source_type='concert' AND k.source_id=c.id)
),'Legacy foreign keyword import lacks verified performer identity; may be reimported with evidence'
FROM concerts c
WHERE c.country_code<>'TH' AND c.manual_override=false
  AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.concert_id=c.id)
  AND EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name='Ticketmaster')
  AND NOT EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND s.source_name<>'Ticketmaster')
  AND NOT EXISTS(SELECT 1 FROM concert_sources s WHERE s.concert_id=c.id AND (
    s.raw_data->>'ticketmasterAttractionId' IS NOT NULL OR
    s.source_url='https://www.universe.com/events/bodyslam-tickets-NVRWTD?ref=ticketmaster'));

DELETE FROM knowledge_chunks k USING ticketmaster_import_archive a
WHERE k.source_type='concert' AND k.source_id=a.concert_id;
DELETE FROM concerts c USING ticketmaster_import_archive a WHERE c.id=a.concert_id;
