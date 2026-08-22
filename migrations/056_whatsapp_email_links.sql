-- Joining a WhatsApp chat to a website account, with proof.
--
-- The wallet holds real money, so the address cannot simply be taken on trust:
-- anyone who knows a customer's email could otherwise type it into their own
-- chat and spend that customer's balance. A code is emailed to the address and
-- has to come back through the chat before anything is joined.
--
-- Phone is the primary key: one pending request per number, and asking again
-- replaces the old code rather than leaving several live at once.

CREATE TABLE IF NOT EXISTS whatsapp_email_links (
  phone       text PRIMARY KEY,
  email       text NOT NULL,
  code        text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_email_links_expiry
  ON whatsapp_email_links (expires_at);
