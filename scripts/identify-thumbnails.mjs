#!/usr/bin/env node
/**
 * identify-thumbnails.mjs — work out which lighting style each downloaded image
 * actually shows, by looking at the image.
 *
 *   node --env-file=.env.local scripts/identify-thumbnails.mjs
 *
 * The files in .playwright-mcp/thumbnails/ carry slot names assigned by grid
 * ORDER, and that turned out to be wrong (12-cool-ripple-projection.png is a warm
 * amber portrait with no ripple). Order and filename timestamps are both
 * unreliable here; the pixels are not. So each image is shown to a vision model
 * alongside the candidate recipes and asked to pick the one it matches.
 *
 * Framing narrows it hard before the lighting question is even asked: a style is
 * tagged full / medium / head, and those look nothing alike, so the candidate set
 * drops from 47 to roughly 9-29. Output is written for review, NOT applied.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIR = join(ROOT, ".playwright-mcp", "thumbnails");
const OUT = join(__dirname, "lighting-thumbnail-identified.json");

const styles = JSON.parse(readFileSync(join(__dirname, "lighting-import.json"), "utf8"))
  .map((s, i) => ({ slot: i + 1, name: s.name, framing: s.framing, recipe: s.prompt.replace(/^Relight this image\.[^.]*\.\s*/, "") }));

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: { maxOutputTokens: 300, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".png")).sort();
  console.log(`identifying ${files.length} images against ${styles.length} styles\n`);

  const out = [];
  for (const file of files) {
    const data = readFileSync(join(DIR, file)).toString("base64");

    // Step 1: framing, which alone eliminates most candidates.
    const fr = await model.generateContent([
      { inlineData: { mimeType: "image/png", data } },
      'Shot framing of this photo in ONE word: "full" (whole body incl. legs), "medium" (waist-up), or "head" (head and shoulders only). One word only.',
    ]);
    const framing = (fr.response.text() || "").trim().toLowerCase().replace(/[^a-z]/g, "");

    const candidates = styles.filter((s) => s.framing === framing);
    const pool = candidates.length ? candidates : styles;

    // Step 2: which recipe does the light in this image match?
    const list = pool.map((s) => `${s.slot}. ${s.name} :: ${s.recipe.slice(0, 200)}`).join("\n");
    const pick = await model.generateContent([
      { inlineData: { mimeType: "image/png", data } },
      `Below are candidate lighting setups. Judging ONLY by the light in this photograph — key direction and hardness, contrast, any colour gel, background treatment, patterns or projections — say which ONE it is.\n\n${list}\n\nReply exactly: <slot number>|<confidence high|medium|low>|<six words why>`,
    ]);
    const [slotRaw, conf, why] = (pick.response.text() || "").trim().split("|");
    const slot = parseInt(slotRaw, 10);
    const style = styles.find((s) => s.slot === slot);

    out.push({ file, detectedFraming: framing, slot: slot || null, name: style?.name ?? null, confidence: (conf || "").trim(), why: (why || "").trim() });
    console.log(`${file.padEnd(42)} -> ${String(slot || "?").padStart(2)} ${(style?.name ?? "UNMATCHED").padEnd(32)} [${framing}] ${(conf || "").trim()}`);
    await sleep(300);
  }

  // Conflicts matter more than any single answer: two images claiming one style
  // means the identification is not trustworthy for those.
  const bySlot = out.reduce((m, r) => ((m[r.slot] = (m[r.slot] || []).concat(r.file)), m), {});
  const dupes = Object.entries(bySlot).filter(([s, fs]) => s !== "null" && fs.length > 1);
  const missing = styles.filter((s) => !out.some((r) => r.slot === s.slot));

  console.log(`\nunique styles matched: ${Object.keys(bySlot).length}`);
  console.log(`duplicate claims: ${dupes.length}`);
  for (const [s, fs] of dupes.slice(0, 10)) console.log(`  slot ${s}: ${fs.join(", ")}`);
  console.log(`styles with no image: ${missing.length}${missing.length ? " -> " + missing.map((m) => m.slot).join(", ") : ""}`);
  const low = out.filter((r) => r.confidence === "low").length;
  console.log(`low-confidence: ${low}`);

  writeFileSync(OUT, JSON.stringify({ identified: out, duplicates: dupes, missingSlots: missing.map((m) => m.slot) }, null, 2));
  console.log(`\nwritten to ${OUT} — review before renaming or attaching anything.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
