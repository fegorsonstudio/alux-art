-- Creators can set separate prices for 1/5/10-image packages.
-- price_ngn remains the required 10-image price (existing column, no rename).
ALTER TABLE templates ADD COLUMN IF NOT EXISTS price_1_ngn INTEGER;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS price_5_ngn INTEGER;

-- Seed configurable platform fee into app_config key-value store.
INSERT INTO app_config (key, value, updated_at)
VALUES ('platform_fee_ngn', '15000', NOW())
ON CONFLICT (key) DO NOTHING;
