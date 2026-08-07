#!/usr/bin/env node
/**
 * scan.mjs — read a folder of sample photographs and work out what is in them.
 *
 * Stage 1 of the wardrobe pipeline. Gemini looks at each photograph and reports
 * which extractable assets it contains, what kind of shoot it is, and a colour
 * to recolour the outfit to so the finished template does not reproduce the
 * sample. Nothing is generated here and nothing is written to the database —
 * this only produces the queue that stage 2 works through.
 *
 *   node --experimental-strip-types scripts/wardrobe/scan.mjs
 *   node --experimental-strip-types scripts/wardrobe/scan.mjs --dir "C:/path" --limit 3
 *
 * Gemini is used rather than Claude because it is on the project's existing key
 * and costs nothing at this volume. Google Flow cannot answer questions about an
 * image — it only generates — so the "what is in this photo" step has to happen
 * here, before Flow is opened at all.
 *
 * Safe to re-run: photographs already scanned are skipped unless --force.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_KINDS, expandAssetSelection } from "../../lib/asset-extractor.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SRC_DIR = argOf("--dir", "C:/Users/FUJITSU/Downloads/sa");
const LIMIT = parseInt(argOf("--limit", ""), 10) || Infinity;
const FORCE = args.includes("--force");

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("GEMINI_API_KEY is not set. Run with --env-file=.env.local");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/** Only the kinds worth pulling out of a person-wearing-things photograph. */
const WANTED = ["outfit", "gown", "suit", "shoes", "bag", "jewellery", "belt",
                "headwear", "wig", "nails", "backdrop"];

/**
 * Categories that already exist on templates. Gemini must choose one of these
 * rather than inventing a label, or the marketplace filter silently loses the
 * template.
 */
const CATEGORIES = ["portrait", "corporate", "editorial", "trending",
                    "call_to_bar", "boudoir", "other"];

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function prompt(usedColours = []) {
  const kindList = ASSET_KINDS.filter(k => WANTED.includes(k.id))
    .map(k => `  ${k.id} — ${k.label}`).join("\n");
  // Each photograph is judged on its own, so without this every gown came back
  // "deep emerald" and the whole set would have looked like one template.
  const avoid = usedColours.length
    ? `\n\nCOLOUR VARIETY — these colours are already taken by other photographs in this batch:\n${usedColours.map(c => `  ${c}`).join("\n")}\nChoose something clearly different from all of them. Repeating one is a failure.`
    : "";
  return `You are cataloguing a photograph so its contents can be extracted as reusable assets.${avoid}

Look at the attached photograph and answer ONLY about what is genuinely visible and clearly enough shown to be reproduced. Do not list something because it is probably there.

Available asset kinds:
${kindList}

Return STRICT JSON, no markdown fence, with exactly these keys:

{
  "usable": true or false,
  "reject_reason": "" or a short reason the photo cannot be used (no person, too blurred, garment mostly hidden, heavily filtered),
  "subject": "one short phrase, e.g. woman in a beaded gown",
  "garment_kind": one of "outfit" | "gown" | "suit" | null,
  "garment_description": "the garment in one sentence: cut, neckline, sleeves, length, fabric, ornament",
  "garment_colour_original": "the garment's actual colour now",
  "garment_colour_new": "a DIFFERENT colour that suits this exact garment and would look expensive on it — name it plainly, e.g. deep emerald, wine, ivory",
  "assets": ["kind ids from the list above that are clearly visible and reproducible"],
  "category": one of ${CATEGORIES.map(c => `"${c}"`).join(" | ")},
  "occasion": "short phrase a buyer would search, e.g. owambe, wedding guest, corporate headshot, call to bar",
  "notes": "anything that would ruin an extraction: cropped shoes, hands covering the bag, motion blur"
}

Rules:
- garment_kind picks the most specific of gown / suit, else outfit.
- Do NOT include the garment kind inside "assets"; it is recorded separately.
- Only include "backdrop" if the background is a deliberate setting worth reusing, not a random room.
- If usable is false, every other field may be empty.`;
}

