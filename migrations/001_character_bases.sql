-- Migration 001: Locked Base Reference
-- Run this in the Supabase SQL editor before enabling LOCKED_BASE_ENABLED

-- =========================================================
-- 1. New table: character_bases
-- =========================================================
CREATE TABLE IF NOT EXISTS character_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- which shoot first produced this base (nullable — becomes reusable)
  origin_shoot_id UUID REFERENCES shoots(id) ON DELETE SET NULL,

  -- cache key: sha256 over sorted input paths so identical inputs reuse the same base
  cache_key TEXT NOT NULL,

  -- input snapshots (storage paths, not URLs — sign on demand)
  identity_image_paths TEXT[] NOT NULL DEFAULT '{}',
  outfit_ref_path TEXT,
  hairstyle_ref_path TEXT,
  makeup_ref_path TEXT,
  nail_ref_path TEXT,
  accessory_ref_paths TEXT[] DEFAULT '{}',
  custom_tag_refs JSONB DEFAULT '{}'::JSONB,

  -- Stage 1 identity profile (copied from originating shoot)
  identity_profile TEXT NOT NULL DEFAULT '',

  -- vision pre-pass output: structured styling description + exclusions
  styling_brief JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- generated output (storage paths)
  base_storage_path TEXT,
  base_4k_storage_path TEXT,
  fal_seed BIGINT,

  -- approval state machine
  status TEXT NOT NULL DEFAULT 'GENERATING' CHECK (status IN (
    'GENERATING',
    'AUTO_APPROVED',
    'PENDING_USER_APPROVAL',
    'USER_APPROVED',
    'USER_REJECTED',
    'FAILED'
  )),
  quality_gate_result JSONB DEFAULT '{}'::JSONB,
  attempt_number INT NOT NULL DEFAULT 1,
  failure_reason TEXT,

  -- library reuse metadata
  user_label TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for library queries (user's non-archived bases, newest first)
CREATE INDEX IF NOT EXISTS idx_character_bases_user
  ON character_bases(user_id, created_at DESC)
  WHERE is_archived = FALSE;

-- Index for cache lookups (approved, non-archived, by cache key)
CREATE INDEX IF NOT EXISTS idx_character_bases_cache
  ON character_bases(user_id, cache_key)
  WHERE status IN ('AUTO_APPROVED', 'USER_APPROVED') AND is_archived = FALSE;

-- =========================================================
-- 2. Extend shoots table
-- =========================================================
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS character_base_id UUID REFERENCES character_bases(id),
  ADD COLUMN IF NOT EXISTS base_lock_status TEXT,
  ADD COLUMN IF NOT EXISTS base_lock_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS base_lock_completed_at TIMESTAMPTZ;

-- =========================================================
-- 3. New shoot.status values (no constraint change needed if status is free text)
-- These are the new values the application will write:
--   'BASE_LOCKING'    — Stage 1.5 base generation in progress
--   'BASE_REVIEW'     — Waiting for user approval (borderline quality gate)
--   'BASE_REJECTED'   — User rejected all attempts; shoot is terminal
-- =========================================================

-- =========================================================
-- 4. Storage bucket: character-bases
-- Create this bucket manually in the Supabase dashboard:
--   Name: character-bases
--   Public: NO (private)
--   Allowed MIME types: image/*
--   Max upload size: 50MB
-- Then add the following RLS policy on the bucket:
--   "Service role full access" (already covered by service role key)
-- =========================================================

-- =========================================================
-- 5. generation_events new type values (informational; no schema change needed)
--   'base_locking'          — base generation started
--   'base_attempt'          — one attempt completed
--   'base_ready'            — auto-approved
--   'base_review_required'  — borderline, awaiting user
--   'base_rerolling'        — re-roll triggered
--   'base_approved'         — user approved
-- =========================================================
