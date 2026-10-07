CREATE TABLE worker_task_state (
  name text PRIMARY KEY,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text
);
INSERT INTO worker_task_state(name) VALUES('ai');

CREATE TABLE worker_heartbeat (
  id integer PRIMARY KEY CHECK(id=1),
  booted_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE concert_monitor_windows ADD COLUMN reason text;
