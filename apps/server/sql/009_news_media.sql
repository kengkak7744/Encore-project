ALTER TABLE news_items ADD COLUMN media_items jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(media_items) = 'array' AND jsonb_array_length(media_items) <= 20);
-- Existing image_url values may contain video thumbnails. Their types are refreshed
-- from Instagram on the next successful sync, rather than guessed in this migration.
