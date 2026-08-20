#!/usr/bin/env node
/**
 * build-wa-cards.mjs — the two images the WhatsApp bot opens with.
 *
 *   node scripts/build-wa-cards.mjs            # render only, into /tmp
 *   node scripts/build-wa-cards.mjs --apply    # render and upload to R2
 *
 * Run ON THE VPS: it needs DATABASE_URL and the R2 credentials.
 *
 * WHY TWO IMAGES AND NOT SIX. The bot used to send one preview per template,
 * which arrived as five separate messages and read like a catalogue being
 * dumped on somebody. WhatsApp list rows cannot carry a thumbnail — the API has
 * no field for it — so the pictures have to live inside one image. A contact
 * sheet shows more in less space and can be zoomed like any photo.
 *
 * WHAT GOES ON THE SHEET. Public marketplace templates only. Private templates
 * are link-only client work and were briefly being listed by the bot; anything
 * that builds a menu has to filter is_private or the leak comes back through a
 * different door.
 *
 * The TRIGGER WORD is printed on every tile, because it is the thing that lets
 * somebody skip the menu on their next visit.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const WORK = "/tmp/wa-cards";
const BUCKET = "template-images";
/** Stable keys: the bot links to these, so a rebuild must overwrite in place. */
const KEY_WELCOME = "whatsapp/welcome.jpg";
const KEY_STYLES = "whatsapp/styles.jpg";

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(ROOT, ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const sql = postgres(env.DATABASE_URL, { ssl: false });
const r2 = new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

/**
 * The word a buyer types to jump straight to this template.
 *
 * The creator's own trigger_words come first, because deriving one from the
 * title produces things nobody would type: "We just hear Gboom oh!" reduces to
 * "just hear", and "Go Get Your PVC" to "get your". A trigger someone has to
 * think about is not a shortcut. The derivation stays as a fallback for
 * templates nobody has given a word to yet.
 */
const STOP = new Set(["the", "a", "an", "pro", "studio", "upgrade", "and", "for", "just", "get", "your", "you", "me", "guy", "hear", "oh"]);
function triggerFor(title, triggerWords) {
  if (Array.isArray(triggerWords) && triggerWords.length) return triggerWords[0];
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
  // Longest surviving word: the most distinctive one, and the least likely to
  // collide with another template.
  return words.sort((a, b) => b.length - a.length)[0] ?? title.toLowerCase();
}

async function pull(bucket, key, dest) {
  const o = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = []; for await (const c of o.Body) chunks.push(c);
  writeFileSync(dest, Buffer.concat(chunks));
}

async function main() {
  mkdirSync(WORK, { recursive: true });

  const [creator] = await sql`SELECT id FROM creators WHERE display_name ILIKE '%fegorson%' LIMIT 1`;
  if (!creator) throw new Error("creator not found");

  const rows = await sql`
    SELECT title, category, price_1_ngn AS p1, price_5_ngn AS p5,
           cover_storage_path AS cov, cover_bucket AS bkt, trigger_words
    FROM templates
    WHERE creator_id = ${creator.id} AND status = 'published' AND is_private = false
      AND cover_storage_path IS NOT NULL
    ORDER BY created_at DESC LIMIT 4`;

  if (!rows.length) throw new Error("no public templates with covers");
  console.log(`templates on the sheet: ${rows.length}`);

  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const local = join(WORK, `cover-${i}.jpg`);
    await pull(r.bkt ?? BUCKET, r.cov, local);
    const trig = triggerFor(r.title, r.trigger_words);
    items.push({ image: local, name: r.title.replace(/\s*[—-]\s*Pro Studio Upgrade$/i, ""), trigger: `send "${trig}"` });
    console.log(`  ${String(r.category).padEnd(16)} ${trig}`);
  }

  // The range covers EVERY public template, not just the four on the sheet.
  // Quoting the sheet's own min and max understates the top of the catalogue —
  // it read as N2,000 to N15,000 when the real ceiling is N25,000.
  const priceRows = await sql`
    SELECT price_1_ngn AS p1, price_5_ngn AS p5, price_ngn AS p10
    FROM templates
    WHERE creator_id = ${creator.id} AND status = 'published' AND is_private = false`;
  const prices = priceRows
    .flatMap(r => [Number(r.p1) || 0, Number(r.p5) || 0, Number(r.p10) || 0])
    .filter(Boolean);
  const low = Math.min(...prices), high = Math.max(...prices);
  console.log(`price range across ${priceRows.length} public templates: N${low} - N${high}`);

  const spec = [{
    id: "wa-cards",
    account: "whatsapp",
    slides: [
      {
        type: "cover",
        eyebrow: "Alux Art",
        title: "Hi, I'm Achoja\nfrom Alux Art.",
        body:
          "I turn your photos into properly lit studio shots. Prices run "
          + `*₦${low.toLocaleString()} to ₦${high.toLocaleString()}* (and the dollar equivalent) `
          + "depending on what you need.",
      },
      {
        type: "grid",
        title: "Our marketplace styles.",
        body: "Curated by professional photographers and visual artists. Know the one you want? *Send its word and we start straight away.*",
        items,
      },
    ],
  }];

  const specPath = join(WORK, "spec.json");
  writeFileSync(specPath, JSON.stringify(spec, null, 2));

  execFileSync("node", [join(ROOT, "scripts/carousel/render.mjs"), specPath, WORK], { stdio: "inherit" });

  const rendered = [join(WORK, "wa-cards", "01.jpg"), join(WORK, "wa-cards", "02.jpg")];
  for (const f of rendered) if (!existsSync(f)) throw new Error(`render did not produce ${f}`);
  console.log(`rendered: ${rendered.join(", ")}`);

  if (!APPLY) { console.log("\nrender only. add --apply to upload."); await sql.end(); return; }

  for (const [file, key] of [[rendered[0], KEY_WELCOME], [rendered[1], KEY_STYLES]]) {
    const body = readFileSync(file);
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "image/jpeg" }));
    console.log(`uploaded ${key}  ${(body.length / 1024).toFixed(0)}KB`);
  }
  await sql.end();
}

main().catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
