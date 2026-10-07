import { Router } from 'express';
import { config } from '../config.js';
import { ollamaJson } from '../ollama.js';
import { one, query } from '../db.js';
import { requireUser, revalidateUser, type User } from '../auth.js';
import { cityCode, drivingDistance } from '../travel.js';
import { hotelQuote } from '../agoda.js';
import { recommendConcerts } from '../recommendations.js';
import { applyManualPrices, BudgetInputError, manualPrices, tripTotals, type TripItem } from '../trip-prices.js';

export const assistantRoutes = Router();
assistantRoutes.use(requireUser);

assistantRoutes.get('/recommendations', async (_req, res) => {
  const user = res.locals.user as User;
  const items = await recommendConcerts(user.id);
  res.json({ items });
});

assistantRoutes.post('/chat', async (req, res) => {
  const disconnected = new AbortController();
  res.once('close',() => { if (!res.writableEnded) disconnected.abort(new Error('Chat client disconnected')); });
  const message = String(req.body?.message || '').trim().slice(0, 1500);
  if (!message) { res.status(400).json({ error: 'กรุณาพิมพ์คำถาม' }); return; }
  const user = res.locals.user as User;
  const artists = await query<{ id: string; slug: string; name: string; name_en: string | null }>('SELECT id,slug,name,name_en FROM artists ORDER BY length(name) DESC');
  const cities = await query<{ city: string }>('SELECT DISTINCT city FROM concerts WHERE city IS NOT NULL LIMIT 100');
  let directArtist = artists.find((artist) => [artist.name, artist.name_en].some((name) => name && message.toLocaleLowerCase().includes(name.toLocaleLowerCase())));
  let directCity = cities.find((row) => message.toLocaleLowerCase().includes(row.city.toLocaleLowerCase()));
  const classifierInstructions = 'เลือก intent ตามสิ่งที่ผู้ใช้ต้องการ: news=ข่าวหรือโพสต์ศิลปิน, concerts=ค้นวัน/สถานที่/ราคางาน, recommendations=ขอแนะนำงานตามรสนิยม, budget=คำนวณงบทริป, unknown=เรื่องอื่น. การมีชื่อศิลปินไม่ได้แปลว่า concerts. ตัวอย่าง "ข่าวศิลปินล่าสุด" ต้องเป็น news; "แนะนำงานจากศิลปินที่ติดตาม" ต้องเป็น recommendations; "ช่วยวางงบทริป" ต้องเป็น budget. ';
  try {
    const body = await ollamaJson(config.ollamaUrl,'/api/chat',{ model: config.chatModel, stream: false, think: false, format: {
      type: 'object',required: ['intent','artist','city','month','year'],additionalProperties: false,
      properties: { intent: { type: 'string',enum: ['concerts','news','recommendations','budget','unknown'] },artist: { type: ['string','null'] },city: { type: ['string','null'] },month: { type: ['integer','null'],minimum: 1,maximum: 12 },year: { type: ['integer','null'] } },
    }, options: { temperature: 0, num_ctx: 4096,num_predict: 256 }, messages: [{ role: 'system', content: classifierInstructions+'จัดประเภทคำถามแฟนเพลงเท่านั้น ห้ามตอบข้อเท็จจริงหรือสร้าง URL. artist/city เป็นชื่อที่ผู้ใช้ถาม ถ้าไม่ระบุคืน null. ถ้าศิลปินไม่อยู่ในรายชื่อให้คงชื่อที่ถามไว้ ห้ามแทนด้วยศิลปินอื่น. ถ้ามีชื่อไทยที่ตรงศิลปินในรายชื่อให้ใช้ชื่อในรายชื่อ. month/year เป็นเดือน1–12/ปีค.ศ.ที่ถาม ไม่ระบุคืนnull. คำถามนอกเรื่องหรือข้อเท็จจริงที่ไม่ใช่คอนเสิร์ต/ข่าว/คำแนะนำ/งบให้intent unknown. รายชื่อศิลปิน: '+JSON.stringify(artists.map(a => [a.name,a.name_en])) }, { role: 'user', content: message }] },{ interactive: true,signal: disconnected.signal,timeoutMs: 60000 });
    if (!await revalidateUser(req,res)) return;
    const selection = JSON.parse(body.message?.content || '{}') as { intent?: string; artist?: unknown; city?: unknown; month?: unknown; year?: unknown };
    if (!selection || !['concerts','news','recommendations','budget','unknown'].includes(selection.intent || '')) throw Error('Invalid AI classification');
    const intent = selection.intent;
    if (!directArtist && typeof selection.artist==='string' && selection.artist.trim()) {
      directArtist = artists.find(artist => [artist.name,artist.name_en,artist.slug].some(name => name?.toLowerCase()===selection.artist?.toString().trim().toLowerCase()));
      if (!directArtist) { res.json({ answer: 'ยังไม่พบข้อมูลของศิลปินที่ถามในระบบ ข้อมูลไม่พอที่จะยืนยันคอนเสิร์ตหรือข่าว',sources: [] }); return; }
    }
    if (!directCity && typeof selection.city==='string' && selection.city.trim()) {
      const requested = selection.city.trim();
      directCity = cities.find(row => row.city.toLowerCase()===requested.toLowerCase() || !!cityCode(requested) && cityCode(row.city)===cityCode(requested));
      if (!directCity) { res.json({ answer: 'ยังไม่พบข้อมูลคอนเสิร์ตในเมืองที่ถาม ข้อมูลไม่พอที่จะยืนยันรายการ',sources: [] }); return; }
    }
    let month = typeof selection.month==='number' && Number.isInteger(selection.month) && selection.month>=1 && selection.month<=12 ? selection.month : null;
    let year = typeof selection.year==='number' && Number.isInteger(selection.year) ? selection.year : null;
    if (year && year>2400) year-=543;
    if (year && (year<1900 || year>2100)) { res.json({ answer: 'ข้อมูลไม่พอสำหรับปีที่ถาม กรุณาระบุปีที่ต้องการค้นหาอีกครั้ง',sources: [] }); return; }
    const calendar = new Intl.DateTimeFormat('en-CA',{ timeZone: 'Asia/Bangkok',year: 'numeric',month: 'numeric' }).formatToParts(new Date());
    const currentYear = Number(calendar.find(part => part.type==='year')?.value), currentMonth = Number(calendar.find(part => part.type==='month')?.value);
    if (/เดือนนี้|เดือนหน้า/.test(message)) {
      const next = /เดือนหน้า/.test(message);
      month = next ? currentMonth%12+1 : currentMonth;
      year = currentYear+(next && currentMonth===12 ? 1 : 0);
    } else if (month && !year) year = currentYear;
    if (intent === 'budget') { res.json({ answer: 'เปิดเครื่องคำนวณงบทริปในหน้านี้เพื่อแยกราคาบัตร การเดินทาง และที่พัก โดยระบบจะแสดงประเภทราคาแต่ละรายการ', sources: [] }); return; }
    if (intent === 'news') {
      const news = await query<{ body: string | null; summary: string | null; source_url: string; published_at: string | null; artist: string }>('SELECT n.body,n.summary,n.source_url,n.published_at,a.name AS artist FROM news_items n JOIN artists a ON a.id=n.artist_id WHERE NOT n.hidden AND ($1::uuid IS NULL OR n.artist_id=$1) ORDER BY n.published_at DESC NULLS LAST LIMIT 5', [directArtist?.id || null]);
      const lines = news.map((item) => `${item.artist}: ${(item.summary || item.body || 'โพสต์ไม่มีข้อความ').slice(0, 250)} (${item.source_url})`);
      res.json({ answer: lines.length ? lines.join('\n\n') : 'ยังไม่มีข่าวที่ระบบดึงข้อความได้จากบัญชีทางการของศิลปินนี้', sources: news.map((item) => item.source_url) }); return;
    }
    if (intent === 'recommendations') {
      const rows = (await recommendConcerts(user.id)).slice(0,5);
      res.json({ answer: rows.length ? rows.map((row) => `${row.title} — ${formatDate(row.starts_at,row.time_tba)} · ${row.followed_artist ? 'ศิลปินที่ติดตาม' : 'แนวเพลงตรงกับศิลปินที่ติดตามหรือประวัติงานที่เคยไป'} (${row.source_url || 'ไม่มีลิงก์ต้นทาง'})`).join('\n') : 'ยังไม่มีงานแนะนำจากศิลปินที่ติดตาม แนวเพลง หรือประวัติที่บันทึกในข้อมูลที่ระบบตรวจพบ ลองติดตามศิลปินเพิ่มเติม',sources: [...new Set(rows.map(row => row.source_url).filter(Boolean))] }); return;
    }
    if (intent === 'concerts') {
      const concerts = await query<{ title: string; starts_at: string | null; time_tba: boolean; venue: string | null; city: string | null; status: string; price_min: string | null; price_note: string | null; currency: string; source_url: string | null }>(`SELECT c.title,c.starts_at,c.time_tba,c.venue,c.city,c.status,c.price_min,c.price_note,c.currency,COALESCE(cs.source_url,c.official_url) AS source_url FROM concerts c LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id ORDER BY CASE source_role WHEN 'organizer' THEN 0 ELSE 1 END LIMIT 1) cs ON true WHERE (c.starts_at >= now() OR (c.time_tba AND (c.starts_at AT TIME ZONE 'Asia/Bangkok')::date >= (now() AT TIME ZONE 'Asia/Bangkok')::date)) AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM concert_artists ca WHERE ca.concert_id=c.id AND ca.artist_id=$1)) AND ($2::text IS NULL OR c.city ILIKE $2) AND ($3::int IS NULL OR extract(month FROM c.starts_at AT TIME ZONE 'Asia/Bangkok')=$3) AND ($4::int IS NULL OR extract(year FROM c.starts_at AT TIME ZONE 'Asia/Bangkok')=$4) ORDER BY c.starts_at LIMIT 5`, [directArtist?.id || null, directCity?.city || null,month,year]);
      const lines = concerts.map((item) => `${item.title} — ${formatDate(item.starts_at, item.time_tba)} · ${[item.venue, item.city].filter(Boolean).join(', ') || 'ยังไม่ระบุสถานที่'} · ${item.status}${item.price_min ? ` · ราคาต้นทาง ${Number(item.price_min).toLocaleString('th-TH')} ${item.currency}` : ' · ยังไม่ทราบราคา'}${item.price_note ? ' · ' + item.price_note : ''}\nแหล่ง: ${item.source_url || 'ยังไม่มีลิงก์ต้นทาง'}`);
      res.json({ answer: lines.length ? lines.join('\n\n') : 'ยังไม่พบคอนเสิร์ตที่ตรงกับคำถามในข้อมูลที่ระบบรองรับ', sources: concerts.map((item) => item.source_url).filter(Boolean) }); return;
    }
    res.json({ answer: 'ข้อมูลไม่พอที่จะยืนยันคำตอบนี้ ลองถามคอนเสิร์ต ข่าว หรือคำแนะนำจากศิลปินที่ติดตาม', sources: [] });
  } catch {
    res.status(503).json({ error: 'ผู้ช่วย AI ยังใช้งานไม่ได้ กรุณาลองใหม่ภายหลัง', code: 'AI_UNAVAILABLE' });
  }
});

