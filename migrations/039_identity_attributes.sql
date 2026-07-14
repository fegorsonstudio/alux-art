-- Per-identity-image attribute classification (framing / view / expression),
-- cached per shoot so retries don't re-run the vision call.
-- Shape: { "<storage_path>": { "framing": "full-body"|"medium"|"close-up",
--          "view": "front"|"back", "expression": "smiling-teeth"|"neutral" } }
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS identity_attributes JSONB;
