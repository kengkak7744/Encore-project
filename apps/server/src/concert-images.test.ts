import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTtmPoster, isTtmPoster } from './concert-images.js';

const poster = 'https://www.thaiticketmajor.com/img_poster/example.jpg';
const jpeg = new Uint8Array([255,216,255,224,0,16]);
const response = () => new Response(jpeg,{ headers: { 'content-type': 'image/jpeg' } });

test('Poster relay restricts host, protocol, credentials, port and image path before fetching',async () => {
  for (const url of ['http://www.thaiticketmajor.com/img_poster/a.jpg','https://localhost/img_poster/a.jpg',
    'https://www.thaiticketmajor.com.evil.test/img_poster/a.jpg','https://user:pass@www.thaiticketmajor.com/img_poster/a.jpg',
    'https://www.thaiticketmajor.com:444/img_poster/a.jpg','https://www.thaiticketmajor.com/admin',
    'https://www.thaiticketmajor.com/img_poster/../../admin','javascript:alert(1)']) {
    assert.equal(isTtmPoster(url),false);
    await assert.rejects(fetchTtmPoster(url,async () => { assert.fail('Unsafe URL fetched'); }),/Unsupported/);
  }
  assert.equal(isTtmPoster(poster),true);
});

test('Public JPEG bytes are retained and redirects are followed manually with a timeout',async () => {
  const calls: string[] = [];
  const image = await fetchTtmPoster(poster,async (url,options) => {
    assert.equal(options?.redirect,'manual');assert.ok(options?.signal);calls.push(String(url));
    return calls.length===1 ? new Response(null,{ status: 302,headers: { location: '/img_poster/final.jpg' } }) : response();
  });
  assert.deepEqual(calls,[poster,'https://www.thaiticketmajor.com/img_poster/final.jpg']);
  assert.equal(image.type,'image/jpeg');assert.deepEqual(image.data,Buffer.from(jpeg));
});

test('Poster relay never follows external redirects or unlimited redirect loops',async () => {
  let calls = 0;
  await assert.rejects(fetchTtmPoster(poster,async () => { calls++;return new Response(null,{ status: 302,headers: { location: 'http://127.0.0.1/private' } }); }),/outside/);
  assert.equal(calls,1);
  calls = 0;
  await assert.rejects(fetchTtmPoster(poster,async () => { calls++;return new Response(null,{ status: 302,headers: { location: poster } }); }),/redirect unavailable/);
  assert.equal(calls,4);
});

test('HTML, SVG, unavailable upstream responses and mislabeled HTML cannot be served as images',async () => {
  for (const [body,type,status] of [['<html>challenge</html>','text/html',200],['<svg/>','image/svg+xml',200],
    ['<html>error</html>','image/jpeg',200],['failed','image/jpeg',403]] as const)
    await assert.rejects(fetchTtmPoster(poster,async () => new Response(body,{ status,headers: { 'content-type': type } })),/unavailable|Invalid/);
});

test('Declared or streamed images larger than 8 MiB are rejected and cancelled',async () => {
  await assert.rejects(fetchTtmPoster(poster,async () => new Response(jpeg,{ headers: { 'content-type': 'image/jpeg','content-length': String(8*1024*1024+1) } })),/unavailable/);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8*1024*1024+1)); },cancel() { cancelled = true; } });
  await assert.rejects(fetchTtmPoster(poster,async () => new Response(stream,{ headers: { 'content-type': 'image/jpeg' } })),/too large/);
  assert.equal(cancelled,true);
});

test('A network failure is reported without a fabricated image',async () => {
  await assert.rejects(fetchTtmPoster(poster,async () => { throw Error('Connection unavailable'); }),/Connection unavailable/);
});
