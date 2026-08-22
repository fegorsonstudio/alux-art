-- A naira wallet, an opt-out register, and a way to join a chat to an account.
--
-- Why naira and not image credits: prices are not uniform. A relight image is
-- ₦1,000 and a portrait image is ₦3,500, so a credit counted in images would let
-- somebody buy at the cheap rate and spend at the dear one. free_grants stays
-- exactly as it is for admin comps, where "N free images" is the right unit.

-- ── The ledger ──────────────────────────────────────────────────────────────
--
-- Append-only, never a mutable balance column. This holds customer money, so
-- every movement has to be readable back: what came in, what was spent, on which
-- shoot, against which Paystack reference.
CREATE TABLE IF NOT EXISTS wallet_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta_ngn  integer     NOT NULL,   -- positive credit, negative spend
  reason     text        NOT NULL,   -- topup | shortfall | spend | refund | admin
  shoot_id   uuid        REFERENCES shoots(id) ON DELETE SET NULL,
  reference  text,                   -- Paystack reference, for a top-up
  note       text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- A replayed Paystack webhook must never credit the same money twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_reference
  ON wallet_entries (reference) WHERE reference IS NOT NULL;

-- One shoot can only ever refund once, however many times generation re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_one_shortfall_per_shoot
  ON wallet_entries (shoot_id) WHERE reason = 'shortfall';

-- Balance is SUM(delta_ngn) per user, so that read must be cheap.
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_entries (user_id, created_at DESC);


-- ── Opt-outs ────────────────────────────────────────────────────────────────
--
-- Required by Meta since 15 January 2026: a business must honour STOP. Keyed by
-- phone rather than by user, because somebody can opt out before they have ever
-- booked anything and therefore before an account exists.
CREATE TABLE IF NOT EXISTS whatsapp_optouts (
  phone      text PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT NOW(),
  source     text,                   -- the word they actually sent
  note       text
);


-- ── Joining a chat to a website account ─────────────────────────────────────
--
-- A WhatsApp buyer is created as wa-<phone>@whatsapp.aluxartandframes.shop. If
-- they later book on the website with a real address that is a second account
-- and a second balance. Recording the phone lets the two be resolved to one
-- wallet once the buyer tells the bot their email.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone) WHERE phone IS NOT NULL;


-- ── Giving back a regeneration that could not have worked ───────────────────
--
-- A content refusal retried with the same prompt fails identically, so the buyer
-- spends their one free attempt for nothing. It can be handed back — but only
-- once, or a prompt that keeps failing would hand out unlimited retries and each
-- one costs a real generation.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS regeneration_restored_at timestamptz;
