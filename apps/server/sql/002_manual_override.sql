ALTER TABLE concerts ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;
