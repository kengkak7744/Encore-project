import { query } from './db.js';
import { imageCreditJoin, imageCreditSelect } from './artist-audit.js';

type Candidate = {
  id: string; name: string; slug: string; kind: string; genres: string[];
  popularity_rank: number | null; family_ids: string[];
  image_url: string | null; image_review: unknown; image_credit: unknown;
};
type Interest = { artist_id: string; weight: number; attended: boolean; engaged: boolean };
type PeerSignal = { artist_id: string; supporters: number; strength: number };
type Signal = { points: number; reason: string };
const normalizedGenres = (genres: string[]) => new Set(genres.map(g => g.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).filter(Boolean));
function overlap(left: Set<string>, right: Set<string>) {
  const shared = [...left].filter(g => right.has(g)).length;
  return shared / Math.max(1,left.size+right.size-shared);
}

/** Bounded, explainable ranking; raw user/peer histories never leave this module. */
export function rankArtistSuggestions(candidates: Candidate[], interests: Interest[], followedIds: Set<string>, peers: PeerSignal[], limit = 5) {
  const byId = new Map(candidates.map(a => [a.id,a]));
  const profile = interests.filter(i => byId.has(i.artist_id) && i.weight>0);
  const totalWeight = profile.reduce((sum,i) => sum+Number(i.weight),0);
  const peerMap = new Map(peers.map(p => [p.artist_id,p]));
  const genres = new Map(candidates.map(a => [a.id,normalizedGenres(a.genres)]));
  const scored = candidates.filter(a => !followedIds.has(a.id)).map(artist => {
    const signals: Signal[] = [];
    let genrePoints = 0,genreAnchor = '',bestGenre = 0,relation = 0,relationAnchor = '';
    for (const interest of profile) {
      const anchor = byId.get(interest.artist_id)!;
      const affinity = artist.id===anchor.id ? 0 : overlap(genres.get(artist.id)!,genres.get(anchor.id)!)*Number(interest.weight);
      genrePoints += affinity;
      if (affinity>bestGenre) { bestGenre=affinity; genreAnchor=anchor.name; }
      // Only direct band/member links contribute; two unrelated solo artists are not inferred as bandmates.
      if (artist.id!==anchor.id && (artist.family_ids.includes(anchor.id) || anchor.family_ids.includes(artist.id))) {
        const strength=Math.min(1,Number(interest.weight));
        if (strength>relation) { relation=strength; relationAnchor=anchor.name; }
      }
    }
    if (relation) signals.push({ points: 40*relation,reason: 'วงหรือสมาชิกที่เกี่ยวข้องกับ '+relationAnchor });
    const own = profile.find(i => i.artist_id===artist.id);
    if (own?.attended) signals.push({ points: 25*Math.min(1,Number(own.weight)/0.7),reason: 'ศิลปินจากงานที่คุณเคยไป' });
    if (own?.engaged) signals.push({ points: 12*Math.min(1,Number(own.weight)/0.6),reason: 'ศิลปินในโพสต์ที่คุณสนใจ' });
    if (genrePoints) signals.push({ points: 30*genrePoints/totalWeight,reason: 'แนวเพลงใกล้กับ '+genreAnchor });
    const peer = peerMap.get(artist.id);
    // Require several distinct peers and shrink weak overlaps to avoid one account deciding the list.
    if (peer && Number(peer.supporters)>=3 && Number(peer.strength)>0) signals.push({ points: 25*Number(peer.strength)/(1+Number(peer.strength)),reason: 'แฟนเพลงที่สนใจศิลปินคล้ายคุณติดตาม' });
    signals.sort((a,b) => b.points-a.points || a.reason.localeCompare(b.reason));
    const rank = Number(artist.popularity_rank);
    const popularity = Number.isFinite(rank) && rank>0 ? 2/Math.sqrt(rank) : 0;
    return { artist,signals,score: signals.reduce((sum,s) => sum+s.points,0)+popularity };
  });
  const selected: typeof scored = [];
  while (selected.length<limit && scored.length) {
    const diversityScore = (entry: typeof scored[number]) => {
      let similarity=0,family=0;
      for (const previous of selected) {
        similarity=Math.max(similarity,overlap(genres.get(entry.artist.id)!,genres.get(previous.artist.id)!));
        if (entry.artist.family_ids.some(id => previous.artist.family_ids.includes(id))) family=1;
      }
      return entry.score*(1-0.18*similarity-0.5*family);
    };
    scored.sort((a,b) => diversityScore(b)-diversityScore(a) || b.score-a.score || a.artist.name.localeCompare(b.artist.name,'th') || a.artist.id.localeCompare(b.artist.id));
    selected.push(scored.shift()!);
  }
  return selected.map(({ artist,signals }) => {
    const { family_ids: _family,popularity_rank: _rank,...publicArtist } = artist;
    const reasons=signals.slice(0,2).map(s => s.reason);
    return { ...publicArtist,reason: reasons.join(' · ') || 'ลองทำความรู้จัก',reasons };
  });
}

