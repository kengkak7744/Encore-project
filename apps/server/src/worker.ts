import { migrate } from './migrate.js';
import { runScheduledNews } from './social-scheduler.js';
import { config } from './config.js';
import { syncNews } from './ingest.js';
import { createWorkerCoordinator } from './worker-coordinator.js';
import { runScheduledAI, workerHeartbeat } from './worker-maintenance.js';
import { runScheduledConcerts, writeConcertReport } from './concert-scheduler.js';
import { writeInstagramReport } from './instagram-monitor.js';

await migrate();
await workerHeartbeat(true);
const worker = createWorkerCoordinator([
  { name: 'heartbeat',intervalMs: 60_000,run: () => workerHeartbeat() },
  { name: 'report',intervalMs: 60_000,run: writeConcertReport },
  { name: 'instagram-report',intervalMs: 300_000,run: writeInstagramReport },
  ...(config.concertSchedulerEnabled ? [{ name: 'concerts',intervalMs: 60_000,run: runScheduledConcerts }] : []),
  ...(config.socialSchedulerEnabled ? [
    { name: 'instagram',intervalMs: 1_000,run: () => syncNews({ platform: 'instagram' }) },
    { name: 'news',intervalMs: 60_000,run: () => runScheduledNews({ includeInstagram: false }) },
  ] : []),
  ...(config.concertSchedulerEnabled || config.socialSchedulerEnabled ? [{ name: 'ai',intervalMs: 60_000,run: () => runScheduledAI() }] : []),
],(name,error) => console.error(`Worker ${name} failed:`,error instanceof Error ? error.message : 'Unknown failure'));
// Start the timer before any slow collector/model completes. IG's persistent budget
// still enforces request spacing, per-account cadence and Meta cooldowns.
// Frequent local wakeups avoid adding a five-second rounding delay to each IG slot.
// The shared PostgreSQL budget still gates every external request and cooldown.
setInterval(() => worker.tick(),1_000);
worker.tick();
