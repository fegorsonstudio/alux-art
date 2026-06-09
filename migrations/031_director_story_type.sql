-- Add director_prompt column and expand story_type CHECK for Gemini Director story type
ALTER TABLE templates ADD COLUMN IF NOT EXISTS director_prompt TEXT;

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_story_type_check;
ALTER TABLE templates ADD CONSTRAINT templates_story_type_check
  CHECK (story_type IN ('solo', 'duo', 'group', 'brand', 'group_brand', 'director'));
