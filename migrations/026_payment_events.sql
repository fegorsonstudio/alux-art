-- ============================================================
-- Migration 026: Append-Only Payment Events Ledger
-- ============================================================
-- 
-- Purpose: Shift from mutable payment status to immutable event log
-- Benefits: Audit trail, dedup via unique index, replay-able, compliant
--
-- The payment_events table is the source of truth. 
-- The payments table becomes a materialized summary.

CREATE TABLE IF NOT EXISTS payment_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Linking to Paystack transaction
  transaction_ref    VARCHAR(255) NOT NULL,       -- Paystack reference
  event_type         VARCHAR(50)  NOT NULL,       -- charge.success, charge.failed, etc.
  
  -- Immutable record: full webhook payload
  raw_payload        JSONB        NOT NULL,       -- Complete event from Paystack
  processed_by       VARCHAR(100),                -- Route/processor name
  idempotency_key    VARCHAR(512),                -- Signature hash for dedup
  
  -- Timestamps
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Index for transaction lookups ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_ref
  ON payment_events(transaction_ref);

-- ── Index for event type filtering ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type
  ON payment_events(event_type);

-- ── Index for time-based queries ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at
  ON payment_events(created_at DESC);

-- ── Unique constraint: prevent duplicate processing ────────────────
-- This is the idempotency enforcement. Same webhook body (same idempotency_key)
-- cannot be inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_idempotency
  ON payment_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── Link payments table to event chain ──────────────────────────────
-- Optional: allows tracing payment lifecycle through events
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS first_event_id UUID REFERENCES payment_events(id),
  ADD COLUMN IF NOT EXISTS latest_event_id UUID REFERENCES payment_events(id);

-- ── Backward-compatibility view: latest payment status ──────────────
-- Useful for dashboards and queries that expect a single "current" state
CREATE OR REPLACE VIEW vw_payment_latest_status AS
SELECT DISTINCT ON (pe.transaction_ref)
  pe.transaction_ref,
  pe.event_type,
  pe.created_at as event_time,
  pe.raw_payload,
  p.id as payment_id,
  p.user_id,
  p.shoot_id,
  p.status
FROM payment_events pe
LEFT JOIN payments p ON pe.transaction_ref = p.provider_reference
ORDER BY pe.transaction_ref, pe.created_at DESC;
