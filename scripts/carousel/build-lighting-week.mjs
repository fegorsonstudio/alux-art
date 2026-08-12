#!/usr/bin/env node
/**
 * build-lighting-week.mjs — generate the lighting marketing week.
 *
 *   node scripts/carousel/build-lighting-week.mjs
 *
 * 30 carousels: 5 days (Wed 12 → Sun 16 Aug) × 3 accounts × 2 a day, all
 * promoting The Gear Equalizer. Generated rather than hand-written so the
 * no-repeat rule is mechanical: each carousel consumes exactly one look from
 * lighting-picked.json, and the assertions at the bottom fail the build if a
 * look, a hook or a headline is ever used twice.
 *
 * Two formats alternate, one of each per account per day:
 *   A — before/after hook, aimed at a photographer scrolling past
 *   B — tutorial, showing the tool actually being used
 *
 * The audience is photographers, not portrait buyers: the promise is that the
 * photos they ALREADY shot get better, not that they should book a shoot.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PICKED = join(__dirname, "lighting-picked.json");
const OUT = join(__dirname, "lighting-week.json");

const TEMPLATE_URL = "aluxartandframes.shop";
const ACCOUNTS = ["aluxartandframes", "aolivetv", "fegorson_studio"];
const DAYS = ["Wed 12", "Thu 13", "Fri 14", "Sat 15", "Sun 16"];

/**
 * 15 hooks, one per Format A carousel, never reused.
 *
 * Written to the owner's own examples: a specific year, a specific camera, or a
 * question that costs the reader something to answer honestly. No adjectives
 * doing the work — the before/after does that.
 */
const HOOKS = [
  { hook: "This was shot in 2020.\nLet's relight it in 2026.", sub: "Same file. Same face. Six years of lighting you never had to learn." },
  { hook: "What if you never had to\nbuy lighting gear again?", sub: "No softbox. No strobes. No stand collapsing in someone's living room." },
  { hook: "What if you never had to\nlearn lighting again?", sub: "The recipe is already written. You just pick the one you want." },
  { hook: "Shot on a Nikon D750.\nWatch.", sub: "The camera was never the problem. The light in the room was." },
  { hook: "You didn't need a better camera.\nYou needed better light.", sub: "Same sensor, same lens, same photo. Relit." },
  { hook: "Your client will never know\nwhere you shot this.", sub: "One window, one bedroom, one afternoon. It doesn't have to look like it." },
  { hook: "That shoot you almost deleted.", sub: "The framing was right. The light was wrong. Only one of those is fixable in post." },
  { hook: "₦1,000 says this photo\nisn't finished yet.", sub: "One image, one lighting look, no subscription." },
  { hook: "The photo was fine.\nThe light was the problem.", sub: "You knew it when you shot it. You just couldn't fix it." },
  { hook: "Every studio look you can't\nafford to build.", sub: "195 of them, and none of them need a stand." },
  { hook: "Same photo.\nDifferent decade.", sub: "Nothing about the file changed except the light falling on it." },
  { hook: "Your old work is worth more\nthan you think.", sub: "There is a portfolio sitting in your archive, badly lit." },
  { hook: "No stands. No sandbags.\nNo blown fuse.", sub: "Lighting without carrying any of it up three flights of stairs." },
  { hook: "The difference between a\nsnapshot and a portrait.", sub: "It was never the pose. It was the light." },
  { hook: "You already took the photo.\nFinish it.", sub: "Upload, pick a look, download. About a minute." },
];

/**
 * Slide 3 of Format A — and the reason it is not the lighting recipe.
 *
 * The first draft printed each look's `description`, which is the actual prompt
 * that produces the light. That is the product. Published on Instagram it can be
 * pasted into any image generator, and the thing being sold is gone. So the slot
 * sells the FEELING instead: what having this changes for the photographer.
 *
 * The recipes stay where they belong — inside the template, for people who paid.
 */
