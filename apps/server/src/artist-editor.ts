import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { imageCreditJoin, imageCreditSelect } from './artist-audit.js';

export class ArtistEditError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Section = { heading: string; body: string; sourceUrl: string; sourceLabel: string };
type Picture = { url?: string; file?: { contentType: string; data: Buffer }; creator: string; title: string; sourceUrl: string; license: string; licenseUrl: string; photoDate: string; caption: string; changes: string; rights: string };

function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new ArtistEditError(label + 'ไม่ถูกต้อง');
  return value.trim();
}
function https(value: unknown, label: string) {
  const raw = text(value,label,2048,true);
  try { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password) throw Error(); return url.href; }
  catch { throw new ArtistEditError(label + 'ต้องเป็น HTTPS URL'); }
}
function imageUrl(value: unknown) {
  const raw = text(value,'URL รูป',2048,true);
  if (/^\/artist-images\/[a-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(raw) || /^\/api\/artist-images\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw)) return raw;
  return https(raw,'URL รูป');
}
function picture(value: unknown): Picture | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new ArtistEditError('ข้อมูลรูปไม่ถูกต้อง');
  const input = value as Record<string,unknown>;
  if (input.confirmRights !== true || !['own','permission','license'].includes(String(input.rights))) throw new ArtistEditError('กรุณายืนยันสิทธิ์ใช้ภาพ');
  let file: Picture['file'];
  if (input.file) {
    if (input.url) throw new ArtistEditError('เลือกรูปจากไฟล์หรือ URL อย่างใดอย่างหนึ่ง');
    const upload = input.file as Record<string,unknown>;
    const contentType = String(upload.contentType);
    if (typeof upload.data === 'string' && upload.data.length > 2_796_204) throw new ArtistEditError('รูปต้องไม่เกิน 2 MB',413);
    const encoded = text(upload.data,'ไฟล์รูป',2_796_208,true);
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ArtistEditError('ข้อมูลไฟล์รูปไม่ถูกต้อง');
    const data = Buffer.from(encoded,'base64');
    if (data.length > 2_097_152) throw new ArtistEditError('รูปต้องไม่เกิน 2 MB',413);
    const valid = data.length >= 12 && (
      (contentType === 'image/png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (contentType === 'image/jpeg' && data.subarray(0,3).equals(Buffer.from([255,216,255]))) ||
      (contentType === 'image/webp' && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP'));
    if (!valid) throw new ArtistEditError('ใช้ไฟล์ JPG, PNG หรือ WebP ที่ถูกต้องเท่านั้น');
    file = { contentType,data };
  }
  const url = file ? undefined : imageUrl(input.url);
  const license = input.rights === 'own' ? 'ภาพถ่ายเอง — ผู้ดูแลอนุญาตให้แสดงใน Encore'
    : input.rights === 'permission' ? 'ได้รับอนุญาตให้แสดงใน Encore' : text(input.license,'ใบอนุญาต',200,true);
  return { url,file,creator: text(input.creator,'ชื่อผู้ถ่าย/เจ้าของภาพ',200,true),
    title: text(input.title,'ชื่อภาพ',500,true),sourceUrl: input.sourceUrl ? https(input.sourceUrl,'แหล่งภาพ') : '',
    license,licenseUrl: input.rights === 'license' ? https(input.licenseUrl,'ลิงก์ใบอนุญาต') : input.licenseUrl ? https(input.licenseUrl,'หลักฐานอนุญาต') : '',
    photoDate: text(input.photoDate ?? 'ไม่ทราบวันถ่าย','วันถ่าย',120,true),caption: text(input.caption ?? '','คำอธิบายภาพ',1000),
    changes: text(input.changes ?? 'แสดงภาพเต็มโดยไม่ตัดหรือแต่งภาพ','การปรับภาพ',1000),rights: String(input.rights) };
}

export async function editArtist(id: string, body: Record<string,unknown>) {
  const allowed: Record<string,string> = { name: 'name',nameEn: 'name_en',kind: 'kind',bio: 'bio',genres: 'genres',popularityRank: 'popularity_rank',popularitySourceUrl: 'popularity_source_url' };
  const entries = Object.entries(allowed).filter(([key]) => Object.hasOwn(body,key));
  const sectionsPresent = Object.hasOwn(body,'biography');
  const imagePresent = Object.hasOwn(body,'image') || Object.hasOwn(body,'imageUrl');
  if (!entries.length && !sectionsPresent && !imagePresent) throw new ArtistEditError('ไม่มีข้อมูลที่ต้องแก้');
  const values = entries.map(([key]) => {
    if (key === 'name') return text(body[key],'ชื่อศิลปิน',200,true);
    if (key === 'nameEn') return body[key] === null ? null : text(body[key],'ชื่อภาษาอังกฤษ',200);
    if (key === 'bio') return body[key] === null ? null : text(body[key],'ประวัติสั้น',10000);
    if (key === 'kind' && ['band','solo','member'].includes(String(body[key]))) return body[key];
    if (key === 'genres' && Array.isArray(body[key]) && body[key].length <= 20) return body[key].map(value => text(value,'แนวเพลง',100,true));
    if (key === 'popularityRank' && (body[key] === null || (Number.isSafeInteger(body[key]) && Number(body[key]) > 0))) return body[key];
    if (key === 'popularitySourceUrl') return body[key] === null ? null : https(body[key],'แหล่งความนิยม');
    throw new ArtistEditError('ข้อมูลศิลปินไม่ถูกต้อง');
  });
  let sections: Section[] | undefined;
  if (sectionsPresent) {
    if (!Array.isArray(body.biography) || body.biography.length > 30) throw new ArtistEditError('ประวัติต้องไม่เกิน 30 หัวข้อ');
    sections = body.biography.map(row => {
      if (!row || typeof row !== 'object') throw new ArtistEditError('หัวข้อประวัติไม่ถูกต้อง');
      return { heading: text(row.heading,'หัวข้อ',300,true),body: text(row.body,'เนื้อหาประวัติ',20000,true),sourceUrl: https(row.sourceUrl,'แหล่งประวัติ'),sourceLabel: text(row.sourceLabel,'ชื่อแหล่งประวัติ',200,true) };
    });
  }
  // Legacy imageUrl requests never inherit an old image's credit.
  const image = Object.hasOwn(body,'image') ? picture(body.image) : undefined;
  const legacyImage = Object.hasOwn(body,'imageUrl') ? body.imageUrl === null || body.imageUrl === '' ? null : imageUrl(body.imageUrl) : undefined;
  if (Object.hasOwn(body,'image') && Object.hasOwn(body,'imageUrl')) throw new ArtistEditError('ส่งข้อมูลรูปซ้ำ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const artist = (await client.query('SELECT *,updated_at::text AS edit_version FROM artists WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (!artist) throw new ArtistEditError('ไม่พบศิลปิน',404);
    if (Object.hasOwn(body,'editVersion') && body.editVersion !== artist.edit_version) throw new ArtistEditError('ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',409);
    if (Object.hasOwn(body,'kind') && body.kind !== artist.kind) {
      const relations = (await client.query('SELECT EXISTS(SELECT 1 FROM artist_memberships WHERE band_id=$1) AS has_members,EXISTS(SELECT 1 FROM artist_memberships WHERE member_id=$1) AS is_member',[id])).rows[0];
      if ((body.kind!=='band' && relations.has_members) || (body.kind==='band' && relations.is_member)) throw new ArtistEditError('เอาความสัมพันธ์สมาชิกออกก่อนเปลี่ยนประเภทโปรไฟล์');
    }
    const sets = entries.map(([,column],index) => column + '=$' + (index + 1));
    if (entries.some(([key]) => ['name','nameEn','kind','genres'].includes(key))) sets.push('catalog_manual_override=true');
    if (sectionsPresent || Object.hasOwn(body,'bio')) sets.push('biography_manual_override=true');
    if (imagePresent) sets.push('image_manual_override=true');
    await client.query(`UPDATE artists SET ${sets.length ? sets.join(',') + ',' : ''} ${sectionsPresent || Object.hasOwn(body,'bio') ? 'verified_at=now(),' : ''}updated_at=now() WHERE id=$${values.length + 1}`,[...values,id]);
    if (sections) {
      await client.query('DELETE FROM artist_biography_sections WHERE artist_id=$1',[id]);
      for (const [index,section] of sections.entries()) {
        await client.query(`INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label) VALUES($1,$2,$3,$4,$5,$6)`,[id,index+1,section.heading,section.body,section.sourceUrl,section.sourceLabel]);
        await client.query('INSERT INTO artist_sources(artist_id,source_url,label) VALUES($1,$2,$3) ON CONFLICT(artist_id,source_url) DO UPDATE SET label=$3,checked_at=now()',[id,section.sourceUrl,section.sourceLabel]);
      }
    }
    if (imagePresent) {
      let url = legacyImage ?? null;
      let uploadId: string | null = null;
      if (image) {
        if (image.file) {
          uploadId = randomUUID(); url = '/api/artist-images/' + uploadId;
          await client.query('INSERT INTO artist_image_uploads(id,artist_id,content_type,data) VALUES($1,$2,$3,$4)',[uploadId,id,image.file.contentType,image.file.data]);
        } else {
          url = image.url!;
          if (url.startsWith('/api/artist-images/')) {
            uploadId = url.split('/').pop()!;
            if (!(await client.query('SELECT 1 FROM artist_image_uploads WHERE id=$1 AND artist_id=$2',[uploadId,id])).rowCount) throw new ArtistEditError('ไม่พบไฟล์รูปของศิลปินนี้');
          }
        }
      }
      const review = { status: image ? 'admin-provided' : 'unverified',checkedAt: new Date().toISOString(),caption: image?.caption || '',rights: image?.rights,
        reason: image ? 'ข้อมูลสิทธิ์ภาพที่ผู้ดูแลระบุ ไม่ใช่การตรวจใบอนุญาตอัตโนมัติ' : 'ผู้ดูแลลบภาพหรือยังไม่ได้ระบุหลักฐานสิทธิ์' };
      await client.query('UPDATE artists SET image_url=$2,image_review=$3::jsonb WHERE id=$1',[id,url,JSON.stringify(review)]);
      await client.query('DELETE FROM artist_image_credits WHERE artist_id=$1',[id]);
      if (image) await client.query(`INSERT INTO artist_image_credits(artist_id,image_url,source_url,creator,title,license,license_url,photo_date,changes,verified_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,[id,url,image.sourceUrl || url,image.creator,image.title,image.license,image.licenseUrl,image.photoDate,image.changes]);
      await client.query('DELETE FROM artist_image_uploads WHERE artist_id=$1 AND id IS DISTINCT FROM $2::uuid',[id,uploadId]);
    }
    const saved = (await client.query('SELECT a.*,a.updated_at::text AS edit_version,' + imageCreditSelect + ' FROM artists a ' + imageCreditJoin + ' WHERE a.id=$1',[id])).rows[0];
    const biography = (await client.query('SELECT position,heading,body,source_url,source_label,checked_at,generated_model FROM artist_biography_sections WHERE artist_id=$1 ORDER BY position',[id])).rows;
    await client.query('COMMIT');
    return { ...saved,biography };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
