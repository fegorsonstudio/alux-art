#!/usr/bin/env node
/**
 * build-g7x-tutorial.mjs — the step-by-step for look 197, built to be sent in a DM.
 *
 *   node scripts/carousel/build-g7x-tutorial.mjs
 *   node scripts/carousel/render.mjs scripts/carousel/g7x-tutorial.json "<out dir>"
 *
 * Screenshots are the real product, captured signed in against production by
 * scripts/carousel/capture-g7x-tutorial.mjs and the live browser. Nothing is
 * mocked up and nothing was paid for — the capture stops at the Pay button.
 *
 * DM, not feed. So the close is the link rather than "comment LIGHT": the person
 * reading this already replied, and asking them to comment again is a step
 * backwards.
 *
 * The 3:4 crop is step 2 rather than a footnote. It is the one instruction that
 * silently ruins a result — a photo of another shape gets cropped to fit, and
 * the buyer loses part of their frame without being told twice.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "g7x-tutorial.json");
const SHOTS = "scripts/carousel/shots/g7x-tutorial";
const PAIR = "scripts/carousel/shots/lighting";

const need = (f) => {
  if (!existsSync(join(__dirname, "..", "..", f))) throw new Error(`missing asset: ${f}`);
  return f;
};

const BEFORE = need(`${PAIR}/g7x-paparazzi-before.jpg`);
const AFTER  = need(`${PAIR}/g7x-paparazzi-after.jpg`);
const S1 = need(`${SHOTS}/live-step1.jpg`);
const S2 = need(`${SHOTS}/live-step2.jpg`);
const S4 = need(`${SHOTS}/live-step4.jpg`);

const carousels = [
  {
    id: "g7x-tutorial",
    account: "fegorson_studio",
    caption:
      "How to do it yourself, step by step.\n\n"
      + "1. Open The Gear Equalizer on aluxartandframes.shop\n"
      + "2. Crop your photo to 3:4, then upload it\n"
      + "3. Type 197 in the search box — it picks the look for you\n"
      + "4. Leave the background alone\n"
      + "5. Pay ₦1,000 and download it\n\n"
      + "The look is \"197 · S Night Paparazzi G7X\". You do not have to remember the name — the number is enough.\n\n"
      + "Works on any photo you already have. Dark club, dim restaurant, bad hall lighting, night shots on your phone.\n\n"
      + "🔗 aluxartandframes.shop\n\n"
      + "#photographytutorial #lagosnightlife #nigerianphotographer #phonephotography #aluxart",
    slides: [
      { type: "beforeafter", fit: "cover", focus: "center 20%",
        title: "How this was done.", body: "Five steps. Two minutes. The photo already existed.",
        before: BEFORE, after: AFTER },

      { type: "shot", title: "1. Open the template.",
        body: "*aluxartandframes.shop* → The Gear Equalizer. Tap *Book this look*.",
        image: S1 },

      { type: "shot", title: "2. Crop to 3:4, then upload.",
        body: "Do the crop *first*. A photo of another shape gets cropped to fit, and you lose part of your frame.",
        image: S2 },

      { type: "shot", title: "3. Type *197*.",
        body: "One look comes up and it is already chosen. That is the whole search — no scrolling through 197 tiles.",
        image: S4 },

      { type: "text", title: "4. Leave the background alone.",
        body: "It should say *keeping yours*. The look is about the light on you, not the room — the club, the restaurant, the hallway all stay exactly where you were." },

      { type: "steps", title: "The whole thing.",
        items: [
          "Open The Gear Equalizer",
          "Crop to 3:4 and upload",
          "Type *197* in the search box",
          "Leave the background as it is",
          "Pay *₦1,000* and download",
        ] },

      { type: "text", title: "One photo. ₦1,000.",
        body: "No subscription and no app to install. Upload up to 10 at once if you have a whole night to fix — you pay per photo." },

      { type: "cta", eyebrow: "Try it on yours",
        title: "Look 197.",
        body: "Send me the one that came out too dark and I'll tell you if it will work.",
        link: "aluxartandframes.shop" },
    ],
  },
];

writeFileSync(OUT, JSON.stringify(carousels, null, 2));
console.log(`${carousels.length} carousel -> ${OUT}`);
for (const c of carousels) console.log(`  ${c.id.padEnd(16)} ${c.slides.length} slides  (${c.slides[0].type} first)`);
