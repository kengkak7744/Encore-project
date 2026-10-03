import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { instagramFeedPosts, instagramMedia, newsUpsertSql } from './social-media.js';

test('Instagram images retain source URLs without any file payload', () => {
  assert.deepEqual(instagramMedia({ media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/photo.jpg' }), [{ type: 'image', url: 'https://scontent.cdninstagram.com/photo.jpg', thumbnailUrl: null }]);
});

test('Instagram video URL and thumbnail remain distinct, including unavailable video URLs', () => {
  const video = { media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/reel.mp4', thumbnail_url: 'https://scontent.cdninstagram.com/cover.jpg' };
  assert.equal(instagramMedia(video)[0].url, video.media_url);
  assert.equal(instagramMedia({ ...video, media_url: undefined })[0].url, null);
  assert.equal(instagramMedia({ ...video, media_url: undefined })[0].thumbnailUrl, video.thumbnail_url);
});

test('Instagram carousel preserves order and mixed media, with missing children handled honestly', () => {
  const children = [{ media_type: 'IMAGE', media_url: 'https://example.com/one.jpg' }, { media_type: 'VIDEO', thumbnail_url: 'https://example.com/cover.jpg' }];
  assert.deepEqual(instagramMedia({ media_type: 'CAROUSEL_ALBUM', children: { data: children } }).map(m => m.type), ['image', 'video']);
  assert.equal(instagramMedia({ media_type: 'CAROUSEL_ALBUM', media_url: 'https://example.com/cover.jpg' }).length, 1);
  assert.equal(instagramMedia({ media_type: 'CAROUSEL_ALBUM' }).length, 0);
});

test('Instagram media rejects unsafe URLs and caps carousel size', () => {
  assert.equal(instagramMedia({ media_type: 'IMAGE', media_url: 'javascript:alert(1)' }).length, 0);
  assert.equal(instagramMedia({ media_type: 'VIDEO', media_url: 'http://example.com/video.mp4' })[0].url, null);
  assert.equal(instagramMedia({ media_type: 'CAROUSEL_ALBUM', children: { data: Array(30).fill({ media_type: 'IMAGE', media_url: 'https://example.com/image.jpg' }) } }).length, 20);
});

test('Instagram discovery keeps public feed/reels but excludes stories, ads and unknown media', () => {
  assert.deepEqual(instagramFeedPosts([
    { id: 1, media_type: 'VIDEO', media_product_type: 'REELS' },
    { id: 2, media_type: 'IMAGE', media_product_type: 'FEED' },
    { id: 3, media_type: 'VIDEO', media_product_type: 'STORY' },
    { id: 4, media_type: 'VIDEO', media_product_type: 'AD' },
    { id: 5, media_type: 'VIDEO' }, null,
  ]).map(p => p.id), [1, 2, 5]);
});

test('News sync refreshes existing CDN URLs without duplicate posts and retains summaries until text changes', { skip: !process.env.INGEST_TEST_DATABASE_URL }, async () => {
  const client = new pg.Client({ connectionString: process.env.INGEST_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA instagram_media_fixture');
    await client.query('SET LOCAL search_path TO instagram_media_fixture, public');
    const dir = new URL('../sql/', import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
      await client.query(await readFile(new URL(file, dir), 'utf8'));
    }
    const artistId = (await client.query("INSERT INTO artists(slug,name,kind) VALUES('test','Test','band') RETURNING id")).rows[0].id;
    const sourceUrl = 'https://www.instagram.com/reel/TestVideo/';
    const media = [{ type: 'video', url: 'https://example.com/new.mp4', thumbnailUrl: 'https://example.com/new.jpg' }];
    await client.query(newsUpsertSql, [artistId, 'instagram', sourceUrl, 'post-1', 'same text', 'https://example.com/old.jpg', '2026-10-03T00:00:00Z', '[]']);
    await client.query("UPDATE news_items SET summary='checked summary',last_verified_at=now()-interval '2 hours'");
    await client.query(newsUpsertSql, [artistId, 'instagram', sourceUrl, 'post-1', 'same text', media[0].thumbnailUrl, '2026-10-03T00:00:00Z', JSON.stringify(media)]);
    let rows = (await client.query('SELECT * FROM news_items')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].summary, 'checked summary');
    assert.equal(rows[0].image_url, media[0].thumbnailUrl);
    assert.deepEqual(rows[0].media_items, media);
    await client.query(newsUpsertSql, [artistId, 'instagram', sourceUrl, 'post-1', 'changed text', null, '2026-10-03T00:00:00Z', JSON.stringify([{ ...media[0], url: null, thumbnailUrl: null }])]);
    rows = (await client.query('SELECT * FROM news_items')).rows;
    assert.equal(rows[0].summary, null);
    assert.equal(rows[0].media_items[0].url, null);
    assert.equal(rows[0].image_url, null);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
