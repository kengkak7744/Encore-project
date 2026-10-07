import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import test from 'node:test';
import { createApp } from './app.js';
import { pool } from './db.js';
import { applyArtistAudit } from './artist-audit.js';
import { seedArtistBiography } from './artist-seed.js';
import { curatedArtistProfiles } from './artist-profiles.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
test('Administrator artist editing is atomic, attributed and durable', { skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  const url = new URL(process.env.INGEST_TEST_DATABASE_URL!);
  if (!url.pathname.startsWith('/encore_ingest_test')) throw Error('Artist editor requires an isolated test database');
  const schema = 'artist_editor_' + randomUUID().replaceAll('-','');
  const setup = new pg.Client({ connectionString: url.href }); await setup.connect();
  const db = new pg.Pool({ connectionString: url.href,options: '-c search_path='+schema+',public' });
  const server = createApp().listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = async (path: string,method = 'GET',cookie?: string,body?: unknown,headers: Record<string,string> = {}) => {
    const response = await fetch(origin+'/api'+path,{ method,headers: { 'Content-Type': 'application/json',...(cookie ? { cookie } : {}),...headers },...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status,headers: response.headers,body: await response.json() };
  };
  try {
    await setup.query('CREATE SCHEMA '+schema); await setup.query('SET search_path TO '+schema+',public');
    const dir = new URL('../sql/',import.meta.url);
    for (const name of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) await setup.query(await readFile(new URL(name,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => db.query(sql,params)); t.mock.method(pool,'connect',() => db.connect());
    const session = async (role: string,expired = false) => {
      const user = (await db.query("INSERT INTO users(email,display_name,password_hash,role) VALUES($1,'fixture','unused',$2) RETURNING id",[randomUUID()+'@example.test',role])).rows[0];
      const token = randomUUID(); await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3::interval)",[createHash('sha256').update(token).digest('hex'),user.id,expired ? '-1 second' : '1 hour']); return 'artist_session='+token;
    };
    const admin = await session('admin'),user = await session('user'),expired = await session('admin',true);
    const artistId = (await db.query("INSERT INTO artists(slug,name,kind,bio) VALUES('phum-viphurit','Fixture artist','solo','Old short bio') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO artist_biography_sections(artist_id,position,heading,body,source_url,source_label,generated_model) VALUES($1,1000,'AI heading','Old AI body','https://example.test/old','Original source','fixture-model')",[artistId]);
    const detail = () => request('/artists/phum-viphurit');
    const patch = (body: unknown,cookie = admin) => request('/admin/artists/'+artistId,'PATCH',cookie,body);
    const sections = [{ heading: 'ประวัติที่ตรวจทานแล้ว',body: 'เนื้อหาใหม่จากผู้ดูแล',sourceUrl: 'https://example.test/biography',sourceLabel: 'แหล่งประวัติใหม่' }];
    const image = { url: 'https://example.test/photo.png',creator: 'Fixture photographer',title: 'Fixture portrait',rights: 'license',license: 'CC BY 4.0',licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',confirmRights: true };

    await t.test('Guest, regular user, expired admin and foreign origin cannot edit',async () => {
      for (const [cookie,status] of [[undefined,401],[user,403],[expired,401]] as const) assert.equal((await request('/admin/artists/'+artistId,'PATCH',cookie,{ bio: 'forbidden',image })).status,status);
      assert.equal((await request('/admin/artists/'+artistId,'PATCH',admin,{ bio: 'forbidden' },{ origin: 'https://other.example.test' })).status,403);
      assert.equal((await detail()).body.bio,'Old short bio'); assert.equal((await db.query('SELECT count(*)::int n FROM artist_image_uploads')).rows[0].n,0);
    });
    await t.test('Full biography and image credits persist together and retain source links',async () => {
      const version = (await detail()).body.edit_version;
      const result = await patch({ name: 'ศิลปินแก้ไขแล้ว',bio: 'ประวัติสั้นใหม่',biography: sections,image,editVersion: version });
      assert.equal(result.status,200); assert.equal(result.body.biography[0].position,1); assert.equal(result.body.biography[0].generated_model,null);
      const saved = (await detail()).body; assert.equal(saved.bio,'ประวัติสั้นใหม่'); assert.equal(saved.biography[0].body,sections[0].body);
      assert.equal(saved.image_credit.creator,image.creator); assert.equal(saved.image_credit.source_url,image.url); assert.equal(saved.image_review.status,'admin-provided');
      assert.equal(saved.biography_manual_override,true); assert.equal(saved.image_manual_override,true);
      assert.ok(saved.sources.some((row: { source_url: string }) => row.source_url === sections[0].sourceUrl));
    });
    await t.test('Invalid sections, image rights and unsafe URLs do not partially update the profile',async () => {
      for (const invalid of [
        { bio: 'not saved',biography: [{ ...sections[0],sourceUrl: 'javascript:alert(1)' }] },
        { bio: 'not saved',image: { ...image,confirmRights: false } },
        { bio: 'not saved',image: { ...image,url: 'data:image/png;base64,AAAA' } },
        { bio: 'not saved',image: { ...image,url: '/api/artist-images/' + '-'.repeat(36) } },
        { bio: 'not saved',image: { ...image,licenseUrl: 'https://user:password@example.test/' } },
        { name: 123 },{ biography: Array(31).fill(sections[0]) },
      ]) assert.equal((await patch(invalid)).status,400);
      assert.equal((await detail()).body.bio,'ประวัติสั้นใหม่'); assert.equal((await detail()).body.image_credit.license,'CC BY 4.0');
    });
    await t.test('A stale edit version returns 409 and leaves the newer edit intact',async () => {
      const old = (await detail()).body.edit_version; assert.equal((await patch({ name: 'Newer editor' })).status,200);
      const result = await patch({ bio: 'stale draft',editVersion: old }); assert.equal(result.status,409); assert.equal((await detail()).body.bio,'ประวัติสั้นใหม่');
    });
    let uploadUrl = '';
    await t.test('Upload is served as original bytes without exposing file data in profile JSON',async () => {
      const result = await patch({ image: { ...image,url: undefined,file: { contentType: 'image/png',data: png.toString('base64') },rights: 'own',licenseUrl: '' } });
      assert.equal(result.status,200); uploadUrl = result.body.image_url;
      assert.match(uploadUrl,/^\/api\/artist-images\/[0-9a-f-]{36}$/); assert.ok(!JSON.stringify(result.body).includes(png.toString('base64')));
      const response = await fetch(origin+uploadUrl); assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'image/png'); assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
      assert.equal((await fetch(origin+uploadUrl,{ method: 'HEAD' })).status,200);
      assert.equal((await detail()).body.image_credit.license_url,'');
    });
    await t.test('Malformed, mismatched and oversized uploads are rejected without replacing the saved image',async () => {
      for (const file of [ { contentType: 'image/svg+xml',data: Buffer.from('<svg>script</svg>').toString('base64') },{ contentType: 'image/jpeg',data: png.toString('base64') },{ contentType: 'image/png',data: '%%%invalid%%%' } ]) {
        assert.equal((await patch({ image: { ...image,url: undefined,file } })).status,400);
      }
      const big = Buffer.alloc(2097153); png.copy(big);
      assert.equal((await patch({ image: { ...image,url: undefined,file: { contentType: 'image/png',data: big.toString('base64') } } })).status,413);
      assert.equal((await detail()).body.image_url,uploadUrl); assert.equal((await db.query('SELECT count(*)::int n FROM artist_image_uploads')).rows[0].n,1);
    });
    await t.test('Large request limits apply after authorization and return JSON errors',async () => {
      const huge = { bio: 'a'.repeat(3*1024*1024) };
      assert.equal((await request('/admin/artists/'+artistId,'PATCH',undefined,huge)).status,401);
      assert.equal((await patch(huge)).status,413);
    });
    await t.test('A failed database write rolls back the newly inserted uploaded file and biography',async () => {
      await db.query(`CREATE FUNCTION reject_editor_credit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fixture credit failure'; END $$ LANGUAGE plpgsql`);
      await db.query('CREATE TRIGGER reject_editor_credit BEFORE INSERT ON artist_image_credits FOR EACH ROW EXECUTE FUNCTION reject_editor_credit()');
      t.mock.method(console,'error',() => {});
      const result = await patch({ bio: 'rollback',biography: [],image: { ...image,url: undefined,file: { contentType: 'image/png',data: png.toString('base64') } } }); assert.equal(result.status,500);
      assert.equal((await detail()).body.bio,'ประวัติสั้นใหม่'); assert.equal((await detail()).body.biography.length,1); assert.equal((await db.query('SELECT count(*)::int n FROM artist_image_uploads')).rows[0].n,1);
      await db.query('DROP TRIGGER reject_editor_credit ON artist_image_credits');
    });
    await t.test('Removing image and sections stays removed across audit runs, and old upload URLs stop serving',async () => {
      assert.equal((await patch({ image: null,biography: [],bio: '' })).status,200);
      const client = await db.connect(); try { await client.query('BEGIN'); await seedArtistBiography(client,curatedArtistProfiles.find(row => row.slug === 'phum-viphurit')!); await applyArtistAudit(client); await applyArtistAudit(client); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      const saved = (await detail()).body; assert.equal(saved.image_url,null); assert.equal(saved.image_credit,null); assert.deepEqual(saved.biography,[]); assert.equal(saved.bio,'');
      assert.equal((await fetch(origin+uploadUrl)).status,404); assert.equal((await db.query('SELECT count(*)::int n FROM artist_image_uploads')).rows[0].n,0);
    });
    await t.test('Legacy imageUrl updates cannot inherit an unrelated license and unknown IDs return 404',async () => {
      assert.equal((await patch({ image })).status,200); assert.equal((await patch({ imageUrl: 'https://example.test/replacement.jpg' })).status,200);
      assert.equal((await detail()).body.image_credit,null);
      assert.equal((await request('/admin/artists/'+randomUUID(),'PATCH',admin,{ bio: 'missing' })).status,404);
      assert.equal((await request('/admin/artists/'+'-'.repeat(36),'PATCH',admin,{ bio: 'bad id' })).status,400);
    });
  } finally {
    server.close(); server.closeAllConnections(); await once(server,'close');
    t.mock.restoreAll(); await db.end(); await setup.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE'); await setup.end(); await pool.end();
  }
});
