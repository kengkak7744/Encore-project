import { randomUUID } from 'node:crypto';

export type FeedCandidate = {
  key: string; kind: 'news' | 'post'; published_at: string | Date;
  artist_ids: string[]; genres: string[]; author_key: string;
  followed: boolean; engaged: boolean; related: boolean; genre_match: boolean;
  own: boolean; shared: boolean; engagement: number;
  family_ids?: string[]; content_key?: string | null;
};
export type RankedFeedEntry = { key: string; reason: string };
const overlap = (a: string[],b: string[]) => a.some(value => b.includes(value));

/** Greedy diversity reranking over metadata, never private histories or full post bodies. */
export function rankForYou(candidates: FeedCandidate[], now = Date.now()): RankedFeedEntry[] {
  const hasInterests = candidates.some(c => c.followed || c.engaged || c.related || c.genre_match || c.shared);
  const remaining = new Map(candidates.map(candidate => {
    const timestamp = new Date(candidate.published_at).getTime();
    const age = Number.isFinite(timestamp) ? Math.max(0,(now-timestamp)/86400000) : 365;
    const affinity = (candidate.followed ? 65 : 0)+(candidate.engaged ? 28 : 0)
      +(candidate.related ? 32 : 0)+(candidate.genre_match ? 18 : 0)+(candidate.shared ? 18 : 0);
    const score = affinity*(0.25+0.75*Math.exp(-age/45))+25*Math.exp(-age/7)
      +(candidate.own ? 25*Math.exp(-age/3) : 0)+Math.min(8,2*Math.log1p(Math.max(0,candidate.engagement)));
    const reason = candidate.followed ? 'ศิลปินที่คุณติดตาม' : candidate.own ? 'โพสต์ของคุณ'
      : candidate.engaged ? 'ศิลปินในโพสต์ที่คุณสนใจ' : candidate.related ? 'วงหรือสมาชิกที่เกี่ยวข้องกับศิลปินที่คุณสนใจ'
      : candidate.shared ? 'แฟนเพลงที่มีความสนใจร่วมกัน' : candidate.genre_match ? 'แนวเพลงที่คุณสนใจ'
      : candidate.artist_ids.length ? 'สำรวจศิลปินใหม่' : 'สำรวจชุมชน';
    return [candidate.key,{ ...candidate,family_ids: candidate.family_ids || [],age,score,reason }] as const;
  }));
  const selected: NonNullable<ReturnType<typeof remaining.get>>[] = [];
  const ranked: RankedFeedEntry[] = [];
  let artistCounts = new Map<string,number>(),authorCounts = new Map<string,number>();
  let familyCounts = new Map<string,number>(),contentKeys = new Set<string>();
  while (remaining.size) {
    const position = selected.length%15;
    if (!position) { artistCounts = new Map(); authorCounts = new Map(); familyCounts = new Map(); contentKeys = new Set(); }
    const all = [...remaining.values()];
    // Caps are relaxed only when remaining data cannot fill the feed under them.
    let available = all.filter(c => c.artist_ids.every(id => (artistCounts.get(id) || 0)<3)
      && (authorCounts.get(c.author_key) || 0)<(c.kind==='post' ? 2 : 3)
      && c.family_ids.every(id => (familyCounts.get(id) || 0)<5) && (!c.content_key || !contentKeys.has(c.content_key)));
    if (!available.length) available = all;
    const last = selected.at(-1);
    const different = available.filter(c => c.author_key!==last?.author_key && (!last || !overlap(c.artist_ids,last.artist_ids)));
    if (different.length) available = different;
    // Reserve opportunities, not fabricated posts: related fans and fresh unfamiliar artists.
    if ([2,7,12].includes(position)) {
      const fans = available.filter(c => c.kind==='post' && !c.own && c.age<=30
        && (c.followed || c.engaged || c.related || c.genre_match || c.shared || !hasInterests));
      if (fans.length) available = fans;
    } else if ([4,9,14].includes(position)) {
      const discovery = available.filter(c => !c.followed && !c.own && c.age<=30 && c.artist_ids.length);
      if (discovery.length) available = discovery;
    }
    const recent = selected.slice(-7);
    const value = (c: typeof all[number]) => {
      const similarity = Math.max(0,...recent.map(p => c.content_key && c.content_key===p.content_key ? 1
        : overlap(c.artist_ids,p.artist_ids) ? 1 : c.author_key===p.author_key ? 0.9
        : overlap(c.family_ids,p.family_ids) ? 0.65 : overlap(c.genres,p.genres) ? 0.2 : 0));
      const repeats = Math.max(0,...c.artist_ids.map(id => artistCounts.get(id) || 0));
      return c.score-24*similarity-7*repeats-7*(authorCounts.get(c.author_key) || 0);
    };
    let best = available[0],bestValue = value(best);
    for (const candidate of available.slice(1)) {
      const next = value(candidate);
      if (next>bestValue || next===bestValue && candidate.key.localeCompare(best.key)<0) { best=candidate; bestValue=next; }
    }
    remaining.delete(best.key); selected.push(best); ranked.push({ key: best.key,reason: best.reason });
    for (const id of best.artist_ids) artistCounts.set(id,(artistCounts.get(id) || 0)+1);
    authorCounts.set(best.author_key,(authorCounts.get(best.author_key) || 0)+1);
    for (const id of best.family_ids) familyCounts.set(id,(familyCounts.get(id) || 0)+1);
    if (best.content_key) contentKeys.add(best.content_key);
  }
  return ranked;
}

type Snapshot = { token: string; viewer: string | null; expires: number; entries: RankedFeedEntry[] };
/** Small process-local snapshots stabilize pagination; public payloads are always fetched live. */
export class FeedSnapshots {
  private readonly snapshots = new Map<string,Snapshot>();
  constructor(private readonly ttl = 10*60_000,private readonly max = 32) {}
  get(token: unknown,viewer: string | null,now = Date.now()) {
    for (const [key,value] of this.snapshots) if (value.expires<=now) this.snapshots.delete(key);
    const snapshot = typeof token==='string' ? this.snapshots.get(token) : undefined;
    return snapshot?.viewer===viewer ? snapshot : undefined;
  }
  create(viewer: string | null,entries: RankedFeedEntry[],now = Date.now()) {
    this.get(null,viewer,now);
    while (this.snapshots.size>=this.max) this.snapshots.delete(this.snapshots.keys().next().value!);
    const snapshot = { token: randomUUID(),viewer,entries,expires: now+this.ttl };
    this.snapshots.set(snapshot.token,snapshot); return snapshot;
  }
}
