import { Router } from 'express';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { requireUser, type User } from '../auth.js';
import { drivingDistance, flightQuote, hotelQuote } from '../travel.js';
import { relevantKnowledge } from '../knowledge.js';

export const assistantRoutes = Router();
assistantRoutes.use(requireUser);

assistantRoutes.get('/recommendations', async (_req, res) => {
  const user = res.locals.user as User;
  const items = await query(
    `WITH tastes AS (
      SELECT unnest(a.genres) AS genre FROM follows f JOIN artists a ON a.id=f.artist_id WHERE f.user_id=$1
      UNION ALL
      SELECT unnest(a.genres) FROM attendance at JOIN concert_artists ca ON ca.concert_id=at.concert_id JOIN artists a ON a.id=ca.artist_id WHERE at.user_id=$1
    )
    SELECT c.id,c.slug,c.title,c.starts_at,c.city,c.venue,c.price_min,c.price_max,c.price_note,c.currency,c.status,
      bool_or(f.user_id IS NOT NULL) AS followed_artist,
      count(DISTINCT t.genre)::integer AS matching_genres,
      array_agg(DISTINCT a.name) FILTER (WHERE a.id IS NOT NULL) AS artists
    FROM concerts c JOIN concert_artists ca ON ca.concert_id=c.id JOIN artists a ON a.id=ca.artist_id
    LEFT JOIN follows f ON f.artist_id=a.id AND f.user_id=$1
    LEFT JOIN tastes t ON t.genre=ANY(a.genres)
    WHERE (c.starts_at >= now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) AND c.status='scheduled'
    GROUP BY c.id ORDER BY bool_or(f.user_id IS NOT NULL) DESC, count(DISTINCT t.genre) DESC, c.starts_at ASC LIMIT 20`, [user.id]);
  res.json({ items });
});

