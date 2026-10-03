import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBiography } from './biography-generator.js';
import { config } from './config.js';
import type { BiographyArtist, BiographySource } from './biography-policy.js';

test('biography generation selects real evidence and allows only one factual repair', async (t) => {
  const originalFetch = globalThis.fetch;
  const artist: BiographyArtist = { id: 'test', slug: 'test', name: 'วงตัวอย่าง', name_en: null, kind: 'band' };
  const quote = 'วงดนตรีตัวอย่างเริ่มทำเพลงร่วมกันและเผยแพร่ผลงานผ่านช่องทางของวง';
  const sources: BiographySource[] = [{ id: 'source-1', url: 'https://example.com/artist', label: 'Artist', text: quote, fetchedAt: '2026-10-03T16:00:00Z' }];
  const raw = { identityMatches: true, reason: '', sections: ['จุดเริ่มต้น', 'การทำเพลง', 'ช่องทางเผยแพร่'].map((heading) => ({ heading, body: quote + ' โดยข้อความนี้กล่าวถึงการทำงานและช่องทางเผยแพร่เพลงของวงตามแหล่งอ้างอิงที่ให้ไว้', sourceId: 'source-1', evidenceIds: ['source-1:1'] })) };
  const review = (supported: boolean) => ({ identityMatches: true, reason: '', checks: [0, 1, 2].map((index) => ({ index, supported, reason: supported ? '' : 'Unsupported claim' })) });
  let calls = 0;
  const respond = (values: object[]) => {
    calls = 0;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      assert.equal(request.model, config.biographyModel);
      assert.equal(request.think, false);
      assert.equal(request.options.num_ctx, 8192);
      assert.ok(values[calls], 'Generation exceeded the repair limit');
      return Response.json({ message: { content: JSON.stringify(values[calls++]) }, done_reason: 'stop' });
    };
  };
  try {
    await t.test('successful draft resolves IDs to exact source quotes and persists review', async () => {
      respond([raw, review(true)]); const snapshots: unknown[] = [];
      const draft = await generateBiography(artist, sources, new AbortController().signal, (value) => { snapshots.push(value); });
      assert.equal(calls, 2); assert.equal(draft.sections[0].evidence[0], quote.normalize('NFKC'));
      assert.equal(snapshots.length, 2); assert.ok(Object.hasOwn(snapshots[1] as object, 'review'));
    });
    await t.test('unsupported first draft is repaired and checked again', async () => {
      respond([raw, review(false), raw, review(true)]);
      assert.equal((await generateBiography(artist, sources, new AbortController().signal)).sections.length, 3);
      assert.equal(calls, 4);
    });
    await t.test('second rejection stops the job without accepting a draft', async () => {
      respond([raw, review(false), raw, review(false)]);
      await assert.rejects(generateBiography(artist, sources, new AbortController().signal), /Unsupported claim/);
      assert.equal(calls, 4);
    });
    await t.test('unsupported editorial wording is repaired before requesting factual review', async () => {
      const promotional = structuredClone(raw); promotional.sections[0].heading = 'เพลงยอดนิยม';
      respond([promotional, raw, review(true)]);
      assert.equal((await generateBiography(artist, sources, new AbortController().signal)).sections.length, 3);
      assert.equal(calls, 3);
    });
  } finally { globalThis.fetch = originalFetch; }
});
