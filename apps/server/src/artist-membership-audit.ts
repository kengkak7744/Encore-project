import type { PoolClient } from 'pg';
import { artistMembershipEvidence } from './artist-membership-evidence.js';
import type { ArtistMembershipEvidence } from './artist-membership-evidence.js';
import { artistMembershipEvidenceFinal } from './artist-membership-evidence-final.js';
import { expandedArtistProfiles } from './expanded-artist-profiles.js';
import { artistMembershipAdditions } from './artist-membership-additions.js';
import { artistMembershipFollowup } from './artist-membership-followup.js';
import { artistMembershipOct15, biographySourceAdditionsOct15 } from './artist-evidence-oct15.js';
import { artistMembershipOct18 } from './artist-evidence-oct18.js';

const baselineMembership: ArtistMembershipEvidence[] = [
  ...artistMembershipEvidence,
  ...expandedArtistProfiles.map(profile => ({
    slug: profile.slug, checkedAt: '2026-10-04T07:53:36Z',
    claims: [{ kind: ['lomosonic', 'lykn'].includes(profile.slug) ? 'members' as const : 'career' as const, status: ['lomosonic', 'lykn'].includes(profile.slug) ? 'current' as const : 'historical' as const,
      text: profile.biography![0].body, sourceUrl: profile.biography![0].sourceUrl, sourceLabel: profile.biography![0].sourceLabel, evidenceKind: 'first-party' as const }],
    pending: ['lomosonic', 'lykn'].includes(profile.slug) ? [] : ['ข้อมูลผลงานยืนยันได้ตามแหล่งประวัติ; รายชื่อสมาชิกและสัญญาค่ายปัจจุบันต้องตรวจตามประกาศที่มีวันที่เพิ่มเติม'],
  })),
];
export const reviewedArtistMembership = [...new Map([...baselineMembership, ...artistMembershipEvidenceFinal].map(row => [row.slug, row])).values()];

export function mergeMembershipAdditions(prior: Omit<ArtistMembershipEvidence,'slug'>|null,addition: ArtistMembershipEvidence) {
  if(prior&&Date.parse(prior.checkedAt)>=Date.parse(addition.checkedAt))return null;
  const claims=[...(prior?.claims||[]),...addition.claims];
  const key=(claim: ArtistMembershipEvidence['claims'][number])=>JSON.stringify([claim.kind,claim.status,claim.sourceUrl,claim.text,claim.publishedAt||null]);
  const {slug,...record}=addition;
  return {...prior,...record,claims:[...new Map(claims.map(claim=>[key(claim),claim])).values()],pending:[...new Set([...(prior?.pending||[]),...addition.pending])]};
}

export async function applyMembershipAdditions(client: Pick<PoolClient,'query'>,additions: readonly ArtistMembershipEvidence[] = [...artistMembershipAdditions,...artistMembershipFollowup]) {
  const applied:string[]=[];
  for(const addition of additions) {
    const existing=await client.query<{id:string;membership_evidence:Omit<ArtistMembershipEvidence,'slug'>|null}>('SELECT id,membership_evidence FROM artists WHERE slug=$1 FOR UPDATE',[addition.slug]);
    if(!existing.rows.length)continue;
    const artist=existing.rows[0],merged=mergeMembershipAdditions(artist.membership_evidence,addition);
    if(!merged)continue;
    // Only append observations. Artist text, social accounts, member links and manual flags are untouched.
    const changed=await client.query(`UPDATE artists SET membership_evidence=$2::jsonb WHERE id=$1 AND membership_evidence IS NOT DISTINCT FROM $3::jsonb RETURNING id`,[artist.id,JSON.stringify(merged),artist.membership_evidence===null?null:JSON.stringify(artist.membership_evidence)]);
    if(!changed.rowCount)continue;
    for(const claim of addition.claims)await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at) VALUES($1,$2,$3,$4) ON CONFLICT(artist_id,source_url) DO NOTHING`,[artist.id,claim.sourceUrl,claim.sourceLabel,addition.checkedAt]);
    applied.push(addition.slug);
  }
  return applied;
}

export async function applyMembershipReview(client: Pick<PoolClient, 'query'>) {
  for (const evidence of reviewedArtistMembership) {
    const { slug, ...record } = evidence;
    await client.query(`UPDATE artists SET membership_evidence=$2::jsonb WHERE slug=$1
      AND (membership_evidence IS NULL OR membership_evidence->>'checkedAt' < $3)`, [slug, JSON.stringify(record), evidence.checkedAt]);
    for (const claim of evidence.claims) {
      await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at)
        SELECT id,$2,$3,$4 FROM artists WHERE slug=$1 AND NOT catalog_manual_override ON CONFLICT(artist_id,source_url) DO UPDATE
        SET checked_at=GREATEST(artist_sources.checked_at,EXCLUDED.checked_at)`, [slug, claim.sourceUrl, claim.sourceLabel, evidence.checkedAt]);
    }
  }
  for (const evidence of reviewedArtistMembership) {
    const bio = evidence.corrections?.shortBio;
    if (bio) await client.query('UPDATE artists SET bio=$3,updated_at=now() WHERE slug=$1 AND bio=$2 AND NOT biography_manual_override', [evidence.slug, bio.oldText, bio.newText]);
    for (const correction of evidence.corrections?.sections || []) {
      // A heading alone is insufficient to establish that an editor has not changed it.
      if (!correction.oldBody || !correction.newBody) continue;
      await client.query(`UPDATE artist_biography_sections s SET heading=$4,body=$5,checked_at=$6
        FROM artists a WHERE a.id=s.artist_id AND a.slug=$1 AND NOT a.biography_manual_override AND s.heading=$2 AND s.body=$3 AND s.generated_model IS NULL`,
      [evidence.slug, correction.oldHeading, correction.oldBody, correction.newHeading, correction.newBody, evidence.checkedAt]);
    }
    for (const [index, section] of (evidence.biographyAdditions || []).entries()) {
      await client.query(`INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label,checked_at)
        SELECT id,$2,$3,$4,$5,$6,$7 FROM artists WHERE slug=$1 AND NOT biography_manual_override ON CONFLICT DO NOTHING`,
      [evidence.slug, 1000 + index, section.heading, section.body, section.sourceUrl, section.sourceLabel, evidence.checkedAt]);
    }
  }
  await applyMembershipAdditions(client);
  await applyMembershipAdditions(client,artistMembershipOct15);
  await applyMembershipAdditions(client,artistMembershipOct18);
  for(const source of biographySourceAdditionsOct15)await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at)
    SELECT id,$2,$3,$4 FROM artists WHERE slug=$1 ON CONFLICT(artist_id,source_url) DO UPDATE
    SET checked_at=GREATEST(artist_sources.checked_at,EXCLUDED.checked_at)`,[source.slug,source.sourceUrl,source.label,source.checkedAt]);
}
