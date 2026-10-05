-- One story GIF per carousel post, made on the server from the post's before
-- and after photographs and a few short lines.
--
-- Kept apart from scheduled_carousels because a GIF does not need the post to
-- be scheduled, and from shoots because these are the studio's own posts, not
-- a customer's order. Keyed by the laptop studio's post id, the same id the
-- scheduler uses, so the two can be joined without either storing the other.
CREATE TABLE IF NOT EXISTS carousel_gifs (
  local_id      text PRIMARY KEY,
  -- generated-4k/carousels/gifs/<local_id>.gif. The retention sweep never
  -- touches carousels/, which is right: a GIF on GIPHY points nowhere near it,
  -- but the studio keeps the master here to re-upload or re-check.
  r2_key        text NOT NULL,
  bytes         integer NOT NULL,
  seconds       numeric(5,2) NOT NULL,

  -- The owner's word that everyone in the photographs agreed to a PUBLIC GIF.
  -- GIPHY is a public library anyone can search, download and reuse; a
  -- customer's YES to "show it on our page" is not consent to that. The
  -- publish route refuses without it, and records when it was given.
  cleared       boolean NOT NULL DEFAULT false,
  cleared_at    timestamptz,

  giphy_id      text,
  giphy_url     text,
  giphy_tag     text,
  published_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);
