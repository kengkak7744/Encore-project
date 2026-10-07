import type { PoolClient } from 'pg';
import { artistAuditCorrections } from './artist-audit-corrections.js';
import { artistPopularityEvidence } from './artist-popularity-evidence.js';
import { reviewedArtistImages, reviewedArtistPopularity } from './artist-review.js';
import { applyMembershipReview } from './artist-membership-audit.js';

// Use the same projection everywhere artists with photos are returned. An admin
// replacement image must never inherit the license belonging to a different URL.
export const imageCreditSelect = "(to_jsonb(ic) - 'artist_id' - 'image_url') AS image_credit";
export const imageCreditJoin = 'LEFT JOIN artist_image_credits ic ON ic.artist_id = a.id AND ic.image_url = a.image_url';

// Caller owns the transaction; updates and image credits are committed together.
export async function applyArtistAudit(client: Pick<PoolClient, 'query'>) {
  await applyMembershipReview(client);
  for (const correction of artistAuditCorrections) {
    if (correction.oldBio) {
      await client.query('UPDATE artists SET bio=$3,verified_at=$4,updated_at=now() WHERE slug=$1 AND bio=$2 AND NOT biography_manual_override', [correction.slug, correction.oldBio, correction.newBio, artistPopularityEvidence.checkedAt]);
    }
    if (correction.oldSection && correction.newSection) {
      const old = correction.oldSection;
      const section = correction.newSection;
      await client.query(`UPDATE artist_biography_sections s SET heading=$5,body=$6,source_url=$7,source_label=$8,checked_at=$9
        FROM artists a WHERE a.id=s.artist_id AND a.slug=$1 AND NOT a.biography_manual_override AND s.heading=$2 AND s.body=$3 AND s.source_url=$4 AND s.generated_model IS NULL`,
      [correction.slug, old.heading, old.body, old.sourceUrl, section.heading, section.body, section.sourceUrl, section.sourceLabel, artistPopularityEvidence.checkedAt]);
    }
  }
  // Additional primary evidence for the dated label claim; the 2021 genie news
  // remains attached to Palmy's historical biography.
  await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at)
    SELECT id,'https://www.gmmgrammy.com/newsroom/news-single.php?id=10418','GMM Music — รายชื่อศิลปินปี 2569',$1
    FROM artists WHERE slug='palmy' AND NOT catalog_manual_override ON CONFLICT(artist_id,source_url) DO UPDATE
    SET checked_at=GREATEST(artist_sources.checked_at,EXCLUDED.checked_at)`, [artistPopularityEvidence.checkedAt]);
  for (const correction of artistAuditCorrections.filter(item => item.newSection)) {
    const section = correction.newSection!;
    await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at)
      SELECT id,$2,$3,$4 FROM artists WHERE slug=$1 AND NOT catalog_manual_override ON CONFLICT(artist_id,source_url) DO UPDATE
      SET checked_at=GREATEST(artist_sources.checked_at,EXCLUDED.checked_at)`, [correction.slug, section.sourceUrl, section.sourceLabel, artistPopularityEvidence.checkedAt]);
  }
  for (const evidence of reviewedArtistPopularity) {
    await client.query(`UPDATE artists SET popularity_evidence=$2::jsonb WHERE slug=$1
      AND (popularity_evidence IS NULL OR popularity_evidence->>'checkedAt' < $3)`, [evidence.slug, JSON.stringify(evidence), evidence.checkedAt]);
    if (evidence.status.startsWith('verified-')) {
      await client.query(`INSERT INTO artist_sources(artist_id,source_url,label,checked_at)
        SELECT id,$2,'หลักฐานความนิยม — ข้อมูลตามวันที่ตรวจ',$3 FROM artists WHERE slug=$1 AND NOT catalog_manual_override ON CONFLICT(artist_id,source_url) DO UPDATE
        SET checked_at=GREATEST(artist_sources.checked_at,EXCLUDED.checked_at)`, [evidence.slug, evidence.sourceUrl, evidence.checkedAt]);
    }
  }
  for (const review of reviewedArtistImages) {
    const checkedAt = ('verifiedAt' in review && review.verifiedAt) || artistPopularityEvidence.checkedAt;
    await client.query(`UPDATE artists SET image_review=$2::jsonb WHERE slug=$1
      AND NOT image_manual_override AND (image_review IS NULL OR image_review->>'checkedAt' < $3)`, [review.slug, JSON.stringify({ ...review, checkedAt }), checkedAt]);
  }
  for (const image of reviewedArtistImages) {
    if (image.status !== 'verified-license' || !('imageUrl' in image)) continue;
    const updated = await client.query<{ id: string }>(`UPDATE artists SET image_url=$2,updated_at=now() WHERE slug=$1
      AND NOT image_manual_override
      AND (image_url IS NULL OR btrim(image_url)='' OR image_url=$2)
      AND (image_review IS NULL OR image_review->>'checkedAt' <= $3) RETURNING id`, [image.slug, image.imageUrl, image.verifiedAt]);
    if (!updated.rows.length) continue;
    await client.query(`INSERT INTO artist_image_credits(artist_id,image_url,source_url,creator,title,license,license_url,photo_date,changes,verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(artist_id) DO UPDATE SET
      image_url=EXCLUDED.image_url,source_url=EXCLUDED.source_url,creator=EXCLUDED.creator,title=EXCLUDED.title,
      license=EXCLUDED.license,license_url=EXCLUDED.license_url,photo_date=EXCLUDED.photo_date,changes=EXCLUDED.changes,verified_at=EXCLUDED.verified_at`,
    [updated.rows[0].id, image.imageUrl, image.sourceUrl, image.creator, image.fileTitle, image.license, image.licenseUrl, image.photoDate, image.changes, image.verifiedAt]);
  }
}
