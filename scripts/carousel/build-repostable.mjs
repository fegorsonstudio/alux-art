#!/usr/bin/env node
/**
 * build-repostable.mjs — daily carousels for creators to save and repost.
 *
 *   node scripts/carousel/build-repostable.mjs
 *
 * These are NOT our marketing. They are stock a creator downloads from the
 * group and posts to their own feed as if it were theirs, to sell the lighting
 * archive through their own link.
 *
 * Two rules follow from that, and they are the whole design:
 *
 *   1. NO DOMAIN ANYWHERE. Every other carousel stamps aluxartandframes.shop in
 *      the footer. On a repost that sends the creator's audience to us, they
 *      book with us, and the person who made the post earns nothing. These pass
 *      brand: "" and close on "link in bio" instead, so the traffic lands
 *      wherever the reposter points it.
 *
 *   2. NO "WE". The copy never says Alux Art, never says "our tool", and never
 *      implies a company behind it. A creator posting "we relit this" about a
 *      studio they do not own reads as a lie the moment a client asks. The
 *      voice is the photographer's own.
 *
 * Uses looks the Instagram week has NOT consumed, so a creator's feed and ours
 * are never running the same before/after in the same week.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PICKED = join(__dirname, "lighting-picked.json");
const OUT = join(__dirname, "repostable.json");

/**
 * Seven days of angles a photographer can post in their own voice.
 *
 * Each is a claim they can defend, because after importing they genuinely can
 * do this for their clients.
 */
const DAYS = [
  {
    id: "rp-01", hookTitle: "Send me your worst-lit photo.", hookSub: "I'll show you what it should have looked like.",
    midTitle: "The shot was never the problem.", midBody: "Framing was right. Expression was right. The light in that room was working against you, and no amount of editing fixes direction.",
    closeTitle: "Send me one and I'll show you.", closeBody: "Drop a photo in my DMs. Link in bio.",
  },
  {
    id: "rp-02", hookTitle: "Old photo. New light.", hookSub: "Nothing about the file changed except the light falling on it.",
    midTitle: "Your archive is worth more than you think.", midBody: "There is a portfolio sitting in your old shoots, and the only thing wrong with it is the lighting.",
    closeTitle: "Bring me an old favourite.", closeBody: "One photo, relit properly. Link in bio.",
  },
  {
    id: "rp-03", hookTitle: "No studio. No lights.\nNo problem.", hookSub: "Shot in a bedroom with one window.",
    midTitle: "Where you shoot stopped mattering.", midBody: "Your client will never know the room. They only ever see the photograph.",
    closeTitle: "Book me anywhere.", closeBody: "The room is no longer the limit. Link in bio.",
  },
  {
    id: "rp-04", hookTitle: "This took four minutes.", hookSub: "Not four hours in front of an editing screen.",
    midTitle: "Fast is part of the service.", midBody: "Clients remember how quickly you delivered almost as clearly as how they looked in the photos.",
    closeTitle: "Same-day delivery.", closeBody: "Shoot today, receive today. Link in bio.",
  },
  {
    id: "rp-05", hookTitle: "Studio lighting,\nwithout the studio.", hookSub: "Same face, same outfit, same day. Different light.",
    midTitle: "One shoot, several looks.", midBody: "Instead of picking one lighting setup and living with it, your set can carry a few and you choose afterwards.",
    closeTitle: "Ask me for options.", closeBody: "One session, more than one look. Link in bio.",
  },
  {
    id: "rp-06", hookTitle: "Which one would\nyou post?", hookSub: "Same photograph. One of them is finished.",
    midTitle: "The difference is direction.", midBody: "Flat light makes a snapshot. Light with a direction makes a portrait. That is the entire gap.",
    closeTitle: "Tell me which and why.", closeBody: "Then send me one of yours. Link in bio.",
  },
  {
    id: "rp-07", hookTitle: "I can fix the light.\nNot the moment.", hookSub: "So get the moment right and leave the rest to me.",
    midTitle: "Shoot for the expression.", midBody: "Timing, comfort and framing are still yours to get right. Everything after that is fixable now.",
    closeTitle: "Let's shoot.", closeBody: "You bring the moment. Link in bio.",
  },
];

const picked = JSON.parse(readFileSync(PICKED, "utf8"));
// The Instagram week eats the first 30 in order. Take from the far end so a
// creator's repost and our own feed never carry the same relight in one week.
const pool = [...picked].reverse();
if (pool.length < DAYS.length) throw new Error(`need ${DAYS.length} looks, have ${pool.length}`);

/**
 * A file being PRESENT is not the same as it being whole.
 *
 * A truncated JPEG still opens, still has a size, and still renders — the
 * decoder just fills the missing rows with flat grey. One of these shipped into
 * a carousel where the "before" photo was 55% grey block and nothing failed.
 * Existence checks cannot catch that; decoding it can.
 */
function assertWhole(rel) {
  const abs = join(__dirname, "..", "..", rel);
  if (!existsSync(abs)) throw new Error(`missing asset: ${rel}`);
  const buf = readFileSync(abs);
  if (buf.length < 1024) throw new Error(`asset far too small, likely truncated: ${rel}`);
  // A complete JPEG ends with the End Of Image marker FF D9. A cut-off
  // download does not, which is exactly the failure this is looking for.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const endsOk = buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
    if (!endsOk) throw new Error(`TRUNCATED JPEG (no end marker): ${rel}`);
  }
}

const out = DAYS.map((d, i) => {
  const look = pool[i];
  for (const f of [look.beforeFile, look.afterFile]) assertWhole(f);
  return {
    id: d.id,
    account: "groups",
    // No domain, no company name — see the header.
    brand: "",
    caption:
      `${d.hookTitle.replace(/\n/g, " ")}\n\n${d.hookSub}\n\n` +
      `Save this and post it as your own. Swap the caption for your voice, ` +
      `and point people at your link.`,
    slides: [
      // cover, not contain: the before and after are exported at different
      // sizes (4594x5743 vs 1792x2400), and letting them letterbox leaves one
      // pane half empty, which reads as a broken graphic rather than a
      // comparison. Both are portraits of the same frame, so filling crops
      // only the margins.
      { type: "beforeafter", fit: "cover", focus: "center 30%",
        title: d.hookTitle, body: d.hookSub, before: look.beforeFile, after: look.afterFile },
      { type: "text", title: d.midTitle, body: d.midBody },
      { type: "cta", title: d.closeTitle, body: d.closeBody, link: "" },
    ],
  };
});

// The whole point is that these carry no trace of us.
const blob = JSON.stringify(out);
for (const banned of ["aluxartandframes", "Alux Art", "Gear Equalizer"]) {
  if (blob.includes(banned)) {
    console.error(`BUILD FAILED: "${banned}" appears in a repostable carousel — a creator posting this would send their audience to us.`);
    process.exit(1);
  }
}
if (new Set(out.map(c => c.slides[0].after)).size !== out.length) {
  console.error("BUILD FAILED: a look is repeated across the week");
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`${out.length} repostable carousels → ${OUT}`);
for (const c of out) console.log(`  ${c.id}  ${c.slides[0].title.replace(/\n/g, " ")}`);
