-- ============================================================
-- Migration 005: Marketplace (creators, templates, coupons)
-- ============================================================

-- Storage bucket for template preview images (private, signed URLs only)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES ('template-images', 'template-images', false,
        ARRAY['image/jpeg','image/png','image/webp'], 15728640)
ON CONFLICT DO NOTHING;

-- ── Creator profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creators (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name             TEXT NOT NULL,
  bio                      TEXT,
  avatar_storage_path      TEXT,
  avatar_bucket            TEXT DEFAULT 'template-images',
  instagram_url            TEXT,
  website_url              TEXT,
  paystack_subaccount_code TEXT,
  bank_name                TEXT,
  account_number           TEXT,
  account_name             TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Templates (marketplace listings) ────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id         UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  category           TEXT NOT NULL DEFAULT 'portrait',
  tags               TEXT[] NOT NULL DEFAULT '{}',
  price_ngn          INTEGER NOT NULL,
  shoot_mode         TEXT NOT NULL DEFAULT 'advanced',
  aspect_ratio       TEXT NOT NULL DEFAULT '4:5',
  package_size       INTEGER NOT NULL DEFAULT 10,
  status             TEXT NOT NULL DEFAULT 'draft',   -- draft | published | suspended
  purchase_count     INTEGER NOT NULL DEFAULT 0,
  cover_storage_path TEXT,
  cover_bucket       TEXT DEFAULT 'template-images',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_status    ON templates (status);
CREATE INDEX IF NOT EXISTS idx_templates_category  ON templates (category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_templates_creator   ON templates (creator_id);

-- ── Template reference images ────────────────────────────────
CREATE TABLE IF NOT EXISTS template_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  storage_path   TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'template-images',
  display_order  INTEGER NOT NULL DEFAULT 0,
  purpose        TEXT NOT NULL DEFAULT 'inspiration',  -- inspiration | tagged
  tag            TEXT,  -- OUTFIT | HAIRSTYLE | MAKEUP | BACKGROUND | LIGHTING | ACCESSORY | COLOR_GRADE
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_images_template ON template_images (template_id, display_order);

-- ── Admin coupon codes (discount on platform fee only) ───────
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  description    TEXT,
  discount_type  TEXT NOT NULL DEFAULT 'percent',  -- percent | fixed
  discount_value INTEGER NOT NULL,                 -- percent: 1-100 | fixed: naira
  max_uses       INTEGER,                          -- NULL = unlimited
  use_count      INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Template purchase records ────────────────────────────────
CREATE TABLE IF NOT EXISTS template_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES templates(id),
  shoot_id            UUID REFERENCES shoots(id),
  user_id             UUID NOT NULL,
  amount_ngn          INTEGER NOT NULL,
  platform_fee_ngn    INTEGER NOT NULL,
  creator_payout_ngn  INTEGER NOT NULL,
  coupon_id           UUID REFERENCES coupons(id),
  coupon_discount_ngn INTEGER NOT NULL DEFAULT 0,
  paystack_reference  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | success | failed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_purchases_user     ON template_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_template_purchases_template ON template_purchases (template_id);
CREATE INDEX IF NOT EXISTS idx_template_purchases_ref      ON template_purchases (paystack_reference);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE creators          ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_purchases ENABLE ROW LEVEL SECURITY;

-- creators: public reads active profiles, users manage own
CREATE POLICY "public read active creators"
  ON creators FOR SELECT USING (is_active = true);

CREATE POLICY "creator manages own profile"
  ON creators FOR ALL USING (auth.uid() = user_id);

-- templates: public reads published, creators manage own
CREATE POLICY "public read published templates"
  ON templates FOR SELECT USING (status = 'published');

CREATE POLICY "creator manages own templates"
  ON templates FOR ALL USING (
    creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
  );

-- template_images: public read (for marketplace display), creator writes own
CREATE POLICY "public read template images"
  ON template_images FOR SELECT USING (true);

CREATE POLICY "creator manages own template images"
  ON template_images FOR ALL USING (
    template_id IN (
      SELECT t.id FROM templates t
      JOIN creators c ON c.id = t.creator_id
      WHERE c.user_id = auth.uid()
    )
  );

-- coupons: service role only (no user-level access via anon/auth)
-- (managed exclusively via service client in admin API routes)

-- template_purchases: users read own, service role writes
CREATE POLICY "user reads own purchases"
  ON template_purchases FOR SELECT USING (auth.uid() = user_id);

-- ── Storage policies for template-images bucket ─────────────
CREATE POLICY "creators upload template images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'template-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "creators delete own template images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'template-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "authenticated read template images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'template-images');

CREATE POLICY "service role read template images"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'template-images');
