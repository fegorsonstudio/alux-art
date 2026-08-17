#!/usr/bin/env node
/**
 * render-look-thumbnail.mjs — render the "after" thumbnail for one lighting look.
 *
 *   node scripts/render-look-thumbnail.mjs --name "S Night Paparazzi Flash" --out /tmp/look.png
 *   node scripts/render-look-thumbnail.mjs --name "..." --attach /tmp/look.png
 *
 * Two steps on purpose. The first spends a generation and writes a file and
 * NOTHING else; the second uploads that file and points the look at it. Looking
 * at the picture before it goes in front of a buyer is the whole reason the
 * steps are split — a thumbnail that misrepresents its look is invisible to us
 * and obvious to the person who paid for it.
 *
 * The source is the same full-body "before" frame every other Full body look was
 * rendered from, read straight off the group, so the new tile sits in a set that
 * compares like for like.
 *
 * Run ON THE VPS: needs FAL_KEY, R2 credentials and DATABASE_URL from .env.local.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { fal } from "@fal-ai/client";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const BUCKET = "template-images";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NAME = arg("--name");
const OUT = arg("--out");
const ATTACH = arg("--attach");
if (!NAME || (!OUT && !ATTACH)) { console.error('usage: --name "<look name>" (--out <file> | --attach <file>)'); process.exit(2); }

const envPath = existsSync("/home/aluxart/app/.env.local") ? "/home/aluxart/app/.env.local" : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const sql = postgres(env.DATABASE_URL, { ssl: false });
fal.config({ credentials: env.FAL_KEY });

if (!env.R2_ENDPOINT) throw new Error("R2_ENDPOINT missing from .env.local");
const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const streamToBuffer = async (body) => {
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
};

async function findLook() {
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const groups = row.option_groups ?? [];
  for (const g of groups.filter(x => x.type === "lighting")) {
    const o = g.options.find(x => x.name === NAME);
    if (o) return { groups, group: g, option: o };
  }
  throw new Error(`no look named "${NAME}"`);
}

async function render() {
  const { group, option } = await findLook();
  const beforePath = (group.beforeImages ?? {})[option.framing] || group.beforeImagePath;
  if (!beforePath) throw new Error(`no before image for framing "${option.framing}"`);

  console.log(`look:   ${option.name}  [${option.framing}]`);
  console.log(`before: ${beforePath}`);

  const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: beforePath }));
  const buf = await streamToBuffer(obj.Body);
  console.log(`source: ${(buf.length / 1024).toFixed(0)} KB`);

  const sourceUrl = await fal.storage.upload(new Blob([buf], { type: obj.ContentType || "image/jpeg" }));

  console.log("calling fal (one generation)...");
  const res = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt: option.description,
      num_images: 1,
      aspect_ratio: "4:5",
      output_format: "png",
      safety_tolerance: "6",
      image_urls: [sourceUrl],
      limit_generations: false,
    },
  });
  const out = (res?.data || res);
  const images = out.images ?? [];
  const url = images[images.length - 1]?.url;
  if (!url) throw new Error("fal returned no image");

  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(OUT, png);
  console.log(`\nwrote ${OUT}  (${(png.length / 1024).toFixed(0)} KB)`);
  console.log("look at it before attaching. then re-run with --attach", OUT);
}

async function attach() {
  const { groups, group, option } = await findLook();
  if (option.imagePath) { console.error(`"${option.name}" already has a thumbnail — refusing to overwrite`); process.exit(1); }
  const png = readFileSync(ATTACH);
  if (png.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") { console.error("not a PNG — refusing"); process.exit(1); }

  const slug = option.name.replace(/^\d+\s+·\s+/, "").replace(/^[CS]\s+/, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const key = `${group.beforeImagePath.split("/")[0]}/${randomUUID()}-${slug}.png`;

  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: png, ContentType: "image/png" }));

  const next = groups.map(g => g.id !== group.id ? g : {
    ...g,
    options: g.options.map(o => o.id === option.id ? { ...o, imagePath: key } : o),
  });

  const before = groups.filter(g => g.type === "lighting").reduce((n, g) => n + g.options.length, 0);
  const after = next.filter(g => g.type === "lighting").reduce((n, g) => n + g.options.length, 0);
  if (before !== after) throw new Error(`look count changed ${before} -> ${after} — refusing`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/home/aluxart/option-groups-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(groups, null, 2));
  await sql`UPDATE templates SET option_groups = ${sql.json(next)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  console.log(`uploaded: ${BUCKET}/${key}`);
  console.log(`backup:   ${backup}`);
  console.log(`${option.name} now has its thumbnail. ${after} looks total.`);
}

(OUT ? render() : attach())
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
