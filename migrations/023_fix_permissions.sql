-- Ensure the aluxart app role has full DML on every table.
-- Safe to run multiple times (GRANT is idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  profiles,
  shoots,
  shoot_images,
  shoot_references,
  generation_events,
  identity_images,
  inspiration_images,
  character_bases,
  app_config,
  pricing_configs,
  forbidden_words,
  creators,
  templates,
  template_images,
  template_purchases,
  template_ratings,
  coupons,
  coupon_uses,
  payments,
  download_logs,
  _migrations
TO aluxart;
