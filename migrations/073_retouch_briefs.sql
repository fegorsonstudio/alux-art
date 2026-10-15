-- Glow Retouch director (owner, 15 Oct 2026): for every photo an AI writes the retouch brief,
-- the studio computer renders it with Fegorson Studio, and the AI checks the result before it
-- goes to the client. One row per pass; a photo that fails its check gets a second pass.
CREATE TABLE IF NOT EXISTS retouch_briefs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_image_id uuid NOT NULL REFERENCES shoot_images(id) ON DELETE CASCADE,
  shoot_id       uuid NOT NULL,
  pass           int  NOT NULL DEFAULT 1,
  status         text NOT NULL DEFAULT 'ready',   -- ready | rendering | rendered | passed | redo | failed
  brief          jsonb,      -- what the director saw and what to do, top to bottom
  candidates     jsonb,      -- what the spot-finder found: id -> kind, place, stroke
  recipe         jsonb,      -- {"params": {...}, "healStrokes": [...]} for Fegorson Studio
  result_bucket  text,
  result_path    text,       -- this pass's render
  qa             jsonb,      -- the check of this pass
  cost_usd       numeric(8,4) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retouch_briefs_image_idx ON retouch_briefs (shoot_image_id, pass);
CREATE INDEX IF NOT EXISTS retouch_briefs_status_idx ON retouch_briefs (status);
