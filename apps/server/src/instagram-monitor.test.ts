import assert from 'node:assert/strict';
import test from 'node:test';
import {buildInstagramMonitor,type InstagramMonitorAccount,type InstagramMonitorRun} from './instagram-monitor.js';

test('Instagram report keeps inaccessible accounts in the denominator and exposes actual capacity',()=>{
  const now=Date.parse('2026-10-09T12:00:00Z');
  const account=(slug:string,minutes:number|null):InstagramMonitorAccount=>({slug,handle:slug,last_success_at:minutes===null?null:new Date(now-minutes*60_000),last_checked_at:null,next_sync_at:null,instagram_failures:0,last_error:null});
  const accounts=Array.from({length:100},(_,index)=>account('artist-'+index,index<51?20:index<98?90:null));
  accounts[99].instagram_failures=3;accounts[99].next_sync_at=new Date(now+3_600_000);
  const run=(minutes:number,mode:string,status='success'):InstagramMonitorRun=>({started_at:new Date(now-minutes*60_000),finished_at:new Date(now-minutes*60_000+1000),status,metrics:{mode,artistSlug:'artist-0'}});
  const result=buildInstagramMonitor(accounts,[run(10,'discovery'),run(80,'discovery'),run(5,'media'),run(6,'detail'),run(1,'discovery','failed')],90,now);
  assert.equal(result.accounts,100);assert.equal(result.freshAccounts,51);assert.equal(result.neverSucceeded,2);assert.equal(result.backoffAccounts,1);
  assert.equal(result.minimumFullPassMinutes,150);assert.equal(result.maximumSpacingForFullPassSeconds,36);
  assert.equal(result.observedUniqueAccountsLastHour,1);assert.equal(result.verdict,'needs_review');
  assert.equal(result.items.find(row=>row.slug==='artist-0')?.maximumRecordedGapMinutes,70);
  assert.equal(result.hourly.reduce((n,row)=>n+row.failures,0),1);
  assert.equal(result.items[0].fresh,false);
});
