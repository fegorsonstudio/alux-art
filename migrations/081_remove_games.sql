-- The Bounty Run race game and the AR balloon campaigns were removed
-- (owner, 2026-10-20: "delete everything about the game"). Drops their tables
-- (created by migrations 074–078, whose files went with the code) and their setting.
-- No CASCADE on purpose: if anything outside these tables still depended on
-- them, the drop stops instead of quietly removing it.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/081_remove_games.sql
BEGIN;
DROP TABLE IF EXISTS race_prizes, races, race_groups, road_tracks, road_tiles, ar_campaign_events, ar_campaigns;
DELETE FROM app_config WHERE key = 'ar_campaign_days';
COMMIT;
