#!/usr/bin/env node
/**
 * VPS PostgreSQL migration runner
 *
 * - Creates a _migrations table to track what has been applied
 * - Marks 001-019 as already applied (schema-vps.sql covers them)
 * - Applies any new .sql files from migrations/ in alphabetical order
 * - Skips failed migrations with a warning instead of stopping the deploy
 *
 * Usage: node scripts/migrate-vps.mjs
 */

import postgres from "postgres";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("No DATABASE_URL set — skipping VPS migrations.");
  process.exit(0);
}

// These were applied when the VPS was set up from schema-vps.sql
const SEEDED = [
  "001_character_bases",
  "002_forbidden_words",
  "003_app_config",
  "004_fal_url",
  "005_marketplace",
  "006_creator_showcase",
  "007_atomic_helpers",
  "008_storage_rls",
  "009_atomic_coupon",
  "010_rls_core_tables",
  "011_package_size_check",
  "012_per_package_prices",
  "013_template_images_notes",
  "014_shoot_zips",
  "015_template_ratings",
  "016_template_images_custom_name",
  "017_creator_storefront",
  "018_template_images_note_hidden",
  "019_shoots_shot_type",
  "020_payments_refund",
];

const db = postgres(DATABASE_URL, {
  max: 1,
  ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

async function main() {
  await db`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  for (const name of SEEDED) {
    await db`INSERT INTO _migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await db`SELECT name FROM _migrations`).map(r => r.name)
  );

  let ran = 0;
  for (const file of files) {
    const name = file.replace(".sql", "");
    if (applied.has(name)) continue;

    console.log(`  Applying ${file}...`);
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.unsafe(sql);
      await db`INSERT INTO _migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
      console.log(`  ✓ ${file}`);
      ran++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log(ran === 0 ? "  No new migrations." : `  ${ran} migration(s) applied.`);
  await db.end();
}

main().catch(err => {
  console.error("Migration error:", err.message);
  process.exit(0);
});
