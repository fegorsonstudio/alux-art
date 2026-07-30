#!/usr/bin/env node
/**
 * attach-section.mjs — publish a whole archive section (Atmosphere, Dark
 * Romantic, ...) onto the template: upload its thumbnails, create or update its
 * choice group, and carry over the per-framing "before" originals.
 *
 *   node scripts/attach-section.mjs --import scripts/atmosphere-import.json \
 *        --dir /tmp/atmosphere --dry-run
 *
 * Run ON THE VPS — it needs R2 credentials and DATABASE_URL from .env.local.
 *
 * Sections are stored as additional groups of type "lighting" so they work in the
 * buyer's per-photo picker immediately (it gathers looks from every lighting
 * group). Each keeps its own label, which is what a future UI can group by.
 *
 * Identity is checked, never assumed: files are NN-slug.png where NN is the
 * style's position in the import file, and the slug must match the style's name.
 * One mismatch aborts the run without writing anything — attaching a picture to
 * the wrong style is invisible until a buyer sees it.
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

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY_RUN = process.argv.includes("--dry-run");
const IMPORT = arg("--import");
const DIR = arg("--dir");
const log = (...a) => console.log(...a);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const r2 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

async function main() {
  if (!IMPORT || !DIR) { log("usage: --import <file.json> --dir <folder> [--dry-run]"); return; }
  if (!existsSync(IMPORT)) { log(`no import file: ${IMPORT}`); return; }
  if (!existsSync(DIR)) { log(`no image folder: ${DIR}`); return; }

  const imp = JSON.parse(readFileSync(IMPORT, "utf8"));
  const styles = imp.styles ?? [];
  const label = imp.label ?? imp.section;
  log(`section "${label}" — ${styles.length} styles`);

  const [template] = await sql`
    SELECT t.option_groups, c.user_id
    FROM templates t LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${TEMPLATE_ID}
  `;
  if (!template) { log("template not found"); return; }
  const groups = template.option_groups ?? [];

  const files = readdirSync(DIR).filter((f) => /^\d{2}-.*\.(png|jpe?g)$/i.test(f));
  const work = [], problems = [];

  styles.forEach((style, i) => {
    const n = String(i + 1).padStart(2, "0");
    const expected = `${n}-${slug(style.name)}`;
    const file = files.find((f) => f.replace(/\.(png|jpe?g)$/i, "") === expected);
    if (!file) { problems.push(`${style.name}: no file named ${expected}.png`); return; }
    work.push({ style, file });
  });

  if (problems.length) {
    log(`ABORT: ${problems.length} problem(s), nothing written:`);
    problems.forEach((p) => log(`  ${p}`));
    return;
  }
  log(`${work.length} files matched to their style by name`);

  if (DRY_RUN) {
    log("dry-run: nothing uploaded or written.");
    work.slice(0, 5).forEach((w) => log(`  would attach ${w.file} -> ${w.style.name} [${w.style.framing}]`));
    return;
  }

  const options = [];
  for (const w of work) {
    const body = readFileSync(join(DIR, w.file));
    const path = `${template.user_id}/${randomUUID()}-${w.file}`;
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: path, Body: body,
      ContentType: w.file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    }));
    options.push({
      id: randomUUID(),
      kind: "prompt",              // hidden recipe, thumbnail shown
      name: w.style.name,
      description: w.style.prompt, // never served to the buyer client
      framing: w.style.framing,
      imagePath: path,
      imageBucket: BUCKET,
    });
    if (options.length % 5 === 0) log(`  uploaded ${options.length}/${work.length}`);
  }

  // Reuse the "before" originals already attached to the first lighting group so
  // this section's crossfade works immediately without re-uploading them.
  const existing = groups.find((g) => g.type === "lighting" && g.beforeImages);
  const before = existing
    ? { beforeImages: existing.beforeImages, beforeImageBucket: existing.beforeImageBucket ?? BUCKET, beforeImagePath: existing.beforeImagePath }
    : {};

  // Replace the section if it already exists (re-running must not duplicate it).
  const idx = groups.findIndex((g) => g.label === label);
  const group = { id: idx >= 0 ? groups[idx].id : randomUUID(), type: "lighting", label, options, ...before };
  if (idx >= 0) groups[idx] = group; else groups.push(group);

  await sql`UPDATE templates SET option_groups = ${sql.json(groups)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [chk] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const live = (chk.option_groups ?? []).filter((g) => g.type === "lighting");
  log(`done: "${label}" has ${options.length} looks`);
  log(`template now has ${live.length} lighting sections, ${live.reduce((n, g) => n + (g.options?.length ?? 0), 0)} looks total`);
  live.forEach((g) => log(`  ${g.label}: ${g.options.length} looks, ${g.options.filter((o) => o.imagePath).length} with a thumbnail`));
}

main().catch((e) => { console.error("attach error:", e); process.exitCode = 1; }).finally(() => sql.end());
