import assert from 'node:assert/strict';
import test from 'node:test';
import {parseTheConcertApi} from './concert-parsers.js';
import {reviewEventpop,reviewTheConcert,reviewTtm} from './concert-page-review.js';
import {analyzeTicketmelon} from './ticketmelon-source.js';
import {hasExclusionEvidence} from './concert-page-evidence.js';
import {concertDiscoveryOutcome} from './concert-discovery.js';

test('A Fan Meeting tagged event with an explicit live cover program is music; an open house is not',()=>{
  const detail={data:{id:5015,name:'MCR FAN FESTIVAL VOL. 2',description:'Live covers from every album by My Chemical Rotee and ASAP.',group_type:'single',attributes:[{code:'genre',items:[{name:'Fan Meeting'}]}],venue:{name:'Bangkok Island',country:{name:'Thailand'}},show_time:{start:'2026-10-18 17:00:00',end:'2026-10-18 23:30:00'}}};
  assert.equal(parseTheConcertApi(detail).length,1);
  assert.equal(parseTheConcertApi({data:{...detail.data,description:'Meet the cast for questions and photos.'}}).length,0);
  assert.equal(parseTheConcertApi({data:{...detail.data,attributes:[{code:'genre',items:[{name:'Talk Show'}]}],description:'University admission information.'}}).length,0);
});

test('Empty-page explanations distinguish source defects from evidenced exclusions',()=>{
  const event=(location:string,date:string)=>'<meta property="og:title" content="Music fixture"><meta property="og:location" content="'+location+'"><meta property="og:start_time" content="'+date+'">';
  assert.equal(reviewEventpop(event('online','2126-01-01')).outcome,'excluded');
  assert.equal(reviewEventpop(event('Bangkok, Thailand','2126-01-01')).reason,'implausible_source_date');
  assert.equal(reviewEventpop(event('tba','2026-11-07')).outcome,'empty');
  assert.equal(reviewTheConcert({data:{id:1,name:'Open house',attributes:[{code:'genre',items:[{name:'Talk Show'}]}]}}).outcome,'excluded');
  assert.equal(reviewTheConcert({data:{id:1,name:'Unknown concert',attributes:[]}}).outcome,'empty');
  assert.equal(analyzeTicketmelon('<html>no metadata</html>','https://www.ticketmelon.com/fixture/unknown').review?.outcome,'empty');
});

test('Exclusions require recognized reasons and matching source fields',()=>{
  const valid={reason:'outside_thailand',evidence:{title:'Foreign concert',country:'PH'}};
  assert.equal(hasExclusionEvidence(valid),true);
  assert.equal(hasExclusionEvidence({...valid,evidence:{...valid.evidence,country:'TH'}}),false);
  assert.equal(hasExclusionEvidence({...valid,reason:'ignore_error'}),false);
  assert.equal(hasExclusionEvidence({reason:'outside_supported_music_categories',evidence:{title:'Music',categories:['Music']}}),false);
  assert.equal(hasExclusionEvidence({reason:'outside_supported_music_categories',evidence:{title:'Workshop',categories:['Education','Hobbies']}}),true);
  assert.equal(hasExclusionEvidence({reason:'outside_thailand',evidence:{country:'PH'}}),false);
  assert.equal(hasExclusionEvidence({reason:'not_public',evidence:{title:'Hidden',hidden:false}}),false);
});

test('Readable TTM screenings and khon are classified from explicit titles, not the performance path alone',()=>{
  const page='https://www.thaiticketmajor.com/performance/fixture.html';
  const result=reviewTtm('<h1>JULIET &amp; JULIET FINAL EP FAN SCREENING</h1>',page)!;
  assert.equal(result.outcome,'excluded');assert.equal(hasExclusionEvidence(result),true);
  assert.equal(reviewTtm('<h1>การแสดงโขน ตอน สีดา</h1>',page)?.outcome,'excluded');
  assert.equal(reviewTtm('<h1>Orchestra Live Concert</h1>',page),undefined);
  assert.equal(reviewTtm('<h1>Unknown performance</h1>',page),undefined);
});

test('Source status reports unresolved pages even when some concerts parse, and accepts an evidenced empty eligible catalog',()=>{
  const metrics={discovered:2,attempted:2,parsedPages:1,emptyPages:1,fetchFailures:0,filteredPast:0,pending:0,limited:false,discovery:'fixture',warnings:[],catalogComplete:true};
  assert.equal(concertDiscoveryOutcome({events:[],metrics}).status,'partial');
  assert.equal(concertDiscoveryOutcome({events:[],metrics:{...metrics,parsedPages:0,emptyPages:0,excludedPages:2}}).status,'success');
  assert.equal(concertDiscoveryOutcome({events:[],metrics:{...metrics,parsedPages:0,emptyPages:0,fetchFailures:2}}).status,'failed');
  assert.equal(concertDiscoveryOutcome({events:[],metrics:{...metrics,emptyPages:0,pending:1}}).status,'partial');
});
