import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';
import { runBiographyCycle } from './biography-jobs.js';
import type { BiographyDraft, BiographySource } from './biography-policy.js';

const databaseUrl = process.env.BIOGRAPHY_TEST_DATABASE_URL;
const quote = 'วงดนตรีตัวอย่างเริ่มทำเพลงร่วมกันและเผยแพร่ผลงานผ่านช่องทางของวง';
const documents: BiographySource[] = [{ id: 'source-1', url: 'https://example.com/artist', label: 'Artist', text: quote, fetchedAt: '2026-10-03T16:00:00Z' }];
const draft: BiographyDraft = { identityMatches: true, reason: '', sections: ['จุดเริ่มต้น', 'การทำเพลง', 'ช่องทางเผยแพร่'].map((heading) => ({ heading, body: quote + ' โดยข้อมูลส่วนนี้กล่าวถึงการทำงานและช่องทางเผยแพร่เพลงของวงตามข้อความที่แหล่งอ้างอิงระบุไว้', sourceId: 'source-1', evidence: [quote] })) };

test('biography worker integration on an isolated database', { skip: !databaseUrl }, async (t) => {
  assert.match(new URL(databaseUrl!).pathname, /^\/encore_biography_test[\w]*$/, 'Never run these destructive fixture resets on the application database');
  const database = new pg.Pool({ connectionString: databaseUrl });
  const saved = { enabled: config.biographyEnabled, start: config.biographyWindowStart, end: config.biographyWindowEnd, max: config.biographyMaxPerNight };
  config.biographyEnabled = true;
  config.biographyWindowStart = '23:00'; config.biographyWindowEnd = '00:00'; config.biographyMaxPerNight = 10;
  let clock = new Date('2026-10-03T16:05:00Z');
  const run = (overrides: Partial<Parameters<typeof runBiographyCycle>[0]> = {}) => runBiographyCycle({ database, now: () => clock, collect: async () => ({ documents, errors: [] }), generate: async () => structuredClone(draft), unload: async () => {}, ...overrides });
  const reset = async () => { await database.query('TRUNCATE artists,biography_worker_state CASCADE'); clock = new Date('2026-10-03T16:05:00Z'); };
  const artist = async () => (await database.query<{ id: string }>("INSERT INTO artists(slug,name,kind,bio) VALUES('test-band','วงตัวอย่าง','band','existing short biography') RETURNING id")).rows[0].id;
  const manual = async (id: string) => database.query("INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label) VALUES($1,1,'manual','keep this human text','https://example.com/manual','Human')", [id]);
  try {
    const dir = new URL('../sql/', import.meta.url);
    await database.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    // An empty migration table can also belong to a prior interrupted fixture setup.
    if (!(await database.query('SELECT 1 FROM schema_migrations LIMIT 1')).rowCount && (await database.query("SELECT to_regclass('biography_runs') AS present")).rows[0].present) {
      await database.query('DROP SCHEMA public CASCADE');
      await database.query('CREATE SCHEMA public');
      await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    }
    for (const file of (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()) {
      if ((await database.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file])).rowCount) continue;
      await database.query(await readFile(new URL(file, dir), 'utf8'));
      await database.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
    }
    await t.test('outside the window no source or AI calls occur', async () => {
      await reset(); await artist(); clock = new Date('2026-10-03T15:59:00Z');
      assert.equal((await run({ collect: async () => { throw new Error('must not fetch'); } })).status, 'outside_window');
      assert.equal((await database.query('SELECT * FROM biography_runs')).rowCount, 0);
    });
    await t.test('publishes all sections with evidence, retains short bio, and skips future nights', async () => {
      await reset(); await artist(); assert.equal((await run({ generate: async (_artist, _sources, _signal, onDraft) => { await onDraft?.({ review: { checked: true } }); return structuredClone(draft); } })).status, 'published');
      const sections = await database.query('SELECT generated_model,evidence,generation_run_id FROM artist_biography_sections');
      assert.equal(sections.rowCount, 3); assert.equal(sections.rows[0].generated_model, config.biographyModel);
      assert.deepEqual(sections.rows[0].evidence, [quote]); assert.ok(sections.rows[0].generation_run_id);
      assert.deepEqual((await database.query('SELECT draft FROM biography_runs')).rows[0].draft.review, { checked: true });
      assert.equal((await database.query('SELECT bio,verified_at FROM artists')).rows[0].bio, 'existing short biography');
      assert.equal((await database.query('SELECT verified_at FROM artists')).rows[0].verified_at, null);
      clock = new Date('2026-10-04T16:05:00Z'); assert.equal((await run()).status, 'empty_queue');
    });
    await t.test('existing biographies never enter the queue', async () => {
      await reset(); await manual(await artist());
      assert.equal((await run({ generate: async () => { throw new Error('must not generate'); } })).status, 'empty_queue');
    });
    await t.test('an intentionally empty administrator biography never enters the queue',async () => {
      await reset(); const id = await artist();
      await database.query('UPDATE artists SET biography_manual_override=true WHERE id=$1',[id]);
      assert.equal((await run({ generate: async () => { throw Error('must not generate'); } })).status,'empty_queue');
      assert.equal((await database.query('SELECT count(*)::int n FROM biography_runs')).rows[0].n,0);
    });
    await t.test('human biography added during generation wins', async () => {
      await reset(); const id = await artist();
      assert.equal((await run({ generate: async () => { await manual(id); return draft; } })).status, 'skipped');
      assert.equal((await database.query('SELECT body FROM artist_biography_sections')).rows[0].body, 'keep this human text');
      assert.equal((await database.query('SELECT * FROM artist_biography_sections')).rowCount, 1);
    });
    await t.test('administrator withholding biography during generation prevents publication even without sections',async () => {
      await reset(); const id = await artist();
      assert.equal((await run({ generate: async () => { await database.query('UPDATE artists SET biography_manual_override=true WHERE id=$1',[id]); return draft; } })).status,'skipped');
      assert.equal((await database.query('SELECT count(*)::int n FROM artist_biography_sections')).rows[0].n,0);
    });
    await t.test('unavailable sources retry next night but never repeatedly in one night', async () => {
      await reset(); await artist();
      assert.equal((await run({ collect: async () => ({ documents: [], errors: [{ url: 'https://example.com', error: 'HTTP 403' }] }) })).status, 'insufficient_sources');
      assert.equal((await run()).status, 'empty_queue');
      clock = new Date('2026-10-04T16:05:00Z'); assert.equal((await run()).status, 'published');
    });
    await t.test('invalid evidence cannot publish any sections', async () => {
      await reset(); await artist();
      const bad = structuredClone(draft); bad.sections[2].evidence = ['คำอ้างที่ไม่มีอยู่จริงในแหล่งข้อมูลศิลปิน'];
      assert.equal((await run({ generate: async () => bad })).status, 'insufficient_sources');
      assert.equal((await database.query('SELECT * FROM artist_biography_sections')).rowCount, 0);
    });
    await t.test('new nights try unattempted profiles before repeating failures, then rotate oldest retries', async () => {
      await reset();
      const ids: string[] = [];
      for (let index = 0; index < 11; index++) {
        ids.push((await database.query<{ id: string }>("INSERT INTO artists(slug,name,kind,created_at) VALUES($1,$1,'solo',$2) RETURNING id", ['queued-' + index, new Date(Date.UTC(2026, 9, 1, 0, index))])).rows[0].id);
      }
      const attempted: string[] = [];
      const fail = () => run({ collect: async (candidate) => { attempted.push(candidate.id); return { documents: [], errors: [] }; } });
      for (let index = 0; index < 10; index++) assert.equal((await fail()).status, 'insufficient_sources');
      assert.deepEqual(attempted, ids.slice(0, 10));
      assert.equal((await fail()).status, 'night_limit');
      for (let index = 0; index < 10; index++) await database.query("UPDATE biography_runs SET started_at=$2 WHERE artist_id=$1 AND window_date='2026-10-03'", [ids[index], new Date(Date.UTC(2026, 9, 3, 16, index))]);
      clock = new Date('2026-10-04T16:05:00Z');
      assert.equal((await fail()).status, 'insufficient_sources');
      assert.equal(attempted[10], ids[10], 'Failures must not starve profiles that have never been tried');
      await database.query("UPDATE biography_runs SET started_at=$2 WHERE artist_id=$1 AND window_date='2026-10-03'", [ids[0], '2026-10-03T16:10:00Z']);
      assert.equal((await fail()).status, 'insufficient_sources');
      assert.equal(attempted[11], ids[1], 'Retry the oldest previous attempt first');
    });
    await t.test('a generation finishing at midnight cannot publish', async () => {
      await reset(); await artist();
      assert.equal((await run({ generate: async () => { clock = new Date('2026-10-03T17:00:00Z'); return draft; } })).status, 'failed');
      assert.equal((await database.query('SELECT * FROM artist_biography_sections')).rowCount, 0);
    });
    await t.test('advisory lock prevents parallel workers', async () => {
      await reset(); await artist(); const other = await database.connect();
      try { await other.query('SELECT pg_advisory_lock(20261003)'); assert.equal((await run()).status, 'busy'); }
      finally { await other.query('SELECT pg_advisory_unlock(20261003)'); other.release(); }
    });
    await t.test('restart marks unfinished attempts and respects persisted nightly caps', async () => {
      await reset(); const id = await artist();
      await database.query("INSERT INTO biography_runs(artist_id,window_date,model) VALUES($1,'2026-10-03',$2)", [id, config.biographyModel]);
      assert.equal((await run()).status, 'empty_queue');
      assert.equal((await database.query('SELECT status FROM biography_runs')).rows[0].status, 'interrupted');
      config.biographyMaxPerNight = 1; assert.equal((await run()).status, 'night_limit');
    });
    await t.test('disabled scheduler performs no generation', async () => {
      await reset(); await artist(); config.biographyEnabled = false;
      assert.equal((await run()).status, 'disabled');
    });
  } finally {
    config.biographyEnabled = saved.enabled; config.biographyWindowStart = saved.start; config.biographyWindowEnd = saved.end; config.biographyMaxPerNight = saved.max;
    await database.end();
  }
});
