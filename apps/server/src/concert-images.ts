// Only public TTM poster paths from a saved concert may be relayed. Never accept a request URL.
export function isTtmPoster(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol==='https:' && ['www.thaiticketmajor.com','thaiticketmajor.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname.startsWith('/img_poster/');
  } catch { return false; }
}

export async function fetchTtmPoster(value: string, request: typeof fetch = fetch) {
  if (!isTtmPoster(value)) throw Error('Unsupported poster source');
  const signal = AbortSignal.timeout(15_000);
  let url = value;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await request(url,{ redirect: 'manual',signal });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirect===3) throw Error('Poster redirect unavailable');
      const next = new URL(location,url).href;
      if (!isTtmPoster(next)) throw Error('Poster redirect outside source');
      url = next; continue;
    }
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const limit = 8 * 1024 * 1024;
    if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(type || '')
      || Number(response.headers.get('content-length')) > limit || !response.body) {
      await response.body?.cancel(); throw Error('Poster unavailable');
    }
    const reader = response.body.getReader(),chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done,value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > limit) throw Error('Poster too large');
        chunks.push(chunk);
      }
    } catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
    const data = Buffer.concat(chunks);
    const valid = type==='image/jpeg' ? data.subarray(0,3).equals(Buffer.from([255,216,255]))
      : type==='image/png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : data.length>=12 && data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP';
    if (!valid) throw Error('Invalid poster bytes');
    return { data,type: type! };
  }
  throw Error('Poster unavailable');
}
