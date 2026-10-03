import { createHash } from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';

async function embed(input: string): Promise<number[]> {
  const response = await fetch(config.ollamaUrl + '/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.embedModel, input }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Embedding API HTTP ' + response.status);
  const data = await response.json() as { embeddings?: number[][] };
  const vector = data.embeddings?.[0];
  if (!vector || vector.length !== 1024) throw new Error('Embedding dimension must be 1024');
  return vector;
}

export async function relevantKnowledge(question: string) {
  try {
    const vector = await embed(question);
    return await query<{ content: string; source_url: string | null }>(`SELECT k.content,
      CASE WHEN k.source_type='news' THEN (SELECT source_url FROM news_items WHERE id=k.source_id)
           WHEN k.source_type='concert' THEN (SELECT source_url FROM concert_sources WHERE concert_id=k.source_id ORDER BY fetched_at DESC LIMIT 1)
      END AS source_url
      FROM knowledge_chunks k WHERE k.embedding IS NOT NULL ORDER BY k.embedding <=> $1::vector LIMIT 8`, ['[' + vector.join(',') + ']']);
  } catch { return []; }
}

export async function enrichKnowledge() {
  const rows = await query<{ id: string; type: string; content: string; hash: string }>(`SELECT id,'concert' AS type,
    concat_ws(' | ',title,venue,city,starts_at::text,status,price_min::text,price_max::text,price_note) AS content,
    md5(concat_ws(' | ',title,venue,city,starts_at::text,status,price_min::text,price_max::text,price_note)) AS hash
    FROM concerts WHERE starts_at >= now() OR (time_tba AND (starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)
    UNION ALL SELECT id,'news' AS type,body AS content,md5(body) AS hash FROM news_items WHERE body IS NOT NULL
    LIMIT 100`);
  let done = 0;
  for (const row of rows) {
    if (done >= 20) break;
    const hash = createHash('sha256').update(row.type + ':' + row.id + ':' + row.hash).digest('hex');
    const current = await query('SELECT 1 FROM knowledge_chunks WHERE source_type=$1 AND source_id=$2 AND content_hash=$3', [row.type, row.id, hash]);
    if (current.length) continue;
    try {
      const vector = await embed(row.content);
      await query('DELETE FROM knowledge_chunks WHERE source_type=$1 AND source_id=$2', [row.type, row.id]);
      await query('INSERT INTO knowledge_chunks(source_type,source_id,content,content_hash,embedding) VALUES($1,$2,$3,$4,$5::vector)', [row.type, row.id, row.content, hash, '[' + vector.join(',') + ']']);
      done++;
    } catch (error) { console.warn('Knowledge enrichment unavailable:', error instanceof Error ? error.message : error); break; }
  }
}

export async function summarizeNews() {
  const rows = await query<{ id: string; body: string }>('SELECT id,body FROM news_items WHERE body IS NOT NULL AND summary IS NULL ORDER BY published_at DESC LIMIT 10');
  for (const row of rows) {
    try {
      const response = await fetch(config.ollamaUrl + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.chatModel, stream: false, options: { temperature: 0.1 }, messages: [{ role: 'system', content: 'สรุปโพสต์ศิลปินเป็นภาษาไทย 1 ประโยค โดยใช้เฉพาะข้อความที่ให้ ห้ามแต่งข้อเท็จจริง' }, { role: 'user', content: row.body.slice(0, 3000) }] }), signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw Error('Ollama HTTP ' + response.status);
      const data = await response.json() as { message?: { content?: string } };
      if (data.message?.content) await query('UPDATE news_items SET summary=$2 WHERE id=$1', [row.id, data.message.content.slice(0, 500)]);
    } catch { break; }
  }
}
