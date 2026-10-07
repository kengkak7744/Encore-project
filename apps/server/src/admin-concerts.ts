import { pool } from './db.js';
import { ArtistEditError } from './artist-editor.js';
import { automaticSlug, managementText } from './admin-management.js';

const columns: Record<string,string> = { title: 'title',description: 'description',venue: 'venue',city: 'city',countryCode: 'country_code',startsAt: 'starts_at',endsAt: 'ends_at',timeTba: 'time_tba',status: 'status',priceMin: 'price_min',priceMax: 'price_max',currency: 'currency',officialUrl: 'official_url' };
function value(key: string, input: unknown): unknown {
  if (key==='title') return managementText(input,'ชื่องาน',500);
  if (['description','venue','city'].includes(key)) { if (input===null || input==='') return null; return managementText(input,'ข้อมูลคอนเสิร์ต',key==='description' ? 20000 : 500); }
  if (key==='countryCode' && typeof input==='string' && /^[a-z]{2}$/i.test(input)) return input.toUpperCase();
  if (key==='currency' && typeof input==='string' && /^[a-z]{3}$/i.test(input)) return input.toUpperCase();
  if (key==='status' && ['scheduled','postponed','cancelled','completed','unknown'].includes(String(input))) return input;
  if (key==='timeTba' && typeof input==='boolean') return input;
  if (key==='priceMin' || key==='priceMax') { if (input===null) return null; if (typeof input==='number' && Number.isFinite(input) && input>=0 && input<=10000000) return input; }
  if (key==='startsAt' || key==='endsAt') {
    if (input===null) return null;
    if (typeof input==='string' && /(Z|[+-]\d{2}:\d{2})$/.test(input) && Number.isFinite(Date.parse(input))) return new Date(input).toISOString();
  }
  if (key==='officialUrl') {
    if (input===null || input==='') return null;
    try { const url = new URL(managementText(input,'ลิงก์ต้นทาง',2048)); if (url.protocol==='https:' && !url.username && !url.password) return url.href; } catch { /* Return the validation error below. */ }
  }
  throw new ArtistEditError('ข้อมูลคอนเสิร์ตไม่ถูกต้อง: '+key);
}
export async function saveManagedConcert(body: Record<string,unknown>, id?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = id ? (await client.query('SELECT *,updated_at::text AS edit_version FROM concerts WHERE id=$1 FOR UPDATE',[id])).rows[0] : null;
    if (id && !current) throw new ArtistEditError('ไม่พบคอนเสิร์ต',404);
    if (current && body.editVersion!==undefined && body.editVersion!==current.edit_version) throw new ArtistEditError('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',409);
    const entries = Object.keys(columns).filter(key => Object.hasOwn(body,key)).map(key => [columns[key],value(key,body[key])] as const);
    if (!entries.length) throw new ArtistEditError('ไม่มีข้อมูลที่ต้องแก้');
    const merged = { ...current,...Object.fromEntries(entries) };
    if (!merged.title) throw new ArtistEditError('กรุณากรอกชื่องาน');
    if (merged.price_min!=null && merged.price_max!=null && Number(merged.price_min)>Number(merged.price_max)) throw new ArtistEditError('ราคาต่ำสุดต้องไม่เกินราคาสูงสุด');
    if (merged.starts_at && merged.ends_at && new Date(merged.ends_at)<new Date(merged.starts_at)) throw new ArtistEditError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    let saved;
    if (id) {
      saved = (await client.query('UPDATE concerts SET '+entries.map(([column],index) => column+'=$'+(index+1)).join(',')+',manual_override=true,last_verified_at=now(),updated_at=now() WHERE id=$'+(entries.length+1)+' RETURNING *,updated_at::text AS edit_version',[...entries.map(([,item]) => item),id])).rows[0];
      if (Object.hasOwn(body,'status')) await client.query('UPDATE concert_performances SET status=$2,updated_at=now() WHERE concert_id=$1 AND is_current',[id,saved.status]);
      // A single round follows the corrected parent date; multi-round events are edited individually.
      const rounds = (await client.query('SELECT id FROM concert_performances WHERE concert_id=$1 AND is_current',[id])).rows;
      if (rounds.length===1 && saved.starts_at && Object.hasOwn(body,'startsAt')) await client.query('UPDATE concert_performances SET starts_at=$2,ends_at=$3,time_tba=$4,updated_at=now() WHERE id=$1',[rounds[0].id,saved.starts_at,saved.ends_at,saved.time_tba]);
    } else {
      await client.query('SELECT pg_advisory_xact_lock(6210424)');
      const base = automaticSlug(String(merged.title),body.slug), values = entries.map(([,item]) => item);
      let slug=base, suffix=2;
      while ((await client.query('SELECT 1 FROM concerts WHERE slug=$1',[slug])).rowCount) { if (body.slug) throw new ArtistEditError('Slug ซ้ำ',409); slug=base+'-'+suffix++; }
      saved = (await client.query('INSERT INTO concerts(slug,'+entries.map(([column]) => column).join(',')+',manual_override,last_verified_at) VALUES($1,'+values.map((_,index) => '$'+(index+2)).join(',')+',true,now()) RETURNING *,updated_at::text AS edit_version',[slug,...values])).rows[0];
      if (saved.starts_at) await client.query('INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url) VALUES($1,$2,$3,$4,$5,$6)',[saved.id,saved.starts_at,saved.ends_at,saved.time_tba,saved.status,saved.official_url]);
    }
    await client.query('COMMIT'); return saved;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function saveManagedPerformance(concertId: string, body: Record<string,unknown>, performanceId?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await client.query('SELECT id FROM concerts WHERE id=$1 FOR UPDATE',[concertId])).rowCount) throw new ArtistEditError('ไม่พบคอนเสิร์ต',404);
    const current = performanceId ? (await client.query('SELECT * FROM concert_performances WHERE id=$1 AND concert_id=$2',[performanceId,concertId])).rows[0] : null;
    if (performanceId && !current) throw new ArtistEditError('ไม่พบรอบแสดง',404);
    const start = value('startsAt',body.startsAt ?? current?.starts_at?.toISOString()), end = value('endsAt',body.endsAt === undefined ? current?.ends_at?.toISOString() || null : body.endsAt);
    if (!start || (end && new Date(String(end))<new Date(String(start)))) throw new ArtistEditError('วันเวลารอบแสดงไม่ถูกต้อง');
    const status = value('status',body.status ?? current?.status ?? 'scheduled'), timeTba = value('timeTba',body.timeTba ?? current?.time_tba ?? false);
    const source = value('officialUrl',body.sourceUrl === undefined ? current?.source_url || null : body.sourceUrl);
    const label = body.label === undefined ? current?.performance_label || null : body.label ? managementText(body.label,'ชื่อรอบแสดง',300) : null;
    const isCurrent = body.isCurrent ?? current?.is_current ?? true;
    if (typeof isCurrent!=='boolean') throw new ArtistEditError('สถานะรอบแสดงไม่ถูกต้อง');
    const params = [concertId,start,end,timeTba,status,source,label,isCurrent];
    const saved = performanceId ? (await client.query('UPDATE concert_performances SET starts_at=$2,ends_at=$3,time_tba=$4,status=$5,source_url=$6,performance_label=$7,is_current=$8,updated_at=now() WHERE concert_id=$1 AND id=$9 RETURNING *',[...params,performanceId])).rows[0]
      : (await client.query('INSERT INTO concert_performances(concert_id,starts_at,ends_at,time_tba,status,source_url,performance_label,is_current) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(concert_id,starts_at) DO UPDATE SET ends_at=EXCLUDED.ends_at,time_tba=EXCLUDED.time_tba,status=EXCLUDED.status,source_url=EXCLUDED.source_url,performance_label=EXCLUDED.performance_label,is_current=EXCLUDED.is_current,updated_at=now() RETURNING *',params)).rows[0];
    await client.query(`UPDATE concerts SET manual_override=true,last_verified_at=now(),updated_at=now() WHERE id=$1`,[concertId]);
    await client.query(`UPDATE concerts SET starts_at=p.start,ends_at=p.finish,time_tba=p.tba FROM
      (SELECT min(starts_at) AS start,max(ends_at) AS finish,bool_and(time_tba) AS tba FROM concert_performances WHERE concert_id=$1 AND is_current) p
      WHERE id=$1 AND p.start IS NOT NULL`,[concertId]);
    await client.query('COMMIT'); return saved;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
