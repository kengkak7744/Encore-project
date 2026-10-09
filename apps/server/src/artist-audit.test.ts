import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { applyArtistAudit, imageCreditJoin, imageCreditSelect } from './artist-audit.js';
import { artistAuditCorrections } from './artist-audit-corrections.js';
import { reviewedArtistImages, reviewedArtistPopularity } from './artist-review.js';
import { curatedArtistProfiles } from './artist-profiles.js';
import { reviewedArtistMembership } from './artist-membership-audit.js';
import { artistMembershipEvidence } from './artist-membership-evidence.js';

test('Popularity evidence distinguishes historical, measured, pending and group observations', () => {
  assert.deepEqual(reviewedArtistPopularity.map(row => row.slug).sort(), curatedArtistProfiles.map(profile => profile.slug).sort());
  assert.deepEqual(reviewedArtistMembership.map(row => row.slug).sort(), curatedArtistProfiles.map(profile => profile.slug).sort());
  const curatedSlugs=new Set(curatedArtistProfiles.map(profile=>profile.slug));
  assert.deepEqual(reviewedArtistImages.filter(row=>curatedSlugs.has(row.slug)).map(row => row.slug).sort(), [...curatedSlugs].sort());
  assert.equal(new Set(reviewedArtistImages.map(row=>row.slug)).size,reviewedArtistImages.length,'Image reviews must retain one identity per profile after expansion');
  for (const evidence of reviewedArtistPopularity) {
    assert.equal(new URL(evidence.sourceUrl).protocol, 'https:');
    if (evidence.status === 'verified-snapshot') assert.ok('measuredAt' in evidence && evidence.measuredAt && Number.isSafeInteger(evidence.value));
    if (evidence.status === 'collective-only-individual-pending') assert.equal(evidence.value, null, evidence.slug);
    if (evidence.status === 'indexed-primary-live-check-pending') assert.equal('measuredAt' in evidence && evidence.measuredAt, null, evidence.slug);
  }
  for (const profile of curatedArtistProfiles) {
    const platforms = (profile.accounts || []).map(account => account.platform);
    assert.equal(new Set(platforms).size, platforms.length, profile.slug);
  }
});

