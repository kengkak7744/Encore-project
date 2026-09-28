import assert from 'node:assert/strict';
import test from 'node:test';
import { curatedArtistProfiles } from './artist-profiles.js';

test('curated artist profiles have unique identities and traceable HTTPS evidence', () => {
  const slugs = curatedArtistProfiles.map((profile) => profile.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.filter((slug) => !slug.endsWith('-4eve')).length >= 30);
  assert.equal(slugs.filter((slug) => slug.endsWith('-4eve')).length, 7);
  for (const profile of curatedArtistProfiles) {
    assert.match(profile.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(profile.bio.length >= 20 && profile.bio.length <= 240);
    assert.equal(new URL(profile.sourceUrl).protocol, 'https:');
    assert.ok(profile.sourceLabel.trim());
    for (const account of profile.accounts || []) {
      const url = new URL(account.url);
      const hosts: Record<string, string[]> = { instagram: ['instagram.com'], facebook: ['facebook.com'], x: ['x.com', 'twitter.com'] };
      assert.equal(url.protocol, 'https:');
      if (hosts[account.platform]) assert.ok(hosts[account.platform].some((host) => url.hostname === host || url.hostname.endsWith('.' + host)));
      assert.equal(new URL(account.evidenceUrl).protocol, 'https:');
    }
  }
});
