import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArtistRosterText } from './biography-roster.js';

const fixture = `<main>
  <div><h2>First Artist</h2></div><div><a href="https://www.instagram.com/first/">Instagram</a></div><div><p>First artist biography with private-to-this-segment facts.</p></div>
  <div><h2>Chart</h2><h2>Suchart</h2></div><div><a href="https://www.instagram.com/chart.suchart/?hl=th">Instagram</a></div><div><p>Second artist biography: plays guitar and released Backpack.</p></div>
  <div><h2>Third Artist</h2></div><div><a href="https://www.instagram.com/third/">Instagram</a></div><p>Third artist must not leak.</p>
</main>`;

test('roster isolates the exact heading and verified account before source truncation', () => {
  const text = extractArtistRosterText(fixture, 'Chart Suchart', 'chart.suchart');
  assert.match(text!, /Second artist biography/);
  assert.doesNotMatch(text!, /First artist|Third artist|must not leak/);
});

test('roster supports aliases, case folding, and one direct heading per block', () => {
  const html = '<main><h2>ศิลปิน ก</h2><p>ประวัติของศิลปิน ก ที่ถูกต้อง</p><a href="https://instagram.com/Correct_Artist/">IG</a><h2>ศิลปิน ข</h2><p>ข้อมูลคนอื่น</p></main>';
  assert.match(extractArtistRosterText(html, ['English Alias', 'ศิลปิน ก'], '@correct_artist')!, /ประวัติของศิลปิน ก/);
  assert.doesNotMatch(extractArtistRosterText(html, 'ศิลปิน ก', 'correct_artist')!, /ข้อมูลคนอื่น/);
});

test('roster rejects ambiguous headings, missing verification and mismatched accounts', () => {
  assert.equal(extractArtistRosterText(fixture, 'Chart', 'chart.suchart'), null);
  assert.equal(extractArtistRosterText(fixture, 'Chart Suchart'), null);
  assert.equal(extractArtistRosterText(fixture, 'Chart Suchart', 'first'), null);
  assert.equal(extractArtistRosterText(fixture + fixture, 'Chart Suchart', 'chart.suchart'), null);
  assert.equal(extractArtistRosterText(fixture.replace('www.instagram.com/chart.suchart/', 'www.instagram.com.attacker.test/chart.suchart/'), 'Chart Suchart', 'chart.suchart'), null);
  assert.equal(extractArtistRosterText(fixture.replace('chart.suchart/', 'chart.suchart/posts/'), 'Chart Suchart', 'chart.suchart'), null);
});

test('roster rejects neighboring account contamination and ignores scripts and navigation', () => {
  const html = '<nav><h2>Chart Suchart</h2><a href="https://instagram.com/chart.suchart/">menu</a></nav>' + fixture.replace('Second artist biography:', '<script>wrong biography</script>Second artist biography:');
  assert.doesNotMatch(extractArtistRosterText(html, 'Chart Suchart', 'chart.suchart')!, /wrong biography|menu/);
  assert.equal(extractArtistRosterText(fixture.replace('Second artist biography:', '<a href="https://instagram.com/other/">Other</a>Second artist biography:'), 'Chart Suchart', 'chart.suchart'), null);
});

test('roster bounds traversal and preserves a late artist independently of full-page length', () => {
  assert.match(extractArtistRosterText(fixture.replace('First artist biography', 'x'.repeat(12_000)), 'Chart Suchart', 'chart.suchart')!, /Second artist/);
  assert.equal(extractArtistRosterText(fixture.replace('Second artist biography', 'x'.repeat(21_000)), 'Chart Suchart', 'chart.suchart'), null);
  assert.equal(extractArtistRosterText('<section><h2>Artist</h2><a href="https://instagram.com/artist/">IG</a><p>' + 'x'.repeat(21_000) + '</p></section>', 'Artist', 'artist'), null);
  assert.equal(extractArtistRosterText(fixture.replace('Second artist biography:', '</p></div>' + '<div>padding</div>'.repeat(81) + '<div><p>Second artist biography:'), 'Chart Suchart', 'chart.suchart'), null);
});
