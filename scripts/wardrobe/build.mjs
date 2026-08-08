#!/usr/bin/env node
/**
 * build.mjs — stage 3b. Turn the extracted assets into draft templates.
 *
 * Runs in two phases because the two things it needs live in different places:
 * R2 is reachable from anywhere, the database only from the VPS.
 *
 *   # on this machine — uploads the asset files to R2, writes a manifest
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/build.mjs --upload
 *
 *   # on the server — reads the manifest, writes the templates
 *   node --env-file=.env.local scripts/wardrobe/build.mjs --templates --limit 1
 *
 * --limit 1 on the template phase builds ONE template so it can be checked
 * before the rest are written. Everything is created as status='draft', so
 * nothing appears in the marketplace until it is published by hand.
 *
 * STRUCTURE — one template per outfit, accessories pooled per category.
 * A buyer booking an editorial gown chooses from the shoes, bags, jewellery,
 * nails, hair and backdrops extracted from EVERY editorial photograph, not just
 * the one their gown came from. That is what makes a template worth booking
 * rather than a single fixed look.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");
const ASSET_DIR = join(ROOT, ".wardrobe-assets");
const MANIFEST = join(__dirname, "wardrobe-manifest.json");

const args = process.argv.slice(2);
const DO_UPLOAD = args.includes("--upload");
const DO_TEMPLATES = args.includes("--templates");
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity; })();

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/**
 * The photo's filename, used as the manifest key.
 *
 * NOT path.basename: the queue stores Windows paths, the upload phase runs on
 * Windows and the template phase runs on Linux, where basename() does not treat
 * "\" as a separator and hands back the whole "C:\Users\...\IMG_0585.JPG"
 * string. The keys then never matched and every template was skipped with
 * "its garment has not been uploaded yet". Split on both separators instead.
 */
const fileKey = (p) => String(p).split(/[\\/]/).pop();

const CREATOR_ID = "ae32d95e-85f5-4c8d-bcbb-5446153314f8";   // Fegorson Studio
const BUCKET = "template-images";

/** Copied from the regular generation templates, NOT the ₦1,000 Gear Equalizer
 *  or Asset Extractor, which are priced as utilities rather than shoots. */
const PRICING = { price_1_ngn: 3500, price_5_ngn: 15000, price_ngn: 25000 };
const SHOOT = { aspect_ratio: "4:5", shoot_mode: "advanced", package_size: 10 };

/**
 * Which buyer-choice group each extracted asset belongs in. The group types are
 * the ones templates already use — inventing a new one would render as an
 * unlabelled group in the booking page.
 */
const GROUP_FOR = {
  shoes: { type: "shoes", label: "Shoes" },
  wig: { type: "hairstyle", label: "Hairstyle" },
  nails: { type: "nails", label: "Nails" },
  jewellery: { type: "accessory", label: "Jewellery" },
  bag: { type: "accessory", label: "Bag" },
  headwear: { type: "accessory", label: "Headwear" },
  belt: { type: "accessory", label: "Belt" },
};
const GARMENTS = new Set(["gown", "suit", "outfit"]);

