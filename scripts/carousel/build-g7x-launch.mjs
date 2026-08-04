#!/usr/bin/env node
/**
 * build-g7x-launch.mjs — four carousels for "197 · S Night Paparazzi G7X".
 *
 *   node scripts/carousel/build-g7x-launch.mjs
 *   node scripts/carousel/render.mjs scripts/carousel/g7x-launch.json "<out dir>"
 *
 * The look recreates a Canon G7X with the flash on, which is the camera every
 * night-out photo on Instagram is shot on. The selling angle is not "nice light"
 * — it is that the photo already exists and the venue ruined it.
 *
 * WHY THESE SITUATIONS. Grounded in what actually goes wrong rather than
 * invented pain:
 *   - a phone in a dark room lengthens the shutter and lifts the gain, so the
 *     result is noisy and motion-blurred, and the built-in compensation adds an
 *     orange cast on top
 *   - club and stage LEDs flicker against the shutter, so colour and brightness
 *     swing frame to frame and bands roll through the picture
 *   - restaurants run 2700-3000K tungsten; the eye adapts and the sensor does
 *     not, so white plates and white shirts go orange
 *   - the only real cure for a dark room is more light, which nobody has on them
 * That last one is the whole pitch: the light arrives afterwards.
 *
 * Every carousel opens on the before/after. The owner reads engagement as
 * favouring an image in slide 1 over a text cover, and these are hand-posted, so
 * the hook has to stand up with no caption under it.
 *
 * The pair is real and it is the owner's own: same woman, same pose, same mirror,
 * same outfit — one frame under the venue's magenta wash, one relit. Nothing in
 * this set is a mismatched "before" borrowed from another shoot.
 */
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "g7x-launch.json");

const BEFORE = "scripts/carousel/shots/lighting/g7x-paparazzi-before.jpg";
const AFTER  = "scripts/carousel/shots/lighting/g7x-paparazzi-after.jpg";
for (const f of [BEFORE, AFTER]) {
  if (!existsSync(join(__dirname, "..", "..", f))) throw new Error(`missing asset: ${f}`);
}

const HERO = (title, body) => ({
  type: "beforeafter", fit: "cover", focus: "center 20%",
  title, body, before: BEFORE, after: AFTER,
});

const PRICE = {
  type: "text",
  title: "No camera. No flash. No reshoot.",
  body: "*₦1,000* for one photo. No subscription — you pay for the photos you actually fix, not for a month you might not use.",
};

const CTA_KEYWORD = {
  type: "cta",
  title: "Send me a dark one.",
  body: "💬 Comment *LIGHT* and I'll send you the link.",
  link: "aluxartandframes.shop",
};

