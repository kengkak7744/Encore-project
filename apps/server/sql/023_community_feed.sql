CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 3000),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community_post_artists (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id,artist_id)
);
CREATE TABLE community_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES community_posts(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  data bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400 AND byte_size = octet_length(data)),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community_likes (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id,user_id)
);
CREATE TABLE community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE concert_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concert_id,user_id),
  FOREIGN KEY (user_id,concert_id) REFERENCES attendance(user_id,concert_id) ON DELETE CASCADE
);
CREATE INDEX community_posts_created_idx ON community_posts(created_at DESC,id DESC) WHERE NOT hidden;
CREATE INDEX community_post_artists_artist_idx ON community_post_artists(artist_id,post_id);
CREATE INDEX community_uploads_post_idx ON community_uploads(post_id,position);
CREATE INDEX community_uploads_user_created_idx ON community_uploads(user_id,created_at);
CREATE INDEX community_comments_post_idx ON community_comments(post_id,created_at,id) WHERE NOT hidden;
CREATE INDEX concert_reviews_concert_idx ON concert_reviews(concert_id,created_at DESC,id) WHERE NOT hidden;
