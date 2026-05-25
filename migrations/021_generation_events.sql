-- generation_events: per-shoot progress log used by the studio real-time UI
-- This table existed only in Supabase and was never migrated to the VPS postgres.

CREATE TABLE IF NOT EXISTS generation_events (
  id          UUID        PRIMARY KEY,
  shoot_id    UUID        NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  type        TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_events_shoot_id ON generation_events(shoot_id);
CREATE INDEX IF NOT EXISTS idx_generation_events_user_id_type ON generation_events(user_id, type);
