import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedInstagramAccounts } from './artist-instagram-accounts.js';
import { artistBiographies } from './artist-biographies.js';
import { biographyFor, curatedArtistProfiles } from './artist-profiles.js';

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
    const biography = biographyFor(profile);
    assert.ok(biography.length >= 3, `${profile.slug} needs at least three sourced biography sections`);
    for (const section of biography) {
      assert.ok(section.heading.trim());
      assert.ok(section.body.trim().length >= 80);
      assert.equal(new URL(section.sourceUrl).protocol, 'https:');
      assert.ok(section.sourceLabel.trim());
    }
    for (const account of profile.accounts || []) {
      const url = new URL(account.url);
      const hosts: Record<string, string[]> = { instagram: ['instagram.com'], facebook: ['facebook.com'], x: ['x.com', 'twitter.com'] };
      assert.equal(url.protocol, 'https:');
      if (hosts[account.platform]) assert.ok(hosts[account.platform].some((host) => url.hostname === host || url.hostname.endsWith('.' + host)));
      assert.equal(new URL(account.evidenceUrl).protocol, 'https:');
    }
  }
  const aheye = curatedArtistProfiles.find((profile) => profile.slug === 'aheye-4eve');
  assert.ok(aheye);
  assert.ok(biographyFor(aheye).length >= 4);
  assert.deepEqual(Object.keys(artistBiographies).sort(), slugs.filter((slug) => slug !== 'aheye-4eve').sort());
});

test('Each curated artist has a distinct Instagram profile with a reviewed source, including individual members', () => {
  const handles = new Set<string>();
  for (const profile of curatedArtistProfiles) {
    const accounts = (profile.accounts || []).filter(account => account.platform === 'instagram');
    assert.equal(accounts.length, 1, profile.slug);
    const handle = new URL(accounts[0].url).pathname.split('/')[1].toLowerCase();
    assert.match(handle, /^[a-z0-9._]+$/);
    assert.ok(!handles.has(handle), `${profile.slug} must not reuse another artist's Instagram`);
    handles.add(handle);
  }
  for (const slug of Object.keys(verifiedInstagramAccounts)) assert.ok(curatedArtistProfiles.some(profile => profile.slug === slug), slug);
});
