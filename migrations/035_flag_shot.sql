-- Viral "flag shot" add-on for Call to Bar templates.
-- templates.flag_shot: creator config { enabled, imagePath, imageBucket } — the empty-flag
--   base plate (mast + black flag + skyline) is also a template_images row tagged FLAG_SCENE.
-- shoots.flag_shot: buyer selection { enabled, text } — the short text rendered on the flag.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS flag_shot JSONB;
ALTER TABLE shoots   ADD COLUMN IF NOT EXISTS flag_shot JSONB;
