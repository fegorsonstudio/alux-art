-- Buyer opt-out: when true, the planner applies the hard no-smile rule for the
-- whole shoot (no smile slots, closed-lips expressions everywhere) even when
-- smiling identity references exist. Available in studio and template checkout.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS no_smile BOOLEAN NOT NULL DEFAULT false;
