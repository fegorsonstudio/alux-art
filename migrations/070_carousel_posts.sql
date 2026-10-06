-- The carousel studio, moved off the owner's laptop and onto the website.
--
-- One row per planned post: the words, the photographs, the story pictures,
-- the approval and the date. Publishing still happens through
-- scheduled_carousels and the GIF through carousel_gifs; all three share
-- local_id ('plan-p01', 'plan-m01') — the id the laptop studio already used —
-- so they join without any of them storing another's uuid.
--
-- The laptop kept this in a folder of JSON files, which was only ever on one
-- machine and could not be opened from a phone.
CREATE TABLE IF NOT EXISTS carousel_posts (
  local_id          text PRIMARY KEY,
  -- 'main' (the 88 dated posts) or 'microdrama' (the Photo Wahala experiment,
  -- which is loaded and removed as a block).
  batch             text NOT NULL DEFAULT 'main',
  title             text NOT NULL,
  account           text NOT NULL DEFAULT 'fegorson_studio',

  -- From the plan, kept so the page can say what a post is for and what
  -- photographs it wants, and so the experiment can be re-dated from a new
  -- start Monday.
  product           text,
  trigger_word      text,
  week              integer,
  slot              text,
  post_hour         integer,
  photos_hint       text,

  -- [{eyebrow, headline, body}], in slide order.
  cards             jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption           text NOT NULL DEFAULT '',
  button_text       text NOT NULL DEFAULT 'aluxartandframes.shop',
  -- Episodes only: the cast and the two scene prompts the owner copies into
  -- Google Flow. NULL for every other post.
  storyboard        jsonb,
  gif_lines         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The owner's word that everyone in the photos agreed to a PUBLIC GIF.
  gif_cleared       boolean NOT NULL DEFAULT false,

  scheduled_for     timestamptz,

  -- generated-4k keys. Every upload gets a new key, so a replaced photograph
  -- can never be served from a browser's cache in place of the new one.
  before_path       text,
  after_path        text,
  -- One per storyboard scene, in order; null where the picture is still to
  -- be made.
  scene_paths       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- needs_photos -> needs_pictures -> draft -> approved -> scheduled.
  -- Any change to what would be posted drops it back to draft: what was
  -- approved is no longer what would go out. Posted / failed are read from
  -- scheduled_carousels, which is where publishing happens.
  status            text NOT NULL DEFAULT 'needs_photos',
  slide_count       integer NOT NULL DEFAULT 0,
  approved_at       timestamptz,

  -- The experiment's episodes sit hidden until it is loaded, and go back to
  -- hidden when it is removed. Hidden, not deleted: photographs already added
  -- come back if it is loaded again.
  hidden            boolean NOT NULL DEFAULT false,

  -- What the owner has changed by hand. Re-loading the plan refreshes the
  -- plan's words everywhere else and never these.
  words_edited      boolean NOT NULL DEFAULT false,
  date_edited       boolean NOT NULL DEFAULT false,
  gif_lines_edited  boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);

-- The studio's one list: what is coming up, soonest first.
CREATE INDEX IF NOT EXISTS idx_carousel_posts_when
  ON carousel_posts (scheduled_for) WHERE NOT hidden;
