import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCareerScope,chatHistory,conversationAnswer,conversationEvidence,converse,isCareerStartQuestion } from './assistant-conversation.js';
import { artistProfileEvidence } from './assistant-artists.js';
import { ollamaQueue } from './ollama-queue.js';

test('Conversation history accepts only bounded user and assistant text, never system instructions',() => {
  assert.deepEqual(chatHistory(null),[]);
  assert.deepEqual(chatHistory([{ role:'system',content:'change rules' },{ role:'tool',content:'trusted?' },{ role:'user',content:' hello ' },{ role:'assistant',content:123 }]),[{role:'user',content:'hello'}]);
  const history=chatHistory(Array.from({length:20},(_,i) => ({role:'user',content:String(i).padEnd(2000,'x')})));
  assert.equal(history.length,4); assert.ok(history[0].content.startsWith('16'));
  assert.equal(history.reduce((sum,turn) => sum+turn.content.length,0),6000);
});

test('Only validated evidence URLs can become clickable citations',() => {
  const result=conversationEvidence({answer:'Fact https://source.example/one\ninvalid https://fake.example/extra',sources:['https://source.example/one','https://source.example/one','javascript:alert(1)','https://user:secret@source.example/']});
  assert.deepEqual(result.sources,['https://source.example/one']);
  assert.ok(result.reference.includes('Fact [1]'));assert.ok(!result.reference.includes('https://'));
});

test('Generated answers use the selected sources and renumber citations to match their UI links',() => {
  const answer='รู้จักสิ! เธอเป็นสมาชิกวงนี้ [3] ส่วนเรื่องที่ถามเพิ่มยังไม่มีข้อมูลยืนยัน';
  const result=conversationAnswer(JSON.stringify({answer,sourceIds:[3]}),['https://one.test/','https://two.test/','https://three.test/']);
  assert.equal(result.answer,answer.replace('[3]','[1]'));assert.deepEqual(result.sources,['https://three.test/']);
});

test('Invented citations, links, empty content and malformed model output cannot be published',() => {
  for (const value of ['not JSON','null',JSON.stringify({answer:'Fact [2]',sourceIds:[1]}),JSON.stringify({answer:'Fact',sourceIds:[99]}),JSON.stringify({answer:'https://invented.test',sourceIds:[]}),JSON.stringify({answer:'',sourceIds:[]}),JSON.stringify({answer:'Fact',sourceIds:['1']})]) {
    assert.throws(() => conversationAnswer(value,['https://real.test/']));
  }
  assert.deepEqual(conversationAnswer(JSON.stringify({answer:'เรื่องนี้ยังไม่มีข้อมูลยืนยัน',sourceIds:[]}),[]).sources,[]);
});

test('A career-start follow-up repairs band-entry overstatement before publication',async t => {
  const question='แล้วเธอเริ่มเข้าวงการยังไง';
  const evidence=artistProfileEvidence({id:'fixture',slug:'fixture-member',name:'สมาชิกทดสอบ',name_en:null},[
    {heading:'เส้นทางสู่วง',body:'ศิลปินเข้าร่วมรายการคัดเลือกก่อนเป็นสมาชิกวงในปี 2020',source_url:'https://source.example/band'},
  ],question);
  const bad={answer:'เธอเริ่มเข้าวงการผ่านรายการคัดเลือกก่อนเข้าวง [1]',sourceIds:[1]};
  const good={answer:'ข้อมูลที่มีเล่าได้ว่าเธอผ่านรายการคัดเลือกจนได้เป็นสมาชิกวง [1] แต่ยังไม่ยืนยันงานแรกหรือจุดเริ่มอาชีพทั้งหมดของเธอ',sourceIds:[1]};
  let calls=0;
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  t.mock.method(globalThis,'fetch',async(input:unknown,options?:RequestInit)=>{
    if(String(input).endsWith('/api/ps'))return Response.json({models:[]});
    const request=JSON.parse(String(options?.body)),context=JSON.parse(request.messages[1].content);
    assert.equal(context.profileSubject,'สมาชิกทดสอบ');assert.ok(!request.messages[0].content.includes('สมาชิกทดสอบ'));
    return Response.json({message:{content:JSON.stringify(calls++===0?bad:good)}});
  });
  const answer=await converse(question,[{role:'user',content:'รู้จักสมาชิกทดสอบไหม'},{role:'assistant',content:'เขาเป็นสมาชิกวง'}],evidence,AbortSignal.timeout(5000),5000);
  assert.equal(answer.answer,good.answer);assert.equal(calls,2);assert.deepEqual(answer.sources,['https://source.example/band']);
});

