-- AR balloon campaigns (2026-10-17). One row per paid `ar_experience` shoot: a
-- business's branded hot-air balloons shown over the phone camera, only inside a
-- circle on the map. `status` is only the admin switch; live / scheduled / ended
-- are derived from starts_at / ends_at in lib/ar/campaign.ts.
--
-- Apply on the VPS by hand:  psql "$DATABASE_URL" -f migrations/074_ar_campaigns.sql

CREATE TABLE IF NOT EXISTS ar_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id        uuid NOT NULL UNIQUE REFERENCES shoots(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  token           text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  preview_token   text NOT NULL UNIQUE CHECK (preview_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  brand_name      text NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 40),
  tagline         text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 60),
  logo_bucket     text NOT NULL DEFAULT 'template-images',
  logo_path       text NOT NULL,
  color_primary   text NOT NULL CHECK (color_primary ~ '^#[0-9a-f]{6}$'),
  color_secondary text NOT NULL CHECK (color_secondary ~ '^#[0-9a-f]{6}$'),
  lat             double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng             double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m        int NOT NULL CHECK (radius_m BETWEEN 100 AND 1000),
  balloon_count   int NOT NULL DEFAULT 6 CHECK (balloon_count BETWEEN 3 AND 8),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL CHECK (ends_at > starts_at),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ar_campaigns_user_idx ON ar_campaigns (user_id, created_at DESC);

-- What the viewer page reports: open, permission_denied, outside, activated, photo.
-- No coordinates, no addresses, no user agents: a type, a coarse distance bucket
-- and the platform (ios / android / other).
CREATE TABLE IF NOT EXISTS ar_campaign_events (
  id              bigserial PRIMARY KEY,
  campaign_id     uuid NOT NULL REFERENCES ar_campaigns(id) ON DELETE CASCADE,
  type            text NOT NULL,
  detail          text,
  distance_bucket text,
  platform        text,
  is_preview      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ar_campaign_events_campaign_idx ON ar_campaign_events (campaign_id, created_at);

-- How long one purchase runs. Change with: UPDATE app_config SET value = '45' WHERE key = 'ar_campaign_days';
INSERT INTO app_config (key, value, updated_at) VALUES ('ar_campaign_days', '30', now())
ON CONFLICT (key) DO NOTHING;
