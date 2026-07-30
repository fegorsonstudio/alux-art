#!/usr/bin/env node
/**
 * attach-lighting-thumbnails.mjs — upload the relit thumbnails to R2 and set each
 * one as its lighting style's "after" image on the template.
 *
 *   node scripts/attach-lighting-thumbnails.mjs --dir /tmp/lighting-thumbs --dry-run
 *   node scripts/attach-lighting-thumbnails.mjs --dir /tmp/lighting-thumbs
 *
 * Run this ON THE VPS: it needs the R2 credentials and DATABASE_URL from
 * .env.local, and the image files copied across.
 *
 * Files are named NN-slug.png where NN is the style's slot. Slot order is NOT
 * trusted on its own — before writing anything, every file's slot is checked
 * against the style name recorded in scripts/lighting-import.json AND the option
 * name on the template. A single mismatch aborts the whole run without writing,
 * because putting the wrong picture on a style is invisible until a buyer sees it
 * (a previous attempt shipped exactly that and all 45 files had to be deleted).
 */

import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEMPLATE_ID = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const BUCKET = "template-images";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DRY_RUN = process.argv.includes("--dry-run");
const DIR = arg("--dir", join(ROOT, ".playwright-mcp", "thumbnails"));
const log = (...a) => console.log(...a);

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
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

async function main() {
  if (!existsSync(DIR)) { log(`no such directory: ${DIR}`); return; }

  const styles = JSON.parse(readFileSync(join(__dirname, "lighting-import.json"), "utf8"));
  const rows = Array.isArray(styles) ? styles : (styles.styles ?? styles.rows ?? []);

  const [template] = await sql`
    SELECT t.id, t.creator_id, t.option_groups, c.user_id
    FROM templates t LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${TEMPLATE_ID}
  `;
  if (!template) { log("template not found"); return; }

  const groups = template.option_groups ?? [];
  const gi = groups.findIndex((g) => g.type === "lighting");
  if (gi < 0) { log("no lighting group on this template"); return; }
  const options = groups[gi].options ?? [];
  log(`template has ${options.length} lighting options; scanning ${DIR}`);

  // Build the work list and verify every single one before writing anything.
  const files = readdirSync(DIR).filter((f) => /^\d{2}-.*\.(png|jpe?g)$/i.test(f)).sort();
  const work = [], problems = [];

  for (const file of files) {
    const slot = Number(file.slice(0, 2));
    const style = rows[slot - 1];
    const option = options[slot - 1];
    if (!style) { problems.push(`${file}: slot ${slot} is not in lighting-import.json`); continue; }
    if (!option) { problems.push(`${file}: slot ${slot} has no option on the template`); continue; }
    // The template de-duplicates repeated style names by appending a number
    // ("Hard Spot Chiaroscuro" appears at slots 14, 15 and 41, stored as the
    // plain name, "… 2" and "… 3"). That trailing counter is the ONLY difference
    // tolerated — any other disagreement still aborts, because it would mean the
    // slots genuinely do not line up.
    const sameStyle = option.name === style.name
      || option.name.replace(/ \d+$/, "") === style.name;
    if (!sameStyle) {
      problems.push(`${file}: slot ${slot} names disagree — template "${option.name}" vs import "${style.name}"`);
      continue;
    }
    work.push({ slot, file, name: style.name, framing: style.framing, option });
  }

  if (problems.length) {
    log(`ABORT: ${problems.length} problem(s), nothing written:`);
    for (const p of problems) log(`  ${p}`);
    return;
  }

  const missing = options
    .map((o, i) => ({ slot: i + 1, name: o.name, has: work.some((w) => w.slot === i + 1) || Boolean(o.imagePath) }))
    .filter((x) => !x.has);
  log(`${work.length} files verified against the template's own option names`);
  if (missing.length) log(`${missing.length} style(s) will still have no image: ${missing.map((m) => m.slot).join(", ")}`);

  if (DRY_RUN) {
    log("dry-run: nothing uploaded or written.");
    for (const w of work.slice(0, 5)) log(`  would attach ${w.file} -> slot ${w.slot} ${w.name}`);
    return;
  }

  let uploaded = 0;
  for (const w of work) {
    const body = readFileSync(join(DIR, w.file));
    const path = `${template.user_id}/${randomUUID()}-${w.file}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: path, Body: body,
      ContentType: w.file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    }));
    // Mutate the in-memory copy; the whole group is written back once at the end
    // so a failure part-way cannot leave the template half-updated.
    w.option.imagePath = path;
    w.option.imageBucket = BUCKET;
    // The checkout crossfade pairs each style with a source photo of the SAME
    // shot size, so the option has to carry its framing. Nothing else sets it —
    // it only exists in lighting-import.json until now.
    if (w.framing) w.option.framing = w.framing;
    uploaded++;
    if (uploaded % 10 === 0) log(`  uploaded ${uploaded}/${work.length}`);
  }

  groups[gi].options = options;
  await sql`UPDATE templates SET option_groups = ${sql.json(groups)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const live = (check.option_groups ?? []).find((g) => g.type === "lighting");
  const withImage = (live.options ?? []).filter((o) => o.imagePath).length;
  log(`done: ${uploaded} uploaded; ${withImage} of ${live.options.length} styles now have a thumbnail`);
}

main()
  .catch((e) => { console.error("attach error:", e); process.exitCode = 1; })
  .finally(() => sql.end());