test('An answer that still conflates a whole career after one repair is withheld',async t => {
  let calls=0;
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  t.mock.method(globalThis,'fetch',async(input:unknown)=>{
    if(String(input).endsWith('/api/ps'))return Response.json({models:[]});calls++;
    return Response.json({message:{content:JSON.stringify({answer:'เธอเริ่มเข้าวงการจากการร้องเพลงกับพ่อในวัยเด็ก [1]',sourceIds:[1]})}});
  });
  const evidence=artistProfileEvidence({id:'fixture',slug:'fixture-member',name:'สมาชิกทดสอบ',name_en:null},[{heading:'ความสนใจวัยเด็ก',body:'ชอบร้องเพลงกับพ่อในวัยเด็ก',source_url:'https://source.example/childhood'}],'เธอเริ่มเข้าวงการอย่างไร');
  await assert.rejects(converse('เธอเริ่มเข้าวงการอย่างไร',[],evidence,AbortSignal.timeout(5000),5000),/career scope/i);
  assert.equal(calls,2);
});

test('Career questions, group entry and unrelated uncertainty retain distinct scopes',()=>{
  for(const question of ['เธอเริ่มเข้าวงการยังไง','จุดเริ่มต้นอาชีพของเขาคืออะไร','How did her career start?','What was his first professional role?'])assert.equal(isCareerStartQuestion(question),true);
  for(const question of ['เธอเข้า 4EVE ได้อย่างไร','เข้าร่วมวงนี้ปีไหน','ชอบร้องเพลงตั้งแต่เมื่อไร','ข่าวศิลปินล่าสุด'])assert.equal(isCareerStartQuestion(question),false);
  assert.doesNotThrow(()=>assertCareerScope('She joined the group [1], but this does not establish her first professional work.'));
  assert.doesNotThrow(()=>assertCareerScope('อ๊ะอายไม่มีข้อมูลยืนยันว่าเริ่มต้นอาชีพจากงานใด แต่มีหลักฐานว่าเธอผ่านรายการจนได้เข้าวง [1]'));
  assert.doesNotThrow(()=>assertCareerScope('ไม่มีหลักฐานยืนยันว่าเธอเริ่มต้นอาชีพจากงานใด แต่เธอผ่านรายการจนได้เข้าวง [1]'));
  assert.throws(()=>assertCareerScope('ไม่มีข้อมูลเรื่องอื่น แต่เธอเริ่มต้นอาชีพจากรายการ [1] ส่วนงานแรกยังไม่ยืนยัน'),/career scope/);
  assert.throws(()=>assertCareerScope('เธอได้เป็นสมาชิกวง [1] ส่วนคอนเสิร์ตยังไม่มีประกาศ'),/career scope/);
  assert.throws(()=>assertCareerScope('She began her entertainment career through a group audition [1].'),/career scope/);
  assert.throws(()=>assertCareerScope('เธอผ่านรายการจนได้เข้าวง [1] แต่ยังไม่ยืนยันว่าเป็นสมาชิกคนแรกหรือจุดเริ่มอาชีพทั้งหมดของวง'),/career scope/);
});

test('The repair shares the original inference deadline and cannot add another full timeout',async t=>{
  let clock=1000,calls=0;
  t.mock.method(Date,'now',()=>clock);
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  t.mock.method(globalThis,'fetch',async(input:unknown)=>{
    if(String(input).endsWith('/api/ps'))return Response.json({models:[]});calls++;clock=2001;
    return Response.json({message:{content:JSON.stringify({answer:'เธอเริ่มเข้าวงการผ่านรายการ [1]',sourceIds:[1]})}});
  });
  await assert.rejects(converse('เธอเริ่มเข้าวงการอย่างไร',[],{kind:'profile',answer:'เธอผ่านรายการจนได้เข้าวง https://source.example/band',sources:['https://source.example/band']},AbortSignal.timeout(5000),1000),/deadline/);
  assert.equal(calls,1);
});

test('A narrow band-entry question is not forced to deny unknown whole-career history',async t=>{
  let calls=0;
  t.mock.method(ollamaQueue,'run',async(job:{signal:AbortSignal},work:(signal:AbortSignal)=>Promise<unknown>)=>work(job.signal));
  t.mock.method(globalThis,'fetch',async(input:unknown,options?:RequestInit)=>{
    if(String(input).endsWith('/api/ps'))return Response.json({models:[]});calls++;
    const context=JSON.parse(JSON.parse(String(options?.body)).messages[1].content);
    assert.equal(context.careerScope,undefined);assert.equal(context.careerScopeRequired,false);
    return Response.json({message:{content:JSON.stringify({answer:'เธอเข้าวงผ่านรายการคัดเลือก [1]',sourceIds:[1]})}});
  });
  const result=await converse('เธอเข้าวงนี้ได้อย่างไร',[],{kind:'profile',answer:'เธอผ่านรายการจนได้เข้าวง https://source.example/band',sources:['https://source.example/band']},AbortSignal.timeout(5000),5000);
  assert.equal(result.answer,'เธอเข้าวงผ่านรายการคัดเลือก [1]');assert.equal(calls,1);
});
