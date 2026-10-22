-- Drama episode soundtracks (owner, 2026-10-22). Applied on the VPS with psql -f.
--
-- scripts/drama-sound.mjs makes each queued episode's 30-second soundtrack and a
-- cover video (slide 1 with the sound). When every check passes it sets
-- scheduled_carousels.cover_video_path, and the publisher posts that video as the
-- carousel's first item; any failure leaves the column empty and the episode
-- posts silent, exactly as before.

ALTER TABLE scheduled_carousels ADD COLUMN IF NOT EXISTS cover_video_path text;

CREATE TABLE IF NOT EXISTS drama_sound (
  episode_id uuid PRIMARY KEY REFERENCES drama_episodes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'making' CHECK (status IN ('making', 'ready', 'failed', 'skipped')),
  script jsonb,
  report jsonb,
  video_path text,
  problems text[],
  usd numeric(8, 3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The switch: 'on' makes soundtracks; anything else and every episode posts silent.
INSERT INTO app_config (key, value, updated_at) VALUES ('drama_sound', 'off', now())
ON CONFLICT (key) DO NOTHING;
