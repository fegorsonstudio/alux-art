-- Atomic purchase count increment to prevent race conditions on concurrent webhook deliveries
CREATE OR REPLACE FUNCTION increment_template_purchase_count(p_template_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = p_template_id;
$$;
