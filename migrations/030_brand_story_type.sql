-- Expand story_type CHECK constraint to include brand story types
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_story_type_check;
ALTER TABLE templates ADD CONSTRAINT templates_story_type_check
  CHECK (story_type IN ('solo', 'duo', 'group', 'brand', 'group_brand'));
