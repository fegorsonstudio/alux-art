-- Gear Equalizer (photo_upgrade category) buyer selection:
-- { "lighting": "rembrandt", "camera": "medium_format", "backdropOptionId": null }
-- backdropOptionId null = keep the photo's own background (relight only).
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS enhance JSONB;
