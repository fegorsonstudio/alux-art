-- Atomic coupon use_count increment to prevent double-counting on concurrent webhooks
CREATE OR REPLACE FUNCTION increment_coupon_use_count(p_coupon_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE coupons SET use_count = use_count + 1 WHERE id = p_coupon_id;
$$;
