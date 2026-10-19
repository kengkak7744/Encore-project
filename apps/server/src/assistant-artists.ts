export type ChatArtist = { id: string; slug: string; name: string; name_en: string | null };

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();

function artistNames(artist: ChatArtist) {
  const names = [artist.name,artist.name_en,artist.slug,artist.slug.replaceAll('-',' ')].filter((name): name is string => !!name).map(normalize);
  return [...new Set(names.flatMap(name => [name,name.replace(/\([^)]*\)/g,'').replace(/\s+/g,' ').trim()]).filter(Boolean))];
}

/** Only stored names/slug and names without parenthetical qualifiers are aliases. */
export function findChatArtist<T extends ChatArtist>(artists: T[],value: string,mode: 'message' | 'name' = 'message'): T | undefined {
  const text = normalize(value);
  const candidates = artists.map(artist => {
    const matching = artistNames(artist).filter(name => {
      if (mode === 'name') return name === text;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const prefix = /^[a-z0-9_]/.test(name) ? '(?<![a-z0-9_])' : '';
      const suffix = /[a-z0-9_]$/.test(name) ? '(?![a-z0-9_])' : '';
      return new RegExp(prefix+escaped+suffix,'u').test(text);
    });
    return { artist,score: Math.max(0,...matching.map(name => name.length)) };
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score);
  if (!candidates.length || candidates[1]?.score === candidates[0].score) return undefined;
  return candidates[0].artist;
}

export function isArtistProfileQuestion(message: string) {
  if (/ข่าว|โพสต์|คอนเสิร์ต|แนะนำงาน|งบทริป|เคยไป|\b(news|posts?|concerts?|budget|trip)\b/i.test(message)) return false;
  return /รู้จัก|ประวัติ|คือใคร|เป็นใคร|แนะนำตัว|\b(who\s+is|who's|do\s+you\s+know|tell\s+me\s+about|biography|profile)\b/i.test(message);
}

/** Explicit current intent overrides a model distracted by previous turns. */
export function explicitChatIntent(message: string): 'news' | 'unknown' | undefined {
  if (/ข่าว|โพสต์|\b(news|posts?)\b/i.test(message) && !/ค้นข้อความ|ค้นโพสต์|ค้นข่าว|\bsearch\b/i.test(message)) return 'news';
  if (/^(สวัสดี|หวัดดี|ขอบคุณ|hello\b|hi\b|thanks\b)/i.test(message.trim()) && !/ใคร|ศิลปิน|ประวัติ|คอนเสิร์ต|ราคา|งบ|แนะนำ|\b(concert|artist|budget|who)\b/i.test(message)) return 'unknown';
  return undefined;
}

export type ProfileSection = { heading: string; body: string; source_url: string };

export function artistProfileEvidence(artist: ChatArtist,sections: ProfileSection[],_message: string) {
  const sourced = sections.filter(section => {
    try { const url = new URL(section.source_url); return !!section.body.trim() && url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  });
  if (!sourced.length) return { kind: 'profile' as const,profileName:artist.name,answer: `พบโปรไฟล์ ${artist.name} ในระบบ แต่ยังไม่มีประวัติพร้อมแหล่งอ้างอิงเพียงพอสำหรับตอบคำถามนี้`,sources: [] as string[] };
  // Keep all available sections so follow-up questions can use later evidence.
  const selected = sourced;
  return {
    kind: 'profile' as const,
    profileName:artist.name,
    answer: `ข้อมูลของ ${artist.name} จากประวัติที่เก็บไว้ในระบบ:\n\n`+selected.map(section => `${section.heading}\n${section.body}\nแหล่ง: ${section.source_url}`).join('\n\n'),
    sources: [...new Set(selected.map(section => section.source_url))],
  };
}
