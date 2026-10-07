import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import test from 'node:test';
import { OllamaQueue } from './ollama-queue.js';

test('Shared GPU priority, cancellation and worker recovery',{ skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = process.env.INGEST_TEST_DATABASE_URL!;
  if (!new URL(url).pathname.includes('test')) throw Error('GPU tests require an isolated database');
  const schema = 'gpu_queue_'+randomUUID().replaceAll('-','');
  const admin = new pg.Pool({ connectionString: url });
  await admin.query('CREATE SCHEMA '+schema);
  const database = new pg.Pool({ connectionString: url,options: '-c search_path='+schema+',public' });
  try {
    await database.query(await readFile(new URL('../sql/020_ollama_queue.sql',import.meta.url),'utf8'));
    const reset = () => database.query('TRUNCATE ollama_requests,ollama_gpu_state');
    const api = new OllamaQueue(database,'same-device',10,60);
    const worker = new OllamaQueue(database,'same-device',10,60);
    const signal = () => AbortSignal.timeout(5000);
    await t.test('Chat cancels background, waits for cleanup, then background resumes the same request after quiet time',async () => {
      await reset(); const order: string[] = []; let attempts=0;
      let started!: () => void; const active = new Promise<void>(resolve => { started=resolve; });
      const background = worker.run({ model: '27b',interactive: false,signal: signal(),cleanup: async () => { order.push('cleanup'); await delay(20); } },async activeSignal => {
        attempts++; order.push('background'+attempts); started();
        if (attempts===1) await delay(4000,undefined,{ signal: activeSignal });
        return 'complete biography';
      });
      await active;
      let finishedAt=0;
      const chat = api.run({ model: '8b',interactive: true,signal: signal() },async () => {
        order.push('chat'); assert.equal(order[1],'cleanup'); finishedAt=Date.now(); return 'Thai answer';
      });
      assert.equal(await chat,'Thai answer'); assert.equal(await background,'complete biography');
      assert.deepEqual(order,['background1','cleanup','chat','background2','cleanup']);
      assert.ok(Date.now()-finishedAt>=60);
      const rows = (await database.query('SELECT priority,status,preemptions FROM ollama_requests ORDER BY priority')).rows;
      assert.equal(rows.length,2); assert.equal(rows[0].preemptions,1); assert.ok(rows.every(row => row.status==='completed'));
    });
    await t.test('Waiting cancellation never calls Ollama and active chat is not interrupted by later work',async () => {
      await reset(); let release!: () => void,started!: () => void;
      const gate = new Promise<void>(resolve => { release=resolve; });
      const active = new Promise<void>(resolve => { started=resolve; });
      const first = api.run({ model: '8b',interactive: true,signal: signal() },async () => { started(); await gate; return 1; });
      await active;
      const cancelled = new AbortController(); let calls=0;
      const next = worker.run({ model: '27b',interactive: false,signal: cancelled.signal },async () => { calls++; });
      await delay(30); cancelled.abort(new Error('Window ended'));
      await assert.rejects(next,/Window ended|aborted/); assert.equal(calls,0); release(); assert.equal(await first,1);
      assert.equal((await database.query("SELECT count(*)::int AS total FROM ollama_requests WHERE status='cancelled'")).rows[0].total,1);
    });
    await t.test('A failed call releases ownership and expired process leases are recovered without successful fake history',async () => {
      await reset(); let cleanup=0;
      await assert.rejects(worker.run({ model: '27b',interactive: false,signal: signal(),cleanup: async () => { cleanup++; } },async () => { throw Error('Ollama offline'); }),/offline/);
      assert.equal(cleanup,1);
      await database.query("INSERT INTO ollama_requests(resource,model,priority,status,heartbeat_at) VALUES('same-device','dead-worker',0,'running',now()-interval '76 seconds')");
      assert.equal(await api.run({ model: '8b',interactive: true,signal: signal() },async () => 'recovered'),'recovered');
      const rows = (await database.query('SELECT status FROM ollama_requests')).rows.map(row => row.status);
      assert.ok(rows.includes('failed')); assert.ok(rows.includes('interrupted')); assert.ok(rows.includes('completed'));
    });
    await t.test('Different URL callers share the resource while the queue rejects overload',async () => {
      await reset();
      await database.query("INSERT INTO ollama_requests(resource,model,priority) SELECT 'same-device','queued',100 FROM generate_series(1,12)");
      await assert.rejects(api.run({ model: '8b',interactive: true,signal: signal() },async () => 'must not run'),/full/);
      assert.equal((await database.query('SELECT count(*)::int AS total FROM ollama_requests')).rows[0].total,12);
    });
    await t.test('An expired heartbeat cannot grant GPU access while the old session still owns it',async () => {
      await reset(); const old = await database.connect(); let calls=0;
      try {
        await old.query("SELECT pg_advisory_lock(hashtextextended('ollama-owned:same-device',0))");
        await old.query("INSERT INTO ollama_requests(resource,model,priority,status,heartbeat_at) VALUES('same-device','slow-owner',0,'running',now()-interval '76 seconds')");
        const next=api.run({ model: '8b',interactive: true,signal: signal() },async () => { calls++; return 'safe handoff'; });
        await delay(100); assert.equal(calls,0);
        await old.query("SELECT pg_advisory_unlock(hashtextextended('ollama-owned:same-device',0))");
        assert.equal(await next,'safe handoff'); assert.equal(calls,1);
      } finally { old.release(true); }
    });
  } finally { await database.end(); await admin.query('DROP SCHEMA '+schema+' CASCADE'); await admin.end(); }
});
