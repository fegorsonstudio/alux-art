-- Carousels built on the laptop, published by the server.
--
-- The studio app renders slides locally and hands them here, so a post goes out
-- on time whether or not that laptop is awake. Slides live in R2 because
-- Instagram's publishing API fetches every image by URL — it cannot be handed
-- bytes, and it cannot reach a folder on somebody's desk.
CREATE TABLE IF NOT EXISTS scheduled_carousels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The id the laptop knows it by, so the app can match its own queue to this
  -- row without storing our uuid.
  local_id       text,
  ig_account     text NOT NULL,
  caption        text NOT NULL DEFAULT '',
  -- R2 keys, in slide order. Order is the whole meaning of a carousel.
  slide_paths    text[] NOT NULL,
  scheduled_for  timestamptz NOT NULL,

  -- queued -> publishing -> published | failed
  status         text NOT NULL DEFAULT 'queued',
  attempts       int  NOT NULL DEFAULT 0,
  last_error     text,
  -- What Instagram called it once it was up, for checking later.
  ig_media_id    text,
  published_at   timestamptz,

  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

-- The publisher asks one question every few minutes: what is due and not yet
-- done. This is that question.
CREATE INDEX IF NOT EXISTS idx_sched_carousel_due
  ON scheduled_carousels (scheduled_for)
  WHERE status IN ('queued', 'publishing');

-- One row per post from the laptop, so a resend after a dropped connection
-- updates rather than duplicating. A duplicate here is a duplicate on the feed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_carousel_local
  ON scheduled_carousels (local_id) WHERE local_id IS NOT NULL;
