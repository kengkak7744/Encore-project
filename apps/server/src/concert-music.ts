/** Narrow program evidence; the word "music" or a generic party alone is insufficient. */
export function announcedLiveMusic(value:string) {
  return /\blive\s+(?:music|bands?|covers?)\b|\blive\s+[\p{L}\s]{1,35}\s+covers?\s+by\b|ดนตรีสด|การแสดงดนตรี|คอนเสิร์ต/iu.test(value);
}

export function announcedNightlifeMusic(value:string) {
  return announcedLiveMusic(value)||/\bDJ\s*(?:sets?|line.?up|community)\b|\bhouse\s*music\b|\belectronic\s*music\b|\b(?:hard|dark|industrial)\s+techno\b|\bhip[ -]?hop\b/iu.test(value);
}
