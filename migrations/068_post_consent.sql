-- Permission to show a customer's photographs on our own page.
--
-- Asked once, after the finished photo lands, because that is the only moment
-- the answer means anything. Recorded here rather than on the shoot so that a
-- customer's decision survives the seven-day retention sweep that clears the
-- files themselves: the answer outlives the pictures, and must, or we would
-- ask the same person again every time.
CREATE TABLE IF NOT EXISTS post_consent (
  shoot_id      uuid PRIMARY KEY REFERENCES shoots(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- asked -> granted | refused | withdrawn
  -- No reply stays 'asked' forever, which is the honest reading: silence is
  -- not consent, and an unanswered ask must never become a yes by timeout.
  status        text NOT NULL DEFAULT 'asked',

  -- The three-week hold the customer was promised. Set when they say yes, and
  -- it is what the carousel queue reads — never the decision date, so nobody
  -- can shorten the promise by accident.
  postable_from timestamptz,

  asked_at      timestamptz NOT NULL DEFAULT NOW(),
  decided_at    timestamptz,
  -- Which chat the answer came through, for tracing a dispute later.
  channel       text,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

-- The only question the carousel queue ever asks: what may we post today.
CREATE INDEX IF NOT EXISTS idx_post_consent_postable
  ON post_consent (postable_from)
  WHERE status = 'granted';

-- And the only question the bot asks: has this person already been asked?
CREATE INDEX IF NOT EXISTS idx_post_consent_user ON post_consent (user_id);
