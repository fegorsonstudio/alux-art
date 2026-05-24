-- ============================================================
-- Alux Art — Complete PostgreSQL Schema (plain, no Supabase)
-- Run once on a fresh database:
--   psql postgresql://aluxart:aluxart_db_2026@localhost:5432/aluxart -f scripts/schema-vps.sql
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY,
  email        TEXT,
  display_name TEXT,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  banned       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── shoots (character_base_id and template FKs added later) ───
CREATE TABLE IF NOT EXISTS shoots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  owner_email            TEXT,
  mode                   TEXT NOT NULL DEFAULT 'fast',
  aspect_ratio           TEXT NOT NULL DEFAULT '4:5',
  currency               TEXT NOT NULL DEFAULT 'NGN',
  package_size           INTEGER NOT NULL DEFAULT 10,
  status                 TEXT NOT NULL DEFAULT 'PENDING',
  progress               INTEGER NOT NULL DEFAULT 0,
  pipeline_stage         TEXT,
  quote                  JSONB,
  identity_profile       TEXT,
  character_base_id      UUID,
  base_lock_status       TEXT,
  base_lock_started_at   TIMESTAMPTZ,
  base_lock_completed_at TIMESTAMPTZ,
  template_id            UUID,
  template_showcase_id   UUID,
  zip_storage_path       TEXT,
  zip_storage_bucket     TEXT DEFAULT 'shoot-zips',
  zip_status             TEXT,
  shot_type              TEXT,
  paystack_reference     TEXT,
  completed_at           TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoots_user_id   ON shoots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shoots_status    ON shoots(status);
CREATE INDEX IF NOT EXISTS idx_shoots_showcase  ON shoots(template_showcase_id);