const FEELINGS = [
  { title: "Lighting is no longer\nthe thing holding you back.", body: "You can compete with a photographer anywhere in the world now. Not on gear. On the picture." },
  { title: "Your client never asks\nwhat lights you own.", body: "They ask to see the photos. That is the entire brief, and it always was." },
  { title: "The gear conversation\nis over.", body: "Nobody chooses a photographer by kit list. They choose by the last ten frames you posted." },
  { title: "You stopped being limited\nby the room.", body: "One window and a bare wall is now a starting point rather than a ceiling." },
  { title: "Charge for the picture,\nnot the equipment.", body: "What it cost you to make stopped being the thing that sets the price." },
  { title: "Deliver in an hour,\nnot in two weeks.", body: "Clients remember how it felt to work with you almost as much as how they looked." },
  { title: "Your portfolio\njust got deeper.", body: "Every shoot you were nearly happy with is a portfolio piece that never made it out." },
  { title: "You don't need the studio\nto book the studio job.", body: "The work gets you hired. Nobody audits where it was made." },
  { title: "Ten years of lighting,\nwithout the ten years.", body: "The part that took a career to learn is now the part you pick from a list." },
  { title: "Say yes to the shoot\nyou'd have turned down.", body: "Bad room, wrong time of day, no time to set up. None of it decides the result now." },
  { title: "The photographer's eye\nstill matters.", body: "Framing, timing, and knowing when someone is comfortable. That was always the real skill." },
  { title: "Nobody can tell\nwhat it cost you.", body: "Not the client, not their friends, not the person who books you off the back of it." },
  { title: "Stop losing jobs\nover a kit list.", body: "The work speaks first, and now it speaks at the level you always saw in your head." },
  { title: "The best light in the city\nis on your laptop.", body: "No rental, no transport, no assistant, no waiting for the sun to do the right thing." },
  { title: "Your worst-lit shoot\nis now a good one.", body: "The frame was right. The light was wrong. Only one of those was ever unfixable." },
];

/** 15 tutorial angles, one per Format B carousel. */
const TUTORIALS = [
  { title: "How to relight a photo\nyou already shot.", note: "Four steps. No gear, no plugins." },
  { title: "Pick the look before\nyou pick the photo.", note: "195 looks, sorted into 14 families so you're not scrolling forever." },
  { title: "Why we ask for the\nshot size.", note: "A beauty clamshell judged on a full-length frame tells you nothing." },
  { title: "What 'relight' actually\nchanges.", note: "The light. Not the face, not the outfit, not the background." },
  { title: "Match the light to\nthe room you shot in.", note: "The looks that read as real are the ones the scene could have produced." },
  { title: "Gels, without owning\na single gel.", note: "Colour contrast that used to mean two lights and two sheets." },
  { title: "Fix a flat photo\nin one pass.", note: "Flat usually means no direction. Direction is what you're picking." },
  { title: "The section names\nare the shortcut.", note: "Dark Romantic, Golden Hour, Neon — pick the mood, not the physics." },
  { title: "Before you upload:\nthree quick checks.", note: "Sharp, correctly framed, and big enough. The rest is the light." },
  { title: "One photo or ten?", note: "Test a look on one image before you commit an entire set to it." },
  { title: "What to charge\nfor a relight.", note: "It costs you ₦1,000. What it's worth to the client is a different number." },
  { title: "Relighting an old\nclient gallery.", note: "The shoot is delivered. The archive is still an asset." },
  { title: "Smoke and haze,\nwithout a hazer.", note: "Atmosphere is a look here, not a rental and a fire alarm." },
  { title: "Reading a lighting\nrecipe.", note: "Every look ships with the setup written out. Learn it while you use it." },
  { title: "From phone photo\nto portfolio.", note: "The file matters less than the light you put on it." },
];

const picked = JSON.parse(readFileSync(PICKED, "utf8"));
if (picked.length < 30) throw new Error(`need 30 looks, lighting-picked.json has ${picked.length}`);

const cap = (body, extra = "") =>
  `${body}\n\n${extra}${extra ? "\n\n" : ""}💬 Comment LIGHT and I'll send you the link.\n\n` +
  "#photographylighting #nigerianphotographer #lightroom #portraitphotography #aluxart";

