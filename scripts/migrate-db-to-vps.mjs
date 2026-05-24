#!/usr/bin/env node
/**
 * Supabase Postgres → VPS PostgreSQL data migration
 *
 * Usage:
 *   node scripts/migrate-db-to-vps.mjs
 *
 * Prerequisites on the VPS:
 *   1. Run all migrations: node scripts/migrate.mjs
 *   2. Set these env vars before running (or they'll fall back to .env.local):
 *      SUPABASE_DB_URL   — Supabase direct connection string (not pooler)
 *                          Format: postgresql://postgres.<project>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
 *                          Get from: Supabase dashboard > Project Settings > Database > Connection String > URI
 *      DATABASE_URL      — VPS PostgreSQL connection string
 *                          Default: postgresql://aluxart:aluxart_db_2026@localhost:5432/aluxart
 *
 * What it does:
 *   - Copies all rows from every table in the priority order below
 *   - Uses INSERT ... ON CONFLICT DO NOTHING (safe to re-run)
 *   - Skips rows that already exist on VPS
 *   - Reports row counts before and after each table
 */

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://aluxart:aluxart_db_2026@localhost:5432/aluxart";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Run: source .env.local && node scripts/migrate-db-to-vps.mjs");
  process.exit(1);
}

// ── Tables to migrate (dependency order — parents before children) ──────────
const TABLES = [
  "profiles",
  "creators",
  "templates",
  "template_images",
  "template_ratings",
  "template_purchases",
  "character_bases",
  "shoots",
  "shoot_references",
  "shoot_images",
  "generation_events",
  "identity_images",
  "inspiration_images",
  "app_config",
  "pricing_configs",
  "coupons",
  "coupon_uses",
  "forbidden_words",
];

// Columns to exclude per table (generated columns, Supabase internals, etc.)
const EXCLUDE_COLUMNS = {};

// ── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const vpsDb = postgres(DATABASE_URL, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 30,
  ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSupabaseCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Supabase count(${table}): ${error.message}`);
  return count ?? 0;
}

async function getVpsCount(table) {
  const [{ count }] = await vpsDb`SELECT COUNT(*) as count FROM ${vpsDb(table)}`;
  return Number(count);
}

async function migrateTable(table) {
  console.log(`\n📋 ${table}`);

  // Count source rows
  let sourceCount;
  try {
    sourceCount = await getSupabaseCount(table);
  } catch (err) {
    console.log(`   ⚠️  Supabase: ${err.message} — skipping`);
    return { table, skipped: true };
  }
  console.log(`   Supabase rows: ${sourceCount}`);

  if (sourceCount === 0) {
    console.log("   Nothing to migrate");
    return { table, sourceCount: 0, inserted: 0, skipped: false };
  }

  const beforeCount = await getVpsCount(table);
  console.log(`   VPS rows before: ${beforeCount}`);

  // Fetch all rows from Supabase in pages of 1000
  const PAGE = 1000;
  let inserted = 0;
  let page = 0;

  while (true) {
    const from = page * PAGE;
    const to = from + PAGE - 1;

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to)
      .order("id");

    if (error) throw new Error(`Supabase fetch(${table}, page ${page}): ${error.message}`);
    if (!data || data.length === 0) break;

    // Filter out excluded columns
    const excluded = EXCLUDE_COLUMNS[table] ?? [];
    const rows = excluded.length
      ? data.map((row) => {
          const r = { ...row };
          excluded.forEach((c) => delete r[c]);
          return r;
        })
      : data;

    // Insert into VPS — ON CONFLICT DO NOTHING is safe to re-run
    try {
      await vpsDb`
        INSERT INTO ${vpsDb(table)} ${vpsDb(rows)}
        ON CONFLICT DO NOTHING
      `;
      inserted += rows.length;
    } catch (err) {
      console.error(`   ❌ Insert failed on page ${page}:`, err.message);
      // Continue with next page
    }

    process.stdout.write(`\r   Inserted: ${inserted}/${sourceCount}`);

    if (data.length < PAGE) break;
    page++;
  }

  console.log(); // newline after progress
  const afterCount = await getVpsCount(table);
  console.log(`   VPS rows after: ${afterCount} (+${afterCount - beforeCount} new)`);

  return { table, sourceCount, inserted, vpsAfter: afterCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Alux Art: Supabase → VPS PostgreSQL data migration");
  console.log(`   Source: ${SUPABASE_URL}`);
  console.log(`   Target: ${DATABASE_URL.replace(/:([^:@]+)@/, ":****@")}`);
  console.log();

  // Verify VPS connection
  try {
    await vpsDb`SELECT 1`;
    console.log("✅ VPS DB connection OK");
  } catch (err) {
    console.error("❌ VPS DB connection failed:", err.message);
    console.error("   Make sure the VPS PostgreSQL is running and DATABASE_URL is set correctly.");
    process.exit(1);
  }

  const results = [];

  for (const table of TABLES) {
    try {
      const result = await migrateTable(table);
      results.push(result);
    } catch (err) {
      console.error(`\n❌ ${table}: ${err.message}`);
      results.push({ table, error: err.message });
    }
  }

  console.log("\n\n📊 Migration summary:");
  console.log("─".repeat(60));
  for (const r of results) {
    if (r.skipped) {
      console.log(`  ${r.table.padEnd(30)} SKIPPED (table may not exist in Supabase)`);
    } else if (r.error) {
      console.log(`  ${r.table.padEnd(30)} ERROR: ${r.error}`);
    } else {
      console.log(`  ${r.table.padEnd(30)} ${String(r.sourceCount ?? 0).padStart(6)} source → ${String(r.vpsAfter ?? 0).padStart(6)} VPS`);
    }
  }
  console.log("─".repeat(60));
  console.log("\n✅ Migration complete. Verify counts above match Supabase.");
  console.log("   If any table shows fewer VPS rows, re-run this script — it is idempotent.");

  await vpsDb.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
