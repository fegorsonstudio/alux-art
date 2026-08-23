-- The Instagram booking bot.
--
-- Mirrors the WhatsApp bot's shape rather than sharing its tables. The two
-- transports address people differently — WhatsApp by phone number, Instagram
-- by a per-app scoped user id (IGSID) that is not a phone, not an email, and
-- not stable across apps — so folding both into whatsapp_sessions would mean a
-- customer_phone column holding something that is not a phone.
--
-- The WhatsApp bot is live and taking real money. Nothing here touches it.

CREATE TABLE IF NOT EXISTS instagram_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Our account (e.g. @fegorson_studio). Stored per row because the same code
  -- serves several connected accounts and the reply must go out from the one
  -- that was messaged.
  ig_account_id     text NOT NULL,
  -- The customer, as Instagram identifies them to THIS app.
  ig_user_id        text NOT NULL,
  ig_username       text,

  state             text NOT NULL DEFAULT 'IDLE',
  template_id       uuid REFERENCES templates(id) ON DELETE SET NULL,
  -- The chosen look, snapshotted by id and name. The prompt itself is never
  -- stored here: it is read from the template at booking time so a look edited
  -- in the workbench cannot leave a stale recipe behind in a session.
  look_option_id    text,
  look_name         text,

  shoot_id          uuid REFERENCES shoots(id) ON DELETE SET NULL,
  -- Source photos the customer sent, as R2 paths under their resolved user id.
  source_paths      text[] NOT NULL DEFAULT '{}',
  user_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  payment_reference text,

  last_inbound      text,
  -- When the customer last messaged US. Instagram only allows a reply within 24
  -- hours of this, so it is not decoration: the poller has to check it before
  -- trying to deliver, or the send fails and the customer hears nothing.
  last_inbound_at   timestamptz NOT NULL DEFAULT NOW(),
  last_message_at   timestamptz NOT NULL DEFAULT NOW(),
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE (ig_account_id, ig_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_sessions_shoot ON instagram_sessions (shoot_id)
  WHERE shoot_id IS NOT NULL;

-- Delivery is gated on the SHOOT, never on the session.
--
-- This is the bug that made a paying WhatsApp customer's second shoot
-- permanently invisible: a session outlives any one booking, so a delivered
-- flag on the session marks the customer as served forever. A new shoot row
-- starts NULL, which makes every path that attaches a booking to an existing
-- chat correct by construction. Do not add a session-level delivery flag here.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS ig_delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shoots_ig_undelivered
  ON shoots (ig_delivered_at) WHERE ig_delivered_at IS NULL;
