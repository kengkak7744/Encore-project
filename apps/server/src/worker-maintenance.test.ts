import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { pool } from './db.js';
import { runScheduledAI, workerHeartbeat } from './worker-maintenance.js';

test('Hourly AI reservation persists across restarts, prevents concurrent work and records failure', { skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA worker_maintenance_fixture');
    await client.query('SET LOCAL search_path TO worker_maintenance_fixture,public');
    await client.query('CREATE TABLE concert_monitor_windows(id bigserial PRIMARY KEY,started_at timestamptz,ends_at timestamptz)');
    await client.query(await readFile(new URL('../sql/017_worker_continuity.sql',import.meta.url),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    t.mock.method(pool,'connect',async () => ({ query: client.query.bind(client),release() {} }));
    let work = 0;
    assert.equal(await runScheduledAI(async () => { work++; }),true);
    assert.equal(await runScheduledAI(async () => { work++; }),false);
    assert.equal(work,1);
    await client.query("UPDATE worker_task_state SET last_started_at=now()-interval '2 hours'");
    const other = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
    await other.connect();
    try {
      await other.query('SELECT pg_advisory_lock(6210420)');
      assert.equal(await runScheduledAI(async () => { work++; }),false);
    } finally { await other.query('SELECT pg_advisory_unlock_all()'); await other.end(); }
    assert.equal(work,1);
    await assert.rejects(runScheduledAI(async () => { throw Error('offline'); }),/offline/);
    const state = (await client.query("SELECT * FROM worker_task_state WHERE name='ai'")).rows[0];
    assert.ok(state.last_finished_at); assert.ok(state.last_error);
    assert.equal(await runScheduledAI(async () => { work++; }),false);
    await workerHeartbeat(true); await workerHeartbeat();
    assert.equal((await client.query('SELECT count(*)::int n FROM worker_heartbeat')).rows[0].n,1);
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()'); t.mock.restoreAll();
    await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
