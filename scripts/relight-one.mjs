#!/usr/bin/env node
/**
 * relight-one.mjs — relight a single local photo, for testing a directive
 * before it becomes a look anyone can buy.
 *
 *   node scripts/relight-one.mjs --image <file> --prompt <file> --aspect 3:4 \
 *        --model both --out /tmp/out
 *
 * --model  nano | gpt | both
 *
 * Runs ON THE VPS (needs FAL_KEY). Every run costs real generations, so it does
 * nothing without --apply.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fal } from "@fal-ai/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IMAGE = arg("--image");
const PROMPT_FILE = arg("--prompt");
const ASPECT = arg("--aspect", "4:5");
const MODEL = arg("--model", "both");
const OUT = arg("--out", "/tmp/relight");
const APPLY = process.argv.includes("--apply");
if (!IMAGE || !PROMPT_FILE) { console.error("usage: --image <file> --prompt <file> [--aspect 4:5] [--model both] [--out dir] --apply"); process.exit(2); }

const envPath = existsSync("/home/aluxart/app/.env.local") ? "/home/aluxart/app/.env.local" : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
fal.config({ credentials: env.FAL_KEY });

// Same table as lib/generate.ts. GPT Image 2 has no aspect_ratio input and 4:5
// is not one of its presets, so ratios are given real pixel dimensions.
const GPT_SIZES = {
  "4:5": { width: 1024, height: 1280 }, "3:4": { width: 1024, height: 1365 },
  "2:3": { width: 1024, height: 1536 }, "9:16": { width: 864, height: 1536 },
  "1:1": { width: 1024, height: 1024 },
};

const prompt = readFileSync(PROMPT_FILE, "utf8").trim();

async function main() {
  mkdirSync(OUT, { recursive: true });
  const buf = readFileSync(IMAGE);
  console.log(`source : ${basename(IMAGE)}  ${(buf.length / 1048576).toFixed(1)}MB`);
  console.log(`aspect : ${ASPECT}`);
  console.log(`models : ${MODEL}`);
  console.log(`prompt : ${prompt.length} chars`);
  if (!APPLY) { console.log("\nno --apply, nothing spent."); return; }

  const url = await fal.storage.upload(new Blob([buf], { type: "image/jpeg" }));
  const runs = MODEL === "both" ? ["nano", "gpt"] : [MODEL];

  for (const m of runs) {
    const label = m === "gpt" ? "openai/gpt-image-2/edit" : "fal-ai/nano-banana-2/edit";
    console.log(`\n${label} ...`);
    try {
      const input = m === "gpt"
        ? { prompt, image_urls: [url], image_size: GPT_SIZES[ASPECT] ?? GPT_SIZES["4:5"], quality: "high", num_images: 1, output_format: "png" }
        : { prompt, image_urls: [url], aspect_ratio: ASPECT, num_images: 1, output_format: "png", safety_tolerance: "6", limit_generations: false };
      const res = await fal.subscribe(label, { input });
      const out = res?.data || res;
      const imgs = out.images ?? [];
      const got = imgs[imgs.length - 1]?.url;
      if (!got) { console.log("  no image returned"); continue; }
      const png = Buffer.from(await (await fetch(got)).arrayBuffer());
      const file = join(OUT, `${m}.png`);
      writeFileSync(file, png);
      console.log(`  wrote ${file}  ${(png.length / 1048576).toFixed(1)}MB`);
    } catch (e) {
      const err = e;
      console.log(`  FAILED: ${err?.message ?? e}`, err?.body ? JSON.stringify(err.body).slice(0, 300) : "");
    }
  }
}

main().catch(e => { console.error("error:", e.message); process.exitCode = 1; });
