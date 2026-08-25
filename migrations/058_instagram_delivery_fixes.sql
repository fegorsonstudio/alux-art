-- Three fixes found by running the Instagram bot against real traffic.

-- 1. The stranded alert fired on EVERY poll.
--
-- When Instagram's 24-hour window closes on a paid, finished shoot there is
-- nothing the poller can do, so it alerted and moved on — and then did the same
-- thing two minutes later, forever. 276 identical Telegram messages for one
-- customer. An alert that repeats until someone mutes it is worse than no
-- alert, because the next real one is muted too.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS ig_stranded_alerted_at timestamptz;

-- 2. A short, login-free download link for the full-size file.
--
-- Instagram caps an image attachment at 8MB, so a 4K relight can only reach a
-- DM as a compressed JPEG. The real file needs a link — and a link the customer
-- can actually use: an Instagram buyer's account is synthetic
-- (ig-<scoped id>@instagram...) and has no password, so "log in and find it in
-- your studio" is not a route they can take.
--
-- A token per image rather than a presigned R2 url: presigned urls run to 500+
-- characters against Instagram's 1000-byte message cap, expire at 7 days, and
-- leak the bucket layout into a chat message.
ALTER TABLE shoot_images ADD COLUMN IF NOT EXISTS download_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shoot_images_download_token
  ON shoot_images (download_token) WHERE download_token IS NOT NULL;

-- 3. Our own accounts, so the bot cannot talk to itself.
--
-- @aluxartandframes messaged @fegorson_studio, each bot answered the other, and
-- the only way to stop it was for one account to block the other. The DM
-- webhook carries a scoped sender id and no username, so there was nothing to
-- compare against — the comment path's handle check does not help here.
--
-- Resolved usernames are cached so the lookup happens once per person, and ours
-- are marked with a state the handler refuses to answer.
CREATE INDEX IF NOT EXISTS idx_ig_sessions_username
  ON instagram_sessions (ig_username) WHERE ig_username IS NOT NULL;
