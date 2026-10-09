-- Keep the latest version if an earlier collector left duplicate documents.
DELETE FROM knowledge_chunks k USING (
  SELECT id,row_number() OVER(PARTITION BY source_type,source_id ORDER BY updated_at DESC,id DESC) AS position
  FROM knowledge_chunks
) duplicates WHERE k.id=duplicates.id AND duplicates.position>1;
CREATE UNIQUE INDEX knowledge_source_identity ON knowledge_chunks(source_type,source_id);
