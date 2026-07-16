-- Private templates: published and fully bookable through their direct link
-- (the UUID in the URL is the secret), but excluded from the marketplace,
-- homepage, creator profile pages, and llms.txt discovery. Built for creators
-- doing one-off client work that should never be publicly listed.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
