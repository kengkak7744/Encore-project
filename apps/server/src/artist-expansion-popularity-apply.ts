import type { PoolClient } from 'pg';
import { artistExpansionPopularityEvidence } from './artist-expansion-popularity.js';

// The caller owns the transaction. Keep editor changes and earlier evidence;
// candidate channel links never qualify as a verified popularity observation.
export async function applyExpansionPopularity(client: Pick<PoolClient, 'query'>) {
  const applied: string[] = [];
  const preserved: string[] = [];
  for (const evidence of artistExpansionPopularityEvidence.rows) {
    if (evidence.status !== 'verified-primary-report' && evidence.status !== 'verified-snapshot') continue;
    const result = await client.query<{ slug: string }>(`UPDATE artists
      SET popularity_evidence=$2::jsonb
      WHERE slug=$1 AND popularity_evidence IS NULL
      RETURNING slug`, [evidence.slug, JSON.stringify(evidence)]);
    if (result.rows.length) applied.push(evidence.slug);
    else preserved.push(evidence.slug);
  }
  return { applied, preserved, pending: artistExpansionPopularityEvidence.counts.pending };
}
