-- Buyer-selected background allocation (call_to_bar templates).
-- templates.background_options: creator-defined option list
--   [{id, name, kind: 'photo'|'text', description?, imagePath?, imageBucket?}]
-- shoots.background_plan: resolved buyer allocation snapshot
--   {version: 1, allocations: [{...option fields, count}]}
ALTER TABLE templates ADD COLUMN IF NOT EXISTS background_options JSONB;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS background_plan JSONB;
