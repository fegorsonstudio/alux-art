-- Free access: two ways a shoot can run without a payment.
--
-- 1. free_grants  — an admin comps an email address N images ("I promised you a
--    free 5-image session"). Keyed by EMAIL, not user id, so the grant can be
--    issued before that person has ever signed up. Consumed by package size, so
--    a 10-image grant can become one 10 or two 5s.
--
-- 2. sponsored templates — a brand pays for a template so anyone can book it
--    free. Bounded by a per-person limit (one shoot each, enforced by the
--    partial unique index below) AND a hard total booking cap, so a campaign can
--    never run up an unbounded generation bill.
--
-- free_bookings is the ledger for both, and records what the platform owes the
-- template's creator: free bookings skip the gateway, so no Paystack split ever
-- happens and Alux Art settles the creator's share by hand.

CREATE TABLE IF NOT EXISTS free_grants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,                       -- stored lowercased
  images_granted INTEGER NOT NULL CHECK (images_granted > 0),
  images_used    INTEGER NOT NULL DEFAULT 0 CHECK (images_used >= 0),
  note           TEXT,
  granted_by     TEXT,                                -- admin email, for audit
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT free_grants_not_overdrawn CHECK (images_used <= images_granted)
);

CREATE INDEX IF NOT EXISTS free_grants_email_idx ON free_grants (lower(email));

CREATE TABLE IF NOT EXISTS free_bookings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id           UUID REFERENCES shoots(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  email              TEXT,
  template_id        UUID REFERENCES templates(id) ON DELETE SET NULL,
  package_size       INTEGER NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('admin', 'grant', 'sponsored')),
  grant_id           UUID REFERENCES free_grants(id) ON DELETE SET NULL,
  creator_payout_ngn INTEGER NOT NULL DEFAULT 0,      -- what Alux Art owes the creator
  payout_settled     BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS free_bookings_shoot_idx ON free_bookings (shoot_id);
CREATE INDEX IF NOT EXISTS free_bookings_unsettled_idx
  ON free_bookings (payout_settled) WHERE payout_settled = false;

-- One sponsored freebie per person per template, enforced by the database rather
-- than a read-then-write check that could race.
CREATE UNIQUE INDEX IF NOT EXISTS free_bookings_sponsored_once
  ON free_bookings (template_id, user_id) WHERE source = 'sponsored';

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_sponsored         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsor_name         TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_package_size INTEGER,     -- 1 | 5 | 10 — what is free
  ADD COLUMN IF NOT EXISTS sponsor_total_limit  INTEGER,     -- hard cap on free bookings
  ADD COLUMN IF NOT EXISTS sponsor_used_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsor_expires_at   TIMESTAMPTZ;

-- Marks the zero-amount purchase row written for a free marketplace booking, so
-- the creator's earnings stay correct while revenue/sales counts can exclude it.
ALTER TABLE template_purchases
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
