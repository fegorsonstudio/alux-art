-- Add template_showcase_id to shoots so we can track which showcase generations
-- belong to which template (used by creator dashboard polling).
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS template_showcase_id UUID REFERENCES templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shoots_template_showcase_id_idx ON shoots(template_showcase_id);