// ── Phase 1: upload to R2 ────────────────────────────────────────────────────

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

  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { uploads: {} };

  // Storage paths sit under the creator's own user id, matching every existing
  // template asset — the sanitisers elsewhere prove ownership from that prefix.
  const ownerId = manifest.ownerId || process.env.WARDROBE_OWNER_ID || "d80f9e08-014e-48b7-8545-b37652059605";
  manifest.ownerId = ownerId;

  const { createHash } = await import("node:crypto");
  const hashOf = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

  // Deleting a file from .wardrobe-assets is how an asset is rejected — some
  // extractions still contain a person, some backdrops came out badly. Removing
  // the file has to be enough on its own, so anything now missing is dropped
  // from the manifest and unmarked in the queue. Otherwise the template build
  // would keep using the copy already in R2 and the deletion would do nothing.
  // Resolve by the name WITHOUT its extension. Editing an asset and re-saving
  // it changes the extension — a review turned .jpeg into .JPEG, .PNG and .jpg
  // — and exact-name matching then reported all 179 as deleted when 121 were
  // sitting right there. The stem is what identifies an asset; the container
  // format is incidental.
  const { readdirSync } = await import("node:fs");
  const stem = (f) => f.replace(/\.[^.]+$/, "").toLowerCase();
  const onDisk = new Map();
  for (const f of readdirSync(ASSET_DIR)) onDisk.set(stem(f), f);

  let removed = 0, renamed = 0;
  for (const p of q.photos.filter(x => x.usable)) {
    for (const j of p.jobs) {
      if (!j.localFile) continue;
      const actual = onDisk.get(stem(j.localFile));
      if (actual) {
        // Keep the queue pointing at whatever the file is really called now.
        if (actual !== j.localFile) { j.localFile = actual; renamed++; }
        continue;
      }
      delete manifest.uploads[`${fileKey(p.file)}::${j.kind}`];
      j.rejected = true;
      j.localFile = null;
      removed++;
    }
  }
  if (renamed) log(`${renamed} asset(s) re-saved with a different extension — queue updated to match`);
  if (removed) {
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    log(`${removed} asset(s) removed from the folder — dropped from the manifest, they will not appear in any template`);
  }

  const todo = [];
  let replaced = 0;
  for (const p of q.photos.filter(x => x.usable)) {
    for (const j of p.jobs) {
      if (!j.localFile) continue;
      const key = `${fileKey(p.file)}::${j.kind}`;
      const prev = manifest.uploads[key];
      if (prev) {
        // An asset edited by hand in .wardrobe-assets must actually reach R2.
        // Skipping anything already uploaded would silently keep serving the
        // original, and the edit would appear to have done nothing.
        const local = join(ASSET_DIR, j.localFile);
        if (!existsSync(local)) continue;
        if (prev.hash && prev.hash === hashOf(readFileSync(local))) continue;
        replaced++;
      }
      todo.push({ p, j, key });
    }
  }
  log(`${todo.length} asset(s) to upload to R2${replaced ? ` (${replaced} edited since last upload)` : ""}`);

  let n = 0;
  for (const { p, j, key } of todo) {
    if (n >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    const local = join(ASSET_DIR, j.localFile);
    if (!existsSync(local)) { log(`✗ missing on disk: ${j.localFile}`); continue; }
    const body = readFileSync(local);
    // Re-upload an edited asset to the SAME path. A fresh uuid each time would
    // orphan the previous object in R2 and change the path every template
    // already points at, so an edit would quietly break existing templates
    // instead of updating them.
    const storagePath = manifest.uploads[key]?.storagePath
      ?? `${ownerId}/${randomUUID()}-${j.localFile}`;

    if (!DRY_RUN) {
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET, Key: storagePath, Body: body, ContentType: j.localFile.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      }));
      manifest.uploads[key] = {
        storagePath, bucket: BUCKET, kind: j.kind, recolour: j.recolour ?? null,
        hash: hashOf(body),   // so a later edit to this file is noticed and re-uploaded
      };
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
    n++;
    log(`${DRY_RUN ? "· would upload" : "✓ uploaded"} ${j.localFile}`);
  }
  log(`${n} uploaded. Manifest: ${MANIFEST}`);
}

// ── Phase 2: write the templates ─────────────────────────────────────────────

