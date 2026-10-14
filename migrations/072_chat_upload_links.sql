-- Full-quality upload links for the chat bots.
--
-- Instagram shrinks every photo sent in a DM (measured 14 Oct 2026: median
-- 0.1 MB, camera metadata stripped) and WhatsApp shrinks photos sent the normal
-- way. A link to a page on our own site lets the customer send the original
-- file into the same order. One row per chat conversation; the token is the
-- only authorisation, and it expires after 48 hours, the same window the
-- privacy page promises for deleting customer photos.
CREATE TABLE IF NOT EXISTS chat_upload_links (
  token       text PRIMARY KEY,
  channel     text NOT NULL CHECK (channel IN ('instagram', 'whatsapp')),
  session_id  uuid NOT NULL,
  -- Files received through this link; capped so a leaked link cannot be used
  -- to fill storage.
  uploads     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS chat_upload_links_session_idx ON chat_upload_links (channel, session_id, expires_at DESC);
