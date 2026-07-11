-- Feature A: cross-creator "community library" for custom slot setups
-- (flag / mugshot / bowl / viral plates). A creator publishes a plate they've
-- configured; other creators can import it, which COPIES the file into their
-- own storage prefix (so deleting the original never breaks an importer's
-- template, and the ${userId}/ ownership sanitizers stay untouched).
CREATE TABLE IF NOT EXISTS shared_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('flag', 'mugshot', 'bowl', 'viral')),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'template-images',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_setups_kind ON shared_setups (kind, created_at DESC);

-- Feature B: pose-mimic template. Creator uploads named signature-pose
-- references; buyers pick which ones they want at checkout. Selected poses
-- ride the shoot as ordinary purpose='pose' shoot_references, reusing the
-- existing Group D pose-extraction pipeline in lib/generate.ts unchanged.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS pose_options JSONB;
