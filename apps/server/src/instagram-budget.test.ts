import assert from 'node:assert/strict';
import test from 'node:test';
import { instagramUsage, instagramCooldown } from './instagram-budget.js';

test('Instagram usage reads numeric maxima without retaining business IDs or arbitrary headers', () => {
  const headers = new Headers({ 'x-app-usage': '{"call_count":9,"total_time":80,"total_cputime":2}',
    'x-business-use-case-usage': '{"private-business-id":[{"call_count":20,"total_time":70,"total_cputime":5,"estimated_time_to_regain_access":95,"secret":"do not save"}]}' });
  assert.deepEqual(instagramUsage(headers), { callCount: 20,totalTime: 80,cpuTime: 5,regainMinutes: 95 });
  assert.equal(instagramCooldown(headers,false).minutes,95);
  assert.equal(instagramUsage(new Headers({ 'x-app-usage': 'bad json' })),null);
  assert.equal(instagramUsage(new Headers({ 'x-app-usage': '{"call_count":"99","total_time":-1}' })),null);
});

test('Instagram cooldown respects processing usage, Retry-After and repeated rate limits', () => {
  assert.equal(instagramCooldown(new Headers({ 'x-app-usage': '{"total_time":76}' }),false).minutes,30);
  assert.equal(instagramCooldown(new Headers({ 'x-app-usage': '{"total_cputime":95}' }),false).minutes,60);
  assert.equal(instagramCooldown(new Headers(),true,0).minutes,60);
  assert.equal(instagramCooldown(new Headers(),true,1).minutes,120);
  assert.equal(instagramCooldown(new Headers({ 'retry-after': '10800' }),true,0).minutes,180);
  assert.equal(instagramCooldown(new Headers(),false).minutes,0);
});
