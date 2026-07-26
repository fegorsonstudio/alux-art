-- Buyer-selected lighting allocation (manual lighting toggle).
-- Lighting looks live in templates.option_groups as a group of type 'lighting'
-- whose options are kind 'prompt' (name + hidden recipe in description + thumbnail).
-- shoots.lighting_plan: resolved buyer selection snapshot
--   {version: 1, allocations: [{id, name, directive, count}]}
-- NULL = manual lighting off → the brief-builder describes lighting itself.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS lighting_plan JSONB;
