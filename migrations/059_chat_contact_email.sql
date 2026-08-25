-- A way to reach a chat customer when their shoot goes wrong.
--
-- A WhatsApp or Instagram buyer gets a synthetic profile — wa-<phone>@... or
-- ig-<scoped id>@... — which is an identifier, not an address anyone reads. So
-- when a paid shoot fails there is no way to reach them outside the chat, and
-- the chat itself can close: Instagram's window shuts after 24 hours, and a
-- customer who has walked away is unreachable by either route.
--
-- This is deliberately NOT profiles.email. That column is the account identity
-- and is unique; overwriting it would break the login it belongs to. And it is
-- deliberately unverified: it is used to CONTACT someone, never to authorise
-- anything. Money credited on a failed shoot goes to the wallet attached to
-- their chat profile, which the email plays no part in choosing.
--
-- Joining a chat to a real website account is a separate, verified flow that
-- still goes through whatsapp_email_links and its six-digit code.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email text;

CREATE INDEX IF NOT EXISTS idx_profiles_contact_email
  ON profiles (lower(contact_email)) WHERE contact_email IS NOT NULL;
