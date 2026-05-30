-- Performance indexes for high-traffic queries
-- CRITICAL: template_purchases status filter (used on every admin revenue load)
CREATE INDEX IF NOT EXISTS idx_purchases_status ON template_purchases(status) WHERE status = 'success';

-- HIGH: shoot_references user_id (used in identity library and shoot reference queries)
CREATE INDEX IF NOT EXISTS idx_shoot_refs_user ON shoot_references(user_id);

-- LOW: coupons ordering by created_at
CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons(created_at DESC);
