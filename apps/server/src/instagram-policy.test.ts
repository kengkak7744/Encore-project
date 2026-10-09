import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from './config.js';
import { instagramPacing, instagramMediaAllowed, instagramRetryMinutes } from './instagram-policy.js';

const usage = (totalTime: number) => ({ callCount: 10,totalTime,cpuTime: 0,regainMinutes: null });

test('Pacing speeds up gradually only with complete healthy usage and slows down before the guard', () => {
  const before = { ...config };
  Object.assign(config,{ instagramAdaptivePacingEnabled: true,instagramRequestSpacingSeconds: 60,instagramMinSpacingSeconds: 30,instagramUsagePausePercent: 75 });
  try {
    let pace = { seconds: 60,healthy: 0 };
    for (let i=0;i<2;i++) pace=instagramPacing(usage(20),pace.seconds,pace.healthy);
    assert.equal(pace.seconds,60);
    pace=instagramPacing(usage(20),pace.seconds,pace.healthy); assert.equal(pace.seconds,55);
    for (let i=0;i<60;i++) pace=instagramPacing(usage(20),pace.seconds,pace.healthy);
    assert.equal(pace.seconds,30);
    assert.equal(instagramPacing(usage(45),30,2).seconds,60);
    assert.equal(instagramPacing(usage(55),60,2).seconds,90);
    assert.equal(instagramPacing(usage(70),60,2).seconds,120);
    assert.equal(instagramPacing(null,30,2).seconds,60);
    assert.equal(instagramPacing({ ...usage(0),callCount: null },30,2).seconds,60);
    assert.equal(instagramPacing(usage(70),120,2).seconds,120,'High headers do not compound the spacing forever');
    assert.equal(instagramPacing(usage(10),120,2).seconds,105);
    config.instagramAdaptivePacingEnabled=false;
    assert.equal(instagramPacing(usage(10),30,2).seconds,60);
  } finally { Object.assign(config,before); }
});

test('Media requires fresh complete headers below the media ceiling', () => {
  const now=Date.now();
  assert.equal(instagramMediaAllowed(usage(10),new Date(now),now),true);
  assert.equal(instagramMediaAllowed(usage(40),new Date(now),now),false);
  assert.equal(instagramMediaAllowed(usage(10),new Date(now-16*60_000),now),false);
  assert.equal(instagramMediaAllowed(usage(10),new Date(now+1),now),false);
  assert.equal(instagramMediaAllowed({ ...usage(10),cpuTime: null },new Date(now),now),false);
});

test('Unavailable accounts get bounded exponential retry; transient/rate errors retry sooner', () => {
  const unavailable=new Error('Instagram Graph HTTP 400 (codes 110/2207013)');
  assert.equal(instagramRetryMinutes(unavailable,1),360);
  assert.equal(instagramRetryMinutes(unavailable,2),720);
  assert.equal(instagramRetryMinutes(unavailable,100),2880);
  assert.equal(instagramRetryMinutes(new Error('timeout'),1),30);
  assert.equal(instagramRetryMinutes(new Error('timeout'),100),240);
  assert.equal(instagramRetryMinutes(new Error('Instagram Graph HTTP 403 (codes 4)'),1),30);
});
