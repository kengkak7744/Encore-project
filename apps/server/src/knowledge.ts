import { config } from './config.js';
import { query } from './db.js';
import { ollamaJson } from './ollama.js';

async function embed(input:string,signal?:AbortSignal,interactive=false):Promise<number[]> {
  const data=await ollamaJson(config.ollamaUrl,'/api/embed',{model:config.embedModel,input},{timeoutMs:30000,signal,interactive});
  const vector=data.embeddings?.[0];
  if(!vector||vector.length!==1024||!vector.every(value=>typeof value==='number'&&Number.isFinite(value)))throw Error('Embedding must contain 1024 finite numbers');
  return vector;
}

// Indexing and retrieval use the same live content/hash definition. Changed,
// hidden or deleted records cannot return an old embedded version of the facts.
const eligibleKnowledge=`WITH documents AS (
  SELECT c.id,'concert' AS type,
    concat_ws(' | ',c.title,c.venue,c.city,c.starts_at::text,c.status,c.price_min::text,c.price_max::text,c.currency,c.price_note) AS content,
    c.updated_at AS changed_at
    FROM concerts c WHERE c.starts_at>=now() OR(c.time_tba AND(c.starts_at AT TIME ZONE 'Asia/Bangkok')::date>=(now() AT TIME ZONE 'Asia/Bangkok')::date)
  UNION ALL SELECT n.id,'news',concat_ws(' | ',a.name,n.title,left(n.body,6000)),n.fetched_at
    FROM news_items n JOIN artists a ON a.id=n.artist_id WHERE n.body IS NOT NULL AND NOT n.hidden
),eligible AS (
  SELECT *,encode(sha256(convert_to(type||':'||id::text||':'||md5(content),'UTF8')),'hex') AS hash FROM documents
) `;

export async function relevantKnowledge(question:string,options:{artistId?:string;signal?:AbortSignal}={}) {
  const vector=await embed(question,options.signal,true);
  return query<{content:string;source_url:string;source_type:string}>(eligibleKnowledge+`SELECT e.content,k.source_type,
    CASE WHEN e.type='news' THEN(SELECT source_url FROM news_items WHERE id=e.id)
      ELSE COALESCE((SELECT source_url FROM concert_sources WHERE concert_id=e.id ORDER BY CASE source_role WHEN 'organizer' THEN 0 ELSE 1 END,fetched_at DESC LIMIT 1),(SELECT official_url FROM concerts WHERE id=e.id)) END AS source_url
    FROM eligible e JOIN knowledge_chunks k ON k.source_type=e.type AND k.source_id=e.id AND k.content_hash=e.hash
    WHERE k.embedding IS NOT NULL AND (k.embedding<=>$1::vector)<0.35
      AND($2::uuid IS NULL OR(e.type='news' AND EXISTS(SELECT 1 FROM news_items n WHERE n.id=e.id AND n.artist_id=$2))
        OR(e.type='concert' AND EXISTS(SELECT 1 FROM concert_artists ca WHERE ca.concert_id=e.id AND ca.artist_id=$2)))
    ORDER BY k.embedding<=>$1::vector,e.id LIMIT 5`,['['+vector.join(',')+']',options.artistId || null]);
}

export async function enrichKnowledge() {
  const rows=await query<{id:string;type:string;content:string;hash:string}>(eligibleKnowledge+`,pending AS (
    SELECT e.*,row_number() OVER(PARTITION BY e.type ORDER BY e.changed_at,e.id) AS position FROM eligible e
    WHERE NOT EXISTS(SELECT 1 FROM knowledge_chunks k WHERE k.source_type=e.type AND k.source_id=e.id AND k.content_hash=e.hash AND k.embedding IS NOT NULL)
  ) SELECT * FROM pending ORDER BY position,type LIMIT 20`);
  for(const row of rows){
    const vector=await embed(row.content);
    await query(`INSERT INTO knowledge_chunks(source_type,source_id,content,content_hash,embedding) VALUES($1,$2,$3,$4,$5::vector)
      ON CONFLICT(source_type,source_id) DO UPDATE SET content=EXCLUDED.content,content_hash=EXCLUDED.content_hash,embedding=EXCLUDED.embedding,updated_at=now()`,
      [row.type,row.id,row.content,row.hash,'['+vector.join(',')+']']);
  }
  return rows.length;
}

export async function summarizeNews() {
  const rows=await query<{id:string;body:string}>('SELECT id,body FROM news_items WHERE body IS NOT NULL AND summary IS NULL AND NOT hidden ORDER BY published_at DESC LIMIT 10');
  for(const row of rows){
    const data=await ollamaJson(config.ollamaUrl,'/api/chat',{model:config.chatModel,stream:false,think:false,options:{temperature:0.1,num_ctx:4096,num_predict:256},messages:[{role:'system',content:'สรุปโพสต์ศิลปินเป็นภาษาไทย 1 ประโยค โดยใช้เฉพาะข้อความที่ให้ ห้ามแต่งข้อเท็จจริง'},{role:'user',content:row.body.slice(0,3000)}]},{timeoutMs:60000});
    if(!data.message?.content)throw Error('News summary was empty');
    await query('UPDATE news_items SET summary=$2 WHERE id=$1 AND NOT hidden AND body=$3',[row.id,data.message.content.slice(0,500),row.body]);
  }
}
