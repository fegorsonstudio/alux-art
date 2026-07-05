-- Formally add the scenes JSONB column to templates.
-- This column was written by the API routes but never added via a migration file.
-- IF NOT EXISTS makes this safe to run on a database that already has the column.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS scenes JSONB;
