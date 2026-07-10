-- "Trending" category custom slots (Shift-for-me template).
-- templates.trend_slots: creator config
--   { mugshot: {enabled, imagePath, imageBucket}, bowl: {enabled, imagePath, imageBucket} }
--   Plates: clean forensics board + height chart (MUGSHOT_BOARD), clean enamel bowl (BOWL_PROP).
-- shoots.trend_slots: buyer selection
--   { mugshot: {enabled, name, offense, date}, bowl: {enabled, mode: "product"|"logo"} }
--   The bowl upload rides shoot_references as tag BOWL_CONTENT.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS trend_slots JSONB;
ALTER TABLE shoots   ADD COLUMN IF NOT EXISTS trend_slots JSONB;
