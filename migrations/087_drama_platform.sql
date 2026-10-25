-- Alux Micro Drama → a platform (owner, 2026-10-25): anyone creates a drama and
-- invites friends from Instagram to collaborate; sponsors fund a season after
-- seeing the cast, the arc and the budget; everyone in an episode earns a share
-- whenever it earns; outputs are handed to the people who made them, to post on
-- their own page or on our shelf (and later the sister app).
--
-- DRAFT — written while the server was down (Hetzner, 2026-10-22). Read
-- tools/drama/PLATFORM.md first. Apply on the VPS with:
--   psql "$DATABASE_URL" -f migrations/087_drama_platform.sql
BEGIN;

-- Prices the models actually charge us (fal.ai pricing, read 2026-10-25).
UPDATE fal_rate_card SET usd_per_image = 0.08000, note = 'Nano Banana 2 edit, 1K (×1.5 at 2K, ×2 at 4K) — fal.ai pricing 2026-10-25' WHERE model = 'fal-ai/nano-banana-2/edit';
INSERT INTO fal_rate_card (model, usd_per_image, note) VALUES
  ('fal-ai/nano-banana-pro/edit', 0.15000, 'Nano Banana Pro edit — fal.ai pricing 2026-10-25')
ON CONFLICT (model) DO NOTHING;

-- The budget rules (lib/drama/budget.ts reads these; defaults are the same numbers).
INSERT INTO app_config (key, value, updated_at) VALUES
  ('drama_cost_buffer_pct', '50', now()),     -- +50 % for pictures and clips that must be made again
  ('drama_profit_pct', '400', now()),         -- 400 % on the production cost
  ('drama_usd_ngn', '1600', now())
ON CONFLICT (key) DO NOTHING;

-- ── Who owns a story ───────────────────────────────────────────────────────────
-- House stories have no owner (created_by NULL). A creator's story is theirs:
-- they invite collaborators, they publish, they earn.
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS created_by uuid;          -- profiles.id
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'house'
  CHECK (visibility IN ('house', 'private', 'shelf', 'own_page'));
  -- house: ours, on the shelf and our Instagram · private: a creator's draft, invited people only
  -- shelf: a creator's story shown on our shelf · own_page: produced for the creator's own Instagram
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'carousel'
  CHECK (format IN ('carousel', 'pictures', 'video'));
ALTER TABLE drama_stories ADD COLUMN IF NOT EXISTS budget jsonb;             -- the last estimate shown (lib/drama/budget.ts Budget)
CREATE INDEX IF NOT EXISTS drama_stories_owner_idx ON drama_stories (created_by) WHERE created_by IS NOT NULL;

-- ── Collaborators and invitations ──────────────────────────────────────────────
-- Everyone who works on a story, with the share they earn. Cast members already
-- live in drama_cast; a collaborator row points at one when the person also plays.
CREATE TABLE IF NOT EXISTS drama_collaborators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  user_id       uuid,                         -- profiles.id once they sign in
  ig_username   text,                         -- how they were invited
  display_name  text NOT NULL,
  job           text NOT NULL CHECK (job IN ('creator', 'writer', 'director', 'actor', 'designer', 'sound', 'sponsor', 'brand')),
  cast_id       uuid REFERENCES drama_cast(id) ON DELETE SET NULL,
  share_bp      int NOT NULL DEFAULT 0 CHECK (share_bp BETWEEN 0 AND 10000),  -- basis points of the story's creator pool
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined', 'declined', 'removed')),
  invited_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_collaborators_story_idx ON drama_collaborators (story_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS drama_collaborators_one_per_user ON drama_collaborators (story_id, user_id) WHERE user_id IS NOT NULL AND status <> 'removed';

-- An invitation is a link (sent as an Instagram DM by the creator themselves, or
-- by our bot when the creator comments INVITE @friend under their own post).
CREATE TABLE IF NOT EXISTS drama_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  job           text NOT NULL,
  role_key      text,                         -- when the invitation is to play a role
  ig_username   text,
  invited_by    uuid NOT NULL,
  accepted_by   uuid,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Sponsors ───────────────────────────────────────────────────────────────────
-- A season funded by one sponsor at the quoted budget. Paid through Paystack
-- (metadata.type = 'drama_sponsor'), released only when amount ≥ price_ngn.
CREATE TABLE IF NOT EXISTS drama_sponsorships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  season        int NOT NULL DEFAULT 1,
  brand_name    text NOT NULL,
  contact_name  text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  user_id       uuid,
  format        text NOT NULL CHECK (format IN ('carousel', 'pictures', 'video')),
  budget        jsonb NOT NULL,               -- the Budget object quoted, frozen
  price_ngn     int NOT NULL CHECK (price_ngn > 0),
  status        text NOT NULL DEFAULT 'quoted'
                CHECK (status IN ('quoted', 'pending_payment', 'paid', 'producing', 'delivered', 'refunded', 'cancelled')),
  payment_reference text,
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drama_sponsorships_one_live ON drama_sponsorships (story_id, season) WHERE status IN ('paid', 'producing', 'delivered');

-- ── Earnings: continuous pay for the people in a story ─────────────────────────
-- Every naira a story earns is one row here (what came in), and its split is
-- rows in drama_earnings (what each person is owed). Payouts are rows too, so
-- a balance is always SUM(earned) − SUM(paid out).
CREATE TABLE IF NOT EXISTS drama_revenue (
  id            bigserial PRIMARY KEY,
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_n     int,
  source        text NOT NULL CHECK (source IN ('cast', 'placement', 'sponsor', 'product_word', 'view', 'download', 'subscription', 'other')),
  reference     text,                         -- the payment reference, placement id, …
  gross_ngn     int NOT NULL CHECK (gross_ngn >= 0),
  pool_ngn      int NOT NULL CHECK (pool_ngn >= 0),     -- the part shared with collaborators (after production cost + our margin)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_revenue_story_idx ON drama_revenue (story_id, created_at);

CREATE TABLE IF NOT EXISTS drama_earnings (
  id            bigserial PRIMARY KEY,
  revenue_id    bigint REFERENCES drama_revenue(id) ON DELETE CASCADE,
  collaborator_id uuid NOT NULL REFERENCES drama_collaborators(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('earned', 'payout', 'adjustment')),
  amount_ngn    int NOT NULL,                 -- positive for earned, negative for a payout
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_earnings_collab_idx ON drama_earnings (collaborator_id, created_at);

-- ── Deliverables: the outputs of each episode, handed to the people who made it ─
CREATE TABLE IF NOT EXISTS drama_deliverables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_id    uuid REFERENCES drama_episodes(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('slides_zip', 'cover_video', 'soundtrack', 'pictures_zip', 'video', 'caption', 'character_sheet', 'poster')),
  bucket        text NOT NULL,
  path          text NOT NULL,
  bytes         bigint,
  for_collaborator uuid REFERENCES drama_collaborators(id) ON DELETE CASCADE,  -- NULL = everyone on the story
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drama_deliverables_story_idx ON drama_deliverables (story_id, episode_id);

-- Where a creator's story is published: their own page (they download and post) or ours.
CREATE TABLE IF NOT EXISTS drama_publications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id      uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_id    uuid REFERENCES drama_episodes(id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel IN ('alux_instagram', 'own_instagram', 'alux_shelf', 'sister_app')),
  external_id   text,                         -- the Instagram media id, the app's episode id
  url           text,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMIT;
