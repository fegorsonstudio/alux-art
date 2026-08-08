#!/usr/bin/env node
/**
 * qa-all.mjs — check every asset that survived the review.
 *
 * A human eye over 121 files catches the obvious failures; this catches the
 * quiet ones. Each asset is judged on whether a person is still in the frame,
 * the item is actually present, the background is clean, and — for a garment —
 * whether it was recoloured rather than redesigned.
 *
 *   node --env-file=.env.local scripts/wardrobe/qa-all.mjs
 *   node --env-file=.env.local scripts/wardrobe/qa-all.mjs --only reject
 *
 * Results are written back to the queue so the template build can refuse to use
 * a rejected asset. Costs nothing: same free Gemini key as the scanner.
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
const GARMENTS = new Set(["gown", "suit", "outfit"]);

/**
 * What "correct" looks like differs completely by kind, and one generic
 * standard rejected perfectly good work: nails were failed for showing a hand,
 * jewellery for sitting on a display bust, and backdrops for having no product
 * on a plain background. Nails need a hand. Jewellery needs a form. A backdrop
 * IS the background.
 */
const EXPECTATION = {
  nails: "A hand or fingers MUST be visible — nails cannot be shown without them. That is correct, not a fault. Reject only if a face or most of a body is in frame.",
  jewellery: "A neck form, bust, stand or ear form is CORRECT and expected. Reject only if a real person's face or body is shown.",
  wig: "A head form or invisible mannequin head is CORRECT and expected. Reject only if a real person's face is shown.",
  headwear: "A head form is CORRECT and expected. Reject only if a real person's face is shown.",
  backdrop: "This is a BACKDROP — the scene itself is the subject, so there is no product and no plain background to expect. It should be empty of people and free of text, logos and watermarks. Reject if a person appears or if it carries text.",
  shoes: "The footwear alone, no feet or legs.",
  bag: "The bag alone, no hands or body.",
  belt: "The belt alone, no body.",
};

const promptFor = (kind, colour) => `You are inspecting a product asset cut out of a photograph of a person.

It should show a ${kind}, presented as a catalogue asset.
${EXPECTATION[kind] ?? "The item alone on a plain background, with no person visible."}${
  colour ? `\nIt was deliberately recoloured to ${colour}. Construction — cut, neckline, sleeves, length, drape, beadwork, hardware — must be unchanged; only the colour should differ.` : ""
}

Return STRICT JSON, no markdown fence:
{
  "verdict": "good" | "usable" | "reject",
  "shows_person": true/false,
  "item_present": true/false,
  "background_clean": true/false,
  "problem": "one short phrase, or empty if fine"
}

Judge against the expectation stated above for THIS kind, not a generic one. Reject only for a real fault: a real person's face or body where it does not belong, the item missing entirely, text or a watermark, or a garment redesigned rather than recoloured. A display form, a hand holding nails, or a scene that is itself a backdrop are all correct.`;

async function main() {
  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const genai = new GoogleGenerativeAI(KEY);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const todo = [];
  for (const p of q.photos.filter(x => x.usable)) {
    for (const j of p.jobs) {
      if (!j.localFile) continue;
      if (j.qa && !FORCE) continue;
      todo.push({ p, j });
    }
  }
  log(`${todo.length} asset(s) to check`);

  const counts = { good: 0, usable: 0, reject: 0, error: 0 };
  let n = 0;
  for (const { p, j } of todo) {
    if (n >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    const file = join(ASSET_DIR, j.localFile);
    if (!existsSync(file)) continue;

    const colour = GARMENTS.has(j.kind) ? j.recolour : null;
    let out = null;
    for (let attempt = 1; attempt <= 3 && !out; attempt++) {
      try {
        const res = await model.generateContent([
          { inlineData: { data: readFileSync(file).toString("base64"), mimeType: MIME[extname(file).toLowerCase()] ?? "image/jpeg" } },
          promptFor(j.kind, colour),
        ]);
        out = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, "").trim());
      } catch {
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 4000));
      }
    }
    if (!out) { counts.error++; n++; continue; }

    j.qa = out;
    counts[out.verdict] = (counts[out.verdict] ?? 0) + 1;
    writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    n++;
    if (out.verdict === "reject") log(`REJECT  ${j.localFile}  — ${out.problem || (out.shows_person ? "person visible" : "unusable")}`);
  }

  console.log();
  log(`good ${counts.good} · usable ${counts.usable} · REJECT ${counts.reject} · errors ${counts.error}`);
  if (counts.reject) log("rejected assets are recorded in the queue; the template build will skip them");
}

main().catch((e) => { console.error("qa-all error:", e); process.exitCode = 1; });
