-- Extend shoots.package_size check constraint to allow 1-image packages
-- Added CodeRabbit test review comment trigger
ALTER TABLE shoots DROP CONSTRAINT IF EXISTS shoots_package_size_check;
ALTER TABLE shoots ADD CONSTRAINT shoots_package_size_check CHECK (package_size IN (1, 5, 10));

