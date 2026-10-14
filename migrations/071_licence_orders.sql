-- Fegorson Studio licence sales through the WhatsApp bot.
--
-- Fegorson Studio is the owner's offline Windows retouching app. After its trial
-- it locks until the buyer pastes a licence code: their name, the date and a
-- short random id, signed with the shop's Ed25519 key (/etc/fegorson-shop on the
-- server, never in this database). The app holds only the public key.
--
-- One row per attempt to buy. The chat fills in the name, the payment link sets
-- the reference, and only a verified payment fills in the code — once per
-- reference, enforced by "WHERE code IS NULL" in lib/fegorson-licence.ts. The code
-- is kept so a buyer who loses it can be sent the same one again; a refund cannot
-- switch a code off, so a second code is never made for one payment.
CREATE TABLE IF NOT EXISTS licence_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The buyer's WhatsApp number, digits only, and the connected number they wrote to.
  phone             text NOT NULL,
  creator_id        uuid,
  -- The name printed in the app ("Licensed to ..."). Null until they send it.
  buyer_name        text,
  state             text NOT NULL DEFAULT 'ASKING_NAME'
                    CHECK (state IN ('ASKING_NAME', 'CONFIRMING_NAME', 'AWAITING_PAYMENT',
                                     'PAID', 'CANCELLED', 'PAYMENT_MISMATCH')),
  price_ngn         integer NOT NULL,
  -- Paystack's reference and checkout link, set when the buyer confirms the name.
  reference         text UNIQUE,
  pay_url           text,
  -- What the payment actually was, from Paystack.
  paid_at           timestamptz,
  paid_amount_kobo  bigint,
  paid_currency     text,
  paid_via          text,          -- 'webhook' or 'verify' (buyer replied PAID)
  -- The licence code and its random id ("k").
  code              text UNIQUE,
  code_id           text,
  code_sent_at      timestamptz,
  send_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS licence_orders_phone_idx ON licence_orders (phone, created_at DESC);

-- One conversation in progress per number. Starting again cancels the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS licence_orders_one_open_per_phone ON licence_orders (phone)
  WHERE state IN ('ASKING_NAME', 'CONFIRMING_NAME', 'AWAITING_PAYMENT');
