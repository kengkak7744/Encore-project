import { query } from './db.js';
import { ConcertFetchError } from './concert-fetch.js';

export async function recordConcertBackoff(source: string, error: unknown) {
  if (!(error instanceof ConcertFetchError) || error.status !== 429) return false;
  const retry = new Date(Date.now() + error.retryMs).toISOString();
  await query(`INSERT INTO concert_source_backoff(source_name,retry_after,reason) VALUES($1,$2,'HTTP 429')
    ON CONFLICT(source_name) DO UPDATE SET retry_after=GREATEST(concert_source_backoff.retry_after,EXCLUDED.retry_after),reason=EXCLUDED.reason,updated_at=now()`,[source,retry]);
  return true;
}
