-- Bounty Run stage 3 (2026-10-17): racing others. A group is one shared start
-- (same drop point, same start time) that several hunts belong to; a hunt
-- keeps its path so the fastest run can be replayed as a ghost.
--
-- Apply on the VPS by hand:  psql "$DATABASE_URL" -f migrations/077_race_groups.sql

CREATE TABLE IF NOT EXISTS race_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ar_campaigns(id) ON DELETE CASCADE,
  drop_x      double precision NOT NULL,
  drop_z      double precision NOT NULL,
  route_m     double precision NOT NULL,
  starts_at   timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS race_groups_campaign_idx ON race_groups (campaign_id, created_at DESC);

ALTER TABLE races ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES race_groups(id);
ALTER TABLE races ADD COLUMN IF NOT EXISTS path jsonb;
CREATE INDEX IF NOT EXISTS races_group_idx ON races (group_id) WHERE group_id IS NOT NULL;
