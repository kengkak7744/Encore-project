import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBiographyVideoSource } from './biography-video-source.js';
import { normalizeText } from './biography-policy.js';

const id = 'bPIbZ8fY78Q';
const url = `https://www.youtube.com/watch?v=${id}`;
const now = new Date('2026-10-10T12:00:00Z');
const prose = 'วง TACE นำเสนอเพลงเดบิวต์ที่พูดถึงการเติบโตท่ามกลางหลายบทบาทในชีวิต ทั้งการเป็นวัยรุ่น เด็กฝึก และคนที่มีความฝัน โดยเปิดเผยแนวคิดการทำงานเพลงและมุมมองต่อการเรียนรู้ที่จะเป็นตัวเอง';
function page(description: string, options: { videoId?: string; date?: string; title?: string } = {}) {
  return '<script>var ytInitialPlayerResponse = ' + JSON.stringify({ videoDetails: { videoId: options.videoId ?? id, title: options.title ?? 'TACE - Mask On [Official MV]', author: 'TACE', shortDescription: description }, microformat: { playerMicroformatRenderer: { publishDate: options.date ?? '2026-07-21T03:30:28-07:00' } } }) + '; globalThis.shouldNeverExecute = true;</script>';
}

test('retains exact performer credits, prose and publication date without lyrics or contacts', () => {
  const description = 'Title : Mask On\nArtist : TACE - AYUMI, JAOJOM, LIYAH, JUNJAO, TOKYO\nRelease Date : 21 JUL 2026\nAll Streaming : https://example.com\n\nProduced by : NT_PAT\nLyrics : Amp, AUTTA\n\n-----\n\n' + prose + '\n\n-----\n\n(LYRIC)\nเพลงร้องที่ไม่ใช่ประวัติ\n\nFollow TACE\nInstagram : tace.officialth';
  const result = extractBiographyVideoSource(page(description), url, now);
  assert.ok(result);
  assert.equal(result.publishedAt, '2026-07-21');
  assert.match(result.text, /AYUMI, JAOJOM, LIYAH, JUNJAO, TOKYO/);
  assert.match(result.text, /Lyrics : Amp, AUTTA/);
  assert.ok(result.text.includes(normalizeText(prose)));
  assert.doesNotMatch(result.text, /เพลงร้องที่ไม่ใช่ประวัติ|Follow|https:|tace\.officialth/);
});

test('never executes script and safely handles braces, quotes and backslashes in JSON strings', () => {
  const title = 'TACE "Mask {On}" \\ Official MV';
  const result = extractBiographyVideoSource(page('Artist : TACE\n\n' + prose, { title }), url, now);
  assert.ok(result?.text.includes(title));
  assert.equal(Reflect.get(globalThis, 'shouldNeverExecute'), undefined);
  assert.equal(extractBiographyVideoSource('<script>var ytInitialPlayerResponse = (() => { throw new Error("executed"); })();</script>', url, now), null);
});

test('requires the requested video ID and an exact public HTTPS watch URL', () => {
  const html = page('Artist : TACE\n\n' + prose);
  for (const bad of ['http://www.youtube.com/watch?v=' + id, 'https://www.youtube.com.evil.test/watch?v=' + id, 'https://www.youtube.com/embed/' + id, url + '&v=abcdefghijk', 'https://secret@www.youtube.com/watch?v=' + id, 'https://www.youtube.com/watch?v=short']) assert.equal(extractBiographyVideoSource(html, bad, now), null);
  assert.equal(extractBiographyVideoSource(page('Artist : TACE', { videoId: 'abcdefghijk' }), url, now), null);
});

test('rejects malformed JSON, missing metadata, excessive nesting and oversized HTML', () => {
  assert.equal(extractBiographyVideoSource('<script>var ytInitialPlayerResponse = {"videoDetails": {bad}};</script>', url, now), null);
  assert.equal(extractBiographyVideoSource('<script>var ytInitialPlayerResponse = {"videoDetails":null};</script>', url, now), null);
  assert.equal(extractBiographyVideoSource('<script>var ytInitialPlayerResponse = ' + '['.repeat(70) + '{}'+ ']'.repeat(70) + ';</script>', url, now), null);
  assert.equal(extractBiographyVideoSource(page('Artist : TACE') + 'x'.repeat(2_000_000), url, now), null);
});

test('bounds output using complete blocks and does not retain partial numeric claims', () => {
  const result = extractBiographyVideoSource(page('Artist : TACE\n\n' + prose + '\n\n' + prose.repeat(30) + ' 70 ล้านวิวภายใน 7 เดือน'), url, now);
  assert.ok(result);
  assert.ok(result.text.length <= 2000);
  assert.ok(result.text.includes(normalizeText(prose)));
  assert.doesNotMatch(result.text, /70 ล้านวิว/);
});

test('keeps prose wrapped across lines, removes unmarked lyrics after prose separator', () => {
  const wrapped = prose.match(/.{1,75}/g)!.join('\n');
  const result = extractBiographyVideoSource(page('Artist : TACE\n\n' + wrapped + '\n\n-----\nร้องเพลงรัก\nจากนี้ไป\nรักเธอ'), url, now);
  assert.ok(result);
  assert.doesNotMatch(result.text, /ร้องเพลงรัก|รักเธอ/);
  assert.match(result.text, /การเติบโต/);
});

test('recognizes upper-case lyric title and excludes footer promotion', () => {
  const result = extractBiographyVideoSource(page('Artist : COPTER PANUWAT\nLyrics : COPTER PANUWAT\n\nLYRICS : แฟนติ่ง (Fan\'s Things) - COPTER PANUWAT\nพ่อชื่อใครแม่ชื่อใคร\n\nFollow COPTER PANUWAT'), url, now);
  assert.ok(result);
  assert.match(result.text, /Lyrics : COPTER PANUWAT/);
  assert.doesNotMatch(result.text, /พ่อชื่อใคร|Follow/);
});

test('ignores invalid calendar, future and missing dates instead of dating with fetch time', () => {
  for (const date of ['2026-02-30', '2027-01-01', '2026-10-10T23:00:00Z', 'today', '']) {
    const result = extractBiographyVideoSource(page('Artist : TACE', { date }), url, now);
    assert.ok(result);
    assert.equal(result.publishedAt, null);
  }
  assert.equal(extractBiographyVideoSource(page('Artist : TACE', { date: '2024-02-29' }), url, now)?.publishedAt, '2024-02-29');
});
