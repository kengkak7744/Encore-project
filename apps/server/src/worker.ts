import { migrate } from './migrate.js';
import { syncNews } from './ingest.js';
import { enrichKnowledge, summarizeNews } from './knowledge.js';
import { config } from './config.js';

import { runScheduledConcerts, writeConcertReport } from './concert-scheduler.js';

await migrate();
let running = false;
let lastSocialRun = 0;
async function run() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    let didSync = false;
    if (config.concertSchedulerEnabled) didSync = await runScheduledConcerts();
    await writeConcertReport();
    if (config.socialSchedulerEnabled && now - lastSocialRun >= config.socialSyncIntervalMinutes * 60 * 1000) {
      lastSocialRun = now;
      await syncNews();
      didSync = true;
    }
    if (didSync) { await enrichKnowledge(); await summarizeNews(); }
  }
  catch (error) { console.error('Worker cycle failed:', error); }
  finally { running = false; }
}
await run();
setInterval(() => { void run(); }, 60 * 1000);
