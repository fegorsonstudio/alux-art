#!/usr/bin/env node
/**
 * build-smoke-launch.mjs — three carousels launching "Golden Rim in Smoke".
 *
 *   node scripts/carousel/build-smoke-launch.mjs
 *
 * The before/after is a real pair: the after is the relight the studio ran, and
 * the before is the same photograph already in the shots library (same woman,
 * same outfit, same pose). A mismatched pair reads as a fake comparison and has
 * shipped here once already, so the build refuses to run if either file moves.
 *
 * Every carousel carries the same emotional slide, in the owner's own words: the
 * argument is not "our software is clever", it is that a smoke machine costs
 * money, needs somewhere that will allow it, and still has to be cleaned up.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "smoke-launch.json");

const BEFORE = "scripts/carousel/shots/lighting/golden-hour-backlight-before.jpg";
const AFTER  = "scripts/carousel/shots/lighting/golden-rim-in-smoke-after.jpg";
for (const f of [BEFORE, AFTER]) {
  if (!existsSync(join(__dirname, "..", "..", f))) throw new Error(`missing asset: ${f}`);
}

// The owner's own pitch, tightened to fit a slide. Repeated across all three
// because it is the argument, not a line.
const EMOTIONAL = {
  type: "text",
  title: "No machine.\nNo lights.\nNo prompts.",
  body: "And no asking a venue whether you're allowed to fill their room with smoke. "
      + "Just *Alux Art* — no subscription, no monthly fee. You only pay for the photos you actually make.",
};

const CTA = {
  type: "cta",
  title: "Put smoke in a photo you already took.",
  body: "💬 Comment *LIGHT* and I'll send you the link.",
  link: "aluxartandframes.shop",
};

const carousels = [
  {
    id: "smoke-01-reveal",
    account: "fegorson_studio",
    caption:
      "Smoke you never had to buy.\n\n"
      + "This photo was already taken. The smoke, the glow behind her and the gold edge down her arm were added afterwards — by light, not by a machine.\n\n"
      + "“Golden Rim in Smoke.” New in the archive. ₦1,000 for one photo, no subscription.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#nigerianphotographer #portraitphotography #studiolighting #photographylighting #aluxart",
    slides: [
      { type: "beforeafter", fit: "cover", focus: "center 30%",
        title: "Smoke you never\nhad to buy.",
        body: "The same photograph, relit. Nothing in the frame moved.",
        before: BEFORE, after: AFTER },
      { type: "text", title: "The smoke isn't real.",
        body: "It was put there after the photo was taken — lit from behind so it glows, and kept off her face so nothing about her changes." },
      EMOTIONAL,
      { type: "text", title: "*₦1,000* for one photo.",
        body: "That is the whole price. Not a plan, not a trial, not a credit bundle you have to spend before it expires." },
      CTA,
    ],
  },
  {
    id: "smoke-02-permission",
    account: "fegorson_studio",
    caption:
      "Try firing a smoke machine in a hotel lobby.\n\n"
      + "Most venues won't have it. Fire alarms, other people's events, and somebody has to clear the haze afterwards.\n\n"
      + "So put the smoke in later. Same photo, same dress, same moment — “Golden Rim in Smoke”, ₦1,000.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#lagosphotographer #abujaphotographer #portraitphotography #studiolighting #aluxart",
    slides: [
      { type: "cover", eyebrow: "Alux Art",
        title: "Try firing a smoke\nmachine in a\nhotel lobby.",
        body: "Fire alarms. Other people's events. Somebody clearing the haze at midnight.",
        kicker: "There is another way" },
      { type: "beforeafter", fit: "cover", focus: "center 30%",
        title: "So add it afterwards.",
        body: "Shot in a normal studio. The smoke arrived later.",
        before: BEFORE, after: AFTER },
      EMOTIONAL,
      { type: "text", title: "Nothing about her changed.",
        body: "Same face, same wrapper, same pose, same moment. Only the air around her is different — which is the only thing you were ever missing." },
      CTA,
    ],
  },
  {
    id: "smoke-03-archive",
    account: "fegorson_studio",
    caption:
      "New in the archive: “Golden Rim in Smoke.”\n\n"
      + "Amber smoke lit from behind, a gold edge down the hair and shoulder, and the floor catching a warm pool of it.\n\n"
      + "One of 196 looks. Upload a photo you already shot, pick the look, download it relit. ₦1,000 per photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#photographylighting #portraitphotography #nigerianphotographer #lightroom #aluxart",
    slides: [
      { type: "cover", eyebrow: "New in the archive",
        title: "Golden Rim\nin Smoke.",
        body: "Amber smoke lit from behind. A gold edge down the hair and shoulder. The floor catching a warm pool of it.",
        kicker: "One of 196 looks" },
      { type: "beforeafter", fit: "cover", focus: "center 30%",
        title: "Before it existed,\nyou'd have hired a room.",
        body: "Now it is a photo you already have, and one choice.",
        before: BEFORE, after: AFTER },
      { type: "steps", title: "Four steps.",
        items: [
          "Upload the photo you already shot",
          "Pick “Golden Rim in Smoke” from the list",
          "Choose the shot size it was framed at",
          "Download it relit",
        ] },
      EMOTIONAL,
      CTA,
    ],
  },
];

writeFileSync(OUT, JSON.stringify(carousels, null, 2));
console.log(`${carousels.length} carousels -> ${OUT}`);
for (const c of carousels) console.log(`  ${c.id.padEnd(20)} ${c.slides.length} slides`);