export async function suggestArtists(userId: string | null) {
  const candidates = await query<Candidate>(`SELECT a.id,a.slug,a.name,a.kind,a.genres,a.popularity_rank,a.image_url,a.image_review,${imageCreditSelect},
    ARRAY(SELECT DISTINCT family FROM (
      SELECT m.band_id AS family FROM artist_memberships m WHERE m.band_id=a.id OR m.member_id=a.id
      UNION SELECT m.member_id FROM artist_memberships m WHERE m.band_id=a.id
    ) families) AS family_ids
    FROM artists a ${imageCreditJoin}`);
  if (!userId) return rankArtistSuggestions(candidates,[],new Set(),[]);
  const [follows,interests,peers] = await Promise.all([
    query<{ artist_id: string }>('SELECT artist_id FROM follows WHERE user_id=$1',[userId]),
    query<Interest>(`WITH evidence AS (
      SELECT f.artist_id,1.0 AS weight,false AS attended,false AS engaged FROM follows f WHERE f.user_id=$1
      UNION ALL
      SELECT ca.artist_id,0.7/(1+GREATEST(0,extract(epoch FROM now()-c.starts_at)/86400)/365),true,false
      FROM attendance at JOIN concerts c ON c.id=at.concert_id JOIN concert_artists ca ON ca.concert_id=c.id
      WHERE at.user_id=$1 AND c.status IN ('scheduled','completed') AND c.starts_at IS NOT NULL
        AND CASE WHEN c.time_tba THEN ((c.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok'
          ELSE COALESCE(c.ends_at,((c.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') END<=now()
        AND NOT EXISTS(SELECT 1 FROM concert_performances cp WHERE cp.concert_id=c.id AND cp.is_current AND cp.status NOT IN ('cancelled','postponed')
          AND (cp.starts_at IS NULL OR CASE WHEN cp.time_tba THEN ((cp.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok'
            ELSE COALESCE(cp.ends_at,((cp.starts_at AT TIME ZONE 'Asia/Bangkok')::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') END>now()))
      UNION ALL
      SELECT pa.artist_id,LEAST(0.6,sum(e.weight)),false,true FROM (
        SELECT post_id,max(weight) AS weight FROM (
          SELECT l.post_id,0.12 AS weight FROM community_likes l JOIN community_posts lp ON lp.id=l.post_id WHERE l.user_id=$1 AND lp.created_at>=now()-interval '90 days'
          UNION ALL SELECT cc.post_id,0.15 FROM community_comments cc WHERE cc.user_id=$1 AND NOT cc.hidden AND cc.created_at>=now()-interval '90 days'
          UNION ALL SELECT p.id,0.2 FROM community_posts p WHERE p.user_id=$1 AND p.created_at>=now()-interval '90 days'
        ) interactions GROUP BY post_id
      ) e JOIN community_posts p ON p.id=e.post_id AND NOT p.hidden JOIN community_post_artists pa ON pa.post_id=p.id GROUP BY pa.artist_id
    ) SELECT artist_id,LEAST(2,sum(weight))::float8 AS weight,bool_or(attended) AS attended,bool_or(engaged) AS engaged FROM evidence GROUP BY artist_id`,[userId]),
    query<PeerSignal>(`WITH mine AS (SELECT artist_id FROM follows WHERE user_id=$1),
      nearest AS (
        SELECT f.user_id,count(*)::float8 AS shared FROM follows f JOIN mine ON mine.artist_id=f.artist_id
        WHERE f.user_id<>$1 GROUP BY f.user_id
      ),peer_scores AS (
        SELECT n.user_id,(n.shared/sqrt((SELECT count(*) FROM mine)*count(f.artist_id)))*(n.shared/(n.shared+2)) AS similarity
        FROM nearest n JOIN follows f ON f.user_id=n.user_id GROUP BY n.user_id,n.shared
        ORDER BY similarity DESC,n.user_id LIMIT 200
      ) SELECT f.artist_id,count(*)::int AS supporters,sum(s.similarity)::float8 AS strength
      FROM peer_scores s JOIN follows f ON f.user_id=s.user_id GROUP BY f.artist_id HAVING count(*)>=3`,[userId]),
  ]);
  return rankArtistSuggestions(candidates,interests,new Set(follows.map(f => f.artist_id)),peers);
}
