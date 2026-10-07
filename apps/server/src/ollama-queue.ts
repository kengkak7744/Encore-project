import type pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from './config.js';
import { pool } from './db.js';

type Job = { model: string; interactive: boolean; signal: AbortSignal; cleanup?: () => Promise<void> };
class YieldToChat extends Error {}

// PostgreSQL coordinates API, news/embedding worker and biography worker even
// when their URLs differ (localhost vs host.docker.internal). No prompts stored.
export class OllamaQueue {
  constructor(private database: pg.Pool = pool,private resource = config.ollamaResource,private pollMs = 250,private quietMs = config.ollamaQuietMs) {}

  private async claim(id: string) {
    const client = await this.database.connect();
    let owned = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.resource]);
      await client.query("UPDATE ollama_requests SET status='interrupted',finished_at=now() WHERE resource=$1 AND status IN ('queued','running') AND heartbeat_at<now()-interval '75 seconds'",[this.resource]);
      const active = await client.query("SELECT 1 FROM ollama_requests WHERE resource=$1 AND status='running'",[this.resource]);
      const next = await client.query<{ id: string; priority: number; quiet: boolean }>(`SELECT r.id,r.priority,(s.last_interactive_at IS NULL OR s.last_interactive_at<=now()-($2*interval '1 millisecond')) AS quiet
        FROM ollama_requests r JOIN ollama_gpu_state s USING(resource) WHERE resource=$1 AND status='queued' ORDER BY priority DESC,created_at,id LIMIT 1`,[this.resource,this.quietMs]);
      const row = next.rows[0];
      const eligible = !active.rowCount && row?.id===id && (row.priority===100 || row.quiet);
      const acquired = eligible && (await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ollama-owned:'+this.resource])).rows[0].locked;
      if (acquired) {
        await client.query("UPDATE ollama_requests SET status='running',started_at=COALESCE(started_at,now()),heartbeat_at=now() WHERE id=$1",[id]);
        if (row.priority===100) await client.query('UPDATE ollama_gpu_state SET last_interactive_at=now() WHERE resource=$1',[this.resource]);
      }
      await client.query('COMMIT'); owned=!!acquired; return owned ? client : null;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      finally { client.release(true); owned=true; }
      throw error;
    }
    finally { if (!owned) client.release(); }
  }

  async run<T>(job: Job,work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    job.signal.throwIfAborted();
    const client = await this.database.connect();
    let id: string;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.resource]);
      await client.query("DELETE FROM ollama_requests WHERE finished_at<now()-interval '7 days'");
      await client.query("UPDATE ollama_requests SET status='interrupted',finished_at=now() WHERE resource=$1 AND status IN ('queued','running') AND heartbeat_at<now()-interval '75 seconds'",[this.resource]);
      const count = await client.query<{ total: number }>("SELECT count(*)::int AS total FROM ollama_requests WHERE resource=$1 AND status IN ('queued','running')",[this.resource]);
      if (count.rows[0].total>=12) throw Error('Ollama queue is full');
      await client.query('INSERT INTO ollama_gpu_state(resource) VALUES($1) ON CONFLICT DO NOTHING',[this.resource]);
      id = (await client.query<{ id: string }>('INSERT INTO ollama_requests(resource,model,priority) VALUES($1,$2,$3) RETURNING id',[this.resource,job.model,job.interactive ? 100 : 0])).rows[0].id;
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    let finalStatus = 'failed';
    try {
      while (true) {
        job.signal.throwIfAborted();
        await this.database.query('UPDATE ollama_requests SET heartbeat_at=now() WHERE id=$1',[id]);
        const owner = await this.claim(id);
        if (!owner) { await delay(this.pollMs,undefined,{ signal: job.signal }); continue; }
        const interrupted = new AbortController();
        const monitorStop = new AbortController();
        // Keep ownership through cancellation and model cleanup. Never let a new
        // request enter Ollama while the old background response is still read.
        const monitor = (async () => {
          try {
            while (!monitorStop.signal.aborted) {
              await delay(this.pollMs,undefined,{ signal: monitorStop.signal });
              const held = await owner.query("UPDATE ollama_requests SET heartbeat_at=now() WHERE id=$1 AND status='running' RETURNING id",[id]);
              if (!held.rowCount) throw Error('Ollama GPU lease lost');
              if (!job.interactive) {
                const chat = await this.database.query("SELECT 1 FROM ollama_requests WHERE resource=$1 AND priority=100 AND status='queued' LIMIT 1",[this.resource]);
                if (chat.rowCount) interrupted.abort(new YieldToChat('Background request yielded to chat'));
              }
            }
          } catch (error) { if (!monitorStop.signal.aborted) interrupted.abort(error); }
        })();
        let yielded = false;
        try {
          const result = await work(AbortSignal.any([job.signal,interrupted.signal]));
          job.signal.throwIfAborted();
          if (interrupted.signal.aborted) throw interrupted.signal.reason;
          finalStatus='completed'; return result;
        } catch (error) {
          yielded = interrupted.signal.reason instanceof YieldToChat && !job.signal.aborted;
          if (!yielded) throw error;
        } finally {
          try { if (job.cleanup) await job.cleanup(); }
          finally {
            monitorStop.abort(); await monitor;
            let unlocked = false;
            try { await owner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ollama-owned:'+this.resource]); unlocked=true; }
            finally { owner.release(!unlocked); }
          }
        }
        if (yielded) await this.database.query("UPDATE ollama_requests SET status='queued',preemptions=preemptions+1,heartbeat_at=now() WHERE id=$1",[id]);
      }
    } catch (error) {
      finalStatus=job.signal.aborted ? 'cancelled' : 'failed'; throw error;
    } finally {
      if (job.interactive) await this.database.query('UPDATE ollama_gpu_state SET last_interactive_at=now() WHERE resource=$1',[this.resource]);
      await this.database.query('UPDATE ollama_requests SET status=$2,finished_at=now() WHERE id=$1',[id,finalStatus]);
    }
  }
}

export const ollamaQueue = new OllamaQueue();
