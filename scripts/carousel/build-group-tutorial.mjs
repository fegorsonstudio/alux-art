#!/usr/bin/env node
/**
 * build-group-tutorial.mjs — the wine relight, taught step by step.
 *
 *   node scripts/carousel/build-group-tutorial.mjs
 *
 * For the Telegram channel and the WhatsApp group, which are NOT Instagram:
 * there is no "comment LIGHT" keyword there and no DM automation behind it, so
 * both versions close on the link itself. Sending people to a keyword that only
 * works on another platform is the kind of small wrongness that wastes a post.
 *
 * The screenshots are frames from the studio's own 4-minute screen recording,
 * cropped to the phone screen (the recording is 2160x3840 with the handset
 * inset, so the black surround comes off via cropdetect). Real screens rather
 * than mockups: the point of a tutorial is that the reader recognises what they
 * are looking at when they get there.
 *
 * Slides are identical for both platforms. Only the caption changes, because
 * only the caption needs to.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "group-tutorial.json");
const ROOT = join(__dirname, "..", "..");

const BEFORE = "scripts/carousel/shots/lighting/wine-dark-backlight-before.jpg";
const AFTER  = "scripts/carousel/shots/lighting/wine-dark-backlight-after.jpg";
const S = (n) => `scripts/carousel/shots/tutorial-wine/${n}.jpg`;

const need = [BEFORE, AFTER, S("step1-size"), S("step2b-upload"), S("step3-look"), S("step4-save"), S("step5-result")];
for (const f of need) if (!existsSync(join(ROOT, f))) throw new Error(`missing asset: ${f}`);

const SLIDES = [
  { type: "beforeafter", fit: "cover", focus: "center 25%",
    title: "How I made this.",
    body: "A photo shot against a plain yellow wall, relit as “Wine Dark Backlight”. Step by step 👉",
    before: BEFORE, after: AFTER },

  { type: "shot", fit: "contain",
    title: "1. Pick the size first.",
    body: "It opens on *3:4*. Whatever you choose, crop your photo to that shape BEFORE you upload — a different shape gets cropped to fit and you can lose part of the frame.",
    image: S("step1-size") },

  { type: "shot", fit: "contain",
    title: "2. Upload the photo.",
    body: "One to ten photos, and you pay per photo. The looks are grouped by *headshot*, *waist-up* and *full body*, so you judge each one on the crop you actually shot.",
    image: S("step2b-upload") },

  { type: "shot", fit: "contain",
    title: "3. Pick a look.",
    body: "196 of them, each one named. This is where “Wine Dark Backlight” lives — under *Medium shots*, because that is the crop it was built for.",
    image: S("step3-look") },

  { type: "shot", fit: "contain",
    title: "4. Preview before you commit.",
    body: "Press and hold any look to see it against the original. *Drag to compare.* You are not guessing from a thumbnail.",
    image: S("step4-save") },

  { type: "shot", fit: "contain",
    title: "5. Backdrop, only if you want one.",
    body: "Keep your own background, pick a studio backdrop, or upload your own. Then *Pay & Generate* — ₦1,000 for one photo.",
    image: S("step5-result") },

  { type: "cta",
    title: "That's the whole thing.",
    body: "No smoke machine, no second flash, no subscription. Open it and try one photo: *aluxartandframes.shop*",
    link: "aluxartandframes.shop" },
];

const TELEGRAM_CAPTION =
  "HOW TO RELIGHT A PHOTO YOU ALREADY SHOT\n\n"
  + "This one was taken against a plain yellow wall. No smoke machine, no gels, no second flash — the wine background and the red edge were added afterwards, by light.\n\n"
  + "The five steps are in the images above:\n"
  + "1. Pick your output size, and crop your photo to it first\n"
  + "2. Upload the photo (1–10 at a time, you pay per photo)\n"
  + "3. Pick from 196 looks, grouped by shot size\n"
  + "4. Press and hold any look to preview it on YOUR photo\n"
  + "5. Choose a backdrop if you want one, then generate\n\n"
  + "₦1,000 per photo. No subscription — you pay for the photos you make.\n\n"
  + "👉 aluxartandframes.shop";

const WHATSAPP_CAPTION =
  "*How to relight a photo you already shot* 📸\n\n"
  + "The photo above was taken against a plain yellow wall. The wine background and the red edge on her arm were added afterwards — no smoke machine, no gels, no second flash.\n\n"
  + "Five steps, all in the images:\n\n"
  + "1️⃣ Pick your output size — crop your photo to that shape first\n"
  + "2️⃣ Upload the photo (1 to 10, you pay per photo)\n"
  + "3️⃣ Pick from 196 looks, grouped by headshot / waist-up / full body\n"
  + "4️⃣ Press and hold a look to preview it on your own photo before choosing\n"
  + "5️⃣ Add a backdrop if you want one, then generate\n\n"
  + "*₦1,000 per photo.* No subscription, no monthly fee.\n\n"
  + "Try it here 👉 https://aluxartandframes.shop";

const carousels = [
  { id: "tutorial-telegram", account: "telegram", caption: TELEGRAM_CAPTION, slides: SLIDES },
  { id: "tutorial-whatsapp", account: "whatsapp", caption: WHATSAPP_CAPTION, slides: SLIDES },
];

writeFileSync(OUT, JSON.stringify(carousels, null, 2));
console.log(`${carousels.length} tutorial sets -> ${OUT}`);
for (const c of carousels) console.log(`  ${c.id.padEnd(20)} ${c.slides.length} slides`);
