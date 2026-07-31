-- The platform-fee floor exists so an outside creator cannot price a template
-- below what a shoot costs us to run. It should never have applied to Alux Art's
-- own templates: the upgrade, relight and asset-extraction products are
-- deliberately cheap and their margin is the studio's decision.
--
-- The create and update routes already exempt admins, but a SECOND floor sits in
-- the booking route and rejected the purchase itself — so an admin could save a
-- low price and buyers still could not book it. That check needs to know whether
-- the TEMPLATE's author is an admin, which it cannot ask: the buyer's identity is
-- what it has, and auth.users is not reachable over the app's direct connection.
--
-- So the answer is recorded on the template when it is written.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS platform_fee_exempt BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: every template already authored by an admin creator.
UPDATE templates t
SET platform_fee_exempt = TRUE
FROM creators c
WHERE c.id = t.creator_id
  AND c.user_id = 'd80f9e08-014e-48b7-8545-b37652059605';
