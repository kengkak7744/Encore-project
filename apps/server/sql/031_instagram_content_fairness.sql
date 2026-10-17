-- Persist bounded content/refresh fairness across worker restarts.
ALTER TABLE instagram_sync_budget ADD COLUMN content_jobs_since_refresh integer NOT NULL DEFAULT 0
  CHECK(content_jobs_since_refresh BETWEEN 0 AND 2);
