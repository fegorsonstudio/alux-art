-- WhatsApp booking bot.
--
-- Migration 022 created whatsapp_sessions and the per-creator credential
-- columns, but no code was ever written against them. This adds the fields the
-- conversation actually needs to run a booking end to end in chat: which
-- package and currency the customer chose, the payment reference to reconcile
-- against, and enough bookkeeping to stop a stalled chat from sitting silently
-- forever.
--
-- Everything is additive. Nothing here alters an existing column.

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS package_size int;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_message_at timestamptz DEFAULT now();
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
-- The customer's own words, kept only for the current step, so a mistyped reply
-- can be answered with something better than "I didn't understand that".
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_inbound text;

-- The webhook arrives with a phone_number_id and nothing else to route on, so
-- this lookup happens on every single inbound message.
CREATE INDEX IF NOT EXISTS creators_whatsapp_phone_number_id_idx
  ON creators (whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_idx
  ON whatsapp_sessions (customer_phone);

-- Reconciling a paid shoot back to the chat that started it.
CREATE INDEX IF NOT EXISTS whatsapp_sessions_shoot_idx
  ON whatsapp_sessions (shoot_id) WHERE shoot_id IS NOT NULL;

-- Meta retries a webhook it considers failed, and a retry must never start a
-- second shoot or send a second DM. Recording every message id we have already
-- handled is the only reliable guard, since WhatsApp ids are stable per message.
CREATE TABLE IF NOT EXISTS whatsapp_handled_messages (
  message_id  text PRIMARY KEY,
  received_at timestamptz DEFAULT now()
);
