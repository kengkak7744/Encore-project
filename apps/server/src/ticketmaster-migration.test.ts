import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

test('Ticketmaster repair archives unverified imports and protects Thai, verified, manual and attended concerts', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async () => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    // All fixtures and migration effects are rolled back, including this isolated schema.
    await client.query('CREATE SCHEMA ticketmaster_migration_fixture');
    await client.query('SET LOCAL search_path TO ticketmaster_migration_fixture, public');
    const sqlDir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(sqlDir)).filter(name => name.endsWith('.sql') && name < '008').sort()) {
      await client.query(await readFile(new URL(file, sqlDir), 'utf8'));
    }
    const artist = (await client.query("INSERT INTO artists(slug,name,kind) VALUES('bodyslam','Bodyslam','band') RETURNING id")).rows[0].id;
    const user = (await client.query("INSERT INTO users(email,password_hash,display_name) VALUES('fixture@example.com','fixture','Fixture') RETURNING id")).rows[0].id;
    const ids: Record<string, string> = {};
    for (const slug of ['invalid', 'thai', 'verified', 'manual', 'attended', 'mixed']) {
      const country = slug === 'thai' ? 'TH' : 'GB';
      const id = (await client.query('INSERT INTO concerts(slug,title,country_code,manual_override) VALUES($1,$1,$2,$3) RETURNING id', [slug, country, slug === 'manual'])).rows[0].id;
      ids[slug] = id;
      const url = slug === 'verified' ? 'https://www.universe.com/events/bodyslam-tickets-NVRWTD?ref=ticketmaster' : 'https://example.com/' + slug;
      await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url,raw_data) VALUES($1,'Ticketmaster',$2,$3)", [id, url, JSON.stringify({ artist: 'Bodyslam', country })]);
      await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)', [id, artist]);
      await client.query("INSERT INTO knowledge_chunks(source_type,source_id,content,content_hash) VALUES('concert',$1,$2,$2)", [id, slug]);
    }
    await client.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2)', [user, ids.attended]);
    await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url) VALUES($1,'Live Nation Tero','https://example.com/organizer')", [ids.mixed]);
    await client.query(await readFile(new URL('008_ticketmaster_identity.sql', sqlDir), 'utf8'));
    assert.deepEqual((await client.query('SELECT slug FROM concerts ORDER BY slug')).rows.map(r => r.slug), ['attended', 'manual', 'mixed', 'thai', 'verified']);
    const archive = (await client.query('SELECT * FROM ticketmaster_import_archive')).rows;
    assert.equal(archive.length, 1);
    assert.equal(archive[0].snapshot.concert.slug, 'invalid');
    assert.equal(archive[0].snapshot.sources[0].raw_data.artist, 'Bodyslam');
    assert.equal(archive[0].snapshot.artists[0].artist_id, artist);
    assert.equal(archive[0].snapshot.knowledge[0].content, 'invalid');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM knowledge_chunks WHERE source_id=$1', [ids.invalid])).rows[0].n, 0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM attendance')).rows[0].n, 1);
    assert.equal((await client.query('SELECT attraction_id FROM ticketmaster_artist_identities')).rows[0].attraction_id, 'K8vZ9172buf');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
