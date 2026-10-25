#!/usr/bin/env node
/**
 * Creates (or updates) the "Character Sheet — from your photos" marketplace
 * template (owner, 2026-10-25): the buyer sends TWO photos — their whole body
 * from the front and their face from the front — and those two ARE the sheet;
 * only the view from behind is generated, without the head
 * (lib/drama/sheet-compose.ts, switched on by templates.worker_options.sheet = 'real').
 *
 *   node --env-file=.env.local scripts/create-character-sheet-real-template.mjs [price_ngn]
 *
 * Same price and settings as the generated Character Sheet (found by
 * category); shares its cover until the owner gives it its own.
 */
import postgres from "postgres";
import crypto from "node:crypto";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const TITLE = "Character Sheet — from your photos";
const DESCRIPTION =
  "A character sheet built from your own photographs. Send exactly two photos: your whole body from the front, head to " +
  "feet, and your face from the front. Those two go on the sheet exactly as you shot them — the face on the full-length " +
  "view is blanked, so the portrait is the only face — and the only thing we generate is the view from behind, without " +
  "the head, in your outfit. Three panels on one grey studio backdrop, 16:9. Shoot straight on, in good light, in the " +
  "clothes your character wears.";
const PRICE_NGN = Number.parseInt(process.argv[2] ?? "", 10) || 2000;

async function main() {
  const [base] = await sql`SELECT * FROM templates WHERE category = 'character_sheet' AND (worker_options IS NULL OR worker_options->>'sheet' IS DISTINCT FROM 'real') ORDER BY created_at LIMIT 1`;
  if (!base) { console.error("make the generated Character Sheet template first (scripts/create-character-sheet-template.mjs)"); process.exit(1); }
  const [existing] = await sql`SELECT id FROM templates WHERE category = 'character_sheet' AND worker_options->>'sheet' = 'real' ORDER BY created_at LIMIT 1`;
  let id;
  if (existing) {
    id = existing.id;
    await sql`UPDATE templates SET title = ${TITLE}, description = ${DESCRIPTION}, price_1_ngn = ${PRICE_NGN}, price_5_ngn = NULL, price_ngn = 0,
        package_size = 1, aspect_ratio = '16:9', status = 'published', is_private = false, marketplace_hidden = false, platform_fee_exempt = true,
        worker_options = ${sql.json({ sheet: "real" })}, updated_at = NOW() WHERE id = ${id}`;
    console.log("updated the existing template");
  } else {
    id = crypto.randomUUID();
    await sql`INSERT INTO templates
        (id, creator_id, title, description, category, status, is_private, marketplace_hidden, platform_fee_exempt,
         package_size, price_ngn, price_1_ngn, price_5_ngn, aspect_ratio, cover_bucket, cover_storage_path, worker_options, created_at, updated_at)
        VALUES (${id}, ${base.creator_id}, ${TITLE}, ${DESCRIPTION}, 'character_sheet', 'published', false, false, true,
                1, 0, ${PRICE_NGN}, NULL, '16:9', ${base.cover_bucket}, ${base.cover_storage_path}, ${sql.json({ sheet: "real" })}, NOW(), NOW())`;
    console.log("created the template");
  }
  const [row] = await sql`SELECT id, title, status, price_1_ngn, worker_options FROM templates WHERE id = ${id}`;
  console.log(row);
  console.log(`\nbook it at  https://aluxartandframes.shop/marketplace/${id}`);
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
