#!/usr/bin/env node
/**
 * set-per-image-price.mjs — change the per-image price on the studio's own
 * per-image templates.
 *
 *   node scripts/set-per-image-price.mjs --to 2000            # dry run
 *   node scripts/set-per-image-price.mjs --to 2000 --apply
 *
 * Only two categories charge per uploaded photo — photo_upgrade and
 * asset_extract (see `perImagePricing` in the marketplace book route). Every
 * other template sells a shoot package at its own price and is left alone; a
 * portrait template at ₦3,500 an image would be given a pay CUT by this.
 *
 * IT REFUSES TO TOUCH A RESALE. A creator who imported our template sets their
 * own price and keeps the margin, so rewriting it would be reaching into someone
 * else's shop. `source_template_id` marks those, and they are skipped and listed
 * rather than silently included — there is one today, an import of the Gear
 * Equalizer, and it must stay the reseller's decision.
 *
 * Prices scale from the 1-image price so the 5- and 10-image tiers keep their
 * existing shape instead of being retyped by hand.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PER_IMAGE_CATEGORIES = ["photo_upgrade", "asset_extract"];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const toArg = args.includes("--to") ? Number(args[args.indexOf("--to") + 1]) : NaN;
if (!Number.isInteger(toArg) || toArg <= 0) {
  console.error("usage: --to <naira per image> [--apply]");
  process.exit(2);
}

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = postgres(env.DATABASE_URL, { ssl: false });

const naira = (n) => "₦" + Number(n ?? 0).toLocaleString();

async function main() {
  const rows = await sql`
    SELECT t.id, t.title, t.category, t.price_1_ngn, t.price_5_ngn, t.price_ngn,
           t.source_template_id, p.email
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    LEFT JOIN profiles p ON p.id = c.user_id
    WHERE t.category = ANY(${PER_IMAGE_CATEGORIES})
    ORDER BY t.category, t.title`;

  const resales = rows.filter(r => r.source_template_id);
  const targets = rows.filter(r => !r.source_template_id);

  if (resales.length) {
    console.log("SKIPPED — resale listings, the reseller's price to set:");
    for (const r of resales) console.log(`   ${String(r.email).padEnd(30)} ${r.title.slice(0, 40)}  (${naira(r.price_1_ngn)}/image)`);
    console.log();
  }

  if (!targets.length) { console.log("nothing to change"); return; }

  console.log(`PER-IMAGE PRICE -> ${naira(toArg)}\n`);
  const plan = [];
  for (const r of targets) {
    // Scale the tiers off the 1-image price so their existing shape survives.
    const factor = r.price_1_ngn ? toArg / Number(r.price_1_ngn) : null;
    if (!factor) { console.log(`   SKIP (no 1-image price): ${r.title}`); continue; }
    const next = {
      price_1_ngn: toArg,
      price_5_ngn: r.price_5_ngn == null ? null : Math.round(Number(r.price_5_ngn) * factor),
      price_ngn: r.price_ngn == null ? null : Math.round(Number(r.price_ngn) * factor),
    };
    plan.push({ r, next });
    console.log(`   ${r.category.padEnd(15)} ${r.title.slice(0, 38)}`);
    console.log(`      1 image  ${naira(r.price_1_ngn).padStart(9)}  ->  ${naira(next.price_1_ngn)}`);
    console.log(`      5 images ${naira(r.price_5_ngn).padStart(9)}  ->  ${naira(next.price_5_ngn)}`);
    console.log(`      10 imgs  ${naira(r.price_ngn).padStart(9)}  ->  ${naira(next.price_ngn)}`);
  }

  if (!APPLY) { console.log("\ndry run. add --apply to write."); return; }

  for (const { r, next } of plan) {
    await sql`
      UPDATE templates
      SET price_1_ngn = ${next.price_1_ngn},
          price_5_ngn = ${next.price_5_ngn},
          price_ngn   = ${next.price_ngn},
          updated_at  = NOW()
      WHERE id = ${r.id} AND source_template_id IS NULL`;
  }

  const after = await sql`
    SELECT title, price_1_ngn, price_5_ngn, price_ngn FROM templates
    WHERE id = ANY(${plan.map(p => p.r.id)}) ORDER BY title`;
  console.log("\nwritten. in DB now:");
  for (const a of after) console.log(`   ${naira(a.price_1_ngn).padStart(8)} / ${naira(a.price_5_ngn).padStart(9)} / ${naira(a.price_ngn).padStart(9)}   ${a.title.slice(0, 38)}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
