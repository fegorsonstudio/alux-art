-- Phase 2 pictures, real-photo character sheets and consistent voices (owner, 2026-10-25).
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/088_drama_pictures_voices.sql
BEGIN;

-- One location image per story (a three-quarter view of the main place, made once).
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS location_bucket text;
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS location_path text;
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS location_meta jsonb;

-- House character sheets: the story's own version of a role nobody plays yet,
-- made once from the role's `look` so pictures can be drawn before any fan joins.
CREATE TABLE IF NOT EXISTS drama_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  role_key      text NOT NULL,
  sheet_bucket  text NOT NULL,
  sheet_path    text NOT NULL,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, role_key)
);

-- Every AI picture made for a slide, for the accounting and the checks.
CREATE TABLE IF NOT EXISTS drama_picture_runs (
  id            bigserial PRIMARY KEY,
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_n     int NOT NULL,
  slide         int NOT NULL,
  attempt       int NOT NULL DEFAULT 1,
  model         text,
  prompt        text,
  bucket        text, path text,
  verdict       jsonb,                       -- the release check: scores and problems
  accepted      boolean NOT NULL DEFAULT false,
  usd           numeric(8, 4) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_picture_runs_day_idx ON drama_picture_runs (created_at);

-- Cast members: how their sheet is made, and their voice.
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS sheet_mode text NOT NULL DEFAULT 'ai' CHECK (sheet_mode IN ('real', 'ai'));
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_sample_bucket text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_sample_path text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_consent_bucket text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_consent_path text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_id text;          -- the replicated Gemini voice (voice_…)
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS voice_meta jsonb;

-- Marketplace templates can carry options for their worker (the "Character Sheet from your photos" product).
ALTER TABLE templates ADD COLUMN IF NOT EXISTS worker_options jsonb;

INSERT INTO app_config (key, value, updated_at) VALUES
  ('drama_pictures_daily_cap', '60', now())   -- AI pictures a day, all stories together (≈ $7 at 2K)
ON CONFLICT (key) DO NOTHING;

COMMIT;
