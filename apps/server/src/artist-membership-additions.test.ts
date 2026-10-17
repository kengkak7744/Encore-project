import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMembershipAdditions, applyMembershipAdditions } from './artist-membership-audit.js';
import { artistMembershipAdditions } from './artist-membership-additions.js';
import { artistMembershipFollowup } from './artist-membership-followup.js';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { artistMembershipOct15 } from './artist-evidence-oct15.js';

test('Dated membership additions preserve prior claims/caveats and do not invent new biography sections',()=>{
  assert.equal(new Set(artistMembershipAdditions.map(record=>record.slug)).size,8);
  assert.ok(artistMembershipAdditions.some(record=>record.slug==='mean-band'));
  for(const addition of artistMembershipAdditions) {
    const prior={checkedAt:'2026-10-05T12:00:00Z',claims:[addition.claims[0]],pending:['Keep administrator caveat']};
    const original=JSON.stringify(prior);
    const merged=mergeMembershipAdditions(prior,addition)!;
    assert.equal(JSON.stringify(prior),original);
    assert.ok(merged.pending.includes('Keep administrator caveat'));
    assert.equal(merged.claims.length,addition.claims.length,'Repeated primary claim must be deduplicated');
    assert.equal(merged.biographyAdditions,undefined);assert.equal(merged.corrections,undefined);
    assert.equal(mergeMembershipAdditions(merged,addition),null,'Same observation is repeatable');
    assert.equal(mergeMembershipAdditions({...merged,checkedAt:'2026-10-12T00:00:00Z'},addition),null,'Preserve newer edits');
    for(const claim of merged.claims)assert.equal(new URL(claim.sourceUrl).protocol,'https:');
  }
  const hers=artistMembershipAdditions.find(record=>record.slug==='hers')!;
  assert.ok(hers.claims.some(claim=>claim.kind==='members'&&claim.status==='historical'&&claim.publishedAt==='2025-10-24'));
  assert.ok(hers.pending.some(note=>note.includes('ต่าง')));
  for(const slug of ['daou-pittaya','offroad-kantapon'])assert.ok(artistMembershipAdditions.find(record=>record.slug===slug)!.claims.every(claim=>claim.status==='historical'&&claim.publishedAt==='2023-03-14'));
});

test('Membership additions are repeatable in PostgreSQL and preserve newer/manual catalog data',{skip:!process.env.INGEST_TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.INGEST_TEST_DATABASE_URL!);
  assert.ok(url.pathname.startsWith('/encore_ingest_test'));
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    await db.query('BEGIN');await db.query('CREATE SCHEMA membership_additions_fixture');await db.query('SET LOCAL search_path TO membership_additions_fixture,public');
    const dir=new URL('../sql/',import.meta.url);
    for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await db.query(await readFile(new URL(file,dir),'utf8'));
    const prior={checkedAt:'2026-10-05',claims:[],pending:['Preserve previous review caveat']};
    for(const record of artistMembershipAdditions)await db.query(`INSERT INTO artists(slug,name,kind,bio,image_url,catalog_manual_override,membership_evidence) VALUES($1,$1,'solo','Manual bio','https://example.com/manual.jpg',true,$2::jsonb)`,[record.slug,record.slug==='hens'?null:JSON.stringify(record.slug==='tonhon'?{...prior,checkedAt:'2026-10-12'}:prior)]);
    assert.equal((await applyMembershipAdditions(db)).length,7);
    const before=(await db.query('SELECT * FROM artists ORDER BY slug')).rows;
    const sources=(await db.query('SELECT * FROM artist_sources ORDER BY artist_id,source_url')).rows;
    assert.deepEqual(await applyMembershipAdditions(db),[]);
    assert.deepEqual((await db.query('SELECT * FROM artists ORDER BY slug')).rows,before);
    assert.deepEqual((await db.query('SELECT * FROM artist_sources ORDER BY artist_id,source_url')).rows,sources);
    for(const row of before) {
      assert.equal(row.bio,'Manual bio');assert.equal(row.image_url,'https://example.com/manual.jpg');assert.equal(row.catalog_manual_override,true);
      if(row.slug!=='hens')assert.ok(row.membership_evidence.pending.includes('Preserve previous review caveat'));
    }
    assert.equal(before.find(row=>row.slug==='tonhon').membership_evidence.claims.length,0);
    assert.ok(sources.length>0);
    // Import the previously unreviewed profiles without treating initial roster
    // observations as completed contract verification or authored biographies.
    assert.equal(new Set(artistMembershipFollowup.map(row=>row.slug)).size,44);
    for(const record of artistMembershipFollowup){
      assert.ok(record.pending.length>0);
      assert.ok(record.claims.every(claim=>new URL(claim.sourceUrl).protocol==='https:'));
      await db.query(`INSERT INTO artists(slug,name,kind,bio,catalog_manual_override) VALUES($1,$1,'solo','Keep existing biography',true)`,[record.slug]);
    }
    assert.equal((await applyMembershipAdditions(db)).length,44);
    const followup=(await db.query('SELECT * FROM artists WHERE slug=ANY($1::text[]) ORDER BY slug',[artistMembershipFollowup.map(row=>row.slug)])).rows;
    for(const row of followup){
      assert.equal(row.bio,'Keep existing biography');assert.equal(row.catalog_manual_override,true);
      assert.ok(row.membership_evidence.claims.length>0);assert.ok(row.membership_evidence.pending.length>0);
    }
    assert.deepEqual(await applyMembershipAdditions(db),[]);
    assert.deepEqual((await db.query('SELECT * FROM artists WHERE slug=ANY($1::text[]) ORDER BY slug',[artistMembershipFollowup.map(row=>row.slug)])).rows,followup);
    // The new dated observations append evidence without changing authored text,
    // manual catalog fields, or the preceding observation's caveats.
    for(const record of artistMembershipOct15)await db.query(`INSERT INTO artists(slug,name,kind,bio,membership_evidence)
      VALUES($1,$1,'solo','Keep existing biography',$2::jsonb) ON CONFLICT(slug) DO NOTHING`,[record.slug,JSON.stringify(prior)]);
    const oct15Before=(await db.query('SELECT slug,bio,updated_at,image_url FROM artists ORDER BY slug')).rows;
    assert.equal((await applyMembershipAdditions(db,artistMembershipOct15)).length,artistMembershipOct15.length);
    assert.deepEqual((await db.query('SELECT slug,bio,updated_at,image_url FROM artists ORDER BY slug')).rows,oct15Before);
    assert.deepEqual(await applyMembershipAdditions(db,artistMembershipOct15),[]);
    for(const record of artistMembershipOct15){
      const evidence=(await db.query('SELECT membership_evidence FROM artists WHERE slug=$1',[record.slug])).rows[0].membership_evidence;
      for(const claim of record.claims)assert.deepEqual(evidence.claims.find((saved:{text:string;sourceUrl:string})=>saved.text===claim.text&&saved.sourceUrl===claim.sourceUrl),claim);
      assert.ok(evidence.pending.length>=record.pending.length);
    }
  }finally{await db.query('ROLLBACK');await db.end();}
});
