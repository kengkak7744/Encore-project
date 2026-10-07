import { pool, query } from './db.js';
import { enrichKnowledge, summarizeNews } from './knowledge.js';

export async function workerHeartbeat(boot = false) {
  await query(`INSERT INTO worker_heartbeat(id) VALUES(1) ON CONFLICT(id) DO UPDATE
    SET last_seen_at=now(),booted_at=CASE WHEN $1 THEN now() ELSE worker_heartbeat.booted_at END`,[boot]);
}

// The database clock and session lock preserve the hourly AI limit across worker restarts.
export async function runScheduledAI(work = async () => { await enrichKnowledge(); await summarizeNews(); }) {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(6210420) AS locked')).rows[0].locked;
    if (!locked) return false;
    const due = await client.query(`UPDATE worker_task_state SET last_started_at=now(),last_finished_at=NULL,last_error=NULL
      WHERE name='ai' AND (last_started_at IS NULL OR last_started_at<=now()-interval '1 hour') RETURNING name`);
    if (!due.rows.length) return false;
    try {
      await work();
      await client.query("UPDATE worker_task_state SET last_finished_at=now() WHERE name='ai'");
    } catch (error) {
      await client.query("UPDATE worker_task_state SET last_finished_at=now(),last_error='AI maintenance failed; see worker log' WHERE name='ai'");
      throw error;
    }
    return true;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(6210420)');
    client.release();
  }
}
