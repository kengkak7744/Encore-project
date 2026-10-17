import test from 'node:test';import assert from 'node:assert/strict';
import {ollamaJson} from './ollama.js';import {ollamaQueue} from './ollama-queue.js';
import {ollamaHttpError} from './ollama-errors.js';

test('diagnostics preserve UTF8 across chunks, redact credentials and bound oversized bodies',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify({error:'เกิดข้อผิดพลาด token=private-token'}));
 const stream=new ReadableStream<Uint8Array>({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}});
 const error=await ollamaHttpError(new Response(stream,{status:500}));
 assert.match(error.detail,/เกิดข้อผิดพลาด/);assert.match(error.detail,/<REDACTED>/);assert.ok(!error.detail.includes('private-token'));
 assert.equal((await ollamaHttpError(new Response('x'.repeat(9000),{status:500}))).detail,'');
});

test('a biography retry budget retries a transient HTTP500 once through separate GPU ownership',async(t)=>{
 let calls=0,ownership=0;
 t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>{ownership++;return work(job.signal);});
 t.mock.method(globalThis,'fetch',async(url:unknown)=>{
  if(String(url).endsWith('/api/ps'))return Response.json({models:[]});
  calls++;return calls===1?Response.json({error:'runner process unexpectedly terminated'},{status:500}):Response.json({message:{content:'{}'}});
 });
 const retryBudget={remaining:1};
 const result=await ollamaJson('http://localhost:11434','/api/chat',{model:'fixture'},{timeoutMs:1000,retryBudget});
 assert.equal(result.message?.content,'{}');assert.equal(calls,2);assert.equal(ownership,2);assert.equal(retryBudget.remaining,0);
});

test('terminal HTTP errors retain bounded redacted diagnostics and never retry',async(t)=>{
 t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
 for(const [status,detail]of [[500,'out of memory token=private-token'],[400,'invalid grammar api_key=private-key'],[401,'unauthorized']] as const){
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url:unknown)=>{if(String(url).endsWith('/api/ps'))return Response.json({models:[]});calls++;return Response.json({error:detail},{status});});
  await assert.rejects(ollamaJson('http://localhost:11434','/api/chat',{model:'fixture'},{timeoutMs:1000,retryBudget:{remaining:1}}),e=>e instanceof Error&&e.message.includes('Ollama HTTP '+status)&&e.message.includes(detail.split(' token=')[0].split(' api_key=')[0])&&!e.message.includes('private-'));
  assert.equal(calls,1);
 }
});

test('a second server failure or interactive request cannot consume another retry',async(t)=>{
 t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
 let calls=0;
 t.mock.method(globalThis,'fetch',async(url:unknown)=>{if(String(url).endsWith('/api/ps'))return Response.json({models:[]});calls++;return Response.json({error:'runner terminated'},{status:500});});
 const retryBudget={remaining:1};
 await assert.rejects(ollamaJson('http://localhost:11434','/api/chat',{model:'fixture'},{timeoutMs:1000,retryBudget}),/HTTP 500/);
 assert.equal(calls,2);assert.equal(retryBudget.remaining,0);
 await assert.rejects(ollamaJson('http://localhost:11434','/api/chat',{model:'fixture'},{timeoutMs:1000,retryBudget:{remaining:1},interactive:true}),/HTTP 500/);
 assert.equal(calls,3);
});
