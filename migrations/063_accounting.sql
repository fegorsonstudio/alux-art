-- Accounting: what we spend, and what the AI actually costs to run.
--
-- Nothing here touches the tables that already hold money. This migration only
-- ADDS places to record the two things nobody was recording at all — expenses,
-- and the cost of generating an image — so the accounting can read everything
-- else without any risk of corrupting the thing it is trying to measure.

-- ── What we spend, entered by hand ──────────────────────────────────────────
-- A recurring cost is stored ONCE and projected across the months it covers,
-- rather than re-entered monthly. A forgotten month would silently inflate
-- profit, and a profit figure that is wrong in the flattering direction is
-- worse than no profit figure at all.
CREATE TABLE IF NOT EXISTS expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incurred_on    date NOT NULL,
  category       text NOT NULL,
  vendor         text,
  description    text,
  amount_ngn     bigint NOT NULL CHECK (amount_ngn >= 0),
  recurs_monthly boolean NOT NULL DEFAULT false,
  -- NULL means "still running". Set it when the subscription ends, and the
  -- projection stops there rather than billing you for ever.
  recurs_until   date,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_incurred_idx ON expenses (incurred_on DESC);

-- ── What each model costs to run ────────────────────────────────────────────
-- fal publishes no billing API, so cost is computed from the model recorded on
-- every generated image. Editable in the admin UI because fal changes prices
-- and a hard-coded rate would rot silently.
CREATE TABLE IF NOT EXISTS fal_rate_card (
  model         text PRIMARY KEY,
  usd_per_image numeric(10,5) NOT NULL CHECK (usd_per_image >= 0),
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

-- ── The real invoice, so the estimate can be checked ────────────────────────
-- An estimate nobody reconciles is a guess with a spreadsheet around it.
CREATE TABLE IF NOT EXISTS fal_invoices (
  month      date PRIMARY KEY,           -- always the first of the month
  usd_actual numeric(12,2) NOT NULL CHECK (usd_actual >= 0),
  ngn_rate   numeric(12,2) NOT NULL CHECK (ngn_rate > 0),
  note       text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Seeded with the models that have actually run in production. The free ones
-- are seeded at zero deliberately: they then show up in the report as costing
-- nothing, rather than as an unpriced model somebody has to investigate.
INSERT INTO fal_rate_card (model, usd_per_image, note) VALUES
  ('fal-ai/nano-banana-2/edit',          0.03900, 'Primary relight/edit model'),
  ('fal-ai/bytedance/seedream/v4/edit',  0.03000, 'Used Jul 2026'),
  ('fal-ai/qwen-image-edit-plus',        0.03000, 'Used Jul 2026'),
  ('openai/gpt-image-2/edit',            0.04000, 'Used May 2026'),
  ('sharp+ffmpeg',                       0.00000, 'Rendered on our own VPS - no per-image cost'),
  ('local-mock',                         0.00000, 'Development only'),
  ('pollinations-free',                  0.00000, 'Free tier'),
  ('prompt-only',                        0.00000, 'Text generation, not an image')
ON CONFLICT (model) DO NOTHING;
