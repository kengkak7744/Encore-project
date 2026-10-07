import { config } from './config.js';
import { pool } from './db.js';
import { syncNews } from './ingest.js';

export async function runScheduledNews(options: { includeInstagram?: boolean } = {}) {
  if (options.includeInstagram !== false) await syncNews({ platform: 'instagram' });
  let hourlyWork = false;
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(6210419) AS locked')).rows[0].locked;
    if (!locked) return false;
    for (const platform of ['x','facebook'] as const) {
      const due = await client.query(`UPDATE social_scheduler_state SET last_started_at=now() WHERE platform=$1
        AND (last_started_at IS NULL OR last_started_at <= now()-$2::double precision*interval '1 minute') RETURNING platform`, [platform,config.socialSyncIntervalMinutes]);
      if (due.rows.length) { await syncNews({ platform }); hourlyWork = true; }
    }
    // Keep AI housekeeping hourly; a lightweight IG check must not start ten summaries every minute.
    return hourlyWork;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(6210419)');
    client.release();
  }
}
