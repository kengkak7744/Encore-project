import { setTimeout as delay } from 'node:timers/promises';
import { config } from './config.js';
import { ollamaQueue } from './ollama-queue.js';

type ModelResponse = { message?: { content?: string }; embeddings?: number[][]; done_reason?: string; [key: string]: unknown };
const ownedModels = () => new Set([config.chatModel,config.embedModel,config.biographyModel]);

async function models(url: string,signal: AbortSignal): Promise<string[]> {
  const response = await fetch(url+'/api/ps',{ signal });
  if (!response.ok) throw Error('Ollama model status HTTP '+response.status);
  const data = await response.json() as { models?: { name: string }[] };
  if (!Array.isArray(data.models)) throw Error('Ollama returned invalid model status');
  return data.models.map(model => model.name);
}

async function releaseModel(url: string,model: string) {
  const signal = AbortSignal.timeout(20_000);
  const response = await fetch(url+'/api/generate',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ model,keep_alive: 0 }),signal });
  if (!response.ok) throw Error('Ollama unload HTTP '+response.status);
  await response.json();
  while ((await models(url,signal)).includes(model)) await delay(100,undefined,{ signal });
}

export async function ollamaJson(url: string,path: '/api/chat' | '/api/embed',body: { model: string; [key: string]: unknown },options: { interactive?: boolean; signal?: AbortSignal; timeoutMs: number }): Promise<ModelResponse> {
  const interactive = options.interactive===true;
  const signal = AbortSignal.any([options.signal || new AbortController().signal,AbortSignal.timeout(interactive ? options.timeoutMs : 60*60*1000)]);
  return ollamaQueue.run({ model: body.model,interactive,signal,cleanup: interactive ? undefined : () => releaseModel(url,body.model) },async activeSignal => {
    for (const model of await models(url,activeSignal)) if (model!==body.model && ownedModels().has(model)) await releaseModel(url,model);
    activeSignal.throwIfAborted();
    const response = await fetch(url+path,{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ ...body,keep_alive: interactive ? '5m' : 0 }),signal: AbortSignal.any([activeSignal,AbortSignal.timeout(options.timeoutMs)]) });
    if (!response.ok) throw Error('Ollama HTTP '+response.status);
    const data = await response.json() as ModelResponse;
    activeSignal.throwIfAborted(); return data;
  });
}
