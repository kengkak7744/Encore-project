import test from 'node:test';
import assert from 'node:assert/strict';
import { biographyRepairFeedback, biographySourceGuidance, biographyReviewEvidence } from './biography-guidance.js';
import type { BiographyDraft, BiographySource } from './biography-policy.js';
import { groundBiographyEvidence, validateBiographyDraft } from './biography-policy.js';

const quote='วงตัวอย่างประกอบด้วยสมาชิกสองคนที่เริ่มสร้างสรรค์ผลงานเพลงร่วมกันและเผยแพร่เพลงผ่านช่องทางของวง.';
const sources:BiographySource[]=[{id:'source-1',url:'https://example.org/one',label:'Official',text:quote+'\nข้อความอื่นที่ไม่ได้เลือกเป็นหลักฐานและต้องไม่เข้าสู่การตรวจหัวข้อนี้',fetchedAt:'2026-10-13T15:00:00Z',publishedAt:null}];

test('repair identifies the failing section, its undated source and selected evidence',()=>{
 const raw={identityMatches:true,sections:[{heading:'สมาชิก',body:quote,sourceId:'source-1',evidenceIds:['source-1:1']},{heading:'ระยะประสบการณ์',body:'วงตัวอย่างมีประสบการณ์มากกว่า 13 ปี '+quote,sourceId:'source-1',evidenceIds:['source-1:1']}]};
 const feedback=biographyRepairFeedback(raw,sources,'Unsupported time quantity');
 assert.equal(feedback.sectionProblems.length,1);
 assert.equal(feedback.sectionProblems[0].index,1);
 assert.equal(feedback.sectionProblems[0].sourceId,'source-1');
 assert.equal(feedback.sectionProblems[0].publishedAt,null);
 assert.match(feedback.sectionProblems[0].problem,/time quantity/);
 assert.deepEqual(feedback.sectionProblems[0].selectedEvidence,[quote]);
 assert.match(feedback.action,/ลบ/);
});

test('source guidance never turns fetch time into a usable publication year',()=>{
 const guidance=biographySourceGuidance(sources);
 assert.equal(guidance[0].articleYear,null);
 assert.equal(guidance[0].datedClaimsAllowed,false);
 assert.match(guidance[0].instruction,/ละ/);
 assert.equal(biographySourceGuidance([{...sources[0],publishedAt:'2023-04-04'}])[0].articleYear,2023);
});

test('factual review failures retain the rejected section and available same-source evidence IDs for repair',()=>{
 const raw={identityMatches:true,sections:[{heading:'ผลงาน',body:quote,sourceId:'source-1',evidenceIds:['source-1:1']}]};
 const feedback=biographyRepairFeedback(raw,sources,'Unsupported claim',{checks:[{index:0,supported:false,reason:'The work title needs an additional selected excerpt'}]});
 assert.equal(feedback.sectionProblems[0].index,0);
 assert.match(feedback.sectionProblems[0].problem,/work title/);
 assert.ok(feedback.sectionProblems[0].allowedEvidenceIds.includes('source-1:1'));
 assert.deepEqual(feedback.sectionProblems[0].selectedEvidence,[quote]);
});

test('a short draft gets explicit structure feedback and unused evidence sources',()=>{
 const raw={sections:[{heading:'ผลงาน',body:quote,sourceId:'source-1',evidenceIds:['source-1:1']}]};
 const feedback=biographyRepairFeedback(raw,[...sources,{...sources[0],id:'source-2'}],'Need 3–6 supported biography sections');
 assert.equal(feedback.structureProblem?.minimumSections,3);
 assert.equal(feedback.structureProblem?.actualSections,1);
 assert.deepEqual(feedback.structureProblem?.unusedSourceIds,['source-2']);
});

test('repair reports the duplicate heading at its actual draft index',()=>{
 const raw={identityMatches:true,reason:'same artist',sections:['ข้อมูลวง','ผลงานเพลง','ผลงานเพลง'].map(heading=>({heading,body:quote,sourceId:'source-1',evidenceIds:['source-1:1']}))};
 const draft=groundBiographyEvidence(raw,sources);
 assert.throws(()=>validateBiographyDraft(draft,sources),/repeated.*heading/);
 const feedback=biographyRepairFeedback(draft,sources,'Missing, repeated, or oversized heading');
 assert.deepEqual(feedback.sectionProblems.map(section=>section.index),[2]);
 assert.match(feedback.sectionProblems[0].problem,/repeated.*heading/);
 assert.deepEqual(feedback.sectionProblems[0].selectedEvidence,[quote]);
});

test('review is restricted to the exact evidence of each section and keeps source dates',()=>{
 const draft:BiographyDraft={identityMatches:true,reason:'',sections:[{heading:'สมาชิก',body:quote,sourceId:'source-1',evidence:[quote]}]};
 const review=biographyReviewEvidence(draft,sources);
 assert.equal(review.sources[0].text,quote);
 assert.equal(review.sources[0].publishedAt,null);
 assert.deepEqual(review.sectionEvidence[0].evidence,[quote]);
 assert.equal(JSON.stringify(review).includes('ข้อความอื่นที่ไม่ได้เลือก'),false);
 assert.throws(()=>biographyReviewEvidence({...draft,sections:[{...draft.sections[0],sourceId:'missing'}]},sources),/unknown source/i);
});
