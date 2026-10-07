import type { PoolClient } from 'pg';
import { biographyFor, type CuratedArtistProfile } from './artist-profiles.js';

export async function seedArtistAccounts(client: Pick<PoolClient,'query'>, profile: CuratedArtistProfile) {
  const artist = (await client.query('SELECT id,catalog_manual_override FROM artists WHERE slug=$1 FOR UPDATE',[profile.slug])).rows[0];
  if (!artist || artist.catalog_manual_override) return;
  for (const account of profile.accounts || []) {
    const handle = account.platform==='website' ? null : new URL(account.url).pathname.split('/').filter(Boolean)[0] || null;
    await client.query('INSERT INTO social_accounts(artist_id,platform,handle,url,verified_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING',[artist.id,account.platform,handle,account.url]);
    if (account.evidenceUrl!==profile.sourceUrl) await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[artist.id,account.evidenceUrl,'หลักฐานช่องทางทางการ']);
  }
}

// Caller owns the transaction. Share the artist row lock with the editor and
// biography publisher so a seed cannot resurrect a just-deleted section.
export async function seedArtistBiography(client: Pick<PoolClient,'query'>, profile: CuratedArtistProfile) {
  const artist = (await client.query<{ id: string; bio: string | null; biography_manual_override: boolean; catalog_manual_override: boolean }>(
    'SELECT id,bio,biography_manual_override,catalog_manual_override FROM artists WHERE slug=$1 FOR UPDATE',[profile.slug])).rows[0];
  if (!artist) throw Error('Curated artist missing from catalogue: ' + profile.slug);
  if (artist.biography_manual_override) return;
  if (!artist.bio?.trim()) await client.query("UPDATE artists SET bio=$2,genres=CASE WHEN catalog_manual_override THEN genres ELSE $3 END,verified_at=now(),updated_at=now() WHERE id=$1",[artist.id,profile.bio,profile.genres]);
  if (!artist.catalog_manual_override && (!artist.bio?.trim() || artist.bio === profile.bio)) await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[artist.id,profile.sourceUrl,profile.sourceLabel]);
  for (const [index,section] of biographyFor(profile).entries()) {
    await client.query('INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[artist.id,index+1,section.heading,section.body,section.sourceUrl,section.sourceLabel]);
    if (!artist.catalog_manual_override) await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[artist.id,section.sourceUrl,section.sourceLabel]);
  }
}
