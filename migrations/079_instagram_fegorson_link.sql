-- When the Instagram bot sent someone the Fegorson Studio download link
-- (/d/fegorson), so the full message goes once and later asks get a short one.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/079_instagram_fegorson_link.sql
ALTER TABLE instagram_sessions ADD COLUMN IF NOT EXISTS fegorson_link_sent_at timestamptz;