function formatDate(value: string | null, timeTba = false) {
  return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', ...(timeTba ? {} : { timeStyle: 'short' as const }), timeZone: 'Asia/Bangkok' }).format(new Date(value)) + (timeTba ? ' เวลาไม่ระบุ' : '') : 'ยังไม่ประกาศวัน';
}

assistantRoutes.post('/trip-estimates', async (req, res) => {
  try {
  const concertId = String(req.body?.concertId || '');
  const origin = String(req.body?.origin || '').trim();
  const nights = Number(req.body?.nights ?? 0);
  const people = Number(req.body?.people ?? 1);
  const rooms = Number(req.body?.rooms ?? Math.ceil(people/2));
  const distanceKm = Number(req.body?.distanceKm ?? 0);
  const prices = manualPrices(req.body?.manualPrices);
  const transport = req.body?.transport ?? 'bus';
  if (!['bus','train','flight','car','none'].includes(transport) || !Number.isInteger(rooms) || rooms<1 || rooms>people) {
    res.status(400).json({ error: 'กรุณาตรวจวิธีเดินทางและจำนวนห้อง (ไม่เกินจำนวนคน)' }); return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(concertId) || !origin || origin.length>80 || !Number.isInteger(nights) || nights<0 || nights>14 || !Number.isInteger(people) || people<1 || people>10 || !Number.isFinite(distanceKm) || distanceKm<0 || distanceKm>3000) {
    res.status(400).json({ error: 'กรุณาตรวจคอนเสิร์ต เมืองต้นทาง จำนวนคน จำนวนคืน และระยะทาง' }); return;
  }
  const concert = await one<{ id: string; title: string; city: string | null; venue: string | null; country_code: string; price_min: string | null; currency: string; starts_at: string | null; last_verified_at: string | null; price_note: string | null; source_url: string | null }>(`SELECT c.*,cs.source_url FROM concerts c LEFT JOIN LATERAL (SELECT source_url FROM concert_sources WHERE concert_id=c.id ORDER BY CASE source_role WHEN 'organizer' THEN 0 ELSE 1 END,fetched_at DESC LIMIT 1) cs ON true WHERE c.id=$1`, [concertId]);
  if (!concert) { res.status(404).json({ error: 'ไม่พบคอนเสิร์ต' }); return; }
  const ticket = concert.price_min != null && !concert.price_note ? Number(concert.price_min) * people : null;
  const destination = concert.city || 'ไม่ทราบเมือง';
  const sameCity = origin.toLocaleLowerCase() === destination.toLocaleLowerCase() || !!cityCode(origin) && cityCode(origin)===cityCode(destination);
  const domestic = concert.country_code==='TH';
  const country = String(req.body?.travellerCountry || '').trim().toUpperCase();
  const eventDate = concert.starts_at && domestic ? new Intl.DateTimeFormat('en-CA',{ timeZone: 'Asia/Bangkok',year: 'numeric',month: '2-digit',day: '2-digit' }).format(new Date(concert.starts_at)) : null;
  const checkIn = String(req.body?.checkInDate || eventDate || '');
  const parsedDate = new Date(checkIn+'T00:00:00Z');
  if ((country && !/^[A-Z]{2}$/.test(country)) || (checkIn && (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10)!==checkIn))) {
    res.status(400).json({ error: 'กรุณาตรวจวันที่เข้าพักและรหัสประเทศผู้เดินทาง 2 ตัว เช่น TH' }); return;
  }
  const checkOut = checkIn ? new Date(parsedDate.getTime()+nights*86400000).toISOString().slice(0,10) : null;
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
    { kind: 'ticket', label: 'บัตรคอนเสิร์ต', amount: ticket, priceType: ticket === null ? 'unavailable' : 'observed', note: ticket === null ? (concert.price_note || 'ยังไม่มีราคาบัตร') : 'อ้างอิงราคาต่ำสุดที่พบ ไม่ใช่ราคาสด', observedAt: concert.last_verified_at,sourceUrl: concert.source_url },
    { kind: 'bus', label: 'รถทัวร์ไปกลับ', amount: sameCity ? 0 : domestic && usedDistanceKm ? Math.round(usedDistanceKm * 2 * 1.5 * people) : null, priceType: sameCity || domestic && usedDistanceKm ? 'estimate' : 'unavailable', note: sameCity ? 'ไม่มีค่าเดินทางระหว่างเมือง ไม่รวมเดินทางในเมือง' : domestic ? `ประมาณ 1.5 บาท/กม./คน จาก${distanceNote}; ยังไม่ใช่ราคาผู้ให้บริการและไม่ยืนยันเส้นทางรถทัวร์` : 'ยังไม่มีราคาและเส้นทางระหว่างประเทศ',searchUrl: 'https://www.busonlineticket.co.th/',provider: 'BusOnlineTicket' },
    { kind: 'train', label: 'รถไฟไปกลับ', amount: sameCity ? 0 : domestic && usedDistanceKm ? Math.round(usedDistanceKm * 2 * 0.9 * people) : null, priceType: sameCity || domestic && usedDistanceKm ? 'estimate' : 'unavailable', note: sameCity ? 'ไม่มีค่าเดินทางระหว่างเมือง ไม่รวมเดินทางในเมือง' : domestic ? `ประมาณ 0.9 บาท/กม./คน จาก${distanceNote}; ไม่ยืนยันว่ามีเส้นทางรถไฟและระยะทางจริงอาจต่างออกไป` : 'ยังไม่มีราคาและเส้นทางระหว่างประเทศ',searchUrl: 'https://dticket.railway.co.th/DTicketPublicWeb/home/',provider: 'SRT D-Ticket' },
    { kind: 'flight', label: 'เครื่องบินไปกลับ', amount: sameCity ? 0 : null, priceType: sameCity ? 'estimate' : 'unavailable', note: sameCity ? 'ไม่มีค่าเดินทางระหว่างเมือง' : 'ตรวจราคาบน Traveloka; ยังไม่ได้เชื่อมราคาอัตโนมัติ',searchUrl: 'https://www.traveloka.com/th-th/flight',provider: 'Traveloka' },
    { kind: 'car', label: 'รถส่วนตัว', amount: sameCity ? 0 : domestic && usedDistanceKm ? Math.round(usedDistanceKm * 2 / 12 * 38) : null, priceType: sameCity || domestic && usedDistanceKm ? 'estimate' : 'unavailable', note: sameCity ? 'ไม่มีค่าเดินทางระหว่างเมือง ไม่รวมเดินทางในเมือง' : domestic ? `ประมาณที่ 12 กม./ลิตร น้ำมัน 38 บาท/ลิตร จาก${distanceNote}; รวมทั้งรถ ไม่รวมค่าทางด่วนและที่จอด` : 'ไม่ประเมินถนนข้ามประเทศจากระยะทางไทย' },
    { kind: 'hotel', label: 'ที่พัก', amount: nights ? nights * 1200 * rooms : 0, priceType: 'estimate', note: nights ? 'ประมาณ 1,200 บาทต่อห้องต่อคืนตามจำนวนห้องที่ระบุ ยังไม่ได้ตรวจราคา Agoda' : 'ไม่พักค้างคืน',searchUrl: 'https://www.agoda.com/th-th/',provider: 'Agoda' },
  ];
  if (!prices.hotel && checkIn && checkOut && nights && country && parsedDate.getTime()>Date.now()) {
    try {
      const hotel = await hotelQuote({ destination,checkIn,checkOut,nights,rooms,adults: people,travellerCountry: country });
      if (hotel) Object.assign(estimates[5], { amount: hotel.amount, priceType: hotel.live ? 'live' : 'observed', note: hotel.live ? 'ข้อเสนอ Agoda รวมทั้งการเข้าพักตามวัน/คน/ห้องที่ระบุ รวมค่าธรรมเนียมบังคับที่ API ส่งมา; ค่าบริการจ่ายที่โรงแรมอาจเพิ่ม ราคาอาจเปลี่ยน' : 'ข้อมูลทดสอบ Agoda sandbox ไม่ใช่ราคาจองจริง',observedAt: hotel.observedAt,validUntil: hotel.validUntil,sourceUrl: hotel.sourceUrl });
    } catch { /* Keep clearly labelled estimate. */ }
  }
  const generatedAt = new Date().toISOString();
  const baseItems = estimates.map(item => ({ ...item,currency: item.kind==='ticket' ? concert.currency : 'THB' })) as TripItem[];
  const items = applyManualPrices(baseItems,prices,{ people,rooms,nights,enteredAt: generatedAt });
  const inputs = { concertId,origin,people,nights,rooms,distanceKm,checkInDate: checkIn,travellerCountry: country,transport,manualPrices: prices };
  const estimate = { concert: { id: concert.id,title: concert.title,destination,startsAt: concert.starts_at },origin,people,nights,stay: { checkIn: checkIn || null,checkOut,rooms,travellerCountry: country || null },distanceKmUsed: usedDistanceKm || null,distanceSource,currency: 'THB',items,summary: tripTotals(items,transport),generatedAt,disclaimer: 'งบใช้วางแผนเท่านั้น ราคาที่ผู้ใช้กรอกยังไม่ได้ยืนยันกับผู้ให้บริการ ยอดรวมเลือกการเดินทางหนึ่งแบบ ไม่รวมเดินทางในเมือง ทางด่วน ที่จอด และไม่แปลงสกุลเงิน กรุณาตรวจราคาจริงก่อนจอง' };
  let saved = null;
  if (!await revalidateUser(req,res)) return;
  if (req.body?.save===true) saved = await one(`INSERT INTO trip_budgets(user_id,concert_id,inputs,estimate) VALUES($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT(user_id,concert_id) DO UPDATE SET inputs=EXCLUDED.inputs,estimate=EXCLUDED.estimate,updated_at=now() RETURNING id,updated_at`,[(res.locals.user as User).id,concertId,JSON.stringify(inputs),JSON.stringify(estimate)]);
  res.json({ ...estimate,saved });
  } catch (error) {
    if (error instanceof BudgetInputError) { res.status(400).json({ error: error.message }); return; }
    throw error;
  }
});

assistantRoutes.get('/me/trip-budgets/:concertId',async (req,res) => {
  const id = String(req.params.concertId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { res.status(400).json({ error: 'รหัสคอนเสิร์ตไม่ถูกต้อง' }); return; }
  const item = await one('SELECT id,inputs,estimate,updated_at FROM trip_budgets WHERE user_id=$1 AND concert_id=$2',[(res.locals.user as User).id,id]);
  if (!item) { res.status(404).json({ error: 'คุณยังไม่ได้บันทึกงบของงานนี้' }); return; }
  res.json(item);
});
