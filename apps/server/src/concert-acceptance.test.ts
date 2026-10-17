import assert from 'node:assert/strict';
import test from 'node:test';
import {concertAcceptanceSummary} from './concert-acceptance.js';
import {buildConcertMonitor,type MonitorRun} from './concert-monitor.js';
import {primaryConcertSources} from './concert-types.js';

const start=Date.parse('2026-10-04T23:00:00Z'),hour=3_600_000,end=start+168*hour;
const window={id:2,started_at:new Date(start),ends_at:new Date(end)};
const runs:MonitorRun[]=Array.from({length:168},(_unused,index)=>primaryConcertSources.map(source=>({
  source_name:source,scheduled_at:new Date(start+index*hour),started_at:new Date(start+index*hour+1000),
  finished_at:new Date(start+index*hour+2000),status:'success',items_seen:1,items_changed:0,error:null,
  metrics:{catalogComplete:true,catalogUrls:['https://example.com/'+source],pages:[{url:'https://example.com/'+source,outcome:'parsed'}]}
}))).flat();

test('Final artifact cannot be accepted before original end or from an older snapshot',()=>{
  const earlier=buildConcertMonitor(window,runs,end-1)!;
  assert.equal(concertAcceptanceSummary(earlier,end-1).finalSnapshotAllowed,false);
  assert.equal(concertAcceptanceSummary(earlier,end+1000).finalSnapshotAllowed,false);
  assert.equal(concertAcceptanceSummary(buildConcertMonitor(window,runs,end)!,end).finalSnapshotAllowed,true);
});

test('Cadence passing remains separate from unresolved details and listing fallbacks',()=>{
  const report=buildConcertMonitor(window,runs,end)!;
  report.coverage[0].listingFallback=1;
  const result=concertAcceptanceSummary(report,end);
  assert.equal(result.cadence,'passed');assert.equal(result.sourceResults,'needs_review');
  assert.equal(result.coverage[0].requiresReview,true);
  assert.match(result.factualCompleteness,/source-by-source/);
});

test('Final artifact rejects duplicate or missing source-hour evidence even if counters claim success',()=>{
  const report=buildConcertMonitor(window,runs,end)!;
  report.rows[1]=report.rows[0];
  const result=concertAcceptanceSummary(report,end);
  assert.equal(result.validRows,false);assert.equal(result.cadence,'needs_review');
  assert.equal(result.sourceResults,'needs_review');
  assert.throws(()=>concertAcceptanceSummary({...report,endsAt:new Date(end-hour).toISOString()},end),/seven-day/);
  assert.throws(()=>concertAcceptanceSummary({...report,generatedAt:new Date(end+120_000).toISOString()},end),/ahead/);
});

test('Final artifact retains failed attempts and never treats missing catalogs as proven coverage',()=>{
  const changed=runs.map(run=>({...run}));changed[0].status='failed';
  const report=buildConcertMonitor(window,changed,end)!;
  report.coverage=[];
  const result=concertAcceptanceSummary(report,end);
  assert.equal(result.cadence,'passed');assert.equal(result.sourceResults,'needs_review');
  assert.ok(result.coverage.every(row=>row.requiresReview&&row.verdict==='untracked'));
  const duplicate=buildConcertMonitor(window,runs,end)!;
  duplicate.coverage.push(duplicate.coverage[0]);
  assert.equal(concertAcceptanceSummary(duplicate,end).sourceResults,'needs_review');
});

test('Final counters cannot hide future completion times, invalid ordering or failed attempts',()=>{
  for(const change of ['future','before-start','failed'] as const) {
    const report=buildConcertMonitor(window,runs,end)!;
    if(change==='future')report.rows[0].finishedAt=new Date(end+1000).toISOString();
    else if(change==='before-start')report.rows[0].finishedAt=report.rows[0].scheduledAt;
    else report.rows[0].status='failed';
    assert.equal(concertAcceptanceSummary(report,end).sourceResults,'needs_review');
    if(change!=='failed')assert.equal(concertAcceptanceSummary(report,end).cadence,'needs_review');
  }
});
