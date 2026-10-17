import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {archiveFinalConcertReport} from './concert-final-report.js';
import {buildConcertMonitor,type MonitorRun} from './concert-monitor.js';
import {primaryConcertSources} from './concert-types.js';

const start=Date.parse('2026-10-04T23:00:00Z'),hour=3_600_000,end=start+168*hour;
const window={id:7,started_at:new Date(start),ends_at:new Date(end)};
const runs:MonitorRun[]=Array.from({length:168},(_unused,index)=>primaryConcertSources.map(source=>({
  source_name:source,scheduled_at:new Date(start+index*hour),started_at:new Date(start+index*hour+1000),
  finished_at:new Date(start+index*hour+2000),status:index===0?'partial':'success',items_seen:1,items_changed:0,error:index===0?'Unreadable seller details':null,
  metrics:{catalogComplete:true,catalogUrls:['https://example.com/'+source],pages:[{url:'https://example.com/'+source,outcome:'failed',error:'Access verification'}]}
}))).flat();
async function directory(t:test.TestContext) {
  const prefix=resolve(tmpdir(),'encore-concert-final-');
  const path=await mkdtemp(prefix);
  assert.ok(resolve(path).startsWith(prefix),'Fixture cleanup must remain in its explicitly named temporary directory');
  t.after(()=>rm(path,{recursive:true,force:true}));return path;
}

test('Final archive creates no file before original end or from a pre-end snapshot',async t=>{
  const dir=await directory(t),report=buildConcertMonitor(window,runs,end-1)!;
  assert.equal(await archiveFinalConcertReport(report,dir,end-1),null);
  assert.equal(await archiveFinalConcertReport(report,dir,end+1000),null);
  assert.deepEqual(await readdir(dir),[]);
});

test('Final archive retains complete failed coverage, original window, and a matching payload hash',async t=>{
  const dir=await directory(t),report=buildConcertMonitor(window,runs,end)!;
  const result=await archiveFinalConcertReport(report,dir,end);
  assert.ok(result?.created);assert.equal(result.path,join(dir,'concert-window7-final.json'));
  const saved=JSON.parse(await readFile(result.path,'utf8'));
  assert.equal(saved.cadence,'passed');assert.equal(saved.sourceResults,'needs_review');
  assert.deepEqual(saved.report,report);assert.equal(saved.report.rows.length,672);
  assert.equal(saved.sha256,createHash('sha256').update(JSON.stringify(report)).digest('hex'));
  assert.equal(saved.endsAt,new Date(end).toISOString());
});

test('Repeated final archive preserves first evidence when later data changes',async t=>{
  const dir=await directory(t),report=buildConcertMonitor(window,runs,end)!;
  const first=await archiveFinalConcertReport(report,dir,end);assert.ok(first);
  const original=await readFile(first.path,'utf8');
  const second=await archiveFinalConcertReport({...report,generatedAt:new Date(end+1000).toISOString(),issues:0},dir,end+1000);
  assert.equal(second?.created,false);assert.equal(await readFile(first.path,'utf8'),original);
  assert.deepEqual(await readdir(dir),['concert-window7-final.json']);
});

test('Concurrent final writers publish one complete immutable artifact and remove their temporary files',async t=>{
  const dir=await directory(t),report=buildConcertMonitor(window,runs,end)!;
  const results=await Promise.all(Array.from({length:8},()=>archiveFinalConcertReport(report,dir,end)));
  assert.equal(results.filter(result=>result?.created).length,1);
  assert.deepEqual(await readdir(dir),['concert-window7-final.json']);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'concert-window7-final.json'),'utf8')).report,report);
});
