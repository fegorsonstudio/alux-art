-- 031_flutterwave_support.sql
-- Dual-gateway support: Flutterwave alongside Paystack.
-- One-Time Regeneration system on shoots.
--
-- Run via migrate-vps.mjs (auto) or manually:
--   psql postgresql://aluxart:aluxart_db_2026@localhost:5432/aluxart \
--     -f migrations/031_flutterwave_support.sql

-- ── 1. Normalise package_size constraint name ────────────────────────────────
-- 011_package_size_check.sql already set the allowed values to (1, 5, 10).
-- Rename the constraint to the project-wide chk_ prefix convention.
ALTER TABLE shoots DROP CONSTRAINT IF EXISTS shoots_package_size_check;
ALTER TABLE shoots ADD CONSTRAINT chk_shoots_package_size
  CHECK (package_size IN (1, 5, 10));

-- ── 2. Regeneration status on shoots ────────────────────────────────────────
-- Tracks a single complimentary regeneration entitlement per paid shoot.
--   'none'      → shoot has no regeneration entitlement (default)
--   'eligible'  → regeneration may be triggered once
--   'completed' → entitlement has been consumed; no further regenerations
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS regeneration_status TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT chk_regeneration_status
      CHECK (regeneration_status IN ('none', 'eligible', 'completed'));

-- ── 3. Provider columns on template_purchases ───────────────────────────────
ALTER TABLE template_purchases
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS provider_reference TEXT;

-- Backfill: map the legacy paystack_reference into the generic column
UPDATE template_purchases
  SET provider_reference = paystack_reference
  WHERE paystack_reference IS NOT NULL
    AND provider_reference IS NULL;

-- ── 4. Provider columns on gift_links ───────────────────────────────────────
ALTER TABLE gift_links
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS provider_reference TEXT;

-- Backfill
UPDATE gift_links
  SET provider_reference = paystack_reference
  WHERE paystack_reference IS NOT NULL
    AND provider_reference IS NULL;

-- ── 5. Flutterwave subaccount ID on creators ────────────────────────────────
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS flutterwave_subaccount_id TEXT;

-- ── 6. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_template_purchases_provider_ref
  ON template_purchases (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_template_purchases_payment_provider
  ON template_purchases (payment_provider);

CREATE INDEX IF NOT EXISTS idx_gift_links_provider_ref
  ON gift_links (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_links_payment_provider
  ON gift_links (payment_provider);

-- Partial index: only rows that actually have an entitlement need fast lookup
CREATE INDEX IF NOT EXISTS idx_shoots_regeneration_eligible
  ON shoots (id)
  WHERE regeneration_status = 'eligible';