assistantRoutes.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 1500);
  if (!message) { res.status(400).json({ error: 'กรุณาพิมพ์คำถาม' }); return; }
  const user = res.locals.user as User;
  const artists = await query<{ id: string; slug: string; name: string; name_en: string | null }>('SELECT id,slug,name,name_en FROM artists ORDER BY length(name) DESC');
  const cities = await query<{ city: string }>('SELECT DISTINCT city FROM concerts WHERE city IS NOT NULL LIMIT 100');
  const directArtist = artists.find((artist) => [artist.name, artist.name_en].some((name) => name && message.toLocaleLowerCase().includes(name.toLocaleLowerCase())));
  const directCity = cities.find((row) => message.toLocaleLowerCase().includes(row.city.toLocaleLowerCase()));
  try {
    const response = await fetch(config.ollamaUrl + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.chatModel, stream: false, format: 'json', options: { temperature: 0, num_ctx: 2048 }, messages: [{ role: 'system', content: 'จัดประเภทคำถามแฟนเพลง ตอบ JSON เท่านั้น รูปแบบ {"intent":"concerts|news|recommendations|budget|unknown"} ห้ามตอบข้อเท็จจริง' }, { role: 'user', content: message }] }), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Ollama HTTP ' + response.status);
    const body = await response.json() as { message?: { content?: string } };
    const intent = JSON.parse(body.message?.content || '{}').intent as string;
    if (intent === 'budget') { res.json({ answer: 'เปิดเครื่องคำนวณงบทริปในหน้านี้เพื่อแยกราคาบัตร การเดินทาง และที่พัก โดยระบบจะแสดงประเภทราคาแต่ละรายการ', sources: [] }); return; }
    if (intent === 'news') {
      const news = await query<{ body: string | null; summary: string | null; source_url: string; published_at: string | null; artist: string }>('SELECT n.body,n.summary,n.source_url,n.published_at,a.name AS artist FROM news_items n JOIN artists a ON a.id=n.artist_id WHERE ($1::uuid IS NULL OR n.artist_id=$1) ORDER BY n.published_at DESC NULLS LAST LIMIT 5', [directArtist?.id || null]);
      const lines = news.map((item) => `${item.artist}: ${(item.summary || item.body || 'โพสต์ไม่มีข้อความ').slice(0, 250)} (${item.source_url})`);
      res.json({ answer: lines.length ? lines.join('\n\n') : 'ยังไม่มีข่าวที่ระบบดึงข้อความได้จากบัญชีทางการของศิลปินนี้', sources: news.map((item) => item.source_url) }); return;
    }
    if (intent === 'recommendations') {
      const rows = await query<{ title: string; starts_at: string; time_tba: boolean; source_url: string | null }>(`SELECT DISTINCT c.title,c.starts_at,c.time_tba,cs.source_url FROM follows f JOIN concert_artists ca ON ca.artist_id=f.artist_id JOIN concerts c ON c.id=ca.concert_id LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id LIMIT 1) cs ON true WHERE f.user_id=$1 AND (c.starts_at >= now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) ORDER BY c.starts_at LIMIT 5`, [user.id]);
      res.json({ answer: rows.length ? rows.map((row) => `${row.title} — ${formatDate(row.starts_at, row.time_tba)} (${row.source_url || 'ไม่มีลิงก์ต้นทาง'})`).join('\n') : 'ยังไม่มีงานของศิลปินที่ติดตามในข้อมูลที่ระบบตรวจพบ ลองติดตามศิลปินเพิ่มเติม', sources: rows.map((row) => row.source_url).filter(Boolean) }); return;
    }
    if (intent === 'concerts' || directArtist || directCity) {
      const concerts = await query<{ title: string; starts_at: string | null; time_tba: boolean; venue: string | null; city: string | null; status: string; price_min: string | null; price_note: string | null; currency: string; source_url: string | null }>(`SELECT c.title,c.starts_at,c.time_tba,c.venue,c.city,c.status,c.price_min,c.price_note,c.currency,cs.source_url FROM concerts c LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id ORDER BY CASE source_role WHEN 'organizer' THEN 0 ELSE 1 END LIMIT 1) cs ON true WHERE (c.starts_at >= now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM concert_artists ca WHERE ca.concert_id=c.id AND ca.artist_id=$1)) AND ($2::text IS NULL OR c.city ILIKE $2) ORDER BY c.starts_at LIMIT 5`, [directArtist?.id || null, directCity?.city || null]);
      const lines = concerts.map((item) => `${item.title} — ${formatDate(item.starts_at, item.time_tba)} · ${[item.venue, item.city].filter(Boolean).join(', ') || 'ยังไม่ระบุสถานที่'} · ${item.status}${item.price_min ? ` · ราคาต้นทาง ${Number(item.price_min).toLocaleString('th-TH')} ${item.currency}` : ' · ยังไม่ทราบราคา'}${item.price_note ? ' · ' + item.price_note : ''}\nแหล่ง: ${item.source_url || 'ยังไม่มีลิงก์ต้นทาง'}`);
      res.json({ answer: lines.length ? lines.join('\n\n') : 'ยังไม่พบคอนเสิร์ตที่ตรงกับคำถามในข้อมูลที่ระบบรองรับ', sources: concerts.map((item) => item.source_url).filter(Boolean) }); return;
    }
    const knowledge = await relevantKnowledge(message);
    res.json({ answer: knowledge.length ? 'พบข้อมูลที่อาจเกี่ยวข้อง ตรวจรายการจากแหล่งต้นทางด้านล่าง: ' + knowledge.map((item) => `${item.content} (${item.source_url || 'ไม่มีแหล่ง'})`).join('\n') : 'ลองถามชื่อศิลปิน คอนเสิร์ต ข่าว หรือขอคำแนะนำจากศิลปินที่ติดตาม', sources: knowledge.map((item) => item.source_url).filter(Boolean) });
  } catch {
    res.status(503).json({ error: 'ผู้ช่วย AI ยังใช้งานไม่ได้ กรุณาลองใหม่ภายหลัง', code: 'AI_UNAVAILABLE' });
  }
});

function formatDate(value: string | null, timeTba = false) {
  return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', ...(timeTba ? {} : { timeStyle: 'short' as const }), timeZone: 'Asia/Bangkok' }).format(new Date(value)) + (timeTba ? ' เวลาไม่ระบุ' : '') : 'ยังไม่ประกาศวัน';
}

