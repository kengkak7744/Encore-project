import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from './db.js';
import { saveEvent, saveSourceEvents } from './ingest.js';
import type { ConcertEvent } from './concert-types.js';

test('Concert persistence retains rounds/history, canonical identity, manual and organizer precedence', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async (t) => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA concert_persistence_fixture');
    await client.query('SET LOCAL search_path TO concert_persistence_fixture,public');
    const dir = new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    const base: ConcertEvent = { title: 'Fixture Live',url: 'https://www.theconcert.com/p/123',venue: 'Hall A',country: 'TH',startsAt: '2030-12-25T09:00:00Z',endsAt: '2030-12-25T16:00:00Z',priceMin: 350,priceMax: 350,completeSchedule: true };
    await saveSourceEvents('The Concert',[base,{ ...base,startsAt: '2030-12-26T09:00:00Z',endsAt: '2030-12-26T16:00:00Z',priceMin: 590,priceMax: 590 }]);
    let concert = (await client.query('SELECT * FROM concerts')).rows[0];
    assert.equal(concert.starts_at.toISOString(),base.startsAt!.replace('Z','.000Z'));
    assert.equal(Number(concert.price_min),350); assert.equal(Number(concert.price_max),590);
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_performances')).rows[0].n,2);
    await saveSourceEvents('The Concert',[{ ...base,startsAt: '2031-01-01T09:00:00Z',endsAt: null,status: 'postponed',priceMin: null,priceMax: null }]);
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_performances WHERE is_current')).rows[0].n,1);
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_performances')).rows[0].n,3);
    concert = (await client.query('SELECT * FROM concerts')).rows[0];
    assert.equal(concert.status,'postponed'); assert.equal(Number(concert.price_min),350); assert.match(concert.price_note,/ยังไม่ระบุราคา/);
    assert.equal(concert.ends_at,null,'An unannounced end time must not be replaced by the start time');
    await client.query('UPDATE concerts SET manual_override=true,title=$2 WHERE id=$1',[concert.id,'Admin correction']);
    await saveSourceEvents('The Concert',[{ ...base,startsAt: '2032-01-01T09:00:00Z',status: 'cancelled' }]);
    assert.equal((await client.query('SELECT title FROM concerts WHERE id=$1',[concert.id])).rows[0].title,'Admin correction');
    assert.equal((await client.query('SELECT count(*)::int n FROM concert_performances')).rows[0].n,3);
    await saveEvent('Eventpop',{ ...base,title: 'Other Live',url: 'https://www.eventpop.me/e/999/old-slug' });
    await saveEvent('Eventpop',{ ...base,title: 'Other Live',url: 'https://www.eventpop.me/e/999' });
    assert.equal((await client.query('SELECT count(*)::int n FROM concerts')).rows[0].n,2);
    assert.equal(await saveEvent('Eventpop',{ ...base,url: 'https://www.eventpop.me/e/998',startsAt: null,status: 'cancelled' }),false);
    await saveEvent('Ticketmelon',{ ...base,url: 'https://www.ticketmelon.com/fixture/other-venue',venue: 'Hall B' });
    assert.equal((await client.query('SELECT count(*)::int n FROM concerts')).rows[0].n,3);
    await saveEvent('Live Nation Tero',{ ...base,title: 'Organizer Live',url: 'https://www.livenationtero.co.th/en/event/fixture',venue: 'Hall C' });
    await saveEvent('Ticketmelon',{ ...base,title: 'Organizer Live',url: 'https://www.ticketmelon.com/fixture/organizer',venue: 'Hall C',status: 'cancelled' });
    assert.equal((await client.query("SELECT status FROM concerts WHERE title='Organizer Live'")).rows[0].status,'scheduled');
    const user = (await client.query("INSERT INTO users(email,password_hash,display_name) VALUES('archive-fixture@example.com','fixture','Fixture') RETURNING id")).rows[0].id;
    for (const kind of ['invalid','manual','attended','mixed']) {
      const id = (await client.query("INSERT INTO concerts(slug,title,starts_at,manual_override) VALUES($1,$1,'2126-01-01',$2) RETURNING id",['archive-'+kind,kind === 'manual'])).rows[0].id;
      await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url) VALUES($1,'Eventpop',$2)",[id,'https://www.eventpop.me/e/archive-'+kind]);
      if (kind === 'attended') await client.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2)',[user,id]);
      if (kind === 'mixed') await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url) VALUES($1,'Live Nation Tero',$2)",[id,'https://example.com/archive-mixed']);
    }
    await client.query(await readFile(new URL('013_eventpop_date_repair.sql',dir),'utf8'));
    assert.deepEqual((await client.query("SELECT slug FROM concerts WHERE slug LIKE 'archive-%' ORDER BY slug")).rows.map(row => row.slug),['archive-attended','archive-manual','archive-mixed']);
    const archive = (await client.query('SELECT snapshot FROM concert_date_archive')).rows;
    assert.equal(archive.length,1); assert.equal(archive[0].snapshot.concert.slug,'archive-invalid');
    assert.equal(archive[0].snapshot.sources.length,1);
  } finally {
    t.mock.restoreAll(); await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
