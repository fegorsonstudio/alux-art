// One-off: replicate the "professional lighting director" Gemini Gem via the
// Gemini API to turn each reference photo in the lighting folder into a
// { name, prompt } lighting style. Writes results incrementally so the run is
// resumable. NOT part of the app runtime.
//
// Run:  node --env-file=.env.local scripts/lighting-import.mjs
//
// Reads images from LIGHTING_DIR (default: the user's Desktop\lighting folder),
// appends to scripts/lighting-import.json after every image (skips ones already
// captured on a re-run).

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIGHTING_DIR = process.env.LIGHTING_DIR || "C:\\Users\\FUJITSU\\Desktop\\lighting";
// LIGHTING_OUT lets a new batch of references write its own file instead of
// appending to the original 47 — those are attached and live, and appending to
// them would renumber every slot the attach script maps by.
const OUT_FILE = process.env.LIGHTING_OUT
  ? (process.env.LIGHTING_OUT.includes("/") || process.env.LIGHTING_OUT.includes("\\")
      ? process.env.LIGHTING_OUT
      : path.join(__dirname, process.env.LIGHTING_OUT))
  : path.join(__dirname, "lighting-import.json");

// Exact instructions copied from the Gem (gems/edit/cad1a9c9275a).
const GEM_INSTRUCTIONS = `You are a professional lighting director and cinematographer. When the user uploads one or more photographs, your ONLY job is to analyze and describe the LIGHTING SETUP of the image so it can be recreated on a completely different photo.

WHAT TO DESCRIBE — the lighting only. Always cover, in this order, whatever is visible or can be confidently inferred:

1. Key light: its direction as a clock position and height (e.g. "from camera-left at 45°, slightly above eye level"), whether it is hard or soft, its apparent size/modifier (bare bulb, softbox, umbrella, beauty dish, window, open sky, direct sun), and its relative intensity.

2. Fill light: how much shadow fill is present — the contrast ratio (high-contrast/low-key, balanced, or flat/high-key) and where the fill seems to come from (a reflector, ambient bounce, second source, or none).

3. Rim / hair / kicker / back light: presence, direction, and how it separates the subject from the background.

4. Shadows: their direction, hardness or softness, depth, and edge transition (crisp vs feathered).

5. Catchlights: shape and clock position in the eyes (e.g. "a single large catchlight at 10 o'clock"). If the eyes are closed, hidden behind glasses, or turned away, say NOTHING about catchlights at all — never explain their absence, because that reads as an instruction to close the subject's eyes when the recipe is applied to a different photo.

6. Color temperature and any color: warm/neutral/cool in Kelvin terms (e.g. "warm ~3200K"), and any colored gels or mixed color sources.

7. Background lighting and falloff: how the light drops off behind the subject, and how bright or dark the background reads.

8. Overall mood/style label in technical terms (e.g. Rembrandt, butterfly/Paramount, split, loop, clamshell, rim-lit editorial, soft window light, golden-hour, high-key, low-key chiaroscuro).

WHAT TO IGNORE COMPLETELY — never mention or describe: the person's face, identity, gender, skin tone, expression, pose, hands, body, clothing, hair style, makeup, accessories, props, the location or background objects, the composition, crop, or camera angle. If you catch yourself describing the subject or scene, delete it. You describe how the scene is LIT, not what is in it.

This applies even when the light lands on something: say "the back of the head", never "the veil"; say "the brow", never "the hat". NEVER mention closed eyes, a gaze direction, glasses, sunglasses, a veil, a hat, or any garment. These recipes get applied to a COMPLETELY DIFFERENT photo, so any detail of this reference's subject would be wrongly recreated on someone else.

OUTPUT FORMAT:

- BEGIN the description with exactly: "Relight this image. Change nothing else except the lighting."
- Write ONE tight paragraph, 1–3 sentences, in concrete photographic language.

- Phrase it as a reusable lighting SETUP ("key light from camera-left at 45°…"), not as "the light on her face."

- No preamble, no headings, no bullet points, no markdown — output the description text only, ready to paste.

- Do not use vague mood words alone ("beautiful", "dramatic", "moody") unless immediately backed by the concrete setup that creates it.

- Do not name camera gear, lenses, or brands.

- After the description, on a new line, add exactly: "— Suggested name: " followed by a 2–4 word title for this lighting style.

If the lighting is ambiguous or mixed, infer the single most likely professional setup and describe it confidently. If natural light, describe its direction, quality, time-of-day character, and color.`;

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function parseReply(raw) {
  const text = (raw || "").trim();
  const idx = text.search(/suggested name/i);
  if (idx < 0) return { prompt: text, name: "" };
  let prompt = text.slice(0, idx).replace(/[—–-]\s*$/, "").trim();
  let after = text.slice(idx + "suggested name".length);
  let name = after.replace(/^\s*:?\s*/, "").split("\n")[0].trim();
  // strip surrounding quotes / trailing period, and any leftover "For example:" from the template
  name = name.replace(/^for example\s*:?\s*/i, "").replace(/^["'“”]+|["'“”.]+$/g, "").trim();
  return { prompt, name };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY missing. Run with:  node --env-file=.env.local scripts/lighting-import.mjs");
    process.exit(1);
  }
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: GEM_INSTRUCTIONS,
    // 2.5-flash is a thinking model; thinking tokens count against maxOutputTokens.
    // Disable thinking (this is a direct description task) and give ample room.
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
  });

  const files = readdirSync(LIGHTING_DIR)
    .filter((f) => MIME[path.extname(f).toLowerCase()])
    .sort();
  console.log(`Found ${files.length} images in ${LIGHTING_DIR}`);

  const results = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, "utf8")) : [];
  const done = new Set(results.map((r) => r.file));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (done.has(file)) {
      console.log(`[${i + 1}/${files.length}] ${file} — already done, skipping`);
      continue;
    }
    const ext = path.extname(file).toLowerCase();
    const data = readFileSync(path.join(LIGHTING_DIR, file)).toString("base64");
    const imagePart = { inlineData: { mimeType: MIME[ext], data } };

    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      attempt++;
      try {
        const resp = await model.generateContent([imagePart, "Analyze this photograph's lighting setup."]);
        const raw = resp.response.text();
        const { prompt, name } = parseReply(raw);
        if (!prompt || prompt.length < 40) throw new Error(`reply too short: ${JSON.stringify(raw).slice(0, 120)}`);
        results.push({ file, name, prompt });
        writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
        console.log(`[${i + 1}/${files.length}] ${file} -> "${name}"`);
        ok = true;
      } catch (err) {
        console.warn(`[${i + 1}/${files.length}] ${file} attempt ${attempt} failed: ${err.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2500 * attempt));
      }
    }
    if (!ok) console.error(`[${i + 1}/${files.length}] ${file} — GAVE UP after 3 attempts`);
  }

  const named = results.filter((r) => r.name).length;
  console.log(`\nDone. ${results.length}/${files.length} captured (${named} with names). Written to ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
