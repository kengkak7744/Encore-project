CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  kind text NOT NULL CHECK (kind IN ('band', 'solo', 'member')),
  bio text,
  image_url text,
  genres text[] NOT NULL DEFAULT '{}',
  popularity_rank integer,
  popularity_source_url text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artist_memberships (
  band_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (band_id, member_id),
  CHECK (band_id <> member_id)
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('x', 'facebook', 'instagram', 'website')),
  handle text,
  url text NOT NULL,
  external_id text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  UNIQUE (artist_id, platform, url)
);

CREATE TABLE IF NOT EXISTS concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  venue text,
  city text,
  country_code char(2) NOT NULL DEFAULT 'TH',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  starts_at timestamptz,
  ends_at timestamptz,
  sale_starts_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'postponed', 'cancelled', 'completed', 'unknown')),
  price_min numeric(12,2),
  price_max numeric(12,2),
  currency char(3) NOT NULL DEFAULT 'THB',
  image_url text,
  official_url text,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS concert_artists (
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (concert_id, artist_id)
);

CREATE TABLE IF NOT EXISTS concert_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  external_id text,
  source_url text NOT NULL UNIQUE,
  source_role text NOT NULL DEFAULT 'ticket' CHECK (source_role IN ('organizer', 'ticket', 'aggregator')),
  raw_data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

CREATE TABLE IF NOT EXISTS news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('x', 'facebook', 'instagram', 'website')),
  source_url text NOT NULL UNIQUE,
  external_id text,
  title text,
  body text,
  summary text,
  image_url text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follows (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, artist_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  attended_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concert_id)
);

CREATE TABLE IF NOT EXISTS source_state (
  source_name text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('concert', 'news', 'travel')),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_count integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id bigserial PRIMARY KEY,
  source_name text NOT NULL,
  category text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  items_seen integer NOT NULL DEFAULT 0,
  items_changed integer NOT NULL DEFAULT 0,
  error text
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL UNIQUE,
  embedding vector(1024),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concerts_starts_at_idx ON concerts(starts_at);
CREATE INDEX IF NOT EXISTS concerts_country_city_idx ON concerts(country_code, city);
CREATE INDEX IF NOT EXISTS concerts_price_idx ON concerts(price_min, price_max);
CREATE INDEX IF NOT EXISTS artists_name_idx ON artists USING gin (to_tsvector('simple', name || ' ' || coalesce(name_en, '')));
CREATE INDEX IF NOT EXISTS news_artist_published_idx ON news_items(artist_id, published_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON sync_runs(started_at DESC);
