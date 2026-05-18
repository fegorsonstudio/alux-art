-- Migration 002: Global forbidden words table
-- Words that trigger fal.ai content moderation, shared across all users.
-- Any user's Forbidden rejection contributes here; all briefs draw from it.

CREATE TABLE IF NOT EXISTS forbidden_words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word        TEXT NOT NULL UNIQUE,
  replacement TEXT NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE forbidden_words ENABLE ROW LEVEL SECURITY;

-- World-readable so any user session can fetch the list for sanitization
CREATE POLICY "Anyone can read forbidden words"
  ON forbidden_words FOR SELECT USING (true);

-- Service role writes (inserts/updates from generation worker)
CREATE POLICY "Service role can manage forbidden words"
  ON forbidden_words FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_forbidden_words_word ON forbidden_words(word);

-- Seed from the static FAL_REPLACE list in lib/generate.ts
INSERT INTO forbidden_words (word, replacement) VALUES
  ('alluring',   'intense'),
  ('seductive',  'confident'),
  ('sensual',    'graceful'),
  ('sultry',     'captivating'),
  ('teasing',    'playful'),
  ('revealing',  'showing'),
  ('exposed',    'visible')
ON CONFLICT (word) DO NOTHING;
