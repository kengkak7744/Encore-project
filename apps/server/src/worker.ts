import { migrate } from './migrate.js';
import { syncConcerts, syncNews } from './ingest.js';
import { enrichKnowledge, summarizeNews } from './knowledge.js';
import { config } from './config.js';

await migrate();
let running = false;
let lastConcertRun = 0;
let lastSocialRun = 0;
async function run() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    let didSync = false;
    if (config.concertSchedulerEnabled && now - lastConcertRun >= 60 * 60 * 1000) {
      lastConcertRun = now;
      await syncConcerts();
      didSync = true;
    }
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
