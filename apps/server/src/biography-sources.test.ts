import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { extractBiographyText, readBiographyResponse } from './biography-sources.js';

test('reads a 1.4 MB artist page and extracts prose without its site scripts', async () => {
  const prose = 'การรวมตัวของ 4 หนุ่ม นำโดย โปเต้ (ร้องนำ), พัด (กีตาร์), ปาล์ม (คีย์บอร์ด), กัน (เบส)';
  const html = `<html><title>MEAN Band | LOVEiS</title><script>${'x'.repeat(1_400_000)}</script><main><p>${prose}</p></main></html>`;
  const text = await readBiographyResponse(Readable.from([Buffer.from(html)]));
  assert.equal(extractBiographyText(text), `MEAN Band | LOVEiS ${prose}`.normalize('NFKC'));
});

test('rejects oversized pages and destroys the response before parsing', async () => {
  const stream = Readable.from([Buffer.alloc(1_000_000), Buffer.alloc(1_000_001)]);
  await assert.rejects(readBiographyResponse(stream), /exceeds size limit/);
  assert.equal(stream.destroyed, true);
});

test('robots responses retain their explicit 64 KB limit; truncated streams fail', async () => {
  await assert.rejects(readBiographyResponse(Readable.from([Buffer.alloc(64001)]), 64000), /exceeds size limit/);
  const stream = Readable.from((async function* () { yield Buffer.from('partial biography'); throw new Error('connection closed'); })());
  await assert.rejects(readBiographyResponse(stream), /connection closed/);
});
