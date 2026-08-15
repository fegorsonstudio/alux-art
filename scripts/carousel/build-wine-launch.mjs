#!/usr/bin/env node
/**
 * build-wine-launch.mjs — four carousels for "Wine Dark Backlight".
 *
 *   node scripts/carousel/build-wine-launch.mjs
 *
 * Three sell the look. The fourth sends people to the tutorial in the story, so
 * it closes on "watch the story" rather than the usual comment-LIGHT keyword —
 * two different asks in one post gets neither.
 *
 * Every one opens on the before/after. The owner reads the engagement as
 * favouring an image in slide 1 over a text cover, and these are hand-posted, so
 * the hook has to carry itself without a caption underneath it.
 *
 * The pair is real: the after is the studio's own relight of the before, same
 * dress, same hands, same beadwork. "Wine Dark Backlight" is the exact name of
 * the look in the library — worth keeping accurate, because anyone who comments
 * LIGHT will go looking for it by that name.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "wine-launch.json");

const BEFORE = "scripts/carousel/shots/lighting/wine-dark-backlight-before.jpg";
const AFTER  = "scripts/carousel/shots/lighting/wine-dark-backlight-after.jpg";
for (const f of [BEFORE, AFTER]) {
  if (!existsSync(join(__dirname, "..", "..", f))) throw new Error(`missing asset: ${f}`);
}

const HERO = (title, body) => ({
  type: "beforeafter", fit: "cover", focus: "center 25%",
  title, body, before: BEFORE, after: AFTER,
});

const NO_SUBSCRIPTION = {
  type: "text",
  title: "No gels.\nNo second flash.\nNo repaint.",
  body: "And no subscription. *₦1,000* for one photo — you pay for the photos you actually make, not for a month you might not use.",
};

const CTA_KEYWORD = {
  type: "cta",
  title: "Relight one of yours.",
  body: "💬 Comment *LIGHT* and I'll send you the link.",
  link: "aluxartandframes.shop",
};

const carousels = [
  {
    id: "wine-01-reveal",
    account: "fegorson_studio",
    caption:
      "Same photo. New light.\n\n"
      + "This was shot against a plain yellow wall. The wine, the glow behind her and the red edge down her arm were added afterwards — nothing in the frame moved.\n\n"
      + "“Wine Dark Backlight.” One of 196 looks. ₦1,000 for one photo, no subscription.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#nigerianphotographer #portraitphotography #studiolighting #photographylighting #asoebi #aluxart",
    slides: [
      HERO("Same photo.\nNew light.", "“Wine Dark Backlight” applied to a photo that was already taken."),
      { type: "text", title: "The yellow wall is gone.",
        body: "So is the flat light. Same dress, same beadwork, same hands — photographed in a room that was never there." },
      NO_SUBSCRIPTION,
      { type: "text", title: "Nothing about her changed.",
        body: "Not the face, not the fabric, not the pose. Only the light falling on it, which is the part a backdrop and two heads would have cost you a day to build." },
      CTA_KEYWORD,
    ],
  },
  {
    id: "wine-02-already-shot",
    account: "fegorson_studio",
    caption:
      "You already took the photo.\n\n"
      + "That is the part people miss. There is no reshoot, no studio booking, no second outfit. The picture exists — it was only ever lit wrong.\n\n"
      + "“Wine Dark Backlight”, ₦1,000 for one photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#lagosphotographer #abujaphotographer #portraitphotography #studiolighting #aluxart",
    slides: [
      HERO("You already\ntook the photo.", "It was only ever lit wrong."),
      { type: "text", title: "No reshoot.",
        body: "No studio booking, no getting her back into the dress, no second make-up chair. The frame you already have is the raw material." },
      { type: "text", title: "*196 looks.*",
        body: "Wine, smoke, hard key, window light, stage spots, gels. Grouped by headshot, waist-up and full body so you judge each one on the right crop." },
      NO_SUBSCRIPTION,
      CTA_KEYWORD,
    ],
  },
  {
    id: "wine-03-what-it-does",
    account: "fegorson_studio",
    caption:
      "What “Wine Dark Backlight” actually does.\n\n"
      + "A deep wine source behind her lifts the background off black, throws a red edge down the arm and shoulder, and leaves the front of the face clean so the skin still reads true.\n\n"
      + "Four steps, ₦1,000 a photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#photographylighting #portraitphotography #nigerianphotographer #studiolighting #aluxart",
    slides: [
      HERO("A red edge, and\na room behind her.", "That is the whole look. Everything else stays exactly as photographed."),
      { type: "text", title: "Why it works on asoebi.",
        body: "Deep colour behind, clean light in front. The beadwork keeps its sparkle and the mint keeps its colour instead of going muddy under a coloured wash." },
      { type: "steps", title: "Four steps.",
        items: [
          "Upload the photo you already shot",
          "Pick “Wine Dark Backlight” from the list",
          "Choose the shot size it was framed at",
          "Download it relit",
        ] },
      NO_SUBSCRIPTION,
      CTA_KEYWORD,
    ],
  },
  {
    id: "wine-04-story-tutorial",
    account: "fegorson_studio",
    caption:
      "I filmed how I did this one.\n\n"
      + "The whole thing, start to finish — the photo I started with, the look I picked, and what came back. It's in my story right now.\n\n"
      + "👆 Tap my profile picture to watch it before it expires.\n\n"
      + "#photographytutorial #nigerianphotographer #portraitphotography #studiolighting #aluxart",
    slides: [
      HERO("I filmed how\nI did this.", "The whole thing, start to finish. It's in my story right now."),
      { type: "text", title: "Watch it in my story.",
        body: "Tap my profile picture at the top of your screen. It shows the photo I started with, the look I picked, and what came back — no edit, no cuts." },
      { type: "steps", title: "What's in it.",
        items: [
          "The original, straight off the card",
          "Where the 196 looks live",
          "Picking “Wine Dark Backlight”",
          "The download, side by side with the original",
        ] },
      { type: "text", title: "Stories don't last.",
        body: "This one is up for 24 hours. After that, comment *LIGHT* and I'll send you the link instead." },
      { type: "cta", title: "Tap my profile picture.",
        body: "The tutorial is at the top of your screen, up now.",
        link: "aluxartandframes.shop" },
    ],
  },
];

writeFileSync(OUT, JSON.stringify(carousels, null, 2));
console.log(`${carousels.length} carousels -> ${OUT}`);
for (const c of carousels) console.log(`  ${c.id.padEnd(24)} ${c.slides.length} slides  (${c.slides[0].type} first)`);
