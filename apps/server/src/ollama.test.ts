import assert from 'node:assert/strict';
import test from 'node:test';
import { ollamaJson } from './ollama.js';
import { ollamaQueue } from './ollama-queue.js';
import { config } from './config.js';

test('Model switching releases project models before inference and keeps unrelated models untouched',async t => {
  const calls: { url: string; body?: any }[]=[];
  let loaded=[config.biographyModel,'unrelated-user-model'];
  t.mock.method(ollamaQueue,'run',async (job: { signal: AbortSignal; cleanup?: () => Promise<void> },work: (signal: AbortSignal) => Promise<unknown>) => { try { return await work(job.signal); } finally { await job.cleanup?.(); } });
  t.mock.method(globalThis,'fetch',async (url: unknown,options?: RequestInit) => {
    const body=options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ url: String(url),body });
    if (String(url).endsWith('/api/ps')) return Response.json({ models: loaded.map(name => ({ name })) });
    if (String(url).endsWith('/api/generate')) { loaded=loaded.filter(model => model!==body.model); return Response.json({ done: true }); }
    assert.ok(!loaded.includes(config.biographyModel));
    assert.equal(body.keep_alive,'5m');
    return Response.json({ message: { content: 'คำตอบภาษาไทย' } });
  });
  const result=await ollamaJson('http://localhost:11434','/api/chat',{ model: config.chatModel,messages: [] },{ interactive: true,timeoutMs: 1000 });
  assert.equal(result.message?.content,'คำตอบภาษาไทย');
  assert.deepEqual(calls.filter(call => call.url.endsWith('/api/generate')).map(call => call.body.model),[config.biographyModel]);
  assert.ok(loaded.includes('unrelated-user-model'));
});

test('A background response holds GPU ownership until the entire JSON body is read, then releases its model',async t => {
  const order: string[]=[];
  t.mock.method(ollamaQueue,'run',async (job: { signal: AbortSignal; cleanup?: () => Promise<void> },work: (signal: AbortSignal) => Promise<unknown>) => { try { return await work(job.signal); } finally { await job.cleanup?.(); order.push('release-ownership'); } });
  t.mock.method(globalThis,'fetch',async (url: unknown,options?: RequestInit) => {
    if (String(url).endsWith('/api/ps')) return Response.json({ models: [] });
    if (String(url).endsWith('/api/generate')) { order.push('unload'); return Response.json({ done: true }); }
    assert.equal(JSON.parse(String(options?.body)).keep_alive,0);
    const response=Response.json({ embeddings: [[1]] });
    const read=response.json.bind(response);
    response.json=async () => { order.push('read-body'); return read(); };
    return response;
  });
  await ollamaJson('http://localhost:11434','/api/embed',{ model: config.embedModel,input: 'text' },{ timeoutMs: 1000 });
  assert.deepEqual(order,['read-body','unload','release-ownership']);
});
