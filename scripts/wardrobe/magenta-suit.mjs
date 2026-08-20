#!/usr/bin/env node
/**
 * magenta-suit.mjs — build one template from a hand-picked asset folder.
 *
 *   # here, uploads the asset files to R2 and writes the manifest
 *   node --env-file=.env.local scripts/wardrobe/magenta-suit.mjs --upload
 *
 *   # on the VPS, writes the template (the database is localhost-only there)
 *   node --env-file=.env.local scripts/wardrobe/magenta-suit.mjs --template
 *
 * The same two-phase split as build.mjs, and the same conventions: assets land
 * under the creator's owner id in template-images, the template is created as
 * status='draft' so nothing reaches the marketplace until it is published by
 * hand, and accessories are POOLED with the existing library rather than
 * limited to this folder — a buyer picking this suit should get every
 * compatible shoe, nail and backdrop the studio owns, which is the standing
 * rule from the wardrobe build.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, "magenta-suit-manifest.json");
const GENDER_MAP = join(__dirname, "gender-map.json");
const TEMPLATE_ID = process.env.MAGENTA_TEMPLATE_ID || "06cae1e1-9a2c-4a77-957d-b0101c92307c";
const SRC = process.env.MAGENTA_SRC || "C:/Users/FUJITSU/Desktop/temp";

const args = process.argv.slice(2);
const DO_UPLOAD = args.includes("--upload");
const DO_TEMPLATE = args.includes("--template");
const REBUILD = args.includes("--rebuild");

const CREATOR_ID = "ae32d95e-85f5-4c8d-bcbb-5446153314f8";   // Fegorson Studio
const OWNER_ID = "d80f9e08-014e-48b7-8545-b37652059605";
const BUCKET = "template-images";
const PRICING = { price_1_ngn: 3500, price_5_ngn: 15000, price_ngn: 25000 };
const SHOOT = { aspect_ratio: "4:5", shoot_mode: "advanced", package_size: 10 };

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/**
 * The five assets, named by what a buyer sees rather than by filename.
 *
 * The watch in the jewellery sheet is a recognisable branded model. It is
 * described by its FORM (gold, fluted bezel, integrated bracelet) and never by
 * brand name, because this text ends up in marketing copy and in prompts.
 */
const ASSETS = [
  { match: /outfit-deep-magenta/i, kind: "outfit", type: "outfit", label: "Outfit",
    name: "Magenta Waistcoat and Black Wide-Leg Trousers" },
  { match: /--shoes/i,             kind: "shoes",  type: "shoes",  label: "Shoes",
    name: "Chocolate Leather Pointed Pumps" },
  { match: /--jewellery/i,         kind: "jewellery", type: "accessory", label: "Jewellery",
    name: "Gold Watch, Bangle Stack and Band Ring" },
  { match: /--nails/i,             kind: "nails",  type: "nails",  label: "Nails",
    name: "Dark Chrome Cat-Eye Stiletto Nails" },
  { match: /lighting_color_palette/i, kind: "backdrop", type: "backdrop", label: "Backdrop",
    name: "Water Caustics on Dark Studio Walls" },
];

function resolveFiles() {
  const files = readdirSync(SRC);
  return ASSETS.map(a => {
    const file = files.find(f => a.match.test(f));
    if (!file) throw new Error(`no file in ${SRC} matched ${a.kind}`);
    return { ...a, file };
  });
}

// ── Phase 1: upload ──────────────────────────────────────────────────────────

