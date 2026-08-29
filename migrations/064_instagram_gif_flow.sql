-- Making a GIF entirely inside an Instagram chat.
--
-- The loop needs two pictures and the customer's own words. The two pictures
-- fit in source_paths, which already exists, but the words have nowhere to
-- live — look_name is the lighting look and last_inbound is only the most
-- recent message, which is wrong the moment somebody sends their lines one at
-- a time, which is how people actually type.
--
-- text[] rather than a jsonb blob because that is what the booking wants: the
-- gif_loop payload takes `lines` as an ordered array of short strings, and the
-- order is the order they appear in the film.
ALTER TABLE instagram_sessions
  ADD COLUMN IF NOT EXISTS gif_lines text[] NOT NULL DEFAULT '{}';

-- The website line, when they give one. Optional, and kept separate from
-- gif_lines because the renderer treats an address as its own kind of beat —
-- centred and smaller, not shouted like a headline.
ALTER TABLE instagram_sessions
  ADD COLUMN IF NOT EXISTS gif_website text;
