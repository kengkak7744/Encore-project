import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBiography } from './biography-generator.js';
import { config } from './config.js';
import { ollamaQueue } from './ollama-queue.js';
import type { BiographyArtist, BiographySource } from './biography-policy.js';

test('actual generator sends only selected evidence to factual review',async(t)=>{
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  const proof='วงตัวอย่างประกอบด้วยสมาชิกสองคนที่เริ่มสร้างสรรค์ผลงานเพลงร่วมกันและเผยแพร่เพลงผ่านช่องทางของวง.';
  const sources:BiographySource[]=[{id:'source-1',url:'https://example.org/artist',label:'Official',text:proof+' Unselected biography content must not enter the review.',fetchedAt:'2026-10-13T15:00:00Z',publishedAt:'2023-04-04'}];
  const raw={identityMatches:true,reason:'',sections:['สมาชิก','การทำเพลง','การเผยแพร่'].map(heading=>({heading,body:proof,sourceId:'source-1',evidenceIds:['source-1:1']}))};
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{
    if(String(url).endsWith('/api/ps'))return Response.json({models:[]});
    const request=JSON.parse(String(options.body)),input=JSON.parse(request.messages[1].content);calls++;
    if(input.draft){
      assert.equal(input.sources[0].text,proof);
      assert.equal(input.sectionEvidence[0].index,0);
      assert.deepEqual(input.sectionEvidence[0].evidence,[proof]);
      return Response.json({message:{content:JSON.stringify({identityMatches:true,checks:[0,1,2].map(index=>({index,supported:true,reason:'supported'}))})}});
    }
    assert.equal(input.sourceGuidance[0].articleYear,2023);
    return Response.json({message:{content:JSON.stringify(raw)}});
  });
  assert.equal((await generateBiography({id:'fixture',slug:'fixture',name:'วงตัวอย่าง',name_en:null,kind:'band'},sources,new AbortController().signal)).sections.length,3);
  assert.equal(calls,2);
});

test('draft and factual review share one HTTP retry for the entire biography job',async(t)=>{
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  const quote='วงตัวอย่างประกอบด้วยสมาชิกสองคนที่เริ่มสร้างสรรค์ผลงานเพลงร่วมกันและเผยแพร่เพลงผ่านช่องทางของวง';
  const sources:BiographySource[]=[{id:'source-1',url:'https://example.org/artist',label:'Official',text:quote,fetchedAt:'2026-10-14T02:00:00Z'}];
  const raw={identityMatches:true,reason:'',sections:['สมาชิก','การทำเพลง','การเผยแพร่'].map(heading=>({heading,body:quote,sourceId:'source-1',evidenceIds:['source-1:1']}))};
  let calls=0;
  t.mock.method(globalThis,'fetch',async(url:unknown)=>{
    if(String(url).endsWith('/api/ps'))return Response.json({models:[]});
    calls++;
    if(calls===1)return Response.json({error:'draft runner terminated'},{status:500});
    if(calls===2)return Response.json({message:{content:JSON.stringify(raw)}});
    return Response.json({error:'review runner terminated'},{status:500});
  });
  await assert.rejects(generateBiography({id:'fixture',slug:'fixture',name:'วงตัวอย่าง',name_en:null,kind:'band'},sources,new AbortController().signal),/Ollama HTTP 500: review runner terminated/);
  assert.equal(calls,3);
});