async function scanOne(model, file, usedColours) {
  const buf = readFileSync(file);
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) return { usable: false, reject_reason: `unsupported file type ${extname(file)}` };

  const res = await model.generateContent([
    { inlineData: { data: buf.toString("base64"), mimeType: mime } },
    prompt(usedColours),
  ]);
  const raw = res.response.text().trim().replace(/^```(?:json)?|```$/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return { usable: false, reject_reason: "could not parse the model's answer" };
  }
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`Folder not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(SRC_DIR)
    .filter(f => MIME[extname(f).toLowerCase()])
    .sort()
    .map(f => join(SRC_DIR, f));

  log(`${files.length} image(s) in ${SRC_DIR}`);

  const queue = existsSync(QUEUE_FILE) && !FORCE
    ? JSON.parse(readFileSync(QUEUE_FILE, "utf8"))
    : { sourceDir: SRC_DIR, scannedAt: null, photos: [] };
  queue.sourceDir = SRC_DIR;

  const already = new Set(queue.photos.map(p => p.file));
  const genai = new GoogleGenerativeAI(KEY);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const usedColours = () => usedColoursFrom(queue);

  let done = 0;
  for (const file of files) {
    if (done >= LIMIT) break;
    if (already.has(file) && !FORCE) continue;

    process.stdout.write(`  ${basename(file).padEnd(46)}`);
    let info;
    try {
      info = await scanOne(model, file, usedColours());
    } catch (e) {
      console.log("ERROR", e.message.slice(0, 80));
      continue;
    }

    if (!info.usable) {
      console.log(`skip — ${info.reject_reason || "not usable"}`);
      queue.photos = queue.photos.filter(p => p.file !== file);
      queue.photos.push({ file, usable: false, reason: info.reject_reason ?? "" });
      done++;
      saveSoon(queue);
      continue;
    }

    // One generation per asset. expandAssetSelection turns a kind into the
    // sheet/angle the extractor actually renders, so the queue lines up exactly
    // with what stage 2 will ask Flow for.
    const kinds = [info.garment_kind, ...(info.assets ?? [])].filter(Boolean);
    const uniqueKinds = [...new Set(kinds)].filter(k => WANTED.includes(k));
    const jobs = expandAssetSelection(uniqueKinds).map(({ kind, angle }) => ({
      kind: kind.id,
      angle: angle.id,
      // Only the garment gets recoloured; shoes and bags stay as photographed
      // so they still match what a buyer would actually be sent.
      recolour: kind.id === info.garment_kind ? (info.garment_colour_new || null) : null,
      done: false,
      flowAsset: null,
    }));

    queue.photos = queue.photos.filter(p => p.file !== file);
    queue.photos.push({
      file,
      usable: true,
      subject: info.subject ?? "",
      category: CATEGORIES.includes(info.category) ? info.category : "portrait",
      occasion: info.occasion ?? "",
      garmentKind: info.garment_kind ?? null,
      garmentDescription: info.garment_description ?? "",
      colourOriginal: info.garment_colour_original ?? "",
      colourNew: info.garment_colour_new ?? "",
      notes: info.notes ?? "",
      jobs,
    });

    console.log(`${info.category.padEnd(12)} ${jobs.length} asset(s)  ${info.garment_colour_original || "?"} → ${info.garment_colour_new || "?"}`);
    done++;
    saveSoon(queue);
  }

  queue.scannedAt = new Date().toISOString();
  save(queue);

  const usable = queue.photos.filter(p => p.usable);
  const totalJobs = usable.reduce((n, p) => n + p.jobs.length, 0);
  console.log();
  log(`scanned ${queue.photos.length} photo(s): ${usable.length} usable, ${queue.photos.length - usable.length} skipped`);
  log(`${totalJobs} extraction(s) queued for Google Flow`);
  const byCat = {};
  for (const p of usable) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
  log("categories: " + Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(", "));
  log(`queue written to ${QUEUE_FILE}`);
}

/** Colours already handed out in this run, so the next photo avoids them. */
function usedColoursFrom(queue) {
  return [...new Set(
    queue.photos.filter(p => p.usable && p.colourNew).map(p => p.colourNew)
  )];
}

let saveTimer = null;
function saveSoon(q) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(q), 250);
}
function save(q) {
  clearTimeout(saveTimer);
  writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}

main().catch((e) => {
  console.error("scan failed:", e);
  process.exit(1);
});
