-- Migration 049: Soul ID — a trained identity a buyer keeps and reuses.
--
-- Migration 001 built character_bases: one locked base IMAGE, cached by input
-- hash, quality-gated, approved. It is switched off (app_config
-- locked_base_enabled = 'false') and its vision passes run on Anthropic.
--
-- This is the same idea one step further on. Instead of a single base image that
-- every generation has to re-read, the buyer's likeness is trained into a FLUX
-- LoRA once and reused for free thereafter. character_bases is left exactly as
-- it is; nothing here touches it.

CREATE TABLE IF NOT EXISTS character_loras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What the buyer calls it in their library ("Me", "Judith").
  label TEXT NOT NULL DEFAULT '',

  -- The rare token every prompt must carry for the LoRA to contribute anything.
  -- Generated per Soul ID, never reused between people.
  trigger_phrase TEXT NOT NULL,

  -- The buyer's own uploads, kept so a Soul ID can be retrained without asking
  -- for the photographs again. [{ bucket, path }] — references carry their own
  -- bucket (see signRefs in lib/generate.ts), so a bare path would lose it.
  source_identity_refs JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- The generated reference sheets, as { sheetId: storagePath }.
  sheet_paths JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Written identity profile carried over from the shoot that produced it, so
  -- the sheets can be regenerated consistently.
  identity_profile TEXT NOT NULL DEFAULT '',

  training_image_count INT NOT NULL DEFAULT 0,

  -- fal's trained weights, plus the request id for support and re-polling.
  lora_url TEXT,
  training_request_id TEXT,

  status TEXT NOT NULL DEFAULT 'SHEETS_GENERATING' CHECK (status IN (
    'SHEETS_GENERATING',   -- the four reference sheets are rendering
    'SHEETS_REVIEW',       -- waiting for the buyer to confirm it looks like them
    'SHEETS_REJECTED',     -- buyer said no; terminal unless they re-roll
    'TRAINING',            -- approved, LoRA training running on fal
    'READY',               -- lora_url is populated and usable
    'FAILED'
  )),
  failure_reason TEXT,

  is_archived BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The library lookup: a buyer's usable Soul IDs, newest first.
CREATE INDEX IF NOT EXISTS idx_character_loras_ready
  ON character_loras(user_id, created_at DESC)
  WHERE status = 'READY' AND is_archived = FALSE;

-- The dashboard lookup: everything of theirs, including in-progress.
CREATE INDEX IF NOT EXISTS idx_character_loras_user
  ON character_loras(user_id, created_at DESC)
  WHERE is_archived = FALSE;

-- Which Soul ID a shoot generated with. Nullable: a boudoir shoot without one
-- still runs the existing Seedream path.
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS character_lora_id UUID REFERENCES character_loras(id) ON DELETE SET NULL;

-- The feature switch. Off until a real shoot has been through it, matching how
-- locked_base_enabled gates migration 001's work.
INSERT INTO app_config (key, value)
VALUES ('flux_boudoir_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