test('biography generation selects real evidence and allows only one factual repair', async (t) => {
  const originalFetch = globalThis.fetch;
  t.mock.method(ollamaQueue,'run',async (job: { signal: AbortSignal },work: (signal: AbortSignal) => Promise<unknown>) => work(job.signal));
  const artist: BiographyArtist = { id: 'test', slug: 'test', name: 'วงตัวอย่าง', name_en: null, kind: 'band' };
  const quote = 'วงดนตรีตัวอย่างเริ่มทำเพลงร่วมกันและเผยแพร่ผลงานผ่านช่องทางของวง';
  const sources: BiographySource[] = [{ id: 'source-1', url: 'https://example.com/artist', label: 'Artist', text: quote, fetchedAt: '2026-10-03T16:00:00Z',publishedAt:'2020-03-19' }];
  const raw = { identityMatches: true, reason: '', sections: ['จุดเริ่มต้น', 'การทำเพลง', 'ช่องทางเผยแพร่'].map((heading) => ({ heading, body: quote + ' โดยข้อความนี้กล่าวถึงการทำงานและช่องทางเผยแพร่เพลงของวงตามแหล่งอ้างอิงที่ให้ไว้', sourceId: 'source-1', evidenceIds: ['source-1:1'] })) };
  const review = (supported: boolean) => ({ identityMatches: true, reason: '', checks: [0, 1, 2].map((index) => ({ index, supported, reason: supported ? '' : 'Unsupported claim' })) });
  let calls = 0;
  const respond = (values: object[]) => {
    calls = 0;
    globalThis.fetch = async (_url, options) => {
      if (String(_url).endsWith('/api/ps')) return Response.json({ models: [] });
      if (String(_url).endsWith('/api/generate')) return Response.json({ done: true });
      const request = JSON.parse(String(options?.body));
      assert.equal(request.model, config.biographyModel);
      assert.equal(request.think, false);
      assert.equal(request.options.num_ctx, 8192);
      const input=JSON.parse(request.messages[1].content);
      if(input.feedback?.review?.checks?.some((check:{supported:boolean})=>!check.supported)) {
        assert.ok(input.feedback.sectionProblems.length>0);
        assert.equal(input.feedback.sectionProblems[0].index,0);
        assert.equal(input.feedback.sectionProblems[0].sourceId,'source-1');
        assert.ok(input.feedback.sectionProblems[0].allowedEvidenceIds.includes('source-1:1'));
      }
      assert.equal(input.sources[0].publishedAt,'2020-03-19');
      assert.equal(input.sources[0].fetchedAt,'2026-10-03T16:00:00Z');
      assert.ok(input.temporalRules.includes('7 เดือน'));
      assert.ok(input.eventRules.includes('วันปล่อยเพลง'));
      if(input.feedback?.problem?.includes('evidenceId')) {
        assert.ok(input.feedback.problem.includes('Allowed IDs: source-1:1'));
        assert.ok(input.feedback.problem.includes('Split cross-source claims'));
        assert.equal(input.feedback.sectionProblems[0].index,0);
        assert.equal(input.feedback.sectionProblems[0].sourceId,'source-1');
      }
      if(input.feedback?.problem?.includes('repeated')) {
        assert.deepEqual(input.feedback.sectionProblems.map((section:{index:number})=>section.index),[2]);
        assert.ok(request.messages[0].content.includes('heading ต้องไม่ซ้ำ'));
      }
      if(!input.draft) {
        const choices=request.format.properties.sections.items.anyOf;
        assert.equal(choices.length,sources.length);
        assert.deepEqual(choices[0].properties.sourceId.enum,['source-1']);
        assert.deepEqual(choices[0].properties.evidenceIds.items.enum,['source-1:1']);
      }
      if(input.draft) {
        assert.equal(request.format.properties.checks.minItems,3);
        assert.equal(request.format.properties.checks.maxItems,3);
        assert.equal(request.format.properties.checks.items.properties.index.maximum,2);
      }
      assert.ok(values[calls], 'Generation exceeded the repair limit');
      return Response.json({ message: { content: JSON.stringify(values[calls++]) }, done_reason: 'stop' });
    };
  };
  try {
    await t.test('successful draft resolves IDs to exact source quotes and persists review', async () => {
      respond([raw, review(true)]); const snapshots: unknown[] = [];
      const draft = await generateBiography(artist, sources, new AbortController().signal, (value) => { snapshots.push(value); });
      assert.equal(calls, 2); assert.equal(draft.sections[0].evidence[0], quote.normalize('NFKC'));
      assert.equal(snapshots.length, 2); assert.ok(Object.hasOwn(snapshots[1] as object, 'review'));
    });
    await t.test('unsupported first draft is repaired and checked again', async () => {
      respond([raw, review(false), raw, review(true)]);
      assert.equal((await generateBiography(artist, sources, new AbortController().signal)).sections.length, 3);
      assert.equal(calls, 4);
    });
    await t.test('second rejection stops the job without accepting a draft', async () => {
      respond([raw, review(false), raw, review(false)]);
      await assert.rejects(generateBiography(artist, sources, new AbortController().signal), /Unsupported claim/);
      assert.equal(calls, 4);
    });
    await t.test('unsupported editorial wording is repaired before requesting factual review', async () => {
      const promotional = structuredClone(raw); promotional.sections[0].heading = 'เพลงยอดนิยม';
      respond([promotional, raw, review(true)]);
      assert.equal((await generateBiography(artist, sources, new AbortController().signal)).sections.length, 3);
      assert.equal(calls, 3);
    });
    await t.test('duplicate headings reach the repair call with their original index',async()=>{
      const repeated=structuredClone(raw);repeated.sections[2].heading=repeated.sections[1].heading;
      respond([repeated,raw,review(true)]);
      const draft=await generateBiography(artist,sources,new AbortController().signal);
      assert.equal(new Set(draft.sections.map(section=>section.heading)).size,3);
      assert.equal(calls,3,'One structural repair and one factual review only');
    });
    await t.test('cross-source excerpt IDs are rejected and repaired with explicit evidence feedback',async()=>{
      const wrong=structuredClone(raw);wrong.sections[0].evidenceIds=['source-2:1'];
      respond([wrong,raw,review(true)]);
      const snapshots:any[]=[];
      const draft=await generateBiography(artist,sources,new AbortController().signal,value=>{snapshots.push(value);});
      assert.equal(calls,3);assert.equal(draft.sections[0].evidence[0],quote.normalize('NFKC'));
      assert.equal(snapshots[0].sections[0].evidenceIds[0],'source-2:1');
      assert.equal(snapshots[0].sections[0].evidence,undefined);
    });
    await t.test('two invalid evidence selections stop without factual review or silent correction',async()=>{
      const wrong=structuredClone(raw);wrong.sections[0].evidenceIds=['source-1:999'];
      respond([wrong,wrong]);
      await assert.rejects(generateBiography(artist,sources,new AbortController().signal),/source-1:999.*source-1|source-1.*source-1:999/);
      assert.equal(calls,2);
    });
  } finally { globalThis.fetch = originalFetch; }
});
