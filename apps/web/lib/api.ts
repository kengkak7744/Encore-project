export type Artist = { id: string; slug: string; name: string; name_en?: string; kind: string; genres: string[]; bio?: string; image_url?: string; verified_at?: string | null; upcoming_count?: number; members?: Artist[]; bands?: Artist[]; accounts?: { platform: string; url: string; last_error?: string }[]; sources?: { source_url: string; label: string; checked_at: string }[]; biography?: { position: number; heading: string; body: string; source_url: string; source_label: string; checked_at: string }[]; upcoming?: Concert[] };
export type Concert = { id: string; slug: string; title: string; description?: string; starts_at?: string | null; time_tba?: boolean; venue?: string | null; city?: string | null; country_code: string; status: string; price_min?: string | null; price_max?: string | null; currency: string; image_url?: string | null; last_verified_at?: string | null; artists?: Artist[]; performances?: { id: string; starts_at: string; time_tba: boolean; status: string }[]; sources?: { source?: string; source_name?: string; url?: string; source_url?: string; fetchedAt?: string; fetched_at?: string }[] };
export type News = { id: string; artist_name: string; artist_slug: string; platform: string; title?: string; body?: string; summary?: string; source_url: string; image_url?: string; published_at?: string; last_verified_at?: string; stale?: boolean; followed?: boolean };
export type Page<T> = { items: T[]; total?: number; page: number; pageSize: number };

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, credentials: 'same-origin' });
  let body: any;
  try { body = await response.json(); } catch { throw new Error('เชื่อมต่อ API ไม่ได้'); }
  if (!response.ok) throw new Error(body?.error || 'เกิดข้อผิดพลาด');
  return body as T;
}

export function date(value?: string | null, timeTba = false) { return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', ...(timeTba ? {} : { timeStyle: 'short' as const }), timeZone: 'Asia/Bangkok' }).format(new Date(value)) + (timeTba ? ' · เวลาไม่ระบุ' : '') : 'ยังไม่ประกาศ'; }
export function price(value?: string | number | null) { return value === null || value === undefined ? 'ยังไม่ประกาศราคา' : '฿' + Number(value).toLocaleString('th-TH'); }
export function stale(value?: string | null) { return !value || Date.now() - new Date(value).getTime() > 2 * 60 * 60 * 1000; }