async function upload() {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { ownerId: OWNER_ID, uploads: {} };

  for (const a of resolveFiles()) {
    const body = readFileSync(join(SRC, a.file));
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    const prev = manifest.uploads[a.kind];
    if (prev?.hash === hash) { log(`· unchanged ${a.kind}`); continue; }

    // Re-upload an edited asset to the SAME key, so a template already pointing
    // at it updates instead of breaking.
    const storagePath = prev?.storagePath ?? `${OWNER_ID}/${randomUUID()}-${a.file}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: storagePath, Body: body,
      ContentType: a.file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    }));
    manifest.uploads[a.kind] = { storagePath, bucket: BUCKET, name: a.name, type: a.type, label: a.label, hash };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    log(`✓ uploaded ${a.kind}  ${a.file}`);
  }
  log(`manifest: ${MANIFEST}`);
}

// ── Phase 2: write the template ──────────────────────────────────────────────

const TITLE = "The Magenta Boardroom";
const DESCRIPTION =
  "A tailored magenta waistcoat and black wide-leg trousers, shot against water-light " +
  "on a dark studio wall. Ten frames that move from full length to close, built for " +
  "the profile picture, the speaker card and the press page at once. Choose your " +
  "shoes, nails, jewellery and backdrop; your own face is preserved in every frame.";

/** Groups worth pooling into a tailored-suit template. */
const POOL_TYPES = new Set(["shoes", "nails", "accessory", "hairstyle", "props"]);
const NEVER_POOL = new Set(["scrubs", "sash", "outfit"]);

/**
 * Only pool from these template categories.
 *
 * An earlier build excluded by GROUP type alone, so a nursing induction
 * template contributed its stethoscope, scrub cap, certificate scroll and
 * "Giant RN Letters" to a boardroom suit. Occasion templates own props that
 * only make sense at their own occasion, so the whitelist is by SOURCE
 * CATEGORY and anything new is excluded until it is added here deliberately.
 */
const POOL_FROM_CATEGORIES = new Set(["portrait", "editorial", "corporate", "other"]);

/** This template is womenswear, so it takes women's and unisex assets only.
 *  Gender comes from gender-map.json (see classify-gender.mjs) because the
 *  option JSON itself carries no gender field. */
const TEMPLATE_GENDER = "women";

/** Assets that are not wearable items at all and should never have been offered
 *  as a buyer choice. Matched on the option name. */
const JUNK_NAMES = new Set(["White display forms", "Hand accessories"]);

/**
 * Extra outfits offered alongside the magenta suit.
 *
 * The booking page only renders a picker once a single-select group has TWO or
 * more options (CheckoutPanel, `pickableGroups`), so a one-outfit template
 * applies its outfit silently and the buyer never sees it listed. Rather than
 * change that shared component for every template, this template carries real
 * alternatives — and they are named explicitly, not pooled by category, so a
 * gown or a set of scrubs can never wander into a boardroom template.
 *
 * The magenta suit is inserted first and stays the default.
 */
const OUTFIT_ALLOW = new Set([
  "Double-breasted tailored pantsuit",
  "Tailored pantsuit.",
  "Maroon Skirt Suit",
  "Olive Suit",
  "Pinstripe Double Breasted Suit",
  "Minimalist, longsleeve midi sheath dress",
]);

async function template() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { ssl: false });

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const u = manifest.uploads;
  for (const k of ["outfit", "shoes", "jewellery", "nails", "backdrop"]) {
    if (!u[k]) throw new Error(`${k} not uploaded — run --upload first`);
  }

  const opt = (a) => ({ id: randomUUID(), kind: "photo", name: a.name,
                        imagePath: a.storagePath, imageBucket: a.bucket });

  // This folder's assets lead each group; the library is pooled in behind them
  // and de-duplicated by storage path.
  const groups = [
    { id: randomUUID(), type: "outfit",    label: "Outfit",    options: [opt(u.outfit)] },
    { id: randomUUID(), type: "shoes",     label: "Shoes",     options: [opt(u.shoes)] },
    { id: randomUUID(), type: "accessory", label: "Jewellery", options: [opt(u.jewellery)] },
    { id: randomUUID(), type: "nails",     label: "Nails",     options: [opt(u.nails)] },
  ];
  const backgrounds = [opt(u.backdrop)];

  const genderMap = existsSync(GENDER_MAP) ? JSON.parse(readFileSync(GENDER_MAP, "utf8")) : {};
  if (!Object.keys(genderMap).length) {
    throw new Error("gender-map.json is empty — run classify-gender.mjs first, or every men's shoe pools in");
  }
  const wearableHere = (o, type) => {
    if (JUNK_NAMES.has(o.name)) return false;
    const g = genderMap[o.imagePath]?.gender ?? "unisex";
    return g === TEMPLATE_GENDER || g === "unisex";
  };

  // Never pool from the template being rebuilt. On the first --rebuild this read
  // its own polluted props straight back in, so the nursing stethoscope and
  // scrub cap survived a filter that was working correctly on everything else.
  const rows = await sql`
    SELECT category, option_groups, background_options FROM templates
    WHERE creator_id = ${CREATOR_ID} AND option_groups IS NOT NULL
      AND id <> ${TEMPLATE_ID}`;

  const seen = new Set([u.outfit.storagePath, u.shoes.storagePath,
                        u.jewellery.storagePath, u.nails.storagePath, u.backdrop.storagePath]);
  let pooled = 0, rejected = 0;
  for (const r of rows) {
    // Backdrops are not gendered and not occasion-bound, so they pool from
    // every category; wearables do not.
    for (const b of r.background_options ?? []) {
      if (!b.imagePath || seen.has(b.imagePath)) continue;
      seen.add(b.imagePath); backgrounds.push({ ...b, id: randomUUID() }); pooled++;
    }
    // Outfits are pooled by explicit NAME, so they ignore the category gate on
    // purpose: the tailored womenswear worth offering here sits on the Call to
    // Bar and nursing templates, and a named pantsuit is not occasion-bound the
    // way a stethoscope is. The allowlist is the control, not the category.
    for (const g of r.option_groups ?? []) {
      if (g.type !== "outfit") continue;
      const target = groups.find(x => x.type === "outfit");
      for (const o of g.options ?? []) {
        if (o.kind !== "photo" || !o.imagePath || seen.has(o.imagePath)) continue;
        if (!OUTFIT_ALLOW.has(o.name) || !wearableHere(o, "outfit")) continue;
        seen.add(o.imagePath); target.options.push({ ...o, id: randomUUID() }); pooled++;
      }
    }

    if (!POOL_FROM_CATEGORIES.has(r.category) || NEVER_POOL.has(r.category)) continue;
    for (const g of r.option_groups ?? []) {
      if (g.type === "outfit") continue;   // handled above
      if (!POOL_TYPES.has(g.type) || NEVER_POOL.has(g.type)) continue;
      const target = groups.find(x => x.type === g.type)
        ?? (groups.push({ id: randomUUID(), type: g.type, label: g.label, options: [] }), groups.at(-1));
      for (const o of g.options ?? []) {
        if (o.kind !== "photo" || !o.imagePath || seen.has(o.imagePath)) continue;
        if (!wearableHere(o, g.type)) { seen.add(o.imagePath); rejected++; continue; }
        seen.add(o.imagePath); target.options.push({ ...o, id: randomUUID() }); pooled++;
      }
    }
  }

  // Rebuild in place when the template already exists, so its id, and any
  // screenshot or link already pointing at it, survive a re-pool.
  const existing = REBUILD
    ? (await sql`SELECT id FROM templates WHERE id = ${TEMPLATE_ID}`)[0]
    : null;

  let row;
  if (existing) {
    [row] = await sql`
      UPDATE templates SET option_groups = ${sql.json(groups)},
        background_options = ${sql.json(backgrounds)}, updated_at = NOW()
      WHERE id = ${TEMPLATE_ID} RETURNING id`;
    log(`↻ rebuilt options on ${row.id}`);
  } else {
    [row] = await sql`
      INSERT INTO templates (
        id, creator_id, title, description, category, status,
        price_1_ngn, price_5_ngn, price_ngn,
        aspect_ratio, shoot_mode, package_size,
        option_groups, background_options, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${CREATOR_ID}, ${TITLE}, ${DESCRIPTION}, 'portrait', 'draft',
        ${PRICING.price_1_ngn}, ${PRICING.price_5_ngn}, ${PRICING.price_ngn},
        ${SHOOT.aspect_ratio}, ${SHOOT.shoot_mode}, ${SHOOT.package_size},
        ${sql.json(groups)}, ${sql.json(backgrounds)}, NOW(), NOW()
      ) RETURNING id`;
    await sql`
      INSERT INTO template_images (id, template_id, storage_path, storage_bucket, display_order, purpose, tag, custom_name)
      VALUES (${randomUUID()}, ${row.id}, ${u.outfit.storagePath}, ${BUCKET}, 0, 'tagged', 'OUTFIT', ${u.outfit.name})`;
    log(`✓ "${TITLE}" → ${row.id}`);
  }
  log(`  ${groups.length} group(s): ${groups.map(g => `${g.type}×${g.options.length}`).join(", ")}`);
  log(`  ${backgrounds.length} backdrop(s), ${pooled} pooled, ${rejected} rejected (wrong gender or junk)`);
  log(`  status=draft — publish it by hand when the gallery is in`);
  await sql.end();
}

if (DO_UPLOAD) await upload();
else if (DO_TEMPLATE) await template();
else { console.error("choose a phase: --upload (here) or --template (on the VPS)"); process.exitCode = 2; }
