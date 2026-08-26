-- The Instagram bot stops answering everything.
--
-- An unmatched DM used to get a sales pitch, every time, for ever. It now gets
-- silence and the studio gets a Telegram note instead — but a stranger sending
-- "hi / hello / are you there" must produce ONE note, not three.
--
-- This column is the throttle. It exists for the same reason
-- shoots.ig_stranded_alerted_at does: an earlier version of this bot sent 276
-- identical Telegram alerts about one customer, two minutes apart, until the
-- chat was muted — which also mutes the next real one.
ALTER TABLE instagram_sessions
  ADD COLUMN IF NOT EXISTS last_ignored_alert_at timestamptz;