const titleFor = (photo) => {
  const occ = (photo.occasion || "").split(/[,·]/)[0].trim();
  const colour = (photo.colourNew || "").replace(/\s+top.*$/i, "").trim();
  const garment = photo.garmentKind === "suit" ? "Suit" : photo.garmentKind === "gown" ? "Gown" : "Look";
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(colour)} ${garment}${occ ? ` — ${cap(occ)}` : ""}`.replace(/\s+/g, " ").slice(0, 80);
};

async function templates() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const up = (photoFile, kind) => manifest.uploads[`${fileKey(photoFile)}::${kind}`] ?? null;

  const usable = q.photos.filter(p => p.usable);

  // Pool the accessories per category, so every template in a category offers
  // everything extracted across that category.
  const pool = {};   // category -> kind -> [{name, storagePath}]
  for (const p of usable) {
    for (const j of p.jobs) {
      if (GARMENTS.has(j.kind)) continue;      // the garment belongs to its own template
      const u = up(p.file, j.kind);
      if (!u) continue;
      (pool[p.category] ??= {});
      (pool[p.category][j.kind] ??= []).push({
        // The asset's OWN name, from name.mjs. Naming these after the source
        // photo's subject gave a template three pairs of shoes all called
        // "woman in a beaded gown", which no buyer could choose between.
        name: (j.assetName || j.kind).slice(0, 40),
        storagePath: u.storagePath,
      });
    }
  }

  let built = 0;
  for (const p of usable) {
    if (built >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    if (p.templateId) continue;                 // already built
    const garmentKind = p.garmentKind;
    const garment = garmentKind ? up(p.file, garmentKind) : null;
    if (!garment) { log(`· skip ${fileKey(p.file)} — its garment has not been uploaded yet`); continue; }

    const groups = [];
    // The outfit group holds this template's own recoloured garment.
    const garmentJob = p.jobs.find(j => j.kind === garmentKind);
    groups.push({
      id: randomUUID(), type: "outfit", label: "Outfit",
      options: [{
        id: randomUUID(), kind: "photo",
        name: (garmentJob?.assetName || p.colourNew || "Outfit").slice(0, 40),
        imagePath: garment.storagePath, imageBucket: BUCKET,
      }],
    });

    // Everything else is pooled across the category.
    const byType = {};
    for (const [kind, cfg] of Object.entries(GROUP_FOR)) {
      const items = (pool[p.category]?.[kind] ?? []).slice(0, 10);
      if (!items.length) continue;
      (byType[cfg.type] ??= { id: randomUUID(), type: cfg.type, label: cfg.label, options: [] });
      for (const it of items) {
        byType[cfg.type].options.push({
          id: randomUUID(), kind: "photo", name: it.name,
          imagePath: it.storagePath, imageBucket: BUCKET,
        });
      }
    }
    // "accessory" collects jewellery, bags, headwear and belts, so cap it.
    for (const g of Object.values(byType)) { g.options = g.options.slice(0, 12); groups.push(g); }

    const backgrounds = (pool[p.category]?.backdrop ?? []).slice(0, 10).map(b => ({
      id: randomUUID(), kind: "photo", name: b.name, imagePath: b.storagePath, imageBucket: BUCKET,
    }));

    const title = titleFor(p);
    const description = [
      p.garmentDescription,
      `Recoloured to ${p.colourNew}.`,
      backgrounds.length ? `Choose your backdrop, shoes and accessories.` : "",
    ].filter(Boolean).join(" ").slice(0, 900);

    if (DRY_RUN) {
      log(`· would build "${title}" [${p.category}] — ${groups.length} group(s), ${backgrounds.length} backdrop(s)`);
      built++;
      continue;
    }

    // sql.json(), not JSON.stringify(...)::jsonb. postgres.js already serialises
    // the value, so stringifying first stored the whole array as a jsonb STRING
    // — jsonb_typeof came back "string" instead of "array" and the booking page
    // would have rendered no choice groups at all.
    const [row] = await sql`
      INSERT INTO templates (
        id, creator_id, title, description, category, status,
        price_1_ngn, price_5_ngn, price_ngn,
        aspect_ratio, shoot_mode, package_size,
        option_groups, background_options, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${CREATOR_ID}, ${title}, ${description}, ${p.category}, 'draft',
        ${PRICING.price_1_ngn}, ${PRICING.price_5_ngn}, ${PRICING.price_ngn},
        ${SHOOT.aspect_ratio}, ${SHOOT.shoot_mode}, ${SHOOT.package_size},
        ${sql.json(groups)}, ${sql.json(backgrounds)}, NOW(), NOW()
      ) RETURNING id`;

    // The garment also goes in as the template's own reference image.
    await sql`
      INSERT INTO template_images (id, template_id, storage_path, storage_bucket, display_order, purpose, tag, custom_name)
      VALUES (${randomUUID()}, ${row.id}, ${garment.storagePath}, ${BUCKET}, 0, 'tagged', 'OUTFIT', ${p.colourNew ?? null})`;

    p.templateId = row.id;
    writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    built++;
    log(`✓ ${title} [${p.category}]  ${groups.length} group(s), ${backgrounds.length} backdrop(s)  → ${row.id}`);
  }

  log(`${built} template(s) built as DRAFT.`);
  await sql.end();
}

if (!DO_UPLOAD && !DO_TEMPLATES) {
  console.error("choose a phase: --upload (here) or --templates (on the server)");
  process.exitCode = 2;
} else if (DO_UPLOAD) {
  await upload();
} else {
  await templates();
}
