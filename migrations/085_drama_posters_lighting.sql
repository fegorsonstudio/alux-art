-- Alux Micro Drama: movie posters and recorded lighting (owner, 2026-10-21).
-- Every generated image keeps the lighting and colour grade it was made with.
-- Applied on the VPS with psql -f (never migrate-vps.mjs).
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS render_notes jsonb;
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS cover_meta jsonb;
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS cover_renders int NOT NULL DEFAULT 0;

-- Brands beyond a picture: their product link, their own comment word for the
-- episode, a link of ours that counts the taps, a private report page, and the
-- counts the report shows. slot_key 'next' = "a spot in the next episode" of a
-- story that is already running (the slot is chosen when the episode is made).
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS product_url text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS keyword text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS link_code text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS report_token text;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS asks int NOT NULL DEFAULT 0;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS taps int NOT NULL DEFAULT 0;
ALTER TABLE drama_placements ADD COLUMN IF NOT EXISTS placed_slot text;
CREATE UNIQUE INDEX IF NOT EXISTS drama_placements_link_code ON drama_placements (link_code) WHERE link_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS drama_placements_report_token ON drama_placements (report_token) WHERE report_token IS NOT NULL;
-- One brand word per episode of a story.
CREATE UNIQUE INDEX IF NOT EXISTS drama_placements_one_word ON drama_placements (story_id, episode_n, keyword)
  WHERE keyword IS NOT NULL AND status IN ('paid', 'approved', 'placed');
