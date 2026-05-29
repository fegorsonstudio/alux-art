CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'js_error',
  message      TEXT NOT NULL,
  source       TEXT,
  line_number  INTEGER,
  page_path    TEXT,
  http_status  INTEGER,
  user_agent   TEXT,
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS error_logs_created_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs (resolved);
