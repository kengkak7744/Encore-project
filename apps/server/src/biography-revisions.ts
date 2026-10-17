import type pg from 'pg';

// Explicit maintenance requests only. Normal biography scheduling still skips
// profiles that have text. Keep the exact old sections as the revision archive.
export async function requestBiographyRevision(client: pg.PoolClient, artistId: string, reason: string): Promise<string> {
  if (!reason.trim() || reason.length>1000) throw new Error('Revision requires a concise reason');
  await client.query('BEGIN');
  try {
    const artist = await client.query('SELECT updated_at FROM artists WHERE id=$1 AND NOT biography_manual_override FOR UPDATE',[artistId]);
    const sections = await client.query('SELECT * FROM artist_biography_sections WHERE artist_id=$1 ORDER BY position',[artistId]);
    if (!artist.rowCount || !sections.rowCount || sections.rows.some(section=>!section.generated_model || !section.generation_run_id)) throw new Error('Only existing automatically generated biographies can be queued for revision');
    const result = await client.query<{id:string}>(`INSERT INTO biography_revision_requests(artist_id,reason,expected_updated_at,previous_sections)
      SELECT $1,$2,updated_at,(SELECT jsonb_agg(to_jsonb(b) ORDER BY position) FROM artist_biography_sections b WHERE artist_id=$1) FROM artists WHERE id=$1
      ON CONFLICT(artist_id) WHERE status='pending' DO UPDATE SET reason=EXCLUDED.reason RETURNING id::text`,[artistId,reason.trim()]);
    await client.query('COMMIT'); return result.rows[0].id;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
