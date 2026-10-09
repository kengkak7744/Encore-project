import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import test from 'node:test';
import { attachUser } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { assistantRoutes } from './routes/assistant.js';
import { summarizeNews } from './knowledge.js';
import { generateBiography } from './biography-generator.js';
import { OllamaQueue,ollamaQueue } from './ollama-queue.js';

test('Thai assistant and trip budgets through authenticated HTTP', { skip: !process.env.INGEST_TEST_DATABASE_URL },async t => {
  if (!new URL(process.env.INGEST_TEST_DATABASE_URL!).pathname.includes('test')) throw Error('Assistant fixtures require a separate test database');
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  const before = { ...config };
  Object.assign(config,{ googleRoutesEnabled: false,agodaEnabled: false });
  const realFetch = globalThis.fetch;
  let intent: Record<string,unknown> = { intent: 'concerts',artist: 'MILLI',city: null,month: null,year: null };
  try {
    await client.query('BEGIN'); await client.query('CREATE SCHEMA assistant_fixture');
    await client.query('SET LOCAL search_path TO assistant_fixture,public');
    const dir = new URL('../sql/',import.meta.url);
    for (const name of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await client.query(await readFile(new URL(name,dir),'utf8'));
    t.mock.method(pool,'query',(sql: string,params: unknown[]) => client.query(sql,params));
    const queueMock = t.mock.method(ollamaQueue,'run',async (job: { signal: AbortSignal },work: (signal: AbortSignal) => Promise<unknown>) => work(job.signal));
    t.mock.method(globalThis,'fetch',async (input: unknown) => String(input).endsWith('/api/ps') ? Response.json({ models: [] }) : new Response(JSON.stringify({ message: { content: JSON.stringify(intent) } }),{ headers: { 'content-type': 'application/json' } }));
    const user = (await client.query("INSERT INTO users(email,display_name,password_hash) VALUES('assistant-fixture@example.test','Fixture user','unused') RETURNING id")).rows[0].id;
    const token = 'assistant-fixture-token';
    await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user]);
    const artist = (await client.query("INSERT INTO artists(slug,name,name_en,kind,genres) VALUES('fixture-milli','MILLI','MILLI','solo',ARRAY['Hip-hop']) RETURNING id")).rows[0].id;
    const foreign = (await client.query("INSERT INTO concerts(slug,title,city,country_code,currency,price_min,starts_at) VALUES('fixture-foreign','Fixture foreign show','London','GB','USD',100,'2030-01-15T18:00Z') RETURNING id")).rows[0].id;
    const show = (await client.query("INSERT INTO concerts(slug,title,city,venue,price_min,starts_at,last_verified_at) VALUES('fixture-milli-show','MILLI fixture concert','กรุงเทพมหานคร','Fixture Arena',1500,'2030-01-15T11:00Z',now()) RETURNING id")).rows[0].id;
    await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[show,artist]);
    await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url,source_role) VALUES($1,'Fixture organizer','https://organizer.example/milli','organizer')",[show]);
    const cancelled = (await client.query("INSERT INTO concerts(slug,title,status,starts_at) VALUES('fixture-cancelled','Cancelled fixture','cancelled','2030-01-14T11:00Z') RETURNING id")).rows[0].id;
    await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[cancelled,artist]);
    await client.query('INSERT INTO follows(user_id,artist_id) VALUES($1,$2)',[user,artist]);
    const app = express(); app.use(express.json()); app.use('/api',attachUser,assistantRoutes);
    app.use((_error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction) => { res.status(500).json({ error: 'Test request failed' }); });
    const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
    const address = server.address(); if (!address || typeof address==='string') throw Error('Missing test address');
    const request = async (path: string,body: unknown,cookie: boolean | string = true) => {
      const response = await realFetch(`http://127.0.0.1:${address.port}/api${path}`,{ method: body===undefined ? 'GET' : 'POST',headers: { 'Content-Type': 'application/json',...(cookie ? { Cookie: 'artist_session='+(typeof cookie==='string' ? cookie : token) } : {}) },...(body===undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status,body: await response.json() as any };
    };
    try {
      await t.test('Foreign ticket currency is retained rather than labelled as Thai baht',async () => {
        const result = await request('/trip-estimates',{ concertId: foreign,origin: 'กรุงเทพมหานคร',people: 2,nights: 0,distanceKm: 100 });
        assert.equal(result.status,200);
        const ticket = result.body.items.find((item: { kind: string }) => item.kind==='ticket');
        assert.equal(ticket.amount,200); assert.equal(ticket.currency,'USD');
        assert.equal(result.body.stay.checkIn,null);
        assert.equal(result.body.items.find((item: any) => item.kind==='bus').amount,null);
      });
      await t.test('Thai recommendations exclude cancelled events and cite the followed artist event',async () => {
        intent = { intent: 'recommendations' };
        const result = await request('/chat',{ message: 'แนะนำคอนเสิร์ตของศิลปินที่ติดตามหน่อย' });
        assert.equal(result.status,200); assert.ok(result.body.answer.includes('MILLI fixture concert'));
        assert.ok(!result.body.answer.includes('Cancelled fixture'));
        assert.deepEqual(result.body.sources,['https://organizer.example/milli']);
      });
      await t.test('An unknown artist returns insufficient data instead of unrelated concerts',async () => {
        intent = { intent: 'concerts',artist: 'วงไม่มีในระบบ',city: null,month: null,year: null };
        const result = await request('/chat',{ message: 'วงไม่มีในระบบมีคอนเสิร์ตเมื่อไหร่' });
        assert.equal(result.status,200); assert.deepEqual(result.body.sources,[]);
        assert.ok(/ยังไม่พบ|ข้อมูลไม่พอ/.test(result.body.answer));
        assert.ok(!result.body.answer.includes('MILLI fixture concert'));
      });
      await t.test('Thai month/year questions do not return events outside the requested month',async () => {
        const later = (await client.query("INSERT INTO concerts(slug,title,city,starts_at) VALUES('fixture-february','February fixture','กรุงเทพมหานคร','2030-02-15T11:00Z') RETURNING id")).rows[0].id;
        await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[later,artist]);
        intent = { intent: 'concerts',artist: 'MILLI',city: null,month: 1,year: 2030 };
        const result = await request('/chat',{ message: 'MILLI มีคอนเสิร์ตเดือนมกราคม 2573 ที่ไหน' });
        assert.equal(result.status,200); assert.ok(result.body.answer.includes('MILLI fixture concert'));
        assert.ok(!result.body.answer.includes('February fixture'));
      });
      await t.test('Recommendations also use followed genres without recommending unrelated tastes',async () => {
        const similarArtist = (await client.query("INSERT INTO artists(slug,name,kind,genres) VALUES('fixture-similar','Similar artist','solo',ARRAY['Hip-hop']) RETURNING id")).rows[0].id;
        const similarShow = (await client.query("INSERT INTO concerts(slug,title,starts_at) VALUES('fixture-similar-show','Similar hip-hop show','2030-01-16T11:00Z') RETURNING id")).rows[0].id;
        await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[similarShow,similarArtist]);
        await client.query("INSERT INTO concert_sources(concert_id,source_name,source_url) VALUES($1,'Fixture','https://organizer.example/similar')",[similarShow]);
        const unrelatedArtist = (await client.query("INSERT INTO artists(slug,name,kind,genres) VALUES('fixture-rock','Rock artist','solo',ARRAY['Rock']) RETURNING id")).rows[0].id;
        const rock = (await client.query("INSERT INTO concerts(slug,title,starts_at) VALUES('fixture-rock-show','Unrelated rock show','2030-01-17T11:00Z') RETURNING id")).rows[0].id;
        await client.query('INSERT INTO concert_artists(concert_id,artist_id) VALUES($1,$2)',[rock,unrelatedArtist]);
        intent = { intent: 'recommendations' };
        const result = await request('/chat',{ message: 'แนะนำงานตามแนวเพลงที่ชอบ' });
        assert.ok(result.body.answer.includes('Similar hip-hop show'));
        assert.ok(!result.body.answer.includes('Unrelated rock show'));
      });
      await t.test('Bad trip identifiers and fractional passenger counts are rejected as user input errors',async () => {
        assert.equal((await request('/trip-estimates',{ concertId: 'bad-id',origin: 'เชียงใหม่' })).status,400);
        assert.equal((await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 1.5 })).status,400);
      });
      await t.test('Unknown price, package price and a zero price remain distinct',async () => {
        for (const [price,note,expected] of [[null,null,null],[1500,'ราคาสำหรับโต๊ะ 4 คน',null],[0,null,0]] as const) {
          await client.query('UPDATE concerts SET price_min=$2,price_note=$3 WHERE id=$1',[show,price,note]);
          const result = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่' });
          const ticket = result.body.items.find((item: any) => item.kind==='ticket');
          assert.equal(ticket.amount,expected); assert.equal(ticket.priceType,expected===null ? 'unavailable' : 'observed');
        }
        await client.query('UPDATE concerts SET price_min=1500,price_note=null WHERE id=$1',[show]);
      });
      await t.test('Trip totals respect passengers, shared car fuel and rooms, with source/time and Thai providers',async () => {
        const result = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 3,nights: 2,distanceKm: 100 });
        assert.equal(result.status,200);
        const items = Object.fromEntries(result.body.items.map((item: any) => [item.kind,item]));
        assert.equal(items.ticket.amount,4500); assert.equal(items.ticket.sourceUrl,'https://organizer.example/milli'); assert.ok(items.ticket.observedAt);
        assert.equal(items.bus.amount,900); assert.equal(items.train.amount,540); assert.equal(items.car.amount,633);
        assert.equal(items.hotel.amount,4800); assert.equal(items.hotel.priceType,'estimate'); assert.equal(items.hotel.provider,'Agoda');
        assert.equal(items.flight.amount,null); assert.equal(items.flight.priceType,'unavailable'); assert.equal(items.flight.provider,'Traveloka');
        assert.equal(items.bus.provider,'BusOnlineTicket'); assert.equal(items.train.provider,'SRT D-Ticket');
        assert.equal(result.body.stay.checkIn,'2030-01-15'); assert.equal(result.body.stay.checkOut,'2030-01-17');
        assert.ok(!JSON.stringify(result.body).includes('12Go'));
      });
      await t.test('City aliases avoid intercity estimates and invalid hotel dates are rejected',async () => {
        const result = await request('/trip-estimates',{ concertId: show,origin: 'Bangkok',nights: 0 });
        assert.equal(result.status,200); assert.equal(result.body.items.find((item: any) => item.kind==='car').amount,0);
        assert.equal((await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',checkInDate: '2030-02-30' })).status,400);
        assert.equal((await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',distanceKm: -1 })).status,400);
      });
      await t.test('Chat facts retain source prices and place, while unsupported questions disclose insufficient data',async () => {
        intent = { intent: 'concerts',artist: 'MILLI',month: 1,year: 2030 };
        const facts = await request('/chat',{ message: 'MILLI เดือนมกราคม 2573 จัดที่ไหน ราคาเท่าไหร่' });
        assert.equal(facts.status,200); assert.ok(facts.body.answer.includes('Fixture Arena')); assert.ok(facts.body.answer.includes('1,500 THB'));
        assert.ok(facts.body.sources.includes('https://organizer.example/milli'));
        intent = { intent: 'unknown' };
        const unknown = await request('/chat',{ message: 'พรุ่งนี้หวยออกอะไร' });
        assert.equal(unknown.status,200); assert.ok(unknown.body.answer.includes('ข้อมูลไม่พอ')); assert.deepEqual(unknown.body.sources,[]);
      });
      await t.test('Authentication and malformed or unavailable AI fail explicitly',async () => {
        assert.equal((await request('/chat',{ message: 'ข่าว MILLI' },false)).status,401);
        assert.equal((await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่' },false)).status,401);
        assert.equal((await request('/chat',{ message: '' })).status,400);
        intent = { intent: 'invented' };
        const invalid = await request('/chat',{ message: 'ข่าว MILLI' });
        assert.equal(invalid.status,503); assert.equal(invalid.body.code,'AI_UNAVAILABLE');
        const mock = t.mock.method(globalThis,'fetch',async () => { throw new Error('Ollama offline'); });
        const offline = await request('/chat',{ message: 'ข่าว MILLI' });
        assert.equal(offline.status,503); assert.equal(offline.body.code,'AI_UNAVAILABLE'); mock.mock.restore();
      });
      await t.test('Attendance tastes and followed tastes are scoped to the signed-in user',async () => {
        const other = (await client.query("INSERT INTO users(email,display_name,password_hash) VALUES('second-fixture@example.test','Second fixture','unused') RETURNING id")).rows[0].id;
        const otherToken = 'second-fixture-token';
        await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(otherToken).digest('hex'),other]);
        intent = { intent: 'recommendations' };
        const empty = await request('/chat',{ message: 'แนะนำงานให้ฉันหน่อย' },otherToken);
        assert.deepEqual(empty.body.sources,[]); assert.ok(!empty.body.answer.includes('MILLI fixture concert'));
        const rock = (await client.query("SELECT id FROM concerts WHERE slug='fixture-rock-show'")).rows[0].id;
        await client.query('INSERT INTO attendance(user_id,concert_id) VALUES($1,$2)',[other,rock]);
        const basedOnHistory = await request('/chat',{ message: 'แนะนำงานตามที่ฉันเคยไป' },otherToken);
        assert.ok(basedOnHistory.body.answer.includes('Unrelated rock show')); assert.ok(!basedOnHistory.body.answer.includes('Similar hip-hop show'));
        const firstUser = await request('/chat',{ message: 'แนะนำงานให้ฉันหน่อย' });
        assert.ok(!firstUser.body.answer.includes('Unrelated rock show'));
      });
      await t.test('Thai news answers cite stored posts, including older posts, without inventing unavailable text',async () => {
        await client.query("INSERT INTO news_items(artist_id,platform,source_url,body,published_at) VALUES($1,'instagram','https://www.instagram.com/p/fixture-news/','ข้อความข่าวทดสอบ: MILLI ประกาศซ้อมสำหรับงานตัวอย่าง','2026-10-03T07:00Z')",[artist]);
        intent = { intent: 'news',artist: 'MILLI' };
        const result = await request('/chat',{ message: 'ข่าว MILLI ล่าสุดเป็นยังไง' });
        assert.ok(result.body.answer.includes('ข้อความข่าวทดสอบ')); assert.deepEqual(result.body.sources,['https://www.instagram.com/p/fixture-news/']);
      });
      await t.test('Agoda sandbox, production mock, provider failure and Google Routes fallback retain truthful price labels',async () => {
        Object.assign(config,{ agodaEnabled: true,agodaClientId: 'http-fixture',agodaClientSecret: 'http-fixture-secret',agodaTokenUrl: 'https://fixture.agoda.com/token',agodaSearchUrl: 'https://fixture.agoda.com/search',agodaPropertyIds: '{"BKK":[999999998]}' });
        let failing = false;
        const mock = t.mock.method(globalThis,'fetch',async (input: string | URL) => {
          if (failing) return new Response('',{ status: 429 });
          if (String(input).endsWith('/token')) return Response.json({ success: true,token: 'fictional-token' });
          return Response.json({ properties: [{ rooms: [{ rate: { currency: 'THB' },totalPayment: { inclusive: 3500 },landingUrl: 'https://www.agoda.com/fixture-only.html' }] }] });
        });
        try {
          config.agodaEnvironment='sandbox';
          const sandbox = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 3,nights: 2,travellerCountry: 'TH',useExternalProviders: true });
          const hotel = sandbox.body.items.find((item: any) => item.kind==='hotel');
          assert.equal(hotel.amount,3500); assert.equal(hotel.priceType,'observed'); assert.ok(hotel.note.includes('sandbox')); assert.ok(hotel.observedAt && hotel.validUntil);
          config.agodaEnvironment='production';
          const productionMock = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 3,nights: 2,travellerCountry: 'TH',useExternalProviders: true });
          assert.equal(productionMock.body.items.find((item: any) => item.kind==='hotel').priceType,'live');
          failing=true; config.googleRoutesEnabled=true; config.googleRoutesKey='fictional-routes-key';
          const unavailable = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 2,nights: 1,travellerCountry: 'TH',useExternalProviders: true,distanceKm: 123 });
          assert.equal(unavailable.status,200); assert.equal(unavailable.body.distanceSource,'user'); assert.equal(unavailable.body.distanceKmUsed,123);
          const fallback = unavailable.body.items.find((item: any) => item.kind==='hotel');
          assert.equal(fallback.amount,1200); assert.equal(fallback.priceType,'estimate'); assert.equal(fallback.sourceUrl,undefined);
        } finally { mock.mock.restore(); config.agodaEnabled=false; config.googleRoutesEnabled=false; }
      });
      await t.test('Manual trip prices normalize units and select only one transport without modifying public prices',async () => {
        const result = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 3,nights: 2,rooms: 2,transport: 'flight',manualPrices: { ticket: { amount: 100,currency: 'USD',unit: 'person' },flight: { amount: 1200,currency: 'THB',unit: 'person_one_way' },hotel: { amount: 1250.5,currency: 'THB',unit: 'room_night' },car: { amount: 700,currency: 'THB',unit: 'group_total' } } });
        assert.equal(result.status,200);
        const items = Object.fromEntries(result.body.items.map((item: any) => [item.kind,item]));
        assert.equal(items.ticket.amount,300); assert.equal(items.ticket.currency,'USD'); assert.equal(items.ticket.priceType,'user'); assert.ok(items.ticket.enteredAt); assert.equal(items.ticket.observedAt,undefined); assert.equal(items.ticket.sourceUrl,null);
        assert.equal(items.flight.amount,7200); assert.equal(items.hotel.amount,5002); assert.equal(items.car.amount,700);
        assert.equal(result.body.summary.complete,true); assert.deepEqual(result.body.summary.totals,[{ currency: 'USD',amount: 300 },{ currency: 'THB',amount: 12202 }]);
        assert.equal((await client.query('SELECT price_min FROM concerts WHERE id=$1',[show])).rows[0].price_min,'1500.00');
      });
      await t.test('Quick manual totals bypass enabled route/hotel providers without multiplying party totals',async () => {
        Object.assign(config,{ googleRoutesEnabled: true,googleRoutesKey: 'fixture-only',agodaEnabled: true,agodaClientId: 'fixture-only',agodaClientSecret: 'fixture-only',agodaTokenUrl: 'https://fixture.agoda.com/token',agodaSearchUrl: 'https://fixture.agoda.com/search',agodaPropertyIds: '{"BKK":[999999998]}' });
        let calls = 0;
        const external = t.mock.method(globalThis,'fetch',async () => { calls++; throw Error('Manual flow must not contact providers'); });
        try {
          const result = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',people: 3,nights: 2,rooms: 2,transport: 'bus',travellerCountry: 'TH',checkInDate: '2030-01-15',useExternalProviders: false,manualPrices: { bus: { amount: 1500,currency: 'THB',unit: 'group_total' },hotel: { amount: 4000,currency: 'THB',unit: 'group_total' } } });
          assert.equal(result.status,200);
          assert.equal(calls,0);
          assert.deepEqual(result.body.summary.totals,[{ currency: 'THB',amount: 10000 }]);
          assert.equal(result.body.items.find((item: any) => item.kind==='bus').amount,1500);
          assert.equal(result.body.items.find((item: any) => item.kind==='hotel').amount,4000);
          assert.equal(result.body.items.find((item: any) => item.kind==='hotel').priceType,'user');
        } finally { external.mock.restore(); config.googleRoutesEnabled=false; config.agodaEnabled=false; }
      });
      await t.test('Saving/loading trip prices is scoped to the authenticated user and upserts only their own budget',async () => {
        const first = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',nights: 0,transport: 'car',manualPrices: { car: { amount: 500,currency: 'THB',unit: 'group_total' } },save: true });
        assert.equal(first.status,200); assert.ok(first.body.saved.id);
        const own = await request('/me/trip-budgets/'+show,undefined);
        assert.equal(own.status,200); assert.equal(own.body.inputs.manualPrices.car.amount,500);
        assert.equal((await request('/me/trip-budgets/'+show,undefined,'second-fixture-token')).status,404);
        assert.equal((await request('/me/trip-budgets/'+show,undefined,false)).status,401);
        const second = await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',nights: 0,transport: 'car',manualPrices: { car: { amount: 600,currency: 'THB',unit: 'group_total' } },save: true,userId: 'attempt-to-override-owner' });
        assert.equal(second.body.saved.id,first.body.saved.id);
        assert.equal((await client.query('SELECT count(*)::int AS count FROM trip_budgets')).rows[0].count,1);
        assert.equal((await request('/me/trip-budgets/'+show,undefined)).body.inputs.manualPrices.car.amount,600);
      });
      await t.test('Manual input rejects invalid scopes, decimals, currencies and incompatible room/night counts',async () => {
        for (const extra of [{ rooms: 3,people: 2 },{ transport: 'all' },{ manualPrices: { hotel: { amount: 100,currency: 'THB',unit: 'room_night' } },nights: 0 },{ manualPrices: { ticket: { amount: 1.001,currency: 'THB',unit: 'person' } } },{ manualPrices: { car: { amount: 100,currency: 'ABC',unit: 'group_total' } } }]) {
          assert.equal((await request('/trip-estimates',{ concertId: show,origin: 'เชียงใหม่',...extra })).status,400);
        }
      });
      await t.test('Chat must succeed while a biography request occupies Ollama',async () => {
        const schema = 'gpu_repro_'+Date.now();
        const admin = new pg.Pool({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
        await admin.query('CREATE SCHEMA '+schema);
        const database = new pg.Pool({ connectionString: process.env.INGEST_TEST_DATABASE_URL,options: '-c search_path='+schema+',public' });
        await database.query(await readFile(new URL('../sql/020_ollama_queue.sql',import.meta.url),'utf8'));
        queueMock.mock.restore();
        const coordinator = new OllamaQueue(database,'fixture-gpu',10,0);
        const coordinated = t.mock.method(ollamaQueue,'run',coordinator.run.bind(coordinator));
        let busy = false, firstBiographyCall = true;
        const source = { id: 'source-1',url: 'https://example.com/artist',label: 'Fixture',fetchedAt: new Date().toISOString(),text: 'วงดนตรีตัวอย่างเริ่มทำเพลงร่วมกันและเผยแพร่ผลงานผ่านช่องทางของวง โดยข้อมูลต้นทางระบุจุดเริ่มต้นการทำงานและการเผยแพร่เพลงของวงตัวอย่างไว้' };
        const raw = { identityMatches: true,reason: '',sections: ['จุดเริ่มต้น','การทำเพลง','ช่องทางเผยแพร่'].map(heading => ({ heading,body: source.text,sourceId: source.id,evidenceIds: ['source-1:1'] })) };
        const modelMock = t.mock.method(globalThis,'fetch',async (_input: unknown,options?: RequestInit) => {
          if (String(_input).endsWith('/api/ps')) return Response.json({ models: [] });
          if (String(_input).endsWith('/api/generate')) return Response.json({ done: true });
          const body = JSON.parse(String(options?.body));
          if (body.model===config.biographyModel) {
            busy = true;
            // Keep the first request active until preemption. A 300 ms response
            // could finish before chat enqueues on a busy database/build machine.
            const holdForChat = firstBiographyCall; firstBiographyCall = false;
            try { await new Promise<void>((resolve,reject) => {
              const signal = options?.signal;
              const aborted = () => { clearTimeout(timer); reject(signal?.reason); };
              const timer = setTimeout(() => { signal?.removeEventListener('abort',aborted); if (holdForChat) reject(Error('Chat did not preempt the fixture biography')); else resolve(); },holdForChat ? 20000 : 300);
              signal?.addEventListener('abort',aborted,{ once: true });
              if (signal?.aborted) aborted();
            }); }
            finally { busy = false; }
            return Response.json({ message: { content: JSON.stringify(body.format?.properties?.checks ? { identityMatches: true,reason: '',checks: [0,1,2].map(index => ({ index,supported: true,reason: '' })) } : raw) } });
          }
          if (busy) throw new DOMException('Model-switch timeout while biography owns GPU','TimeoutError');
          return Response.json({ message: { content: JSON.stringify({ intent: 'news',artist: 'MILLI',city: null,month: null,year: null }) } });
        });
        const biography = generateBiography({ id: artist,slug: 'fixture',name: 'วงตัวอย่าง',name_en: null,kind: 'band' },[source],new AbortController().signal).catch(() => null);
        try {
          while (!busy) await new Promise(resolve => setTimeout(resolve,1));
          const response = await request('/chat',{ message: 'ข่าว MILLI ล่าสุด' });
          assert.equal(response.status,200,'Chat returned AI_UNAVAILABLE while biography owned Ollama');
          assert.ok((await database.query('SELECT sum(preemptions)::int AS count FROM ollama_requests')).rows[0].count>=1);
        } finally { await biography; modelMock.mock.restore(); coordinated.mock.restore(); await database.end(); await admin.query('DROP SCHEMA '+schema+' CASCADE'); await admin.end(); }
      });
      if (process.env.AI_ACCEPTANCE_LIVE_OLLAMA==='true') await t.test('Real local Ollama Thai answers, news concurrency and graceful biography contention',async () => {
        config.ollamaUrl='http://localhost:11434';
        const liveMock = t.mock.method(globalThis,'fetch',(input: string | URL,options?: RequestInit) => realFetch(input,options));
        const results: unknown[] = [];
        let background: Promise<unknown> = Promise.resolve(null);
        try {
          const newsStart = Date.now();
          const news = summarizeNews().then(() => ({ durationMs: Date.now()-newsStart }));
          for (const message of ['MILLI มีคอนเสิร์ตเดือนมกราคม 2573 จัดที่ไหน ราคาเท่าไหร่','ข่าว MILLI ล่าสุด','แนะนำคอนเสิร์ตจากศิลปินที่ฉันติดตาม','วงไม่มีในระบบมีคอนเสิร์ตเมื่อไหร่','ช่วยวางงบทริปไปดู MILLI','พรุ่งนี้หวยออกอะไร']) {
            const began = Date.now(); const response = await request('/chat',{ message });
            results.push({ message,...response,durationMs: Date.now()-began });
            assert.equal(response.status,200,'Real Thai classifier: '+message);
            if (message.startsWith('MILLI')) { assert.ok(response.body.answer.includes('Fixture Arena')); assert.ok(response.body.sources.includes('https://organizer.example/milli')); }
            if (message.startsWith('ข่าว')) assert.ok(response.body.sources.includes('https://www.instagram.com/p/fixture-news/'));
            if (/วงไม่มี|หวย/.test(message)) { assert.ok(/ข้อมูลไม่พอ|ยังไม่พบ/.test(response.body.answer)); assert.deepEqual(response.body.sources,[]); }
          }
          results.push({ realNewsBackground: await news });
          assert.ok((await client.query("SELECT summary FROM news_items WHERE source_url='https://www.instagram.com/p/fixture-news/'")).rows[0].summary,'Real news worker summary');
          const began = Date.now();
          // Synthetic stress prompt only. No generated biography is published.
          background = realFetch(config.ollamaUrl+'/api/chat',{ method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ model: config.biographyModel,stream: false,think: false,keep_alive: '30s',options: { temperature: 0,num_ctx: 8192,num_predict: 128 },messages: [{ role: 'system',content: 'สรุปเป็นภาษาไทยเฉพาะข้อมูลที่ให้ ห้ามเพิ่มข้อเท็จจริง' },{ role: 'user',content: 'ข้อมูลทดสอบสมมติ ไม่ใช่ชีวประวัติจริง: ศิลปินตัวอย่างชื่อ Fixture Artist เริ่มทำเพลงในปี 2020 ออกเพลงตัวอย่างในปี 2021 และแสดงที่งานตัวอย่างในปี 2022 เขียนประวัติสั้นหนึ่งย่อหน้าจากข้อมูลนี้' }] }),signal: AbortSignal.timeout(240000) }).then(async response => ({ ok: response.ok,data: await response.json(),durationMs: Date.now()-began })).catch(error => ({ ok: false,error: String(error),durationMs: Date.now()-began }));
          const during = await request('/chat',{ message: 'ข่าว MILLI ล่าสุด' });
          results.push({ biographyContention: during,durationMs: Date.now()-began });
          assert.ok([200,503].includes(during.status));
          if (during.status===503) assert.equal(during.body.code,'AI_UNAVAILABLE');
          const completed = await background as { ok: boolean };
          results.push({ biographyBackground: completed }); assert.ok(completed.ok,'Separate local biography model request');
          const recoveryStart = Date.now();
          const recovery = await request('/chat',{ message: 'ข่าว MILLI ล่าสุด' });
          results.push({ recovery,durationMs: Date.now()-recoveryStart });
          assert.equal(recovery.status,200); assert.ok(recovery.body.sources.includes('https://www.instagram.com/p/fixture-news/'));
        } finally {
          await background; liveMock.mock.restore();
          await writeFile(new URL('../../../.local/ai-trip-ollama-2026-10-05.json',import.meta.url),JSON.stringify({ measuredAt: new Date().toISOString(),fixtureOnly: true,models: [config.chatModel,config.biographyModel],results },null,2));
        }
      });
    } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
  } finally {
    t.mock.restoreAll(); Object.assign(config,before);
    await client.query('ROLLBACK'); await client.end(); await pool.end();
  }
});
