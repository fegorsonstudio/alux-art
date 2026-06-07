-- ============================================================
-- Migration 029: Story fields on shoots
-- ============================================================
-- Adds the user's role prompt and story asset references
-- (co-star, group photo, brand assets) to shoot records.

ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS role_prompt  TEXT,    -- user's custom role, max 100 chars, e.g. "I'm the official photographer"
  ADD COLUMN IF NOT EXISTS story_assets JSONB;   -- { costarRefs?, groupPhotoRef?, brandRefs? }
