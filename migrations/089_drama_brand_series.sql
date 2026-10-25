-- A brand's own micro drama series (owner, 2026-10-25): the brand uploads pictures of
-- its products; the engine works out what they are and writes a season that places
-- them in the story. Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/089_drama_brand_series.sql
BEGIN;
CREATE TABLE IF NOT EXISTS drama_brand_series (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name    text NOT NULL,
  contact_name  text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  instagram     text,                         -- the brand's handle, if the series should post there
  city          text,
  genre         text,
  audience      text,                         -- who they want to reach, in their words
  products      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ key, name, url, note, bucket, path }]
  message       text,
  user_id       uuid,
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested', 'briefed', 'written', 'preview', 'approved', 'paid', 'producing', 'delivered', 'declined')),
  brief         jsonb,                        -- what DeepSeek found: what the products are, who buys them, the pitches
  story_slug    text,                         -- the story once written (tools/drama/stories/<slug>.mjs)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMIT;
