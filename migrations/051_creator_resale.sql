-- Creator resale of the studio's lighting product.
--
-- A creator imports The Gear Equalizer into their own store, sells it under
-- their own link at their own price, and keeps the margin. Three facts the
-- templates table could not express before:
--
--   source_template_id       -- this template's looks LIVE on another template.
--                               Resolved at read time, so every look added to
--                               the source reaches every importer immediately
--                               and 195 looks are stored once, not per creator.
--
--   platform_fee_override_ngn -- what the platform takes on THIS template.
--                               The fee has always been global
--                               (app_config.platform_fee_ngn) scaled by package
--                               size. Resale needs it per-template: ₦800 to the
--                               studio on a ₦1,000 sale, ₦200 to the creator.
--
--   marketplace_hidden       -- keep it OUT of the marketplace listing while it
--                               still shows on the creator's own storefront.
--                               is_private hides it from BOTH, which is not the
--                               same thing: an imported template is meant to be
--                               the creator's shop window, just not ours.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS source_template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS platform_fee_override_ngn INTEGER,
  ADD COLUMN IF NOT EXISTS marketplace_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- The override is per-IMAGE money, so guard it the same way prices are guarded.
ALTER TABLE templates
  DROP CONSTRAINT IF EXISTS templates_platform_fee_override_positive;
ALTER TABLE templates
  ADD CONSTRAINT templates_platform_fee_override_positive
  CHECK (platform_fee_override_ngn IS NULL OR platform_fee_override_ngn >= 0);

-- Resolving a source is on the read path of every booking, so index it.
CREATE INDEX IF NOT EXISTS templates_source_template_id_idx
  ON templates(source_template_id) WHERE source_template_id IS NOT NULL;

-- One import per creator per source. Without this a creator who taps Import
-- twice ends up with two competing links and split earnings.
CREATE UNIQUE INDEX IF NOT EXISTS templates_one_import_per_creator_idx
  ON templates(creator_id, source_template_id) WHERE source_template_id IS NOT NULL;
