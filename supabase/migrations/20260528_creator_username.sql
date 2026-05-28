ALTER TABLE creators
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS creators_username_idx ON creators (LOWER(username));
