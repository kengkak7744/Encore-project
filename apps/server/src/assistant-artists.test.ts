import assert from 'node:assert/strict';
import test from 'node:test';
import { artistProfileEvidence,explicitChatIntent,findChatArtist,isArtistProfileQuestion } from './assistant-artists.js';

const member = { id: 'member',slug: 'aheye-4eve',name: 'Aheye (4EVE)',name_en: 'Aheye (4EVE)' };
const band = { id: 'band',slug: '4eve',name: '4EVE',name_en: null };
const artists = [band,member];

test('Chat resolves a stored artist nickname beside Thai text',() => {
  assert.equal(findChatArtist(artists,'นายรู้จัก Aheye ไหม')?.id,'member');
  assert.equal(findChatArtist(artists,'รู้จักaHeYeไหม')?.id,'member');
});
test('Canonical names and slugs keep the intended member',() => {
  assert.equal(findChatArtist(artists,'ขอประวัติ Aheye (4EVE)')?.id,'member');
  assert.equal(findChatArtist(artists,'ขอประวัติ aheye-4eve')?.id,'member');
  assert.equal(findChatArtist(artists,'Ａｈｅｙｅ','name')?.id,'member');
});
test('Parenthetical group names do not become member aliases',() => {
  assert.equal(findChatArtist(artists,'ข่าว 4EVE')?.id,'band');
  assert.equal(findChatArtist([member],'4EVE','name'),undefined);
});
test('Unknown and embedded Latin names cannot broaden a query',() => {
  for (const value of ['AheyeXYZ','NotAheye','missing-artist','ข่าว NotAheye ล่าสุด']) assert.equal(findChatArtist(artists,value),undefined);
  assert.equal(findChatArtist(artists,'AheyeXYZ','name'),undefined);
});
test('A shared nickname requires a qualifier instead of an arbitrary artist',() => {
  const two = [{...member,id:'one',name:'Nun (PERSES)',name_en:null,slug:'nun-perses'},{...member,id:'two',name:'Nun (Other)',name_en:null,slug:'nun-other'}];
  assert.equal(findChatArtist(two,'รู้จัก Nun ไหม'),undefined);
  assert.equal(findChatArtist(two,'Nun (PERSES)','name')?.id,'one');
});
test('Profile questions preserve explicit news, concert and travel intent',() => {
  for (const message of ['นายรู้จัก Aheye ไหม','Aheye คือใคร','ขอประวัติ Aheye แบบละเอียด','Tell me about Aheye']) assert.ok(isArtistProfileQuestion(message));
  for (const message of ['ข่าว Aheye ล่าสุด','รู้จักคอนเสิร์ต Aheye ไหม','แนะนำงานของ Aheye','ประวัติคอนเสิร์ตที่เคยไป']) assert.equal(isArtistProfileQuestion(message),false);
});

test('Explicit current news and small talk cannot be replaced with profile intent from history',() => {
  assert.equal(explicitChatIntent('ข่าว Aheye ล่าสุดมีอะไรบ้าง'),'news');
  assert.equal(explicitChatIntent('สวัสดี อยากคุยเรื่องเพลงด้วย'),'unknown');
  assert.equal(explicitChatIntent('ค้นโพสต์เกี่ยวกับอัลบั้มใหม่'),undefined);
  assert.equal(explicitChatIntent('สวัสดี Aheye มีคอนเสิร์ตไหม'),undefined);
});
test('Profile evidence includes later sections for follow-up questions and deduplicates citations',() => {
  const sections = Array.from({length:4},(_,index) => ({heading:'Heading '+index,body:'Stored evidence '+index,source_url:'https://source.example/'+(index%2)}));
  const brief = artistProfileEvidence(member,sections,'รู้จัก Aheye ไหม');
  assert.ok(brief.answer.includes('Stored evidence 2'));assert.ok(brief.answer.includes('Stored evidence 3'));assert.equal(brief.sources.length,2);
  assert.ok(artistProfileEvidence(member,sections,'ขอประวัติเต็ม Aheye').answer.includes('Stored evidence 3'));
});
test('Missing or invalid source evidence distinguishes a known profile from an unknown artist',() => {
  const result = artistProfileEvidence(member,[{heading:'Unsupported',body:'Do not assert this',source_url:'javascript:alert(1)'}],'รู้จัก Aheye ไหม');
  assert.ok(result.answer.includes('พบโปรไฟล์ Aheye (4EVE)'));assert.ok(!result.answer.includes('Do not assert this'));assert.deepEqual(result.sources,[]);
});
