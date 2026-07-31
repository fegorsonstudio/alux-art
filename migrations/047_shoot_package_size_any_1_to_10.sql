-- Photo upgrades are priced per image: the buyer brings however many photos they
-- have (1-10) and pays the single-image price for each. Booking three photos was
-- rejected at the final insert because shoots.package_size only permitted the
-- fixed package sizes:
--
--   new row for relation "shoots" violates check constraint "chk_shoots_package_size"
--
-- Widen it to any count from 1 to 10. The upper bound is kept — it is what stops
-- a malformed or hostile request queueing a thousand slots — and every other
-- template still resolves to 1, 5 or 10 in code, so nothing that works today
-- changes. Only shoots is widened; templates, gift_links and free_bookings keep
-- their own rules.

ALTER TABLE shoots DROP CONSTRAINT IF EXISTS chk_shoots_package_size;

ALTER TABLE shoots
  ADD CONSTRAINT chk_shoots_package_size
  CHECK (package_size >= 1 AND package_size <= 10);
