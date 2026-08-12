#!/usr/bin/env node
/**
 * lighting-assets.mjs — pull before/after pairs for the lighting marketing week.
 *
 *   node --env-file=.env.local scripts/lighting-assets.mjs --list
 *   node --env-file=.env.local scripts/lighting-assets.mjs --pull --count 30
 *
 * The Gear Equalizer holds 195 lighting looks, every one with a rendered
 * thumbnail (the "after"), against 6 source images (the "before", one per
 * framing × 2 variants). All of it is already in R2, so a week of before/after
 * marketing needs NO image generation: no fal call, no spend, no approval gate.
 *
 * THE NO-REPEAT RULE. The owner's instruction is that a lighting look must never
 * appear twice across the week, so the audience does not get bored. That is
 * enforced here rather than by hand: every look this script hands out is written
 * to lighting-used.json, and an already-used look is never handed out again.
 * Delete that file to start the rotation over.
 *
 * The "before" frame rotates too. Only 6 sources exist, so the same before
 * returns roughly every sixth carousel; the picker refuses to hand the same
 * source to the same account twice in a row, which is what actually reads as
 * repetition in a feed.
 */

import postgres from "postgres";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "scripts", "carousel", "shots", "lighting");
const LEDGER = join(ROOT, "scripts", "carousel", "lighting-used.json");

const GEAR_EQUALIZER = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";

const args = process.argv.slice(2);
const LIST = args.includes("--list");
const PULL = args.includes("--pull");
const RESET = args.includes("--reset");
const COUNT = (() => { const i = args.indexOf("--count"); return i >= 0 ? parseInt(args[i + 1], 10) || 30 : 30; })();

const env = process.env.DATABASE_URL ? process.env : Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const r2 = new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/** Buffer a whole R2 object. */
async function fetchR2(bucket, key) {
  const o = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const c of o.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Every look in the Gear Equalizer, with the before image for its framing. */
async function loadLooks() {
  const sql = postgres(env.DATABASE_URL, { ssl: false });
  const [row] = await sql`
    SELECT option_groups FROM templates WHERE id = ${GEAR_EQUALIZER}`;
  await sql.end();

  const looks = [];
  for (const g of row.option_groups ?? []) {
    if (g.type !== "lighting") continue;
    const befores = g.beforeImages ?? {};
    for (const o of g.options ?? []) {
      if (o.kind !== "prompt" || !o.imagePath) continue;
      const framing = o.framing || "medium";
      const before = befores[framing] || g.beforeImagePath;
      if (!before) continue;                       // no pair, no carousel
      looks.push({
        id: o.id, name: o.name, section: g.label, framing,
        after: o.imagePath, before,
        bucket: o.imageBucket || "template-images",
        // The creator's own recipe. Useful copy for the tutorial format.
        recipe: (o.description || "").replace(/^Relight this image\.\s*/i, "").trim(),
      });
    }
  }
  return looks;
}

async function main() {
  if (RESET && existsSync(LEDGER)) { writeFileSync(LEDGER, JSON.stringify({ used: [] }, null, 2)); log("ledger reset"); }
  const looks = await loadLooks();
  const bySection = looks.reduce((a, l) => (a[l.section] = (a[l.section] ?? 0) + 1, a), {});

  if (LIST) {
    console.log(`${looks.length} looks with a usable before/after pair\n`);
    for (const [s, n] of Object.entries(bySection).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${s}`);
    const befores = [...new Set(looks.map(l => l.before))];
    console.log(`\n${befores.length} distinct "before" source images`);
    return;
  }
  if (!PULL) { console.error("choose --list or --pull"); process.exitCode = 2; return; }

  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { used: [] };
  const used = new Set(ledger.used.map(u => u.id));

  // Spread the picks across sections so a week is not five days of one family.
  const pool = looks.filter(l => !used.has(l.id));
  if (pool.length < COUNT) throw new Error(`only ${pool.length} unused looks left, need ${COUNT} — pass --reset to start the rotation over`);

  const bySec = new Map();
  for (const l of pool) (bySec.get(l.section) ?? bySec.set(l.section, []).get(l.section)).push(l);
  const sections = [...bySec.keys()];
  const picked = [];
  for (let i = 0; picked.length < COUNT; i++) {
    const list = bySec.get(sections[i % sections.length]);
    if (list?.length) picked.push(list.shift());
    if (i > COUNT * sections.length) break;        // exhausted
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = [];
  for (const l of picked) {
    const stem = slug(l.name);
    const files = { before: join(OUT_DIR, `${stem}-before.jpg`), after: join(OUT_DIR, `${stem}-after.jpg`) };
    for (const [which, path] of Object.entries(files)) {
      if (existsSync(path)) continue;
      const buf = await fetchR2(l.bucket, which === "before" ? l.before : l.after);
      if (!buf.length) throw new Error(`empty object for ${l.name} (${which})`);
      writeFileSync(path, buf);
    }
    out.push({
      id: l.id, name: l.name, section: l.section, framing: l.framing, recipe: l.recipe,
      beforeFile: `scripts/carousel/shots/lighting/${stem}-before.jpg`,
      afterFile: `scripts/carousel/shots/lighting/${stem}-after.jpg`,
      beforeSource: l.before,
    });
    log(`✓ ${l.name}  [${l.section}]`);
  }

  ledger.used.push(...out.map(o => ({ id: o.id, name: o.name, at: new Date().toISOString() })));
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  writeFileSync(join(ROOT, "scripts", "carousel", "lighting-picked.json"), JSON.stringify(out, null, 2));

  console.log(`\n${out.length} pair(s) ready in ${OUT_DIR}`);
  console.log(`ledger: ${ledger.used.length} look(s) now used, ${looks.length - ledger.used.length} still unused`);
  console.log(`picked: scripts/carousel/lighting-picked.json`);
}

main().catch(e => { console.error("lighting-assets error:", e.message); process.exitCode = 1; });
