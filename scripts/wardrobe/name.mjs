#!/usr/bin/env node
/**
 * name.mjs — give every extracted asset a name a buyer would understand.
 *
 * The first build named each buyer choice after the SOURCE PHOTO's subject, so
 * a template offered three pairs of shoes all called "woman in a beaded gown".
 * Useless to choose between, and it would look careless on a live template.
 *
 * Gemini looks at each downloaded asset and returns a short product name —
 * "Gold strappy heels", "Black wavy lace front", "Nude almond nails". Same free
 * key as the scanner, no image generation, so this costs nothing.
 *
 *   node --env-file=.env.local scripts/wardrobe/name.mjs
 *   node --env-file=.env.local scripts/wardrobe/name.mjs --limit 5 --force
 *
 * Safe to re-run: assets already named are skipped unless --force.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");
const ASSET_DIR = join(ROOT, ".wardrobe-assets");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity; })();

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY not set"); process.exit(2); }

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const promptFor = (kind) => `Name this ${kind} the way a shop would label it, for a customer choosing between several.

Rules:
- 2 to 5 words. No sentence, no full stop.
- Lead with the colour, then the defining feature: "Gold strappy heels", "Black wavy lace front", "Nude almond nails", "Emerald beaded clutch".
- Describe the ITEM only. Never mention a person, a model, a photograph or a background.
- If several of the item are shown from different angles, name the item once.

Return ONLY the name, nothing else.`;

async function main() {
  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const genai = new GoogleGenerativeAI(KEY);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const todo = [];
  for (const p of q.photos.filter(x => x.usable)) {
    for (const j of p.jobs) {
      if (!j.localFile) continue;
      if (j.assetName && !FORCE) continue;
      todo.push({ p, j });
    }
  }
  log(`${todo.length} asset(s) to name`);
  if (!todo.length) return;

  let done = 0, failed = 0;
  for (const { p, j } of todo) {
    if (done >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    const file = join(ASSET_DIR, j.localFile);
    if (!existsSync(file)) { log(`✗ missing on disk: ${j.localFile}`); failed++; continue; }

    const mime = MIME[extname(file).toLowerCase()] ?? "image/jpeg";
    let name = null;
    for (let attempt = 1; attempt <= 3 && !name; attempt++) {
      try {
        const res = await model.generateContent([
          { inlineData: { data: readFileSync(file).toString("base64"), mimeType: mime } },
          promptFor(j.kind),
        ]);
        name = res.response.text().trim().replace(/^["'\s]+|["'.\s]+$/g, "").slice(0, 40);
      } catch (e) {
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 4000));
        else log(`✗ ${j.localFile} — ${String(e.message ?? e).slice(0, 60)}`);
      }
    }
    if (!name) { failed++; continue; }

    j.assetName = name;
    writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    done++;
    log(`✓ ${j.kind.padEnd(10)} ${name}`);
  }

  log(`named ${done}, failed ${failed}`);
}

main().catch((e) => { console.error("name error:", e); process.exitCode = 1; });
