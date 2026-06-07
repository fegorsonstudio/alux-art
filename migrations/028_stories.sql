-- ============================================================
-- Migration 028: Story Photoshoot template support
-- ============================================================
-- Adds story-specific columns to the templates table.
-- Story templates are sequential narratives where each image
-- slot represents a different scene in the story.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_story        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS story_type      TEXT,      -- 'solo' | 'duo' | 'group' | 'brand' | 'group_brand'
  ADD COLUMN IF NOT EXISTS default_role    TEXT,      -- e.g. "fan in the stands"
  ADD COLUMN IF NOT EXISTS role_chips      TEXT[],    -- creator-defined quick-select role suggestions
  ADD COLUMN IF NOT EXISTS requires_costar BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_group  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_brand  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scene_labels    TEXT[];    -- narrative label per scene slot, e.g. ["Arrival", "Kick off"]

-- Index for filtering only story templates in marketplace
CREATE INDEX IF NOT EXISTS idx_templates_story
  ON templates (is_story)
  WHERE status = 'published';
