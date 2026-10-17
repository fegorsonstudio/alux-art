-- Roads that players record themselves for Bounty Run (the hunt no longer uses
-- Google Street View). A road is a phone video of the real road plus the GPS
-- track logged while it was filmed; the server turns it into a playable mp4.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/078_road_tracks.sql

CREATE TABLE IF NOT EXISTS road_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ar_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 60),
  recorder text NOT NULL DEFAULT '' CHECK (char_length(recorder) <= 24),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'uploaded', 'processing', 'ready', 'failed', 'hidden')),
  mime text NOT NULL DEFAULT '',
  bytes bigint NOT NULL DEFAULT 0,
  parts int NOT NULL DEFAULT 0,
  duration_s real,
  length_m real,
  track jsonb,                 -- [[seconds from the start, lat, lng], ...] from the phone's GPS
  video_path text,             -- in the template-images bucket (never purged): roads/<id>/road.mp4
  poster_path text,            -- roads/<id>/poster.jpg
  width int,
  height int,
  error text,
  ip_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS road_tracks_campaign_idx ON road_tracks (campaign_id, status, created_at DESC);

ALTER TABLE races ADD COLUMN IF NOT EXISTS road_id uuid REFERENCES road_tracks(id) ON DELETE SET NULL;
ALTER TABLE race_groups ADD COLUMN IF NOT EXISTS road_id uuid REFERENCES road_tracks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS races_road_idx ON races (road_id, status, elapsed_ms);
