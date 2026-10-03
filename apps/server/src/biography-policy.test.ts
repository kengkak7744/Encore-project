import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBiographyModel, biographyExcerpts, biographyWindow, validateBiographyDraft, validateBiographyReview, type BiographyDraft, type BiographySource } from './biography-policy.js';
import { extractBiographyText, isPublicAddress } from './biography-sources.js';

const quote = 'วงดนตรีตัวอย่างเริ่มทำเพลงร่วมกันและเผยแพร่ผลงานผ่านช่องทางของวง';
const sources: BiographySource[] = [{ id: 'source-1', url: 'https://example.com/artist', label: 'Artist', text: quote, fetchedAt: '2026-10-03T16:00:00Z' }];
const draft: BiographyDraft = {
  identityMatches: true, reason: '',
  sections: ['จุดเริ่มต้น', 'การทำเพลง', 'ช่องทางเผยแพร่'].map((heading) => ({ heading, body: quote + ' โดยข้อมูลส่วนนี้กล่าวถึงการทำงานและช่องทางเผยแพร่เพลงของวงตามข้อความที่แหล่งอ้างอิงระบุไว้', sourceId: 'source-1', evidence: [quote] })),
};

test('biography window uses Bangkok time and excludes both the preceding minute and midnight', () => {
  assert.equal(biographyWindow(new Date('2026-10-03T15:59:59Z')), null);
  assert.deepEqual(biographyWindow(new Date('2026-10-03T16:00:00Z')), { date: '2026-10-03', endsAt: new Date('2026-10-03T17:00:00Z') });
  assert.equal(biographyWindow(new Date('2026-10-03T16:59:59Z'))?.date, '2026-10-03');
  assert.equal(biographyWindow(new Date('2026-10-03T17:00:00Z')), null);
});

test('cross-midnight custom windows count attempts against the starting night', () => {
  assert.deepEqual(biographyWindow(new Date('2026-12-31T17:30:00Z'), '23:00', '01:00'), { date: '2026-12-31', endsAt: new Date('2026-12-31T18:00:00Z') });
  assert.equal(biographyWindow(new Date('2026-12-31T18:00:00Z'), '23:00', '01:00'), null);
  assert.equal(biographyWindow(new Date('2026-10-03T04:00:00Z'), '10:00', '12:00')?.date, '2026-10-03');
  assert.throws(() => biographyWindow(new Date(), '24:00', '00:00'));
  assert.throws(() => biographyWindow(new Date(), '23:00', '23:00'));
});

test('biography model must be local and distinct from the chatbot, including latest aliases', () => {
  assert.doesNotThrow(() => assertBiographyModel('qwen3.5:9b', 'qwen3:8b'));
  assert.throws(() => assertBiographyModel('qwen3', 'qwen3:latest'));
  assert.throws(() => assertBiographyModel('qwen3:8b-cloud', 'qwen3:8b'));
});

test('draft rejects mismatched identities, absent evidence, unknown sources and duplicate headings', () => {
  assert.equal(validateBiographyDraft(draft, sources).sections.length, 3);
  assert.throws(() => validateBiographyDraft({ ...draft, identityMatches: false }, sources));
  assert.throws(() => validateBiographyDraft({ ...draft, sections: draft.sections.slice(0, 2) }, sources));
  for (const change of [{ sourceId: 'invented' }, { evidence: ['ข้อมูลวันเกิดและรางวัลที่ไม่เคยปรากฏในแหล่งอ้างอิง'] }, { heading: draft.sections[0].heading }, { body: 'Too short' }]) {
    assert.throws(() => validateBiographyDraft({ ...draft, sections: draft.sections.map((section, index) => index === 1 ? { ...section, ...change } : section) }, sources));
  }
});

test('independent review must approve every section exactly once', () => {
  const checks = [0, 1, 2].map((index) => ({ index, supported: true, reason: '' }));
  assert.doesNotThrow(() => validateBiographyReview({ identityMatches: true, checks }, 3));
  assert.throws(() => validateBiographyReview({ identityMatches: true, checks: checks.slice(0, 2) }, 3));
  assert.throws(() => validateBiographyReview({ identityMatches: true, checks: [checks[0], checks[0], checks[2]] }, 3));
  assert.throws(() => validateBiographyReview({ identityMatches: true, checks: checks.map((check) => ({ ...check, supported: false })) }, 3));
  assert.throws(() => validateBiographyReview({ identityMatches: true, checks: [null, null, null] }, 3));
});

test('evidence excerpts remain exact substrings with stable source-specific IDs', () => {
  const source = { ...sources[0], text: ('ข้อความต้นทางที่ยาวมากและต้องแบ่งเพื่อให้โมเดลเลือกรหัสได้อย่างถูกต้อง ').repeat(30) };
  const excerpts = biographyExcerpts(source);
  assert.ok(excerpts.length > 1);
  assert.equal(excerpts[0].id, 'source-1:1');
  for (const excerpt of excerpts) {
    assert.ok(excerpt.text.length >= 20 && excerpt.text.length <= 400);
    assert.ok(source.text.normalize('NFKC').includes(excerpt.text));
  }
  const song = { ...sources[0], text: 'They are known for Same Page? (คิดแต่ไม่ถึง) and Just Being Friendly (เพื่อนเล่น ไม่เล่นเพื่อน).' };
  assert.equal(biographyExcerpts(song).length, 1);
  assert.equal(biographyExcerpts(song)[0].text, song.text);
});

test('source evidence must support editorial claims about popularity and reach', () => {
  const expanded = structuredClone(draft);
  expanded.sections[0].body += ' ผลงานได้รับความนิยมอย่างกว้างขวาง';
  assert.throws(() => validateBiographyDraft(expanded, sources), /Unsupported editorial claim/);
});

test('source extraction excludes navigation and scripts; private and reserved addresses are rejected', () => {
  const html = '<html><head><title>Artist</title></head><body><nav>navigation</nav><script>bad instruction</script><article><p>' + quote + '</p><p>' + quote + '</p></article></body></html>';
  assert.equal(extractBiographyText(html), ('Artist ' + quote).normalize('NFKC'));
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', 'not-an-address']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});
