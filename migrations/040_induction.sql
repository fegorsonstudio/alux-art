-- Buyer induction personalization (nursing induction templates):
-- { "name": "JANE SMITH", "titles": ["RN","RM","BNSc"], "year": 2023 }
-- Rendered as embroidered text on the sash / scrubs / cap via prompt directives.
ALTER TABLE shoots ADD COLUMN IF NOT EXISTS induction JSONB;
