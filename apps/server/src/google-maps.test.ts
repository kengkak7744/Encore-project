import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile,readdir } from 'node:fs/promises';
import express from 'express';
import pg from 'pg';
import test from 'node:test';
import { attachUser } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { autocomplete,exploreRoute } from './google-maps.js';
import { mapsRoutes } from './routes/maps.js';

test('Maps HTTP permissions, provider contracts and persistent request budget',{skip:!process.env.INGEST_TEST_DATABASE_URL},async t=>{
  assert.ok(new URL(process.env.INGEST_TEST_DATABASE_URL!).pathname.includes('test'));
  const db=new pg.Client({connectionString:process.env.INGEST_TEST_DATABASE_URL});await db.connect();
  const before={...config},realFetch=globalThis.fetch;
  let server:ReturnType<express.Express['listen']>|undefined;
  Object.assign(config,{googleMapsEmbedKey:'public-embed-fixture',googlePlacesKey:'private-places-fixture',googleRoutesKey:'private-routes-fixture',googleRoutesEnabled:true,googleMapsDailyLimit:100});
  const calls:{url:string;body:any;fields:string}[]=[];
  let failure=0,route:any={distanceMeters:12345,duration:'1201s'},locations=true,onFetch:(()=>Promise<void>)|undefined;
  try{
    await db.query('BEGIN');await db.query('CREATE SCHEMA maps_fixture');await db.query('SET LOCAL search_path TO maps_fixture,public');
    const dir=new URL('../sql/',import.meta.url);
    for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(new URL(file,dir),'utf8'));
    t.mock.method(pool,'query',(sql:string,params:unknown[])=>db.query(sql,params));
    t.mock.method(globalThis,'fetch',async(input:unknown,options?:RequestInit)=>{
      const url=String(input),headers=new Headers(options?.headers);
      calls.push({url,body:options?.body?JSON.parse(String(options.body)):null,fields:headers.get('X-Goog-FieldMask') || ''});
      assert.ok(url.startsWith('https://places.googleapis.com/')||url.startsWith('https://routes.googleapis.com/'));
      assert.ok(!url.includes('private-'));
      if(onFetch)await onFetch();
      if(failure===-1)throw Error('private-routes-fixture');
      if(failure)return Response.json({error:{message:'private-routes-fixture'}},{status:failure});
      if(url.includes(':autocomplete'))return Response.json({suggestions:[{placePrediction:{placeId:'ChIJ_fixture',text:{text:'Google fixture venue'}}},{queryPrediction:{text:'discard'}}]});
      if(url.includes(':searchNearby'))return Response.json({places:[{id:'ChIJ_hotel',displayName:{text:'Google fixture hotel'},formattedAddress:'Google fixture address',googleMapsUri:'https://malicious.example/',attributions:[{provider:'Fixture provider',providerUri:'https://provider.example/'},{provider:'Unsafe link',providerUri:'javascript:alert(1)'}]}]});
      if(url.includes('/v1/places/'))return Response.json({id:'ChIJ_fixture',...(locations?{location:{latitude:13.75,longitude:100.5}}:{})});
      return Response.json({routes:route?[route]:[]});
    });
    const user=(await db.query("INSERT INTO users(email,display_name,password_hash) VALUES('maps@example.test','Maps fixture','unused') RETURNING id")).rows[0].id;
    const token='maps-session';await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),user]);
    const concert=(await db.query("INSERT INTO concerts(slug,title,venue,city) VALUES('maps-fixture','Maps fixture concert','User venue','Bangkok') RETURNING id")).rows[0].id;
    await db.query('UPDATE concerts SET venue_location=$2 WHERE id=$1',[concert,JSON.stringify({address:'99 Rama 1 Road, Bangkok',latitude:13.75,longitude:100.5,placeId:null,sourceUrl:'https://organizer.example/show',checkedAt:new Date().toISOString()})]);
    const unknown=(await db.query("INSERT INTO concerts(slug,title) VALUES('maps-unknown','Unknown venue') RETURNING id")).rows[0].id;
    const app=express();app.use(express.json());app.use('/api',attachUser,mapsRoutes);server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const request=async(path:string,body?:unknown,authenticated=true)=>{
      const res=await realFetch(`http://127.0.0.1:${address.port}/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authenticated?{Cookie:'artist_session='+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:res.status,body:await res.json() as any};
    };
    const query={input:'Bangkok',sessionToken:randomUUID(),country:'TH'},trip={concertId:concert,origin:'User origin',mode:'DRIVE'};
    await t.test('Public map/config require no paid calls and reveal only the dedicated browser key',async()=>{
      const settings=await request('/maps/config',undefined,false);assert.equal(settings.body.authenticated,false);assert.ok(!JSON.stringify(settings).includes('private-'));
      const map=await request('/concerts/'+concert+'/map',undefined,false);assert.equal(map.status,200);assert.equal(new URL(map.body.embedUrl).searchParams.get('key'),'public-embed-fixture');
      assert.equal((await request('/concerts/'+unknown+'/map')).body.embedUrl,null);assert.equal(calls.length,0);
    });
    await t.test('Source coordinates/address replace name guessing; delivery and unverified venues cannot produce maps/routes',async()=>{
      const known=await request('/concerts/'+concert+'/map');assert.equal(known.body.destination,'99 Rama 1 Road, Bangkok');assert.equal(new URL(known.body.embedUrl).searchParams.get('q'),'13.75,100.5');
      const unverified=(await db.query("INSERT INTO concerts(slug,title,venue) VALUES('unverified-hall','Unverified hall','Ambiguous Name') RETURNING id")).rows[0].id;
      assert.equal((await request('/concerts/'+unverified+'/map')).body.embedUrl,null);
      assert.equal((await request('/maps/routes',{...trip,concertId:unverified})).body.code,'VENUE_UNKNOWN');
      const delivery=(await db.query("INSERT INTO concerts(slug,title,venue) VALUES('delivery','ANGEL OF STARS','Product Delivery') RETURNING id")).rows[0].id;
      const result=await request('/concerts/'+delivery+'/map');assert.equal(result.body.embedUrl,null);assert.equal(result.body.url,null);assert.equal(result.body.nonPhysical,true);
      assert.equal((await request('/maps/routes',{...trip,concertId:delivery,destinationId:'ChIJ_fixture'})).body.code,'VENUE_NONPHYSICAL');assert.equal(calls.length,0);
    });
    await t.test('Guest, expired session and malformed input cause no provider request',async()=>{
      for(const [path,body] of [['/maps/autocomplete',query],['/maps/routes',trip],['/maps/nearby',{placeId:'ChIJ_fixture',category:'hotel'}]] as const)assert.equal((await request(path,body,false)).status,401);
      for(const body of [{...query,input:'xx'},{...query,sessionToken:'bad'},{...query,country:'Thailand'}])assert.equal((await request('/maps/autocomplete',body)).status,400);
      for(const body of [{...trip,concertId:'-'.repeat(36)},{...trip,mode:'FLY'},{...trip,concertId:unknown},{...trip,departure:'2030-01-01T11:00'},{...trip,departure:new Date(Date.now()-86400000).toISOString()}])assert.equal((await request('/maps/routes',body)).status,400);
      for(const body of [{placeId:'../../bad',category:'hotel'},{placeId:'ChIJ_fixture',category:'unknown'},{placeId:'ChIJ_fixture',category:'hotel',radius:0}])assert.equal((await request('/maps/nearby',body)).status,400);
      await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");assert.equal((await request('/maps/routes',trip)).status,401);await db.query("UPDATE sessions SET expires_at=now()+interval '1 hour'");assert.equal(calls.length,0);
    });
    await t.test('Autocomplete uses a session, restricted fields and country, discarding query predictions',async()=>{
      const res=await request('/maps/autocomplete',query);assert.equal(res.status,200);assert.deepEqual(res.body.suggestions,[{id:'ChIJ_fixture',text:'Google fixture venue'}]);
      assert.deepEqual(calls.at(-1)?.body.includedRegionCodes,['th']);assert.equal(calls.at(-1)?.body.sessionToken,query.sessionToken);assert.ok(!calls.at(-1)?.fields.includes('photos'));
    });
    await t.test('Selected places terminate sessions using Details before traffic-aware routing',async()=>{
      const offset=calls.length,res=await request('/maps/routes',{...trip,originId:'ChIJ_origin',destinationId:'ChIJ_fixture',originToken:query.sessionToken,destinationToken:randomUUID()});
      assert.equal(res.status,200);assert.equal(res.body.distanceKm,12.3);assert.equal(res.body.durationMinutes,21);assert.equal(res.body.fare,null);
      assert.equal(calls.length-offset,3);assert.equal(new URL(calls[offset].url).searchParams.get('sessionToken'),query.sessionToken);
      assert.equal(calls.at(-1)?.body.routingPreference,'TRAFFIC_AWARE');assert.deepEqual(calls.at(-1)?.body.origin.location.latLng,{latitude:13.75,longitude:100.5});
      assert.equal(new URL(res.body.url).searchParams.get('origin_place_id'),'ChIJ_origin');
    });
    await t.test('Transit fare distinguishes absent, malformed, genuine zero and fractional amounts',async()=>{
      for(const [fare,expected] of [[undefined,null],[{currencyCode:'THB'},null],[{currencyCode:'THB',units:'garbage'},null],[{currencyCode:'THB',units:'1',nanos:1e9},null],[{currencyCode:'THB',units:'0'},0],[{currencyCode:'THB',units:'42',nanos:500000000},42.5]] as const){
        route={duration:'invalid',travelAdvisory:{transitFare:fare},legs:[{steps:[{transitDetails:{transitLine:{nameShort:'BTS'},stopDetails:{departureStop:{name:'A'},arrivalStop:{name:'B'}}}}]}]};
        const res=await request('/maps/routes',{...trip,mode:'TRANSIT'});assert.equal(res.status,200);assert.equal(res.body.fare?.amount ?? null,expected);assert.equal(res.body.durationMinutes,null);assert.equal(res.body.distanceKm,null);assert.equal(res.body.transit[0].line,'BTS');
      }
      route=null;assert.equal((await request('/maps/routes',trip)).status,404);route={distanceMeters:100,duration:'60s'};
    });
    await t.test('Nearby categories use selected coordinates and bounded radius; outgoing links stay on Google',async()=>{
      for(const category of ['hotel','restaurant','parking']){
        const res=await request('/maps/nearby',{placeId:'ChIJ_fixture',category,radius:3000});assert.equal(res.status,200);assert.equal(new URL(res.body.items[0].url).hostname,'www.google.com');
        assert.deepEqual(res.body.items[0].attributions,[{provider:'Fixture provider',url:'https://provider.example/'},{provider:'Unsafe link',url:null}]);
        assert.deepEqual(calls.at(-1)?.body.includedTypes,[category]);assert.equal(calls.at(-1)?.body.locationRestriction.circle.radius,3000);assert.equal(calls.at(-1)?.body.maxResultCount,6);assert.ok(!('price' in res.body.items[0]));
      }
      locations=false;const start=calls.length;assert.equal((await request('/maps/nearby',{placeId:'ChIJ_fixture',category:'hotel'})).body.code,'NO_LOCATION');assert.equal(calls.length-start,1);locations=true;
    });
    await t.test('Expiry while Google is responding discards the result',async()=>{
      onFetch=async()=>{await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");};
      assert.equal((await request('/maps/autocomplete',query)).status,401);onFetch=undefined;await db.query("UPDATE sessions SET expires_at=now()+interval '1 hour'");
    });
    await t.test('Provider access/network failures are safe; 429 cooldown persists in PostgreSQL',async()=>{
      for(const status of [403,-1]){failure=status;const res=await request('/maps/autocomplete',query);assert.equal(res.status,503);assert.ok(!JSON.stringify(res).includes('private-'));}
      failure=429;assert.equal((await request('/maps/autocomplete',query)).body.code,'PROVIDER_LIMIT');failure=0;
      const start=calls.length;assert.equal((await request('/maps/autocomplete',query)).status,429);assert.equal(calls.length,start);assert.ok((await request('/maps/config')).body.blockedUntil);
    });
    await t.test('Concurrent reservations cannot exceed the daily cap; only counts are persisted',async()=>{
      await db.query('DELETE FROM google_maps_budget');config.googleMapsDailyLimit=3;
      const start=calls.length,results=await Promise.allSettled(Array.from({length:8},()=>autocomplete('Bangkok',randomUUID(),'TH')));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,3);assert.equal(calls.length-start,3);
      const rows=(await db.query('SELECT * FROM google_maps_budget')).rows;assert.equal(rows[0].requests,3);assert.deepEqual(rows[0].by_kind,{autocomplete:3});assert.ok(!JSON.stringify(rows).includes('Google fixture'));
      config.googlePlacesKey='';await assert.rejects(autocomplete('Bangkok',randomUUID(),'TH'),{code:'NOT_CONFIGURED'});assert.equal(calls.length-start,3);
      config.googleRoutesEnabled=false;await assert.rejects(exploreRoute({...trip,destination:'User venue'}),{code:'NOT_CONFIGURED'});
    });
  }finally{
    if(server)await new Promise<void>(resolve=>{server!.close(()=>resolve());server!.closeAllConnections();});
    Object.assign(config,before);t.mock.restoreAll();await db.query('ROLLBACK');await db.end();
  }
});
