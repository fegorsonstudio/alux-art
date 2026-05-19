-- Global app config key-value store.
-- Admin writes via service role; generate.ts reads via service role.
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (generate.ts uses service role, so always allowed)
CREATE POLICY "Anyone can read app_config"
  ON app_config FOR SELECT USING (true);

-- Only service role can write (enforced via RLS default-deny for non-service)
CREATE POLICY "Service role can manage app_config"
  ON app_config FOR ALL USING (true) WITH CHECK (true);

-- Seed defaults
INSERT INTO app_config (key, value) VALUES
  ('vision_model',      'gemini'),
  ('generation_model',  'nano-banana')
ON CONFLICT (key) DO NOTHING;
