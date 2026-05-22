ALTER TABLE creators ADD COLUMN IF NOT EXISTS theme text DEFAULT 'alux';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'default';
