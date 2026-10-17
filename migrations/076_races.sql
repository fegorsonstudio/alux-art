-- Bounty Run stage 2 (2026-10-17): a campaign is a bounty. Prize codes are
-- generated at fulfilment and handed out, first finisher first, by the server.
--
-- Apply on the VPS by hand:  psql "$DATABASE_URL" -f migrations/076_races.sql

ALTER TABLE ar_campaigns ADD COLUMN IF NOT EXISTS prize_label text NOT NULL DEFAULT '';
ALTER TABLE ar_campaigns ADD COLUMN IF NOT EXISTS max_races int NOT NULL DEFAULT 300;

CREATE TABLE IF NOT EXISTS race_prizes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ar_campaigns(id) ON DELETE CASCADE,
  code        text NOT NULL,
  label       text NOT NULL,
  claimed_at  timestamptz,
  race_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, code)
);
CREATE INDEX IF NOT EXISTS race_prizes_open_idx ON race_prizes (campaign_id) WHERE claimed_at IS NULL;

CREATE TABLE IF NOT EXISTS races (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES ar_campaigns(id) ON DELETE CASCADE,
  player       text NOT NULL DEFAULT '',
  drop_x       double precision NOT NULL,
  drop_z       double precision NOT NULL,
  route_m      double precision NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'finished', 'expired', 'refused')),
  elapsed_ms   int,
  prize_id     uuid REFERENCES race_prizes(id),
  ip_hash      text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS races_campaign_idx ON races (campaign_id, status, elapsed_ms);
