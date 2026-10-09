import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

test('Instagram upgrade preserves quota/history and seeds only known inaccessible accounts into backoff',{skip:!process.env.INGEST_TEST_DATABASE_URL},async () => {
  const client=new pg.Client({connectionString:process.env.INGEST_TEST_DATABASE_URL}); await client.connect();
  try {
    await client.query('BEGIN'); await client.query('CREATE SCHEMA instagram_upgrade_fixture');
    await client.query('SET LOCAL search_path TO instagram_upgrade_fixture,public');
    const dir=new URL('../sql/',import.meta.url);
    for (const file of (await readdir(dir)).filter(name=>name.endsWith('.sql') && name<'025_').sort()) await client.query(await readFile(new URL(file,dir),'utf8'));
    for(const [slug,error] of [['unavailable','Instagram Graph HTTP 400 (codes 110/2207013)'],['rate','Instagram Graph HTTP 400 (codes 4)'],['normal',null]] as const) {
      const id=(await client.query("INSERT INTO artists(slug,name,kind) VALUES($1,$1,'solo') RETURNING id",[slug])).rows[0].id;
      await client.query("INSERT INTO social_accounts(artist_id,platform,url,last_checked_at,next_sync_at,last_error) VALUES($1,'instagram',$2,now(),now()+interval '1 hour',$3)",[id,'https://www.instagram.com/'+slug+'/',error]);
    }
    await client.query(`UPDATE instagram_sync_budget SET usage='{"totalTime":75}',paused_until=now()+interval '30 minutes',next_request_at=now()+interval '1 minute'`);
    const before=(await client.query('SELECT * FROM instagram_sync_budget')).rows[0];
    await client.query(await readFile(new URL('025_instagram_freshness.sql',dir),'utf8'));
    const after=(await client.query('SELECT * FROM instagram_sync_budget')).rows[0];
    for(const key of Object.keys(before)) assert.deepEqual(after[key],before[key]);
    const accounts=(await client.query('SELECT a.slug,s.instagram_failures,s.next_sync_at>=now()+interval \'6 hours\' AS waiting FROM social_accounts s JOIN artists a ON a.id=s.artist_id ORDER BY a.slug')).rows;
    assert.equal(accounts.find(a=>a.slug==='unavailable').instagram_failures,1);
    assert.equal(accounts.find(a=>a.slug==='unavailable').waiting,true);
    assert.equal(accounts.find(a=>a.slug==='rate').instagram_failures,0);
    assert.equal(accounts.find(a=>a.slug==='normal').instagram_failures,0);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
