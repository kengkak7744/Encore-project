CREATE TABLE IF NOT EXISTS trip_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  inputs jsonb NOT NULL,
  estimate jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,concert_id)
);
CREATE INDEX IF NOT EXISTS trip_budgets_user_updated_idx ON trip_budgets(user_id,updated_at DESC);
