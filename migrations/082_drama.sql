-- Alux Micro Drama: interactive picture dramas on Instagram with a game page
-- (/d/drama). Stories are written as files (tools/drama/stories, ENGINE.md) and
-- loaded here by scripts/drama-seed.mjs; everything people DO — join a role,
-- vote, buy a brand slot — lives in the other tables.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/082_drama.sql
BEGIN;

CREATE TABLE IF NOT EXISTS drama_stories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title       text NOT NULL,
  tagline     text NOT NULL,
  genre       text NOT NULL,
  city        text NOT NULL,
  logline     text NOT NULL,
  status      text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished', 'hidden')),
  featured    boolean NOT NULL DEFAULT false,
  sort        int NOT NULL DEFAULT 100,
  min_votes   int NOT NULL DEFAULT 2 CHECK (min_votes >= 2),
  content     jsonb NOT NULL,                 -- the story file as written: cast, episodes, slots
  cover_bucket text,                          -- cover art once made; NULL = the type-only cover
  cover_path   text,
  ig_account  text NOT NULL DEFAULT 'aolivetv',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_stories_shelf_idx ON drama_stories (status, sort);

-- Episodes as produced and posted (the written episode is in drama_stories.content).
CREATE TABLE IF NOT EXISTS drama_episodes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id     uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  n            int NOT NULL CHECK (n >= 1),
  from_word    text,                          -- the winning word of the episode before (NULL for episode 1)
  content      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'producing', 'ready', 'posted', 'closed')),
  ig_media_id  text,
  posted_at    timestamptz,
  decided_word text,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, n)
);

-- One vote per person per episode; the first word to reach the story's min_votes wins.
CREATE TABLE IF NOT EXISTS drama_votes (
  id          bigserial PRIMARY KEY,
  episode_id  uuid NOT NULL REFERENCES drama_episodes(id) ON DELETE CASCADE,
  word        text NOT NULL CHECK (word ~ '^[A-Z]{2,10}$'),
  voter       text NOT NULL,                  -- 'ig:<instagram user id>' or 'web:<profile id>'
  source      text NOT NULL DEFAULT 'instagram',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id, voter)
);

-- Fans who play a role. A role belongs to one person at a time.
CREATE TABLE IF NOT EXISTS drama_cast (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  role_key      text NOT NULL,
  user_id       uuid,                         -- profiles.id when known
  ig_user_id    text,
  display_name  text NOT NULL,
  photo_bucket  text, photo_path text,
  sheet_bucket  text, sheet_path text,        -- the character sheet the engine makes
  status        text NOT NULL DEFAULT 'pending_payment'
                CHECK (status IN ('pending_payment', 'submitted', 'approved', 'sheet_ready', 'rejected', 'withdrawn')),
  price_ngn     int NOT NULL DEFAULT 0 CHECK (price_ngn >= 0),
  payment_reference text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drama_cast_one_per_role
  ON drama_cast (story_id, role_key) WHERE status NOT IN ('rejected', 'withdrawn');

-- Brands that buy a slot (an object in a scene).
CREATE TABLE IF NOT EXISTS drama_placements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id       uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_n      int NOT NULL CHECK (episode_n >= 1),
  slot_key       text NOT NULL,
  brand_name     text NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 60),
  contact_name   text, contact_email text, contact_phone text,
  product_bucket text, product_path text,
  note           text,
  price_ngn      int NOT NULL CHECK (price_ngn >= 0),
  status         text NOT NULL DEFAULT 'pending_payment'
                 CHECK (status IN ('pending_payment', 'paid', 'approved', 'rejected', 'placed', 'refunded')),
  payment_reference text,
  user_id        uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drama_placements_one_per_slot
  ON drama_placements (story_id, episode_n, slot_key) WHERE status IN ('paid', 'approved', 'placed');

-- Prices the owner can change without code (naira).
INSERT INTO app_config (key, value, updated_at) VALUES
  ('drama_price_lead', '10000', now()),
  ('drama_price_main', '5000', now()),
  ('drama_price_cameo', '2000', now()),
  ('drama_price_slot', '10000', now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
