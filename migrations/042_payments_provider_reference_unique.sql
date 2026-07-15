-- HOTFIX (applied manually 2026-07-15): the /api/shoots/[id]/pay route inserts
-- with ON CONFLICT (provider_reference), but the payments table never had a
-- unique constraint on that column — every studio payment failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (user-facing: "Could not record payment").
--
-- Root cause of the missing constraint: the payments table was owned by
-- postgres, not aluxart, so earlier migrations touching it silently failed
-- ("must be owner of table payments"). Ownership was also fixed:
--   ALTER TABLE payments OWNER TO aluxart;  (run as postgres superuser)
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_key
  ON payments (provider_reference);
