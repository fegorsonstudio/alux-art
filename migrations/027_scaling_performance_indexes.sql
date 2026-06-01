-- Performance indexes for scale testing
-- Add a composite index to support marketplace listing queries that filter by status/category and order by created_at.
CREATE INDEX IF NOT EXISTS idx_templates_published_category_created_at
  ON templates(status, category, created_at DESC)
  WHERE status = 'published';

-- Speed up title searches used by marketplace filtering and search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_templates_title_trgm
  ON templates USING gin (title gin_trgm_ops);
