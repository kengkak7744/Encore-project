export type Artist = { id: string; slug: string; name: string; name_en?: string; kind: string; genres: string[]; bio?: string; image_url?: string; image_credit?: ArtistImageCredit | null; image_review?: { status: string; checkedAt: string; reason?: string; caption?: string } | null; membership_evidence?: ArtistMembershipEvidence | null; popularity_evidence?: ArtistPopularityEvidence | null; verified_at?: string | null; upcoming_count?: number; members?: Artist[]; bands?: Artist[]; accounts?: { platform: string; url: string; last_error?: string }[]; sources?: { source_url: string; label: string; checked_at: string }[]; biography?: { position: number; heading: string; body: string; source_url: string; source_label: string; checked_at: string; generated_model?: string | null }[]; upcoming?: Concert[] };
export type ArtistImageCredit = { creator: string; title: string; source_url: string; license: string; license_url: string; photo_date: string; changes: string; verified_at: string };
export type EditableArtist = Artist & { edit_version: string; biography_manual_override?: boolean; image_manual_override?: boolean };
export type ArtistMembershipEvidence = { checkedAt: string; pending: string[]; claims: { kind: string; status: 'current' | 'historical' | 'unclear'; text: string; sourceUrl: string; sourceLabel: string; publishedAt?: string; reproductionUrl?: string }[] };
export type ArtistPopularityEvidence = { status: string; metric: string; value?: number | null; sourceUrl: string; sourceLabel?: string; work?: string; sourceDate?: string | null; measuredAt?: string | null; checkedAt: string; note: string };
export type Concert = { id: string; slug: string; title: string; description?: string; starts_at?: string | null; time_tba?: boolean; venue?: string | null; city?: string | null; country_code: string; status: string; price_min?: string | null; price_max?: string | null; price_note?: string | null; currency: string; image_url?: string | null; last_verified_at?: string | null; artists?: Artist[]; performances?: { id: string; starts_at: string; ends_at?: string | null; time_tba: boolean; status: string; is_current: boolean; performance_label?: string | null }[]; sources?: { source?: string; source_name?: string; url?: string; source_url?: string; fetchedAt?: string; fetched_at?: string }[] };
export type NewsMedia = { type: 'image' | 'video'; url: string | null; thumbnailUrl: string | null };
export type News = { id: string; artist_name: string; artist_slug: string; platform: string; title?: string; body?: string; summary?: string; source_url: string; image_url?: string; media_items?: NewsMedia[]; published_at?: string; last_verified_at?: string; stale?: boolean; followed?: boolean };
export type Page<T> = { items: T[]; total?: number; page: number; pageSize: number };

export const sessionEvent = 'encore-session-change';
let sessionEpoch = 0;
let announcedSignedOut = false;
let announcedPermissionChange = false;
type SessionChange = 'authenticated' | 'logout' | 'expired' | 'permissions';

function sessionChanged(reason: SessionChange, publish = true) {
  sessionEpoch++;
  announcedSignedOut = reason==='expired' || reason==='logout';
  if (reason!=='permissions') announcedPermissionChange = false;
  if (typeof window==='undefined') return;
  window.dispatchEvent(new CustomEvent(sessionEvent,{ detail: reason }));
  // Share an invalidation notice only; never store a session token or user data.
  if (publish) try { localStorage.setItem(sessionEvent,JSON.stringify({ reason,nonce: crypto.randomUUID() })); } catch { /* Storage can be disabled. */ }
}
if (typeof window!=='undefined') window.addEventListener('storage',event => {
  if (event.key!==sessionEvent || !event.newValue) return;
  try {
    const reason = JSON.parse(event.newValue).reason;
    if (['authenticated','logout','expired','permissions'].includes(reason)) sessionChanged(reason,false);
  } catch { /* Ignore unrelated or malformed storage notices. */ }
});

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const epoch = sessionEpoch;
  const response = await fetch('/api' + path, { ...options, cache: 'no-store',headers: { 'Content-Type': 'application/json', ...options?.headers }, credentials: 'same-origin' });
  let body: any;
  try { body = await response.json(); } catch { throw new Error('เชื่อมต่อ API ไม่ได้'); }
  if (epoch!==sessionEpoch) throw new Error('บัญชีหรือสิทธิ์เปลี่ยนแล้ว กรุณาลองใหม่');
  if (!response.ok) {
    if (response.status===401 && !path.startsWith('/auth/') && !announcedSignedOut) sessionChanged('expired');
    if (response.status===403 && path.startsWith('/admin/') && !announcedPermissionChange) {
      announcedPermissionChange=true; sessionChanged('permissions');
    }
    throw new Error(body?.error || 'เกิดข้อผิดพลาด');
  }
  if (path==='/auth/login' || path==='/auth/register') sessionChanged('authenticated');
  if (path==='/auth/logout') sessionChanged('logout');
  if (path==='/me') {
    announcedSignedOut=false;
    if (body.user?.role==='admin') announcedPermissionChange=false;
  }
  return body as T;
}

export function date(value?: string | null, timeTba = false) { return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', ...(timeTba ? {} : { timeStyle: 'short' as const }), timeZone: 'Asia/Bangkok' }).format(new Date(value)) + (timeTba ? ' · เวลาไม่ระบุ' : '') : 'ยังไม่ประกาศ'; }
export function price(value?: string | number | null) { return value === null || value === undefined ? 'ยังไม่ประกาศราคา' : '฿' + Number(value).toLocaleString('th-TH'); }
export function stale(value?: string | null) { return !value || Date.now() - new Date(value).getTime() > 2 * 60 * 60 * 1000; }
