import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkerCoordinator } from './worker-coordinator.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
test('Instagram keeps its cadence while concert collection and AI are pending, without overlapping either',async () => {
  let finishConcerts!: () => void, finishAI!: () => void;
  const concerts = new Promise<void>(resolve => { finishConcerts = resolve; });
  const ai = new Promise<void>(resolve => { finishAI = resolve; });
  const calls = { concerts: 0, instagram: 0, ai: 0 };
  const errors: unknown[] = [];
  const worker = createWorkerCoordinator([
    { name: 'concerts',intervalMs: 60_000,run: async () => { calls.concerts++; await concerts; } },
    { name: 'instagram',intervalMs: 5_000,run: async () => { calls.instagram++; } },
    { name: 'ai',intervalMs: 60_000,run: async () => { calls.ai++; await ai; } },
  ],(_name,error) => errors.push(error));
  void worker.tick(0); await flush();
  void worker.tick(60_000); await flush();
  const observed = { ...calls };
  finishConcerts(); finishAI(); await flush();
  assert.deepEqual(observed,{ concerts: 1,instagram: 2,ai: 1 });
  assert.deepEqual(errors,[]);
});

test('One failed lane does not stop other lanes or immediate retries before their interval',async () => {
  let checks = 0;
  const errors: string[] = [];
  const worker = createWorkerCoordinator([
    { name: 'broken',intervalMs: 60_000,run: async () => { throw Error('offline'); } },
    { name: 'instagram',intervalMs: 5_000,run: async () => { checks++; } },
  ],name => { errors.push(name); });
  void worker.tick(0); await flush();
  void worker.tick(4_999); await flush();
  void worker.tick(5_000); await flush();
  assert.equal(checks,2);
  assert.deepEqual(errors,['broken']);
});