/** Format A — the before/after argues, the copy stays out of the way. */
function formatA(look, hook, feeling, id, account, day) {
  return {
    id, account,
    caption: cap(
      `${hook.hook.replace(/\n/g, " ")}\n\n${hook.sub}`,
      `“${look.name}” — one of 195 looks in The Gear Equalizer. ₦1,000 for a single photo.`),
    slides: [
      { type: "beforeafter", title: hook.hook, body: hook.sub, before: look.beforeFile, after: look.afterFile },
      { type: "text", title: "The file never changed.", body: "Same frame, same face, same lens. The only thing added was light with a direction." },
      // Never the recipe. See FEELINGS above.
      { type: "text", title: feeling.title, body: feeling.body },
      { type: "text", title: "₦1,000 for one photo.", body: "No subscription, no gear, nothing to install. Upload, pick a look, download." },
      { type: "cta", title: "Relight your own.", body: "Comment LIGHT and I'll send you the link.", link: TEMPLATE_URL },
    ],
  };
}

/** Format B — the tutorial. Ends on a relight so it still sells. */
function formatB(look, tut, id, account, day, shot) {
  return {
    id, account,
    caption: cap(
      `${tut.title.replace(/\n/g, " ")}\n\n${tut.note}`,
      "The Gear Equalizer relights a photo you already have. ₦1,000 for one image."),
    slides: [
      // `body`, not `sub`: the cover renderer reads `body`, and a `sub` key is
      // silently dropped — the subtitle just never appears.
      { type: "cover", eyebrow: "HOW IT WORKS", title: tut.title, body: tut.note, kicker: "SWIPE →" },
      { type: "shot", title: "Pick your look.", body: "195 lighting looks, grouped into 14 families so you can find a mood instead of scrolling.", image: shot, fit: "contain" },
      { type: "steps", title: "Four steps.", items: [
        "Upload the photo you already shot",
        "Pick a lighting look from the list",
        "Choose the shot size it was framed at",
        "Download it relit",
      ] },
      { type: "beforeafter", title: "That's the whole job.", body: `“${look.name}” applied to a photo that was already taken.`, before: look.beforeFile, after: look.afterFile },
      { type: "cta", title: "Try it on your worst-lit photo.", body: "Comment LIGHT and I'll send you the link.", link: TEMPLATE_URL },
    ],
  };
}

// The screenshot for Format B. Captured separately; the build refuses to
// produce carousels pointing at an image that is not on disk, because the
// renderer would fail 30 slides deep instead of here.
const SHOT = "scripts/carousel/shots/lighting-picker.png";
if (!existsSync(join(ROOT, SHOT))) {
  console.error(`missing screenshot: ${SHOT}\nCapture it first (see capture-lighting-shots.mjs), then re-run.`);
  process.exit(2);
}

const out = [];
let n = 0, h = 0, t = 0, f = 0;
for (let d = 0; d < DAYS.length; d++) {
  for (const account of ACCOUNTS) {
    const tag = `lw-d${d + 1}-${account.slice(0, 8)}`;
    out.push(formatA(picked[n++], HOOKS[h++], FEELINGS[f++], `${tag}-hook`, account, DAYS[d]));
    out.push(formatB(picked[n++], TUTORIALS[t++], `${tag}-howto`, account, DAYS[d], SHOT));
  }
}

// ── assertions: the no-repeat rule, enforced ────────────────────────────────
const ids = out.map(c => c.id);
const looksUsed = out.flatMap(c => c.slides.filter(s => s.type === "beforeafter").map(s => s.after));
const covers = out.map(c => c.slides[0].title);
const fail = (m) => { console.error("BUILD FAILED: " + m); process.exit(1); };
if (new Set(ids).size !== ids.length) fail("duplicate carousel id");
if (new Set(looksUsed).size !== looksUsed.length) fail("a lighting look is used twice");
if (new Set(covers).size !== covers.length) fail("two carousels open on the same headline");
if (out.length !== 30) fail(`expected 30 carousels, built ${out.length}`);
const recipes = picked.map(p => p.recipe).filter(Boolean);
const slideText = JSON.stringify(out);
for (const r of recipes) {
  const probe = r.slice(0, 60);
  if (probe.length > 20 && slideText.includes(probe)) fail("a lighting recipe leaked into a slide — that text is the product");
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`${out.length} carousels → ${OUT}`);
for (const a of ACCOUNTS) console.log(`  ${a.padEnd(20)} ${out.filter(c => c.account === a).length}`);
console.log(`${new Set(looksUsed).size} distinct lighting looks, no repeats`);
