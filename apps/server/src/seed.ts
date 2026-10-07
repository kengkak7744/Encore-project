import { hashPassword } from './auth.js';
import { config } from './config.js';
import { one, pool, query } from './db.js';
import { migrate } from './migrate.js';
import { curatedArtistProfiles } from './artist-profiles.js';
import { seedArtistBiography, seedArtistAccounts } from './artist-seed.js';
import { applyArtistAudit } from './artist-audit.js';
import { expandedArtistProfiles } from './expanded-artist-profiles.js';

// Candidate catalogue. verified_at stays NULL until an editor checks an official source.
const artists: [string, string, 'band' | 'solo' | 'member', string[]][] = [
  ['bodyslam','Bodyslam','band',['rock']], ['tilly-birds','Tilly Birds','band',['pop','rock']],
  ['three-man-down','Three Man Down','band',['pop','rock']], ['cocktail','Cocktail','band',['rock']],
  ['slot-machine','Slot Machine','band',['rock']], ['getsunova','Getsunova','band',['pop','rock']],
  ['polycat','Polycat','band',['pop','indie']], ['4eve','4EVE','band',['t-pop']],
  ['bus','BUS','band',['t-pop']], ['proxie','PROXIE','band',['t-pop']],
  ['pixxie','PiXXiE','band',['t-pop']], ['atlas','ATLAS','band',['t-pop']],
  ['jeff-satur','Jeff Satur','solo',['pop']], ['nont-tanont','NONT TANONT','solo',['pop']],
  ['ink-waruntorn','INK WARUNTORN','solo',['pop']], ['bowkylion','BOWKYLION','solo',['pop']],
  ['the-toys','THE TOYS','solo',['pop']], ['phum-viphurit','Phum Viphurit','solo',['indie']],
  ['violette-wautier','Violette Wautier','solo',['pop']], ['milli','MILLI','solo',['hip-hop']],
  ['pp-krit','PP Krit','solo',['pop']], ['billkin','Billkin','solo',['pop']],
  ['palmy','Palmy','solo',['pop']], ['stamp-apiwat','STAMP Apiwat','solo',['pop']],
  ['tattoo-colour','TATTOO COLOUR','band',['pop','rock']], ['scrubb','Scrubb','band',['indie','pop']],
  ['musketeers','Musketeers','band',['pop','rock']], ['paper-planes','Paper Planes','band',['rock']],
  ['only-monday','Only Monday','band',['rock']], ['dept','Dept','band',['indie','pop']],
  ['mind-4eve','Mind (4EVE)','member',['t-pop']], ['jorin-4eve','Jorin (4EVE)','member',['t-pop']],
  ['taaom-4eve','Taaom (4EVE)','member',['t-pop']], ['hannah-4eve','Hannah (4EVE)','member',['t-pop']],
  ['fai-4eve','Fai (4EVE)','member',['t-pop']], ['punch-4eve','Punch (4EVE)','member',['t-pop']],
  ['aheye-4eve','Aheye (4EVE)','member',['t-pop']],
];

artists.push(...expandedArtistProfiles.map(profile => [profile.slug, profile.name, profile.kind, profile.genres] as [string, string, 'band' | 'solo', string[]]));

if (!!config.adminEmail !== !!config.adminPassword) throw Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to create an administrator');
if (config.adminEmail && config.adminPassword.length < 12) throw Error('ADMIN_PASSWORD must contain at least 12 characters');
await migrate();
for (const [slug, name, kind, genres] of artists) {
  await query('INSERT INTO artists(slug,name,name_en,kind,genres) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slug) DO NOTHING', [slug, name, name, kind, genres]);
}
const band = await one<{ id: string }>('SELECT id FROM artists WHERE slug=$1', ['4eve']);
for (const [slug] of artists.filter(([slug]) => slug.endsWith('-4eve'))) {
  await query('INSERT INTO artist_memberships(band_id,member_id) SELECT $1,id FROM artists WHERE slug=$2 AND EXISTS(SELECT 1 FROM artists b WHERE b.id=$1 AND NOT b.catalog_manual_override) ON CONFLICT DO NOTHING', [band!.id, slug]);
}
for (const profile of curatedArtistProfiles) {
  const artist = await one<{ id: string }>('SELECT id FROM artists WHERE slug=$1', [profile.slug]);
  if (!artist) throw new Error('Curated artist missing from catalogue: ' + profile.slug);
  const client = await pool.connect();
  try { await client.query('BEGIN'); await seedArtistBiography(client,profile); await seedArtistAccounts(client,profile); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const auditClient = await pool.connect();
try {
  await auditClient.query('BEGIN');
  await applyArtistAudit(auditClient);
  await auditClient.query('COMMIT');
} catch (error) {
  await auditClient.query('ROLLBACK');
  throw error;
} finally {
  auditClient.release();
}
await query(`INSERT INTO ticketmaster_artist_identities(artist_id,attraction_id,evidence_url)
  SELECT id,'K8vZ9172buf','https://www.electricbrixton.uk.com/events/bodyslam-world-tour-2026/'
  FROM artists WHERE slug='bodyslam' ON CONFLICT DO NOTHING`);
if (config.adminEmail && config.adminPassword) {
  await query('INSERT INTO users(email,display_name,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING', [config.adminEmail.toLowerCase(), 'ผู้ดูแล', await hashPassword(config.adminPassword), 'admin']);
}
console.log('Seeded artist candidates: ' + artists.length + '; curated profiles: ' + curatedArtistProfiles.length);
await pool.end();
