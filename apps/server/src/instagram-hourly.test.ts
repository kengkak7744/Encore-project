import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from './config.js';
import { instagramDiscoveryHeadroom, instagramPacing } from './instagram-policy.js';

test('100 accounts fit repeated hourly passes at observed 45% total-time usage', () => {
  const before = { ...config };
  Object.assign(config,{ instagramAdaptivePacingEnabled:true,instagramRequestSpacingSeconds:60,instagramMinSpacingSeconds:30,instagramUsagePausePercent:75 });
  try {
    const usage = { callCount:23,totalTime:45,cpuTime:0,regainMinutes:null };
    let pace = { seconds:60,healthy:0 };
    // Let the existing gradual recovery converge before measuring sustained capacity.
    for(let i=0;i<100;i++) pace=instagramPacing(usage,pace.seconds,pace.healthy);
    for(let pass=0;pass<3;pass++) {
      let seconds=0;
      for(let account=0;account<100;account++) {
        seconds+=pace.seconds+1; // include one second of scheduling/response overhead
        pace=instagramPacing(usage,pace.seconds,pace.healthy);
      }
      assert.ok(seconds<=3600,`100 discovery checks require ${seconds/60} minutes at ${pace.seconds}s spacing`);
    }
  } finally { Object.assign(config,before); }
});

test('Discovery deadline planning reserves capacity for the whole queue, including accounts not due yet', () => {
  const now=Date.parse('2026-10-10T01:00:00Z');
  const recent=Array.from({length:100},()=>new Date(now-10*60_000));
  assert.equal(instagramDiscoveryHeadroom(recent,30,now).allowEnrichment,false,
    'Every account looks individually safe, but 100 reserved slots exceed the remaining 50 minutes');
  assert.equal(instagramDiscoveryHeadroom([new Date(now-10*60_000)],30,now).allowEnrichment,true);
  assert.equal(instagramDiscoveryHeadroom([null],30,now).allowEnrichment,false);
  assert.equal(instagramDiscoveryHeadroom([],30,now).allowEnrichment,true);
});

test('100-account twelve-hour simulation drains mixed queues while preserving hourly discovery gaps', () => {
  const start=Date.parse('2026-10-10T01:00:00Z');
  const successes=Array.from({length:100},(_,index)=>start-(55*60-index*33)*1000);
  let optional=0,discovery=0,maximumGap=0,checksSinceEnrichment=5;
  let pendingText=26,pendingMedia=82,lastMode='detail';
  // One request every 32 seconds: 30-second reservation plus two seconds overhead.
  for(let elapsed=0;elapsed<12*3600;elapsed+=32) {
    const now=start+elapsed*1000;
    const oldest=successes.indexOf(Math.min(...successes));
    const due=now-successes[oldest]>=55*60_000;
    const headroom=instagramDiscoveryHeadroom(successes.map(value=>new Date(value)),30,now);
    if(headroom.allowEnrichment && (pendingText || pendingMedia) && (!due || checksSinceEnrichment>=5)) {
      const mode=pendingText && (!pendingMedia || lastMode==='media') ? 'detail' : 'media';
      if(mode==='detail')pendingText--;else pendingMedia--;
      lastMode=mode;checksSinceEnrichment=0;optional++;
    } else if(due || !headroom.allowEnrichment) {
      maximumGap=Math.max(maximumGap,now-successes[oldest]);
      successes[oldest]=now;discovery++;checksSinceEnrichment++;
    }
    assert.ok(successes.every(value=>now-value<=60*60_000),'No accessible account may age past an hour');
  }
  assert.ok(discovery>=1200);
  assert.equal(optional,108);assert.equal(pendingText,0);assert.equal(pendingMedia,0);
  assert.ok(maximumGap<=60*60_000);
});

test('Proactive discovery spreads 100 synchronized deadlines before the first hourly expiry', () => {
  const start=Date.parse('2026-10-10T01:00:00Z');
  const successes=Array.from({length:100},()=>start);
  let checks=0;
  for(let elapsed=0;elapsed<3*3600;elapsed+=32) {
    const now=start+elapsed*1000;
    const oldest=successes.indexOf(Math.min(...successes));
    const headroom=instagramDiscoveryHeadroom(successes.map(value=>new Date(value)),30,now);
    if(now-successes[oldest]>=55*60_000 || !headroom.allowEnrichment) {
      successes[oldest]=now;checks++;
    }
    assert.ok(successes.every(value=>now-value<=60*60_000),'Synchronized next_sync_at values cannot delay the tail beyond one hour');
  }
  assert.ok(checks>=200);
});
