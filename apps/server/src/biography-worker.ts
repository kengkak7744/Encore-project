import { migrate } from './migrate.js';
import { pool } from './db.js';
import { runBiographyCycle } from './biography-jobs.js';

await migrate();
const shutdown = new AbortController();
let running: Promise<unknown> | null = null;
const tick = () => {
  if (running || shutdown.signal.aborted) return;
  running = runBiographyCycle({ signal: shutdown.signal }).catch((error) => console.error('Biography worker failed:', error)).finally(() => { running = null; });
};
const timer = setInterval(tick, 60_000);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    clearInterval(timer);
    shutdown.abort(new Error('Biography worker is stopping'));
    void (running || Promise.resolve()).finally(() => pool.end());
  });
}
tick();
