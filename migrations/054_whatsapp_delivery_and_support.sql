-- WhatsApp: delivery belongs to the shoot, and support requests are recorded.
--
-- A customer paid for two images and the bot never spoke again. The delivery
-- poller gated on whatsapp_sessions.delivered_at, but a session is long-lived
-- and outlives any one booking: her first delivery stamped that column, and her
-- second shoot — started with a trigger word, which does not clear it — became
-- permanently invisible to the poller.
--
-- Marking delivery on the SHOOT ends the whole class of bug. A new shoot row
-- starts NULL by definition, so every path that attaches a booking to an
-- existing session is correct without anybody remembering to reset a flag.

ALTER TABLE shoots ADD COLUMN IF NOT EXISTS wa_delivered_at timestamptz;

-- Only shoots that really were delivered. The created_at test is what protects
-- a shoot made AFTER its session's last delivery — precisely the row that was
-- stranded — from being wrongly marked as already sent.
UPDATE shoots
SET wa_delivered_at = s.delivered_at
FROM whatsapp_sessions s
WHERE s.shoot_id = shoots.id
  AND s.delivered_at IS NOT NULL
  AND shoots.created_at < s.delivered_at
  AND shoots.wa_delivered_at IS NULL;

-- The poller reads this on every pass.
CREATE INDEX IF NOT EXISTS idx_shoots_wa_undelivered
  ON shoots (wa_delivered_at)
  WHERE wa_delivered_at IS NULL;


-- Support requests raised from the chat.
--
-- A Telegram alert scrolls away; an open issue should not. Kept deliberately
-- thin: who asked, what their shoot was doing at that moment, and whether it
-- has been dealt with.
CREATE TABLE IF NOT EXISTS whatsapp_support_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text        NOT NULL,
  session_id     uuid        REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
  shoot_id       uuid        REFERENCES shoots(id) ON DELETE SET NULL,
  session_state  text,
  shoot_status   text,
  message        text,
  -- What the bot answered them with, so the studio can see whether the
  -- automatic reply already resolved it before reading further.
  bot_reply      text,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  resolved_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wa_support_open
  ON whatsapp_support_requests (created_at DESC)
  WHERE resolved_at IS NULL;
