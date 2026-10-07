import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedSnapshots, rankForYou, type FeedCandidate } from './feed-ranking.js';
const now = Date.parse('2026-10-08T00:00:00Z');
function item(key: string,artist = key,changes: Partial<FeedCandidate> = {}): FeedCandidate {
  return { key,kind: 'news',published_at: new Date(now),artist_ids: [artist],genres: ['pop'],author_key: 'artist:'+artist,
    followed: false,engaged: false,related: false,genre_match: false,own: false,shared: false,engagement: 0,...changes };
}

test('For You keeps a relevant first item but prevents one prolific artist dominating a full page',() => {
  const entries = [...Array.from({length: 40},(_,i) => item('flood-'+i,'favorite',{ followed: true })),
    ...Array.from({length: 24},(_,i) => item('other-'+i,'other-'+i%8,{ genre_match: true }))];
  const byKey = new Map(entries.map(c => [c.key,c]));
  const ranked = rankForYou(entries,now);
  assert.equal(byKey.get(ranked[0].key)!.followed,true);
  const page=ranked.slice(0,15).map(r => byKey.get(r.key)!);
  assert.ok(page.filter(c => c.artist_ids.includes('favorite')).length<=3);
  assert.ok(new Set(page.flatMap(c => c.artist_ids)).size>=5);
  assert.ok(page.every((c,i) => !i || c.author_key!==page[i-1].author_key));
  assert.equal(ranked.length,entries.length);assert.equal(new Set(ranked.map(r => r.key)).size,entries.length);
});

test('Fresh unfamiliar artists and related fan authors get opportunities when enough content exists',() => {
  const news=Array.from({length: 45},(_,i) => item('news-'+i,'followed-'+i%15,{ followed: true }));
  const discovery=Array.from({length: 12},(_,i) => item('discover-'+i,'new-'+i,{ genre_match: true }));
  const fans=Array.from({length: 12},(_,i) => item('fan-'+i,'fan-artist-'+i,{ kind: 'post',author_key: 'user:'+i,shared: true }));
  const candidates=[...news,...discovery,...fans],byKey=new Map(candidates.map(c => [c.key,c]));
  const page=rankForYou(candidates,now).slice(0,15).map(r => byKey.get(r.key)!);
  assert.ok(page.filter(c => c.kind==='post').length>=3);
  assert.ok(page.filter(c => !c.followed).length>=3);
  assert.ok(page.filter(c => c.followed).length>=6);
});

test('Fan post flooding and multi-artist tagging cannot bypass author or artist limits',() => {
  const flood=Array.from({length: 35},(_,i) => item('fan-flood-'+i,'A',{ kind: 'post',author_key: 'user:one',followed: true,artist_ids: ['A','B'] }));
  const other=Array.from({length: 25},(_,i) => item('other-'+i,'other-'+i,{ followed: true }));
  const byKey=new Map([...flood,...other].map(c => [c.key,c]));
  const page=rankForYou([...flood,...other],now).slice(0,15).map(r => byKey.get(r.key)!);
  assert.ok(page.filter(c => c.author_key==='user:one').length<=2);
  assert.ok(page.filter(c => c.artist_ids.includes('A')).length<=3);
});

test('Band members and repeated captions cannot dominate by changing the artist or author',() => {
  const family=Array.from({length: 18},(_,i) => item('member-'+i,'member-'+i,{ followed: true,family_ids: ['same-band'] }));
  const copies=Array.from({length: 18},(_,i) => item('copy-'+i,'copy-'+i,{ followed: true,content_key: 'same-long-caption' }));
  const alternatives=Array.from({length: 25},(_,i) => item('alternative-'+i,'alt-'+i,{ genre_match: true }));
  const entries=[...family,...copies,...alternatives],byKey=new Map(entries.map(c => [c.key,c]));
  const result=rankForYou(entries,now),page=result.slice(0,15).map(r => byKey.get(r.key)!);
  assert.ok(page.filter(c => c.family_ids?.includes('same-band')).length<=5);
  assert.ok(page.filter(c => c.content_key==='same-long-caption').length<=1);
  assert.equal(result.length,entries.length);
});

test('Old favorites and manufactured engagement cannot outrank a fresh followed artist',() => {
  const old=item('old','A',{ followed: true,own: true,kind: 'post',published_at: new Date(now-365*86400000),engagement: 100000 });
  const viral=item('viral','B',{ engagement: 1000000000 });
  const fresh=item('fresh','C',{ followed: true });
  assert.equal(rankForYou([old,viral,fresh],now)[0].key,'fresh');
});

test('Explanation follows actual evidence and no private ranking signals are returned',() => {
  const candidate=item('related','A',{ related: true,author_key: 'user:private-id' });
  const result=rankForYou([candidate],now)[0];
  assert.match(result.reason,/วงหรือสมาชิก/);assert.deepEqual(Object.keys(result).sort(),['key','reason']);
  assert.ok(!JSON.stringify(result).includes('private-id'));
});

test('Sparse catalogs relax caps, retain old/untagged posts, and have deterministic complete pagination',() => {
  const entries=Array.from({length: 40},(_,i) => item('single-'+String(i).padStart(2,'0'),'A',{ published_at: new Date(now-400*86400000) }));
  entries.push(item('untagged','',{ artist_ids: [],kind: 'post',author_key: 'user:untagged' }));
  const first=rankForYou(entries,now),second=rankForYou([...entries].reverse(),now);
  assert.deepEqual(first,second);assert.equal(first.length,41);
  assert.equal(new Set([...first.slice(0,15),...first.slice(15,30),...first.slice(30)].map(r => r.key)).size,41);
  assert.deepEqual(rankForYou([],now),[]);
});

test('Feed windows are bound to the viewer, expire and evict old windows without storing payloads',() => {
  const windows=new FeedSnapshots(100,2),entries=[{ key: 'news:one',reason: 'test' }];
  const first=windows.create('A',entries,now);
  assert.equal(windows.get(first.token,'A',now+10),first);
  assert.equal(windows.get(first.token,'B',now+10),undefined);assert.equal(windows.get(first.token,null,now+10),undefined);
  const guest=windows.create(null,entries,now+20);assert.equal(windows.get(guest.token,null,now+30),guest);
  windows.create('C',entries,now+40);assert.equal(windows.get(first.token,'A',now+40),undefined);
  assert.equal(windows.get(guest.token,null,now+120),undefined);
});