const carousels = [
  {
    id: "g7x-01-the-club",
    account: "fegorson_studio",
    caption:
      "The club was too dark for your phone. That was never your fault.\n\n"
      + "In a dark room your phone holds the shutter open longer and cranks the gain, so you get noise and blur. Then it \"helps\" by lifting the brightness, which is where the orange comes from. Add a magenta LED wash and your skin is somebody else's colour.\n\n"
      + "The fix was never a better phone. It was a flash — and that can arrive after the night is over.\n\n"
      + "\"Night Paparazzi G7X\", look 197. ₦1,000 for one photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#lagosnightlife #nigerianphotographer #phonephotography #lowlightphotography #detty december #aluxart",
    slides: [
      // Titles wrap on their own — the renderer does not honour \n — so a hero
      // headline has to be short enough that its natural break lands well.
      HERO("Too dark for your phone.", "Same photo. The flash arrived afterwards."),
      { type: "text", title: "It was never your phone's fault.",
        body: "A small sensor in a dark room has two options: hold the shutter open, or turn up the gain. One gives you blur, the other gives you noise. Yours did both." },
      { type: "text", title: "Then it made it worse.",
        body: "Your phone lifts the brightness to compensate, and that is where the *orange* comes from. The magenta wall lights did the rest — that colour is on your face, not your skin." },
      { type: "text", title: "The only cure for a dark room is more light.",
        body: "Every photographer knows it. Nobody carries a flash to a club. So the light arrives *after* — same night, same dress, same pose, lit like you brought one." },
      PRICE,
      CTA_KEYWORD,
    ],
  },
  {
    id: "g7x-02-where-it-happens",
    account: "fegorson_studio",
    caption:
      "You have these photos. Everybody does.\n\n"
      + "The lounge that was pitch black. The restaurant that turned your white shirt orange. The owambe where the DJ lights painted everyone green. The night shot where the flash blew out your face and killed the whole background.\n\n"
      + "You do not need to go back. The photo is fine — the room was the problem.\n\n"
      + "Look 197, \"Night Paparazzi G7X\". ₦1,000 a photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#owambe #lagosphotographer #nigerianwedding #phonephotography #aluxart",
    slides: [
      HERO("You have these photos.", "The room was the problem. Not the photo."),
      { type: "steps", title: "Where it always happens.",
        items: [
          "The lounge that was pitch black",
          "The restaurant that turned your white shirt orange",
          "The owambe under the DJ's green wash",
          "The hotel corridor lit by one strip of LED",
          "Night shots where the flash killed the background",
        ] },
      { type: "text", title: "Why the restaurant ones go orange.",
        body: "Those bulbs run at *2700K*. Your eye adjusts and forgets. The sensor cannot, so it records the room exactly as orange as it really was." },
      { type: "text", title: "Same night. Same outfit.",
        body: "Nothing gets restaged and nobody gets asked to pose again. The frame you already have is the raw material — only the light on it changes." },
      PRICE,
      CTA_KEYWORD,
    ],
  },
  {
    id: "g7x-03-what-it-does",
    account: "fegorson_studio",
    caption:
      "What \"Night Paparazzi G7X\" actually does.\n\n"
      + "It puts a hard flash on the lens axis, exposes you about a stop and a half over the room, and holds your skin neutral — so you come out cool, clean and glossy while the room stays warm and golden behind you.\n\n"
      + "That contrast is the whole look: the reason a G7X photo outside a restaurant reads expensive and the same shot on a phone reads like a group chat.\n\n"
      + "Look 197. ₦1,000 for one photo.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#photographylighting #directflash #g7x #nigerianphotographer #aluxart",
    slides: [
      HERO("Cool on you. Warm behind you.", "That contrast is the entire look."),
      { type: "steps", title: "What the look does.",
        items: [
          "Hard flash on the lens, straight at you",
          "You, a stop and a half over the room",
          "Your skin held neutral, not the venue's colour",
          "The room left warm and golden behind",
          "Speculars pushed so skin reads glossy, not flat",
        ] },
      { type: "text", title: "Why it reads expensive.",
        body: "It is the look of a compact camera with the flash up outside a restaurant. Everyone recognises it. Almost nobody can get it out of a phone in the dark." },
      { type: "text", title: "Your face stays your face.",
        body: "Same pose, same outfit, same expression, same jewellery. The only thing that changes is the light falling on it." },
      PRICE,
      CTA_KEYWORD,
    ],
  },
  {
    id: "g7x-04-camera-roll",
    account: "fegorson_studio",
    caption:
      "Go and look at your camera roll from December.\n\n"
      + "How many of those did you never post? Not because you looked bad — because the light did. Too dark, too orange, too green, too grainy to survive a zoom.\n\n"
      + "Those photos are not dead. They were just taken in the wrong room.\n\n"
      + "Look 197, \"Night Paparazzi G7X\". ₦1,000 for one, no subscription.\n\n"
      + "💬 Comment LIGHT and I'll send you the link.\n\n"
      + "#cameraroll #dettydecember #lagosnightlife #phonephotography #aluxart",
    slides: [
      HERO("The ones you never posted.", "Not because you looked bad. Because the light did."),
      { type: "text", title: "You already took the photo.",
        body: "That is the part people miss. There is no reshoot, no second outfit, no getting everyone back out. It exists — it was only ever *lit wrong*." },
      { type: "steps", title: "Four steps.",
        items: [
          "Upload the photo you already have",
          "Search *197* in the lighting list",
          "Pick the shot size it was framed at",
          "Download it relit",
        ] },
      { type: "text", title: "197 of 197.",
        body: "That is its number. Type it into the search box and it comes straight up — so when a friend asks which one you used, you can just tell them *197*." },
      PRICE,
      CTA_KEYWORD,
    ],
  },
];

writeFileSync(OUT, JSON.stringify(carousels, null, 2));
console.log(`${carousels.length} carousels -> ${OUT}`);
for (const c of carousels) console.log(`  ${c.id.padEnd(24)} ${c.slides.length} slides  (${c.slides[0].type} first)`);
