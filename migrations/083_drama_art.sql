-- Pictures for Alux Micro Drama slides — rendered in the Unreal studio (or any
-- other source) and attached per slide before an episode is approved. When a
-- slide has one, lib/drama/slides.ts draws the caption over the picture;
-- otherwise the slide stays designed. Approving an episode copies these into
-- its frozen content, so a later change here cannot alter what was approved.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/083_drama_art.sql
CREATE TABLE IF NOT EXISTS drama_art (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    uuid NOT NULL REFERENCES drama_stories(id) ON DELETE CASCADE,
  episode_n   int NOT NULL CHECK (episode_n >= 1),
  slide       int NOT NULL CHECK (slide BETWEEN 1 AND 10),
  bucket      text NOT NULL,
  path        text NOT NULL,
  source      text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'unreal', 'ai')),
  caption_at  text NOT NULL DEFAULT 'bottom' CHECK (caption_at IN ('top', 'bottom')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, episode_n, slide)
);
