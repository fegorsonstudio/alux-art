-- Track Instagram shoots on the SHOOT, not on the conversation.
--
-- The delivery poller found work by joining instagram_sessions.shoot_id, which
-- holds one shoot at a time. So a customer who sent a second photo while the
-- first was still generating silently orphaned the first: the column was
-- overwritten, the poller could no longer see it, and a paid shoot would never
-- have been delivered.
--
-- This is the same lesson as shoots.wa_delivered_at. A conversation outlives any
-- one booking, so anything that belongs to a booking has to live on the booking.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS ig_user_id    text;
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS ig_account_id text;

-- "Payment received, making it now" is announced once per SHOOT for the same
-- reason. Held on the shoot rather than inferred from session state, which can
-- only describe one booking at a time.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS ig_started_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shoots_ig_pending
  ON shoots (ig_user_id) WHERE ig_user_id IS NOT NULL AND ig_delivered_at IS NULL;

-- Backfill the one shoot that already exists, so it is not stranded by the
-- change that was meant to protect it.
UPDATE shoots sh
SET ig_user_id = s.ig_user_id, ig_account_id = s.ig_account_id
FROM instagram_sessions s
WHERE s.shoot_id = sh.id AND sh.ig_user_id IS NULL;
