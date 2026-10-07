ALTER TABLE social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_platform_check
  CHECK (platform IN ('x','facebook','instagram','website','youtube','tiktok'));
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS catalog_manual_override boolean NOT NULL DEFAULT false;