assistantRoutes.post('/trip-estimates', async (req, res) => {
  const concertId = String(req.body?.concertId || '');
  const origin = String(req.body?.origin || '').trim().slice(0, 80);
  const nights = Math.max(0, Math.min(14, Number(req.body?.nights) || 0));
  const people = Math.max(1, Math.min(10, Number(req.body?.people) || 1));
  const distanceKm = Math.max(0, Math.min(3000, Number(req.body?.distanceKm) || 0));
  const concert = await one<{ id: string; title: string; city: string | null; venue: string | null; country_code: string; price_min: string | null; price_max: string | null; currency: string; starts_at: string | null; last_verified_at: string | null; price_note: string | null }>('SELECT id,title,city,venue,country_code,price_min,price_max,currency,starts_at,last_verified_at,price_note FROM concerts WHERE id=$1', [concertId]);
  if (!concert) { res.status(404).json({ error: 'ไม่พบคอนเสิร์ต' }); return; }
  const ticket = concert.price_min != null && !concert.price_note ? Number(concert.price_min) * people : null;
  const destination = concert.city || 'ไม่ทราบเมือง';
  const sameCity = origin && origin.toLocaleLowerCase() === destination.toLocaleLowerCase();
  let usedDistanceKm = distanceKm;
  let distanceSource = distanceKm ? 'user' : 'unavailable';
  if (!sameCity && concert.country_code === 'TH' && origin && concert.city) {
    try {
      const route = await drivingDistance(origin + ', Thailand', [concert.venue, concert.city, 'Thailand'].filter(Boolean).join(', '));
      if (route) { usedDistanceKm = route.distanceKm; distanceSource = 'Google Routes'; }
    } catch { /* Keep the user-entered distance when Routes is unavailable. */ }
  }
  const distanceNote = distanceSource === 'Google Routes' ? 'ระยะทางถนนจาก Google Routes' : 'ระยะทางที่กรอก';
  const estimates = [
    { kind: 'ticket', label: 'บัตรคอนเสิร์ต', amount: ticket, priceType: ticket === null ? 'unavailable' : 'observed', note: ticket === null ? (concert.price_note || 'ยังไม่มีราคาบัตร') : 'อ้างอิงราคาต่ำสุดที่พบ ไม่ใช่ราคาสด', observedAt: concert.last_verified_at },
    { kind: 'bus', label: 'รถทัวร์ไปกลับ', amount: sameCity ? 0 : usedDistanceKm ? Math.round(usedDistanceKm * 2 * 1.5 * people) : null, priceType: sameCity || usedDistanceKm ? 'estimate' : 'unavailable', note: usedDistanceKm ? `ประมาณ 1.5 บาท/กม./คน จาก${distanceNote}; ยังไม่ใช่ราคา 12Go` : 'กรอกระยะทางเพื่อประเมิน' },
    { kind: 'train', label: 'รถไฟไปกลับ', amount: sameCity ? 0 : usedDistanceKm ? Math.round(usedDistanceKm * 2 * 0.9 * people) : null, priceType: sameCity || usedDistanceKm ? 'estimate' : 'unavailable', note: usedDistanceKm ? `ประมาณ 0.9 บาท/กม./คน จาก${distanceNote}; ระยะทางรถไฟจริงอาจต่างออกไป` : 'กรอกระยะทางเพื่อประเมิน' },
    { kind: 'flight', label: 'เครื่องบินไปกลับ', amount: sameCity ? 0 : null, priceType: sameCity ? 'estimate' : 'unavailable', note: sameCity ? 'อยู่เมืองเดียวกัน' : 'ยังไม่มีราคาเชื่อมต่อจากผู้ให้บริการ' },
    { kind: 'car', label: 'รถส่วนตัว', amount: sameCity ? 0 : usedDistanceKm ? Math.round(usedDistanceKm * 2 / 12 * 38) : null, priceType: sameCity || usedDistanceKm ? 'estimate' : 'unavailable', note: usedDistanceKm ? `ประมาณที่ 12 กม./ลิตร น้ำมัน 38 บาท/ลิตร จาก${distanceNote}; ไม่รวมค่าทางด่วนและที่จอด` : 'กรอกระยะทางเพื่อประเมิน' },
    { kind: 'hotel', label: 'ที่พัก', amount: nights ? nights * 1200 * Math.ceil(people / 2) : 0, priceType: 'estimate', note: nights ? 'ประมาณ 1,200 บาทต่อห้องต่อคืน ห้องละ 2 คน' : 'ไม่พักค้างคืน' },
  ];
  if (concert.starts_at && config.amadeusClientId) {
    const showDate = new Date(concert.starts_at);
    try {
      const flight = await flightQuote(origin, destination, showDate, people);
      if (flight) Object.assign(estimates[3], { amount: flight.amount, priceType: flight.live ? 'live' : 'observed', note: flight.live ? 'ข้อเสนอจาก Amadeus; ราคาอาจเปลี่ยน' : 'ข้อมูลจาก Amadeus test API ไม่ใช่ราคาจองจริง', observedAt: flight.observedAt, sourceUrl: flight.sourceUrl });
    } catch { /* Keep unavailable price on provider failure. */ }
    try {
      const hotel = await hotelQuote(destination, showDate, nights, Math.ceil(people / 2));
      if (hotel) Object.assign(estimates[5], { amount: hotel.amount, priceType: hotel.live ? 'live' : 'observed', note: hotel.live ? 'ข้อเสนอจาก Amadeus; ราคาอาจเปลี่ยน' : 'ข้อมูลจาก Amadeus test API ไม่ใช่ราคาจองจริง', observedAt: hotel.observedAt, sourceUrl: hotel.sourceUrl });
    } catch { /* Keep clearly labelled estimate. */ }
  }
  res.json({ concert: { id: concert.id, title: concert.title, destination, startsAt: concert.starts_at }, origin, people, nights, distanceKmUsed: usedDistanceKm || null, distanceSource, currency: 'THB', items: estimates, generatedAt: new Date().toISOString(), disclaimer: 'ราคาประมาณใช้วางแผนเท่านั้น กรุณาตรวจราคาจริงก่อนจอง' });
});
