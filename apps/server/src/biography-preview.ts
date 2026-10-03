import { one, pool, query } from './db.js';
import { collectBiographySources } from './biography-sources.js';
import { generateBiography, unloadBiographyModel } from './biography-generator.js';
import type { BiographyArtist } from './biography-policy.js';

// Read-only live preview; does not bypass the publication schedule or modify artist data.
try {
  const slug = process.argv[2];
  if (!slug) throw new Error('Usage: npm run biography:preview -- <artist-slug>');
  const artist = await one<BiographyArtist>('SELECT id,slug,name,name_en,kind FROM artists WHERE slug=$1', [slug]);
  if (!artist) throw new Error('Artist not found');
  const links = await query<{ source_url: string; label: string }>('SELECT source_url,label FROM artist_sources WHERE artist_id=$1', [artist.id]);
  const signal = AbortSignal.timeout(12 * 60 * 1000);
  const collected = await collectBiographySources(artist, links, signal);
  console.log('Sources:', collected.documents.map((source) => source.url), 'Errors:', collected.errors);
  const draft = await generateBiography(artist, collected.documents, signal, (raw) => console.log('Draft before validation:', JSON.stringify(raw, null, 2)));
  console.log(JSON.stringify(draft, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await unloadBiographyModel();
  await pool.end();
}
