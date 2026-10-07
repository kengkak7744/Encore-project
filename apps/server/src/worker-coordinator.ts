export type WorkerTask = { name: string; intervalMs: number; run: () => Promise<unknown> };

export function createWorkerCoordinator(tasks: WorkerTask[], onError: (name: string, error: unknown) => void) {
  const lanes = tasks.map(task => ({ task,running: false,nextAt: -Infinity }));
  return { tick(now = Date.now()) {
    for (const lane of lanes) {
      if (lane.running || now < lane.nextAt) continue;
      lane.running = true;
      lane.nextAt = now + lane.task.intervalMs;
      void Promise.resolve().then(lane.task.run)
        .catch(error => onError(lane.task.name,error))
        .finally(() => { lane.running = false; });
    }
  } };
}