-- ── shoot_images ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shoot_images (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id                UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slot                    INTEGER NOT NULL,
  kind                    TEXT NOT NULL DEFAULT 'portrait',
  status                  TEXT NOT NULL DEFAULT 'QUEUED',
  stage                   TEXT,
  provider                TEXT,
  configured_model        TEXT,
  prompt                  TEXT,
  preview_storage_bucket  TEXT,
  preview_storage_path    TEXT,
  download_storage_bucket TEXT,
  download_storage_path   TEXT,
  fal_url                 TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoot_images_shoot ON shoot_images(shoot_id, slot);
CREATE INDEX IF NOT EXISTS idx_shoot_images_user  ON shoot_images(user_id);

-- ── shoot_references ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shoot_references (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id       UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL,
  tag            TEXT,
  custom_name    TEXT,
  note           TEXT,
  name           TEXT,
  type           TEXT,
  size           INTEGER,
  storage_bucket TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shoot_refs_shoot ON shoot_references(shoot_id);

-- ── generation_events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id   UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_events_shoot ON generation_events(shoot_id, created_at DESC);

-- ── identity_images ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           TEXT,
  type           TEXT,
  size           INTEGER,
  storage_bucket TEXT NOT NULL DEFAULT 'identity-images',
  storage_path   TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_images_user ON identity_images(user_id, last_used_at DESC);

-- ── inspiration_images ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspiration_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           TEXT,
  type           TEXT,
  size           INTEGER,
  storage_bucket TEXT NOT NULL DEFAULT 'inspiration-images',
  storage_path   TEXT NOT NULL,
  tag            TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspiration_images_user ON inspiration_images(user_id, last_used_at DESC);

-- ── character_bases ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_bases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  origin_shoot_id      UUID REFERENCES shoots(id) ON DELETE SET NULL,
  cache_key            TEXT NOT NULL,
  identity_image_paths TEXT[] NOT NULL DEFAULT '{}',
  outfit_ref_path      TEXT,
  hairstyle_ref_path   TEXT,
  makeup_ref_path      TEXT,
  nail_ref_path        TEXT,
  accessory_ref_paths  TEXT[] DEFAULT '{}',
  custom_tag_refs      JSONB DEFAULT '{}',
  identity_profile     TEXT NOT NULL DEFAULT '',
  styling_brief        JSONB NOT NULL DEFAULT '{}',
  base_storage_path    TEXT,
  base_4k_storage_path TEXT,
  fal_seed             BIGINT,
  status               TEXT NOT NULL DEFAULT 'GENERATING' CHECK (status IN (
    'GENERATING','AUTO_APPROVED','PENDING_USER_APPROVAL','USER_APPROVED','USER_REJECTED','FAILED'
  )),
  quality_gate_result  JSONB DEFAULT '{}',
  attempt_number       INT NOT NULL DEFAULT 1,
  failure_reason       TEXT,
  user_label           TEXT,
  is_archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_char_bases_user  ON character_bases(user_id, created_at DESC) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_char_bases_cache ON character_bases(user_id, cache_key)
  WHERE status IN ('AUTO_APPROVED','USER_APPROVED') AND is_archived = FALSE;

-- Add FK from shoots → character_bases now that the table exists
ALTER TABLE shoots ADD CONSTRAINT fk_shoots_char_base
  FOREIGN KEY (character_base_id) REFERENCES character_bases(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ── app_config ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES
  ('vision_model',     'gemini'),
  ('generation_model', 'nano-banana'),
  ('platform_fee_ngn', '15000')
ON CONFLICT (key) DO NOTHING;

-- ── pricing_configs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_configs (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  ngn        NUMERIC NOT NULL DEFAULT 0,
  usd        NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pricing_configs (id, ngn, usd) VALUES (1, 0, 0) ON CONFLICT DO NOTHING;

-- ── forbidden_words ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forbidden_words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word        TEXT NOT NULL UNIQUE,
  replacement TEXT NOT NULL,
  hit_count   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forbidden_words ON forbidden_words(word);

INSERT INTO forbidden_words (word, replacement) VALUES
  ('alluring',  'intense'),
  ('seductive', 'confident'),
  ('sensual',   'graceful'),
  ('sultry',    'captivating'),
  ('teasing',   'playful'),
  ('revealing', 'showing'),
  ('exposed',   'visible')
ON CONFLICT (word) DO NOTHING;

-- ── creators ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creators (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
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
  theme                    TEXT DEFAULT 'alux',
  font_family              TEXT DEFAULT 'default',
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id         UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  category           TEXT NOT NULL DEFAULT 'portrait',
  tags               TEXT[] NOT NULL DEFAULT '{}',
  price_ngn          INTEGER NOT NULL DEFAULT 0,
  price_1_ngn        INTEGER,
  price_5_ngn        INTEGER,
  shoot_mode         TEXT NOT NULL DEFAULT 'advanced',
  aspect_ratio       TEXT NOT NULL DEFAULT '4:5',
  package_size       INTEGER NOT NULL DEFAULT 10,
  status             TEXT NOT NULL DEFAULT 'draft',
  purchase_count     INTEGER NOT NULL DEFAULT 0,
  avg_rating         NUMERIC(3,2),
  rating_count       INTEGER NOT NULL DEFAULT 0,
  cover_storage_path TEXT,
  cover_bucket       TEXT DEFAULT 'template-images',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_status   ON templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_templates_creator  ON templates(creator_id);

-- Add FKs from shoots → templates now that templates exists
ALTER TABLE shoots ADD CONSTRAINT fk_shoots_template
  FOREIGN KEY (template_id) REFERENCES templates(id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shoots ADD CONSTRAINT fk_shoots_template_showcase
  FOREIGN KEY (template_showcase_id) REFERENCES templates(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- ── template_images ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_images (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  storage_path   TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'template-images',
  display_order  INTEGER NOT NULL DEFAULT 0,
  purpose        TEXT NOT NULL DEFAULT 'inspiration',
  tag            TEXT,
  custom_name    TEXT,
  note           TEXT,
  note_hidden    BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_images ON template_images(template_id, display_order);

-- ── coupons ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  description    TEXT,
  discount_type  TEXT NOT NULL DEFAULT 'percent',
  discount_value INTEGER NOT NULL,
  max_uses       INTEGER,
  use_count      INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── coupon_uses ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_uses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id  UUID NOT NULL REFERENCES coupons(id),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shoot_id   UUID REFERENCES shoots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── template_purchases ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         UUID NOT NULL REFERENCES templates(id),
  shoot_id            UUID REFERENCES shoots(id),
  user_id             UUID NOT NULL REFERENCES profiles(id),
  amount_ngn          INTEGER NOT NULL,
  platform_fee_ngn    INTEGER NOT NULL,
  creator_payout_ngn  INTEGER NOT NULL,
  coupon_id           UUID REFERENCES coupons(id),
  coupon_discount_ngn INTEGER NOT NULL DEFAULT 0,
  paystack_reference  TEXT,
  currency            TEXT NOT NULL DEFAULT 'NGN',
  amount_usd          NUMERIC(10,2),
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_user     ON template_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_template ON template_purchases(template_id);
CREATE INDEX IF NOT EXISTS idx_purchases_ref      ON template_purchases(paystack_reference);

-- ── template_ratings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS template_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, user_id)
);

CREATE OR REPLACE FUNCTION sync_template_avg_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE tid UUID := COALESCE(NEW.template_id, OLD.template_id);
BEGIN
  UPDATE templates SET
    avg_rating   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM template_ratings WHERE template_id = tid),
    rating_count = (SELECT COUNT(*) FROM template_ratings WHERE template_id = tid)
  WHERE id = tid;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_template_rating ON template_ratings;
CREATE TRIGGER trg_sync_template_rating
  AFTER INSERT OR UPDATE OR DELETE ON template_ratings
  FOR EACH ROW EXECUTE FUNCTION sync_template_avg_rating();

-- ── Helper functions ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_template_purchase_count(p_template_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = p_template_id;
$$;

CREATE OR REPLACE FUNCTION increment_coupon_use_count(p_coupon_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE coupons SET use_count = use_count + 1 WHERE id = p_coupon_id;
$$;
