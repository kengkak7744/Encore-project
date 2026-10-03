import { config } from './config.js';

// Pinned Unsloth text weights: omit the 931 MB vision projector for this text-only job.
const parent = 'hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS';
const digest = 'sha256:40fac4050e940397dbf13087afd50f4734a11805bf9d65ef8ddd7483470e6199';
const endpoint = config.biographyOllamaUrl;
const url = new URL(endpoint);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Run biography:setup on the machine running Ollama with BIOGRAPHY_OLLAMA_URL=http://localhost:11434');

async function statusRequest(path: string, body: object) {
  const response = await fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: AbortSignal.timeout(30 * 60_000) });
  if (!response.ok || !response.body) throw new Error('Ollama setup HTTP ' + response.status);
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let last = '';
  const report = (line: string) => {
    if (!line.trim()) return;
    const item = JSON.parse(line) as { status?: string; error?: string; completed?: number; total?: number };
    if (item.error) throw new Error(item.error);
    const progress = item.total ? ' ' + Math.floor((item.completed || 0) / item.total * 10) * 10 + '%' : '';
    const label = (item.status || 'working') + progress;
    if (label !== last) { console.log(label); last = label; }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) report(line);
    }
    buffer += decoder.decode(); if (buffer.trim()) report(buffer);
  } finally { await reader.cancel(); }
}

try {
  console.log('Installing biography model into native Ollama at ' + endpoint);
  await statusRequest('/api/pull', { model: parent });
  const present = await fetch(endpoint + '/api/blobs/' + digest, { method: 'HEAD' });
  if (!present.ok) throw new Error('Pinned text weights are absent. Upstream may have changed; verify the model digest before updating it.');
  await statusRequest('/api/create', { model: config.biographyModel, files: { 'Qwen3.8-27B-UD-IQ4_XS.gguf': digest }, parameters: { num_ctx: 8192, temperature: 0.1, num_predict: 2400 }, license: 'Apache-2.0' });
  console.log('Ready: ' + config.biographyModel + ' (text only; chatbot model is unchanged)');
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
