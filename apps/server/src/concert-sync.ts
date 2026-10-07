import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm workspace commands run inside apps/server; the Compose settings live at root.
loadEnv({ path: new URL('../../../.env',import.meta.url), quiet: true });
const { migrate } = await import('./migrate.js');
const { syncConcerts } = await import('./ingest.js');
const { pool, query } = await import('./db.js');
const { config } = await import('./config.js');
if (config.concertReportDirectory) config.concertReportDirectory = resolve(fileURLToPath(new URL('../../../',import.meta.url)),config.concertReportDirectory);
const { writeConcertReport, startConcertMonitor } = await import('./concert-scheduler.js');

try {
  await migrate();
  if (process.argv.includes('--start-monitor')) {
    const reasonIndex = process.argv.indexOf('--reason');
    const reason = reasonIndex<0 ? '' : process.argv[reasonIndex+1] || '';
    console.log(JSON.stringify(await startConcertMonitor(reason),null,2));
    await writeConcertReport();
  } else if (process.argv.includes('--report')) {
    const report = await writeConcertReport();
    console.log(JSON.stringify({ directory: config.concertReportDirectory || null, report },null,2));
  } else {
    const started = new Date();
    await syncConcerts({ primaryOnly: true, sweep: process.argv.includes('--sweep') });
    console.log(JSON.stringify(await query(`SELECT source_name,status,items_seen,items_changed,error,metrics FROM sync_runs
      WHERE category='concert' AND started_at >= $1 ORDER BY started_at`,[started]),null,2));
  }
} finally { await pool.end(); }
