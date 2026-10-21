-- Alux Micro Drama: joining the cast runs by itself (owner, 2026-10-21).
-- Three photos instead of one, a free photo check, the character sheet and a
-- portrait made by the engine, a private page per cast member, and requests
-- from companies that want more than one product in a scene.
-- Applied on the VPS with psql -f (never migrate-vps.mjs).

-- photos: [{ kind: 'face' | 'angle' | 'body', bucket, path }]. photo_bucket/photo_path
-- stay as the first (face) photo for everything that already reads them.
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS email text;
-- The free photo check: { at, results: [{ kind, ok, problems: [...] }] }
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS photo_check jsonb;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS portrait_bucket text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS portrait_path text;
-- Paid model runs so far (a cap stops a stuck render from spending for ever),
-- whether the one free "make it again" has been used, and the model that ran.
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS renders int NOT NULL DEFAULT 0;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS redo_used boolean NOT NULL DEFAULT false;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS render_model text;
ALTER TABLE drama_cast ADD COLUMN IF NOT EXISTS last_error text;

-- New steps: photos_needed (a photo failed the check; the member sends another),
-- making (the engine is drawing the character), accepted (the member said "this
-- is me"), failed (the engine gave up; the owner is told).
ALTER TABLE drama_cast DROP CONSTRAINT IF EXISTS drama_cast_status_check;
ALTER TABLE drama_cast ADD CONSTRAINT drama_cast_status_check CHECK (status IN (
  'pending_payment', 'submitted', 'photos_needed', 'making', 'sheet_ready', 'accepted',
  'approved', 'failed', 'rejected', 'withdrawn'));

CREATE TABLE IF NOT EXISTS drama_partner_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company      text NOT NULL CHECK (char_length(company) BETWEEN 2 AND 80),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 80),
  email        text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 120),
  phone        text,
  package      text NOT NULL CHECK (package IN ('episode_sponsor', 'story_partner', 'own_drama', 'other')),
  story_slug   text,
  budget       text,
  message      text CHECK (message IS NULL OR char_length(message) <= 1500),
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Prices the owner approved on 2026-10-21. Every package has a fixed number of
-- pictures, so the model cost can never pass the price.
INSERT INTO app_config (key, value, updated_at) VALUES
  ('drama_price_cameo', '10000', now()), ('drama_price_main', '30000', now()), ('drama_price_lead', '90000', now()),
  ('drama_price_slot', '30000', now()), ('drama_price_sponsor', '100000', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
