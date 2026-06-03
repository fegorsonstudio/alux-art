// Run: node --env-file=.env.local scripts/migrate-gift-links.mjs
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "owdfoxglbxrqhgqbvkon";

if (!PAT) {
  console.error("SUPABASE_ACCESS_TOKEN is required. Run with: node --env-file=.env.local scripts/migrate-gift-links.mjs");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
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

console.log("Running gift_links migration against owdfoxglbxrqhgqbvkon...\n");

await run("gift_links table", `
  CREATE TABLE IF NOT EXISTS gift_links (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id        UUID NOT NULL REFERENCES templates(id),
    sender_user_id     UUID NOT NULL REFERENCES auth.users(id),
    sender_name        TEXT NOT NULL,
    custom_message     TEXT,
    package_size       INT NOT NULL DEFAULT 5,
    currency           TEXT NOT NULL DEFAULT 'NGN',
    is_claimed         BOOLEAN NOT NULL DEFAULT false,
    claimed_by_user_id UUID,
    claimed_at         TIMESTAMPTZ,
    shoot_id           UUID,
    paystack_reference TEXT,
    payment_status     TEXT NOT NULL DEFAULT 'pending',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
  );
`);

await run("gift_links indexes", `
  CREATE INDEX IF NOT EXISTS gift_links_template_id_idx ON gift_links(template_id);
  CREATE INDEX IF NOT EXISTS gift_links_sender_user_id_idx ON gift_links(sender_user_id);
  CREATE INDEX IF NOT EXISTS gift_links_payment_status_idx ON gift_links(payment_status);
`);

await run("gift_links RLS", `
  ALTER TABLE gift_links ENABLE ROW LEVEL SECURITY;
`);

await run("gift_links policies", `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gift_links' AND policyname='Senders can view own gifts') THEN
      CREATE POLICY "Senders can view own gifts" ON gift_links
        FOR SELECT USING (auth.uid() = sender_user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gift_links' AND policyname='Anyone can read paid gifts') THEN
      CREATE POLICY "Anyone can read paid gifts" ON gift_links
        FOR SELECT USING (payment_status = 'paid');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gift_links' AND policyname='Service role full access on gift_links') THEN
      CREATE POLICY "Service role full access on gift_links" ON gift_links
        FOR ALL USING (true);
    END IF;
  END $$;
`);

console.log("\n✅ Gift links migration complete.");
console.log("Run this script against production once to create the table.");
