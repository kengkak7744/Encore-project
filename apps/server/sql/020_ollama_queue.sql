CREATE TABLE IF NOT EXISTS ollama_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  model text NOT NULL,
  priority integer NOT NULL CHECK (priority IN (0,100)),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled','interrupted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  preemptions integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ollama_requests_queue_idx ON ollama_requests(resource,status,priority DESC,created_at,id);
CREATE TABLE IF NOT EXISTS ollama_gpu_state (
  resource text PRIMARY KEY,
  last_interactive_at timestamptz
);
