CREATE TABLE IF NOT EXISTS platform_sessions (
  platform TEXT PRIMARY KEY,
  storage_state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_sessions_updated ON platform_sessions(updated_at);
