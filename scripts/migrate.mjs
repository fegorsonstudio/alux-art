const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "owdfoxglbxrqhgqbvkon";

if (!PAT) {
  console.error("SUPABASE_ACCESS_TOKEN is required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/migrate.mjs`.");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
  return data;
}

async function run(label, sql) {
  try {
    await query(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label}:`, e.message);
  }
}

console.log("Running migration against owdfoxglbxrqhgqbvkon...\n");

// ── profiles ────────────────────────────────────────────────────────────────
await run("profiles table", `
  CREATE TABLE IF NOT EXISTS profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name  TEXT,
    currency      TEXT NOT NULL DEFAULT 'NGN',
    region        TEXT,
    banned        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── identity_images ──────────────────────────────────────────────────────────
await run("identity_images table", `
  CREATE TABLE IF NOT EXISTS identity_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    size            BIGINT NOT NULL,
    storage_bucket  TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    fingerprint     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
  );
`);

await run("inspiration_images table", `
  CREATE TABLE IF NOT EXISTS inspiration_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    size            BIGINT NOT NULL,
    storage_bucket  TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
  );
`);

// ── shoots ───────────────────────────────────────────────────────────────────
await run("shoots table", `
  CREATE TABLE IF NOT EXISTS shoots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_email         TEXT NOT NULL,
    mode                TEXT NOT NULL DEFAULT 'fast',
    aspect_ratio        TEXT NOT NULL DEFAULT '4:5',
    currency            TEXT NOT NULL DEFAULT 'NGN',
    package_size        INTEGER NOT NULL DEFAULT 10 CHECK (package_size IN (5, 10)),
    credits_required    INTEGER NOT NULL DEFAULT 10,
    credits_reserved    INTEGER NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'DRAFT',
    progress            INTEGER NOT NULL DEFAULT 0,
    pipeline_stage      TEXT,
    quote               JSONB,
    identity_profile    TEXT,
    shoot_brief         TEXT,
    zip_status          TEXT,
    zip_storage_bucket  TEXT,
    zip_storage_path    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
  );
`);

await run("shoots package/retention columns", `
  ALTER TABLE shoots ADD COLUMN IF NOT EXISTS package_size INTEGER NOT NULL DEFAULT 10 CHECK (package_size IN (5, 10));
  ALTER TABLE shoots ADD COLUMN IF NOT EXISTS credits_required INTEGER NOT NULL DEFAULT 10;
  ALTER TABLE shoots ADD COLUMN IF NOT EXISTS credits_reserved INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shoots ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
`);

// ── shoot_images ─────────────────────────────────────────────────────────────
await run("shoot_images table", `
  CREATE TABLE IF NOT EXISTS shoot_images (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shoot_id                  UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slot                      INTEGER NOT NULL,
    kind                      TEXT NOT NULL DEFAULT 'portrait',
    status                    TEXT NOT NULL DEFAULT 'PENDING',
    stage                     TEXT,
    provider                  TEXT,
    provider_error            TEXT,
    configured_model          TEXT,
    api_model                 TEXT,
    fallback_model            TEXT,
    preview_storage_bucket    TEXT,
    preview_storage_path      TEXT,
    download_storage_bucket   TEXT,
    download_storage_path     TEXT,
    instagram_storage_bucket  TEXT,
    instagram_storage_path    TEXT,
    original_dimensions       JSONB,
    final_dimensions          JSONB,
    target_dimensions         JSONB,
    upscaled                  BOOLEAN DEFAULT FALSE,
    file_size                 BIGINT,
    preview_file_size         BIGINT,
    instagram_file_size       BIGINT,
    retry_count               INTEGER NOT NULL DEFAULT 0,
    last_retry_at             TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await run("shoot_images retry columns", `
  ALTER TABLE shoot_images ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shoot_images ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;
`);

// ── shoot_references ─────────────────────────────────────────────────────────
await run("shoot_references table", `
  CREATE TABLE IF NOT EXISTS shoot_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shoot_id        UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL,
    tag             TEXT,
    custom_name     TEXT,
    note            TEXT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    size            BIGINT NOT NULL,
    storage_bucket  TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── payments ─────────────────────────────────────────────────────────────────
await run("payments table", `
  CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shoot_id            UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending',
    currency            TEXT NOT NULL,
    amount              BIGINT NOT NULL,
    provider            TEXT NOT NULL DEFAULT 'paystack',
    provider_reference  TEXT,
    paid_at             TIMESTAMPTZ,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await run("credit_balances table", `
  CREATE TABLE IF NOT EXISTS credit_balances (
    user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_balance  INTEGER NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await run("credit_transactions table", `
  CREATE TABLE IF NOT EXISTS credit_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shoot_id            UUID REFERENCES shoots(id) ON DELETE SET NULL,
    image_id            UUID REFERENCES shoot_images(id) ON DELETE SET NULL,
    amount              INTEGER NOT NULL,
    reason              TEXT NOT NULL,
    provider            TEXT,
    provider_reference  TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── generation_events ────────────────────────────────────────────────────────
await run("generation_events table", `
  CREATE TABLE IF NOT EXISTS generation_events (
    id          BIGSERIAL PRIMARY KEY,
    shoot_id    UUID NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── download_logs ────────────────────────────────────────────────────────────
await run("download_logs table", `
  CREATE TABLE IF NOT EXISTS download_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shoot_id    UUID REFERENCES shoots(id) ON DELETE SET NULL,
    image_id    UUID,
    type        TEXT NOT NULL,
    bytes       BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── pricing_configs ──────────────────────────────────────────────────────────
await run("pricing_configs table", `
  CREATE TABLE IF NOT EXISTS pricing_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ngn         INTEGER NOT NULL DEFAULT 15000,
    usd         INTEGER NOT NULL DEFAULT 10,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

// ── indexes ──────────────────────────────────────────────────────────────────
await run("indexes", `
  CREATE INDEX IF NOT EXISTS idx_shoots_user_id ON shoots(user_id);
  CREATE INDEX IF NOT EXISTS idx_shoot_images_shoot_id ON shoot_images(shoot_id);
  CREATE INDEX IF NOT EXISTS idx_shoot_references_shoot_id ON shoot_references(shoot_id);
  CREATE INDEX IF NOT EXISTS idx_generation_events_shoot_id ON generation_events(shoot_id);
  CREATE INDEX IF NOT EXISTS idx_identity_images_user_id ON identity_images(user_id);
  CREATE INDEX IF NOT EXISTS idx_inspiration_images_user_id ON inspiration_images(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_shoot_id ON payments(shoot_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider_reference) WHERE provider_reference IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_credit_transactions_shoot_id ON credit_transactions(shoot_id);
  CREATE INDEX IF NOT EXISTS idx_shoots_expires_at ON shoots(expires_at);
`);

// ── RLS ──────────────────────────────────────────────────────────────────────
await run("enable RLS", `
  ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE identity_images   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE inspiration_images ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shoots            ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shoot_images      ENABLE ROW LEVEL SECURITY;
  ALTER TABLE shoot_references  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE download_logs     ENABLE ROW LEVEL SECURITY;
  ALTER TABLE pricing_configs   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE credit_balances   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
`);

// ── RLS policies ─────────────────────────────────────────────────────────────
await run("profiles policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can view own profile') THEN
      CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile') THEN
      CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert own profile') THEN
      CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
  END $$;
`);

await run("shoots policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shoots' AND policyname='Users can manage own shoots') THEN
      CREATE POLICY "Users can manage own shoots" ON shoots FOR ALL USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("shoot_images policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shoot_images' AND policyname='Users can manage own shoot images') THEN
      CREATE POLICY "Users can manage own shoot images" ON shoot_images FOR ALL USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("shoot_references policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shoot_references' AND policyname='Users can manage own shoot references') THEN
      CREATE POLICY "Users can manage own shoot references" ON shoot_references FOR ALL USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("identity_images policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='identity_images' AND policyname='Users can manage own identity images') THEN
      CREATE POLICY "Users can manage own identity images" ON identity_images FOR ALL USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("inspiration_images policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inspiration_images' AND policyname='Users can manage own inspiration images') THEN
      CREATE POLICY "Users can manage own inspiration images" ON inspiration_images FOR ALL USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("payments policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='Users can view own payments') THEN
      CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("credit policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_balances' AND policyname='Users can view own credit balance') THEN
      CREATE POLICY "Users can view own credit balance" ON credit_balances FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_transactions' AND policyname='Users can view own credit transactions') THEN
      CREATE POLICY "Users can view own credit transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("generation_events policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_events' AND policyname='Users can view own events') THEN
      CREATE POLICY "Users can view own events" ON generation_events FOR SELECT USING (auth.uid() = user_id);
    END IF;
  END $$;
`);

await run("pricing_configs policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pricing_configs' AND policyname='Anyone can read pricing') THEN
      CREATE POLICY "Anyone can read pricing" ON pricing_configs FOR SELECT USING (true);
    END IF;
  END $$;
`);

// ── service role bypass ──────────────────────────────────────────────────────
// Service role bypasses RLS — needed for the generation worker
await run("service role can write generation_events", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_events' AND policyname='Service role can insert events') THEN
      CREATE POLICY "Service role can insert events" ON generation_events FOR INSERT WITH CHECK (true);
    END IF;
  END $$;
`);

await run("service role can write shoot_images", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shoot_images' AND policyname='Service role can update images') THEN
      CREATE POLICY "Service role can update images" ON shoot_images FOR UPDATE USING (true);
    END IF;
  END $$;
`);

await run("service role can write shoots", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shoots' AND policyname='Service role can update shoots') THEN
      CREATE POLICY "Service role can update shoots" ON shoots FOR UPDATE USING (true);
    END IF;
  END $$;
`);

// ── seed default pricing ─────────────────────────────────────────────────────
await run("seed default pricing", `
  INSERT INTO pricing_configs (ngn, usd, updated_at)
  SELECT 15000, 10, NOW()
  WHERE NOT EXISTS (SELECT 1 FROM pricing_configs);
`);

// ── auto-create profile on signup ────────────────────────────────────────────
await run("profile auto-create trigger", `
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.profiles (id, display_name, currency, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'NGN',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$;
`);

await run("profile trigger on auth.users", `
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`);

console.log("\n✅ Migration complete.");
