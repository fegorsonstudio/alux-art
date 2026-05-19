-- Migration 010: Enable RLS on all tables that were created without it.
-- All server-side mutations use the service role key which bypasses RLS automatically.
-- These policies only gate direct client/anon queries.

-- ── character_bases (created in 001 without RLS) ──────────────────────────────
ALTER TABLE character_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own character bases"
  ON character_bases FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user manages own character bases"
  ON character_bases FOR ALL USING (auth.uid() = user_id);

-- ── profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "user updates own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── shoots ────────────────────────────────────────────────────────────────────
ALTER TABLE shoots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own shoots"
  ON shoots FOR SELECT USING (auth.uid() = user_id);

-- ── shoot_images ──────────────────────────────────────────────────────────────
ALTER TABLE shoot_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own shoot images"
  ON shoot_images FOR SELECT USING (auth.uid() = user_id);

-- ── shoot_references ──────────────────────────────────────────────────────────
ALTER TABLE shoot_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own shoot references"
  ON shoot_references FOR SELECT USING (auth.uid() = user_id);

-- ── payments ──────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own payments"
  ON payments FOR SELECT USING (auth.uid() = user_id);

-- ── generation_events ─────────────────────────────────────────────────────────
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own generation events"
  ON generation_events FOR SELECT USING (auth.uid() = user_id);
