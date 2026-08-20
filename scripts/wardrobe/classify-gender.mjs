#!/usr/bin/env node
/**
 * classify-gender.mjs — tag every library asset as womenswear, menswear or unisex.
 *
 *   node --env-file=.env.local scripts/wardrobe/classify-gender.mjs
 *   node --env-file=.env.local scripts/wardrobe/classify-gender.mjs --recheck
 *
 * WHY THIS EXISTS. Buyer choice options carry no gender: the option JSON has
 * only id, kind, name, imagePath, imageBucket, description and framing. So when
 * a template pools accessories from the whole library it offers oxfords and a
 * men's jewellery set on a womenswear template. There is nothing in the data to
 * filter on, so this builds that missing fact once and caches it.
 *
 * Names alone are not enough — "Caramel Yellow", "Gold watch", "socks" and
 * "Hand accessories" say nothing about who wears them — so each asset is judged
 * from its image by Gemini (free on the existing key) and cached by storage
 * path. Re-running only classifies assets it has not seen.
 *
 * The result is written to gender-map.json and is READ-ONLY as far as the
 * database is concerned: this script never writes to templates. The pooling
 * step consults the map. That keeps a misclassification cheap to correct.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = join(__dirname, "gender-map.json");

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY not set"); process.exit(2); }
const RECHECK = process.argv.includes("--recheck");

const SITE = process.env.ALUX_SITE || "https://aluxartandframes.shop";
const mediaUrl = (bucket, path) =>
  `${SITE}/api/media?b=${encodeURIComponent(bucket || "template-images")}&p=${encodeURIComponent(path)}`;

/** Only these types can be gendered. Backdrops, lighting and props like a chair
 *  are worn by nobody, so they stay unisex and are never sent to the model. */
const GENDERED = new Set(["shoes", "accessory", "hairstyle", "outfit", "makeup", "nails"]);

const PROMPT = `You are sorting a fashion studio's asset library.

Look at this product image and answer with ONE word, lowercase, nothing else:

  women   - made for and worn by women (heels, pumps, women's jewellery, wigs,
            women's handbags, dresses, nail sets, women's tailoring)
  men     - made for and worn by men (oxfords, derbies, brogues, loafers styled
            for men, monk straps, men's jewellery, men's suiting, ties, men's caps)
  unisex  - genuinely worn by either (plain watches, sunglasses, plain sneakers,
            plain socks, plain belts, scarves, backdrops, props, furniture)

If the item is clearly a men's dress shoe, answer men even when the colour is
unusual. If you cannot tell, answer unisex.`;

async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { ssl: false });

  const rows = await sql`
    SELECT g->>'type' AS type, o->>'name' AS name,
           o->>'imagePath' AS path, COALESCE(o->>'imageBucket','template-images') AS bucket
    FROM templates t, jsonb_array_elements(t.option_groups) g, jsonb_array_elements(g->'options') o
    WHERE o->>'kind' = 'photo' AND o->>'imagePath' IS NOT NULL`;
  await sql.end();

  // De-duplicate: the same asset is pooled into many templates, and classifying
  // it once per template would be dozens of needless calls.
  const byPath = new Map();
  for (const r of rows) if (!byPath.has(r.path)) byPath.set(r.path, r);

  const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {};
  const genai = new GoogleGenerativeAI(KEY);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  let done = 0, skipped = 0, failed = 0;
  for (const [path, r] of byPath) {
    if (!GENDERED.has(r.type)) { map[path] = { gender: "unisex", type: r.type, name: r.name, why: "type" }; skipped++; continue; }
    if (map[path] && !RECHECK) { skipped++; continue; }

    try {
      const res = await fetch(mediaUrl(r.bucket, path));
      if (!res.ok) throw new Error(`media ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = await model.generateContent([
        PROMPT,
        { inlineData: { mimeType: res.headers.get("content-type") || "image/jpeg", data: buf.toString("base64") } },
      ]);
      const word = (out.response.text() || "").trim().toLowerCase().replace(/[^a-z]/g, "");
      const gender = word === "women" ? "women" : word === "men" ? "men" : "unisex";
      map[path] = { gender, type: r.type, name: r.name };
      writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
      done++;
      console.log(`${gender.padEnd(6)} ${r.type.padEnd(10)} ${r.name}`);
    } catch (e) {
      failed++;
      console.log(`FAILED ${r.type} ${r.name}: ${e.message}`);
    }
  }

  const tally = Object.values(map).reduce((a, v) => (a[v.gender] = (a[v.gender] ?? 0) + 1, a), {});
  console.log(`\n${done} classified, ${skipped} skipped, ${failed} failed`);
  console.log("totals:", JSON.stringify(tally));
  console.log(`map: ${MAP_FILE}`);
}

main().catch(e => { console.error("classify error:", e); process.exitCode = 1; });
