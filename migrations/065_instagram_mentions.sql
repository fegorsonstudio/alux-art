-- Being @mentioned on somebody else's post.
--
-- The comments webhook only covers our own media. `mentions` is the separate
-- field that fires when someone names us in a comment or a caption on a post we
-- do not own — which is where our GIFs actually end up, because people drop
-- them under other accounts' posts.
--
-- We cannot DM those people. Instagram's private replies are scoped to comments
-- on our OWN media, so the only channel is a public reply on the comment
-- itself, which is why the reply has to carry the instruction rather than a
-- link.
--
-- This table exists for one reason: to never reply twice. A webhook can be
-- redelivered, and a bot that answers the same comment three times under a
-- stranger's post is spam that reflects on the account.
CREATE TABLE IF NOT EXISTS instagram_mentions (
  -- The comment we were named in. For a caption mention there is no comment, so
  -- the media id stands in — hence text rather than a strict id, and hence a
  -- primary key that covers both cases.
  ref             text PRIMARY KEY,
  ig_account_id   text NOT NULL,
  media_id        text,
  comment_id      text,
  from_username   text,
  text            text,
  -- What we said back, and when. Null reply_text means we saw it and chose not
  -- to answer — kept as a row so it is not reconsidered on a redelivery.
  reply_text      text,
  replied_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_mentions_created ON instagram_mentions (created_at DESC);
