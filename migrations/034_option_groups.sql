-- Buyer choice groups: creator uploads multiple options per styling category
-- (outfit, hairstyle, makeup, nails, shoes, accessory, color grade); the buyer
-- picks ONE per group for the whole shoot.
-- templates.option_groups:
--   [{id, type, label, options: [{id, name, kind:'photo'|'text', description?, imagePath?, imageBucket?}]}]
-- shoots.choice_selections:
--   {version: 1, selections: [{groupId, groupType, tag, label, ...chosen option snapshot}]}
ALTER TABLE templates ADD COLUMN IF NOT EXISTS option_groups JSONB;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS choice_selections JSONB;
