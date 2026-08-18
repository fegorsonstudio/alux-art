#!/usr/bin/env node
/**
 * set-look-pair.mjs — give one lighting look its own before/after pair.
 *
 *   node scripts/set-look-pair.mjs --name "197 · S Night Paparazzi G7X" \
 *     --before /tmp/before.png --after /tmp/after.png [--apply]
 *
 * For a look sold on a real photo rather than a render of the shared studio
 * source. Both frames must be the same person in the same pose, or the crossfade
 * is a lie — that is the whole reason this exists.
 *
 * Uploads both to R2 and sets imagePath (the after) and beforeImagePath (the
 * before) on the option. Every other look is untouched and keeps using the
 * group's framing-matched before.
 *
 * Run ON THE VPS: needs R2 credentials and DATABASE_URL from .env.local.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const BUCKET = "template-images";

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined; };
const NAME = arg("--name");
const BEFORE = arg("--before");
const AFTER = arg("--after");
const APPLY = process.argv.includes("--apply");
if (!NAME || !BEFORE || !AFTER) { console.error('usage: --name "<look>" --before <file> --after <file> [--apply]'); process.exit(2); }

const envPath = existsSync("/home/aluxart/app/.env.local") ? "/home/aluxart/app/.env.local" : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = postgres(env.DATABASE_URL, { ssl: false });
const r2 = new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const kindOf = (buf) => {
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return { ext: "png", type: "image/png" };
  if (buf.slice(0, 3).toString("hex") === "ffd8ff") return { ext: "jpg", type: "image/jpeg" };
  return null;
};

async function main() {
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const groups = row.option_groups ?? [];
  let group, option;
  for (const g of groups.filter(x => x.type === "lighting")) {
    const o = g.options.find(x => x.name === NAME);
    if (o) { group = g; option = o; break; }
  }
  if (!option) throw new Error(`no look named "${NAME}"`);

  const files = {};
  for (const [role, path] of [["before", BEFORE], ["after", AFTER]]) {
    const buf = readFileSync(path);
    const kind = kindOf(buf);
    if (!kind) throw new Error(`${role}: not a PNG or JPEG`);
    files[role] = { buf, kind };
    console.log(`${role}: ${(buf.length / 1024 / 1024).toFixed(1)} MB  ${kind.ext}`);
  }

  const prefix = group.beforeImagePath.split("/")[0];
  const slug = option.name.replace(/^\d+\s+·\s+/, "").replace(/^[CS]\s+/, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const keys = {
    before: `${prefix}/${randomUUID()}-${slug}-before.${files.before.kind.ext}`,
    after: `${prefix}/${randomUUID()}-${slug}-after.${files.after.kind.ext}`,
  };

  console.log(`\nlook:   ${option.name}  [${group.label}]`);
  console.log(`before: ${option.beforeImagePath ?? "(group's shared source)"}\n     -> ${keys.before}`);
  console.log(`after:  ${option.imagePath ?? "(none)"}\n     -> ${keys.after}`);
  if (!APPLY) { console.log("\ndry run. add --apply to write."); return; }

  for (const role of ["before", "after"]) {
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET, Key: keys[role], Body: files[role].buf, ContentType: files[role].kind.type,
    }));
  }

  const next = groups.map(g => g.id !== group.id ? g : {
    ...g,
    options: g.options.map(o => o.id !== option.id ? o : {
      ...o,
      imagePath: keys.after,
      imageBucket: BUCKET,
      beforeImagePath: keys.before,
      beforeImageBucket: BUCKET,
    }),
  });

  const before = groups.filter(g => g.type === "lighting").reduce((n, g) => n + g.options.length, 0);
  const after = next.filter(g => g.type === "lighting").reduce((n, g) => n + g.options.length, 0);
  if (before !== after) throw new Error(`look count changed ${before} -> ${after} — refusing`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/home/aluxart/option-groups-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(groups, null, 2));
  await sql`UPDATE templates SET option_groups = ${sql.json(next)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const saved = (check.option_groups ?? []).filter(g => g.type === "lighting");
  const mine = saved.flatMap(g => g.options).find(o => o.id === option.id);
  const others = saved.flatMap(g => g.options).filter(o => o.id !== option.id && o.beforeImagePath).length;
  console.log(`\nwritten. backup: ${backup}`);
  console.log(`pair set on "${mine.name}"`);
  console.log(`other looks carrying their own before: ${others}`);
  console.log(`total looks: ${saved.reduce((n, g) => n + g.options.length, 0)}`);
}

main().then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