test('Audit repairs are repeatable, preserve editor changes and pair image licenses with their exact URL', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async () => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA artist_audit_fixture');
    await client.query('SET LOCAL search_path TO artist_audit_fixture, public');
    const dir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file, dir), 'utf8'));
    for (const profile of curatedArtistProfiles) {
      const correction = artistAuditCorrections.find(item => item.slug === profile.slug);
      await client.query('INSERT INTO artists(slug,name,kind,bio) VALUES($1,$1,\'solo\',$2)', [profile.slug, correction?.oldBio || profile.bio]);
      if (correction?.oldSection) {
        const old = correction.oldSection;
        await client.query(`INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label)
          SELECT id,1,$2,$3,$4,$5 FROM artists WHERE slug=$1`, [profile.slug, old.heading, profile.slug === 'musketeers' ? 'Editor biography' : old.body, old.sourceUrl, old.sourceLabel]);
      }
    }
    const onlyMondayCorrection = artistMembershipEvidence.find(row => row.slug === 'only-monday')!.corrections!.sections![0];
    await client.query(`INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label)
      SELECT id,1,$1,$2,'https://www.gmmgrammy.com/newsroom/news-single.php?id=9990','GMM Music' FROM artists WHERE slug='only-monday'`,
    [onlyMondayCorrection.oldHeading, onlyMondayCorrection.oldBody]);
    await client.query("UPDATE artists SET bio='Editor short bio' WHERE slug='palmy'");
    await client.query("UPDATE artists SET image_url='https://example.com/editor.jpg' WHERE slug='pp-krit'");
    await client.query(`UPDATE artists SET popularity_evidence='{"checkedAt":"2027-01-01T00:00:00Z","note":"Later review"}'::jsonb WHERE slug='stamp-apiwat'`);
    await client.query(`UPDATE artists SET membership_evidence='{"checkedAt":"2027-01-01T00:00:00Z","pending":["Later roster review"]}'::jsonb WHERE slug='stamp-apiwat'`);
    await applyArtistAudit(client);
    await applyArtistAudit(client);
    const artist = async (slug: string) => (await client.query('SELECT a.*, ' + imageCreditSelect + ' FROM artists a ' + imageCreditJoin + ' WHERE slug=$1', [slug])).rows[0];
    assert.equal((await artist('cocktail')).bio, artistAuditCorrections[0].newBio);
    assert.equal((await artist('palmy')).bio, 'Editor short bio');
    assert.equal(Number((await client.query("SELECT count(*) AS total FROM artist_sources s JOIN artists a ON a.id=s.artist_id WHERE a.slug='palmy' AND s.source_url='https://www.gmmgrammy.com/newsroom/news-single.php?id=10418'")).rows[0].total), 1);
    assert.equal((await artist('pp-krit')).image_url, 'https://example.com/editor.jpg');
    assert.equal((await artist('pp-krit')).image_credit, null);
    assert.equal((await artist('stamp-apiwat')).popularity_evidence.note, 'Later review');
    assert.deepEqual((await artist('stamp-apiwat')).membership_evidence.pending, ['Later roster review']);
    assert.ok((await artist('atlas')).membership_evidence.claims.some((claim: { text: string }) => claim.text.includes('6') || claim.text.includes('หก')));
    assert.ok((await artist('only-monday')).membership_evidence.claims.some((claim: { text: string }) => claim.text.includes('21 กุมภาพันธ์')));
    const sections = (await client.query('SELECT a.slug,s.* FROM artist_biography_sections s JOIN artists a ON a.id=s.artist_id')).rows;
    assert.equal(sections.find(row => row.slug === 'musketeers').body, 'Editor biography');
    assert.equal(sections.find(row => row.slug === 'violette-wautier').body, artistAuditCorrections.find(item => item.slug === 'violette-wautier')!.newSection!.body);
    assert.equal(sections.find(row => row.slug === 'only-monday' && row.position === 1).body, onlyMondayCorrection.newBody);
    assert.equal(sections.filter(row => row.slug === 'only-monday' && row.position >= 1000).length, 1);
    assert.equal(sections.filter(row => row.slug === 'phum-viphurit' && row.position >= 1000).length, 1, 'Final review adds the independent-work biography once');
    assert.deepEqual((await artist('phum-viphurit')).membership_evidence.pending, []);
    assert.ok((await artist('phum-viphurit')).membership_evidence.claims.some((claim: { text: string }) => claim.text.includes('ศิลปินอิสระ')));
    assert.equal((await artist('atlas')).image_url, '/artist-images/atlas-interview-2022.png');
    assert.match((await artist('atlas')).image_review.caption, /ไม่ใช่หลักฐานรายชื่อสมาชิกปัจจุบัน/);
    const seededSlugs=new Set((await client.query('SELECT slug FROM artists')).rows.map(row=>row.slug));
    assert.equal(Number((await client.query('SELECT count(*) AS total FROM artist_image_credits')).rows[0].total), reviewedArtistImages.filter(row => row.status === 'verified-license' && row.slug !== 'pp-krit' && seededSlugs.has(row.slug)).length);
    assert.equal(Number((await client.query('SELECT count(*) AS total FROM artists WHERE popularity_rank IS NOT NULL')).rows[0].total), 0);
    assert.ok((await artist('mind-4eve')).popularity_evidence.value > 0);
    assert.match((await artist('mind-4eve')).popularity_evidence.work, /ของสำคัญ/);
    assert.ok((await artist('ink-waruntorn')).image_credit?.license);
    const originalImage = (await artist('tilly-birds')).image_url;
    await client.query("UPDATE artists SET image_url='https://example.com/replacement.jpg' WHERE slug='tilly-birds'");
    assert.equal((await artist('tilly-birds')).image_credit, null, 'Old license must not be attributed to a replacement image');
    await client.query('UPDATE artists SET image_url=$1 WHERE slug=\'tilly-birds\'', [originalImage]);
    assert.equal((await artist('tilly-birds')).image_credit.license, 'CC BY-SA 4.0');
    await client.query(`UPDATE artists SET image_url=NULL,image_review='{"checkedAt":"2027-01-01T00:00:00Z","status":"unverified","reason":"Newer editor rights review"}'::jsonb WHERE slug='tilly-birds'`);
    await applyArtistAudit(client);
    assert.equal((await artist('tilly-birds')).image_url,null,'An older license review must not override a newer decision to withhold the image');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
