import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pool, one, query } from './db.js';
import { config } from './config.js';
import { syncConcerts } from './ingest.js';
import { buildConcertMonitor, concertMonitorCsv, concertMonitorMarkdown, type MonitorRun, type MonitorWindow } from './concert-monitor.js';

const hour = 3_600_000;
export async function getConcertMonitor() {
  const window = await one<MonitorWindow>('SELECT id,started_at,ends_at FROM concert_monitor_windows ORDER BY id DESC LIMIT 1');
  const runs = window ? await query<MonitorRun>(`SELECT r.source_name,c.scheduled_at,r.started_at,r.finished_at,r.status,r.items_seen,r.items_changed,r.error,r.metrics
    FROM sync_runs r JOIN concert_sync_cycles c ON c.id=r.cycle_id
    WHERE c.scheduled_at >= $1 AND c.scheduled_at < $2 ORDER BY r.started_at`, [window.started_at,window.ends_at]) : [];
  return buildConcertMonitor(window,runs);
}
export async function writeConcertReport() {
  const report = await getConcertMonitor();
  if (!report || !config.concertReportDirectory) return report;
  await mkdir(config.concertReportDirectory, { recursive: true });
  for (const [extension,body] of [['json',JSON.stringify(report,null,2)],['csv',concertMonitorCsv(report)],['md',concertMonitorMarkdown(report)]]) {
    const path = join(config.concertReportDirectory,'concert-monitor-latest.' + extension);
    const temporary = path + '.' + randomUUID() + '.tmp';
    await writeFile(temporary,body,'utf8');
    await rename(temporary,path);
  }
  return report;
}
export async function runScheduledConcerts() {
  const client = await pool.connect();
  let locked = false;
  let cycleId: number | null = null;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(6210417) AS locked')).rows[0].locked;
    if (!locked) return false;
    // The dedicated lock connection proves no other instance still owns these runs.
    await client.query(`UPDATE sync_runs SET status='failed',finished_at=now(),error='Worker stopped before scheduled cycle finished'
      WHERE status='running' AND cycle_id IN(SELECT id FROM concert_sync_cycles WHERE status='running')`);
    await client.query(`UPDATE concert_sync_cycles SET status='failed',finished_at=now(),error='Worker stopped before cycle finished' WHERE status='running'`);
    const start = new Date(Math.ceil(Date.now() / hour) * hour).toISOString();
    await client.query(`INSERT INTO concert_monitor_windows(started_at,ends_at) SELECT $1::timestamptz,$1::timestamptz+interval '7 days'
      WHERE NOT EXISTS(SELECT 1 FROM concert_monitor_windows)`, [start]);
    await writeConcertReport();
    const scheduled = new Date(Math.floor(Date.now() / hour) * hour).toISOString();
    const cycle = await client.query(`INSERT INTO concert_sync_cycles(scheduled_at) VALUES($1) ON CONFLICT(scheduled_at) DO NOTHING RETURNING id`, [scheduled]);
    if (!cycle.rows.length) return false;
    cycleId = cycle.rows[0].id;
    await syncConcerts({ cycleId: cycleId! });
    const failed = await one<{ count: number }>(`SELECT count(*)::integer AS count FROM sync_runs WHERE cycle_id=$1 AND status<>'success'`, [cycleId]);
    await client.query('UPDATE concert_sync_cycles SET finished_at=now(),status=$2 WHERE id=$1',[cycleId,failed?.count ? 'failed' : 'success']);
    return true;
  } catch (error) {
    if (cycleId) await client.query("UPDATE concert_sync_cycles SET finished_at=now(),status='failed',error=$2 WHERE id=$1",[cycleId,error instanceof Error ? error.message.slice(0,500) : 'Scheduled cycle failed']);
    throw error;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(6210417)');
    client.release();
  }
}
