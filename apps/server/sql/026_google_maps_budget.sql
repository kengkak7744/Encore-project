-- Count attempts without persisting user searches, locations or Google content.
CREATE TABLE google_maps_budget (
  day date PRIMARY KEY,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  by_kind jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocked_until timestamptz
);
