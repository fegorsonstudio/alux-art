-- Sponsors hand us the real thing (owner, 2026-10-25): their music for a car scene, photos
-- of their restaurant for a scene set there, a flyer for a phone screen — not only a product
-- picture. Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/090_drama_placement_kinds.sql
BEGIN;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product'
  CHECK (kind IN ('product', 'location', 'music', 'flyer'));
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS assets jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{ bucket, path, type, name }]
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS brief text;                                 -- how they'd like it used
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS music_title text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS music_artist text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS place_name text;                            -- the restaurant, the shop, the hotel
COMMIT;
