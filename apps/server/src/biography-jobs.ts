import type pg from 'pg';
import { config } from './config.js';
import { pool } from './db.js';
import { collectBiographySources, type CollectedSources } from './biography-sources.js';
import { generateBiography, unloadBiographyModel } from './biography-generator.js';
import { assertBiographyModel, biographyWindow, BiographyRejected, validateBiographyDraft, type BiographyArtist, type BiographyDraft, type BiographySource } from './biography-policy.js';

const lockId = 20261003;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000);
type CycleOptions = {
  now?: () => Date;
  signal?: AbortSignal;
  database?: pg.Pool;
  collect?: typeof collectBiographySources;
  generate?: typeof generateBiography;
  unload?: typeof unloadBiographyModel;
};

export async function publishBiography(client: pg.PoolClient, artist: BiographyArtist, runId: string, draft: BiographyDraft, sources: BiographySource[], signal: AbortSignal, now: () => Date = () => new Date()): Promise<boolean> {
  validateBiographyDraft(draft, sources);
  const window = biographyWindow(now(), config.biographyWindowStart, config.biographyWindowEnd);
  if (!window) throw new Error('Biography publication outside the configured window');
  const assertActive = () => {
    signal.throwIfAborted();
    if (now().getTime() >= window.endsAt.getTime()) throw new Error('Biography window ended before publication');
  };
  await client.query('BEGIN');
  try {
    assertActive();
    await client.query("SELECT set_config('statement_timeout',$1,true)", [String(Math.max(1, Math.min(10000, window.endsAt.getTime() - now().getTime())))]);
    const locked = await client.query<{ updated_at: string }>('SELECT updated_at::text AS updated_at FROM artists WHERE id=$1 AND NOT biography_manual_override FOR UPDATE', [artist.id]);
    const existing = await client.query('SELECT 1 FROM artist_biography_sections WHERE artist_id=$1 LIMIT 1', [artist.id]);
    if (!locked.rowCount || existing.rowCount || (artist.updated_at && artist.updated_at !== locked.rows[0].updated_at)) {
      await client.query('ROLLBACK');
      return false;
    }
    for (const [index, section] of draft.sections.entries()) {
      assertActive();
      const source = sources.find((item) => item.id === section.sourceId)!;
      const inserted = await client.query('INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label,checked_at,generated_model,generation_run_id,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING position', [artist.id, index + 1, section.heading, section.body, source.url, source.label, source.fetchedAt, config.biographyModel, runId, JSON.stringify(section.evidence)]);
      if (!inserted.rowCount) throw new Error('Biography was added concurrently; keep the existing text');
      await client.query('INSERT INTO artist_sources(artist_id,source_url,label,checked_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [artist.id, source.url, source.label, source.fetchedAt]);
    }
    assertActive();
    await client.query("UPDATE artists SET bio=CASE WHEN bio IS NULL OR btrim(bio)='' THEN $2 ELSE bio END, updated_at=now() WHERE id=$1", [artist.id, draft.sections[0].body.slice(0, 240)]);
    await client.query("UPDATE biography_runs SET status='published',finished_at=now(),draft=COALESCE(draft,'{}'::jsonb)||$2::jsonb,error=NULL WHERE id=$1", [runId, JSON.stringify(draft)]);
    assertActive();
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// One artist per cycle. Persistent run rows cap attempts and survive restarts.
export async function runBiographyCycle(options: CycleOptions = {}) {
  const now = options.now || (() => new Date());
  const client = await (options.database || pool).connect();
  let locked = false;
  let runId: string | null = null;
  let usedModel = false;
  let windowSignal: AbortSignal | undefined;
  try {
    locked = (await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [lockId])).rows[0].acquired;
    if (!locked) return { status: 'busy' };
    await client.query('INSERT INTO biography_worker_state(id,enabled,model,window_start,window_end,max_per_night) VALUES(1,$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET last_checked_at=now(),enabled=$1,model=$2,window_start=$3,window_end=$4,max_per_night=$5,last_error=NULL', [config.biographyEnabled, config.biographyModel, config.biographyWindowStart, config.biographyWindowEnd, config.biographyMaxPerNight]);
    // Acquiring this session lock proves no other cycle owns these unfinished jobs.
    await client.query("UPDATE biography_runs SET status='interrupted',finished_at=now(),error='Worker restarted before the previous attempt completed' WHERE status='running'");
    if (!config.biographyEnabled) return { status: 'disabled' };
    assertBiographyModel(config.biographyModel, config.chatModel);
    const window = biographyWindow(now(), config.biographyWindowStart, config.biographyWindowEnd);
    if (!window) return { status: 'outside_window' };
    const total = await client.query<{ count: number }>('SELECT count(*)::integer AS count FROM biography_runs WHERE window_date=$1', [window.date]);
    if (total.rows[0].count >= config.biographyMaxPerNight) return { status: 'night_limit' };
    const candidates = await client.query<BiographyArtist>(`SELECT a.id,a.slug,a.name,a.name_en,a.kind,a.updated_at::text AS updated_at,
      (SELECT s.handle FROM social_accounts s WHERE s.artist_id=a.id AND s.platform='instagram' AND s.verified_at IS NOT NULL ORDER BY s.id LIMIT 1) AS instagram_handle FROM artists a
      WHERE NOT a.biography_manual_override AND NOT EXISTS (SELECT 1 FROM artist_biography_sections b WHERE b.artist_id=a.id)
      AND NOT EXISTS (SELECT 1 FROM biography_runs r WHERE r.artist_id=a.id AND r.window_date=$1)
      ORDER BY (SELECT max(r.started_at) FROM biography_runs r WHERE r.artist_id=a.id) ASC NULLS FIRST,a.created_at,a.id LIMIT 1`, [window.date]);
    const artist = candidates.rows[0];
    if (!artist) return { status: 'empty_queue' };
    const claimed = await client.query<{ id: string }>('INSERT INTO biography_runs(artist_id,window_date,model) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id::text', [artist.id, window.date, config.biographyModel]);
    if (!claimed.rowCount) return { status: 'already_attempted' };
    runId = claimed.rows[0].id;
    windowSignal = AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(Math.max(1, window.endsAt.getTime() - now().getTime()))]);
    const links = await client.query<{ source_url: string; label: string }>(`SELECT source_url,label FROM artist_sources WHERE artist_id=$1
      UNION SELECT url AS source_url,'เว็บไซต์ศิลปิน' AS label FROM social_accounts WHERE artist_id=$1 AND platform='website' AND verified_at IS NOT NULL`, [artist.id]);
    const collected: CollectedSources = await (options.collect || collectBiographySources)(artist, links.rows, windowSignal);
    await client.query('UPDATE biography_runs SET source_documents=$2,source_errors=$3 WHERE id=$1', [runId, JSON.stringify(collected.documents), JSON.stringify(collected.errors)]);
    if (!collected.documents.length) throw new BiographyRejected('No readable, matching biography sources found');
    windowSignal.throwIfAborted();
    usedModel = true;
    const draft = await (options.generate || generateBiography)(artist, collected.documents, windowSignal, async (raw) => {
      await client.query('UPDATE biography_runs SET draft=$2 WHERE id=$1', [runId, JSON.stringify(raw)]);
    });
    await client.query("UPDATE biography_runs SET draft=COALESCE(draft,'{}'::jsonb)||$2::jsonb WHERE id=$1", [runId, JSON.stringify(draft)]);
    const published = await publishBiography(client, artist, runId, draft, collected.documents, windowSignal, now);
    if (!published) await client.query("UPDATE biography_runs SET status='skipped',finished_at=now(),error='Artist changed or already has a biography' WHERE id=$1", [runId]);
    console.log(`Biography ${artist.slug}: ${published ? 'published' : 'skipped'} (run ${runId})`);
    return { status: published ? 'published' : 'skipped', artist: artist.slug, runId };
  } catch (error) {
    const status = options.signal?.aborted || windowSignal?.aborted ? 'interrupted' : error instanceof BiographyRejected ? 'insufficient_sources' : 'failed';
    if (runId) await client.query('UPDATE biography_runs SET status=$2,finished_at=now(),error=$3 WHERE id=$1', [runId, status, message(error)]);
    if (locked) await client.query('UPDATE biography_worker_state SET last_error=$1 WHERE id=1', [message(error)]);
    console.warn('Biography cycle:', message(error));
    return { status, runId, error: message(error) };
  } finally {
    try {
      if (usedModel) await (options.unload || unloadBiographyModel)();
    } finally {
      try {
        if (locked) {
          try { await client.query('UPDATE biography_worker_state SET last_checked_at=now() WHERE id=1'); }
          finally { await client.query('SELECT pg_advisory_unlock($1)', [lockId]); }
        }
      } finally { client.release(); }
    }
  }
}
