#!/usr/bin/env node
/**
 * qa.mjs — check an extracted asset actually came out usable.
 *
 * An extraction can fail in ways that are invisible until a buyer's shoot comes
 * back wrong: a person still in the frame, the garment redesigned rather than
 * recoloured, a mannequin's hollow shape baked in, the background not clean.
 * Reviewing 212 of those by eye is not realistic, so Gemini does the looking on
 * the same free key the scanner uses.
 *
 *   node --env-file=.env.local scripts/wardrobe/qa.mjs <image> [--kind gown] [--colour "deep emerald"]
 *
 * Prints a verdict and the reasons. Exit code 1 when the asset should not be
 * used, so this can gate the template build later.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const argOf = (n, d = "") => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const KIND = argOf("--kind", "asset");
const COLOUR = argOf("--colour", "");

if (!file) { console.error("usage: qa.mjs <image> [--kind gown] [--colour \"deep emerald\"]"); process.exit(2); }
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY not set"); process.exit(2); }

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const prompt = `You are inspecting a product asset that was cut out of a photograph of a person.

The asset should be a ${KIND}, presented alone as a catalogue product shot on a plain background.${
  COLOUR ? `\nIt was deliberately recoloured to ${COLOUR}. Its construction — cut, neckline, sleeves, length, drape, beadwork, embroidery, sequins, hardware — must be unchanged; only the colour should differ.` : ""
}

The screenshot may include surrounding application interface. Judge ONLY the generated asset image itself, not the page around it.

Return STRICT JSON, no markdown fence:

{
  "verdict": "good" | "usable" | "reject",
  "shows_person": true/false,
  "person_detail": "what of a person is visible (face, hands, legs, whole body) or empty",
  "background_clean": true/false,
  "item_present": true/false,
  "actual_colour": "the colour the item actually is",${COLOUR ? `\n  "colour_matches_request": true/false,` : ""}
  "construction_preserved": true/false,
  "problems": ["short specific problems"],
  "summary": "one sentence a person can act on"
}

Judge harshly. "reject" if a person is visible, if the item is missing, or if the item has clearly been redesigned rather than recoloured.`;

const buf = readFileSync(file);
const mime = MIME[extname(file).toLowerCase()];
if (!mime) { console.error(`unsupported file type: ${extname(file)}`); process.exit(2); }

const genai = new GoogleGenerativeAI(KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
const res = await model.generateContent([
  { inlineData: { data: buf.toString("base64"), mimeType: mime } },
  prompt,
]);

let out;
try {
  out = JSON.parse(res.response.text().trim().replace(/^```(?:json)?|```$/g, "").trim());
} catch {
  console.error("could not parse the model's answer:\n" + res.response.text().slice(0, 400));
  process.exit(2);
}

console.log(`${basename(file)}  [${KIND}${COLOUR ? " → " + COLOUR : ""}]`);
console.log(`  verdict:      ${out.verdict}`);
console.log(`  item present: ${out.item_present}`);
console.log(`  shows person: ${out.shows_person}${out.person_detail ? ` (${out.person_detail})` : ""}`);
console.log(`  background:   ${out.background_clean ? "clean" : "NOT clean"}`);
console.log(`  colour:       ${out.actual_colour}${
  out.colour_matches_request === undefined ? "" : out.colour_matches_request ? "  (matches)" : "  (DOES NOT MATCH)"}`);
console.log(`  construction: ${out.construction_preserved ? "preserved" : "CHANGED"}`);
if (out.problems?.length) for (const p of out.problems) console.log(`  problem:      ${p}`);
console.log(`  summary:      ${out.summary}`);

// Set the code rather than calling process.exit(): exiting while the Gemini
// client still has a handle open trips a libuv assertion on Windows, which
// turned a clean pass into exit 127 and would break using this as a gate.
process.exitCode = out.verdict === "reject" ? 1 : 0;
