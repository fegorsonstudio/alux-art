#!/usr/bin/env node
/**
 * instagram-hold.mjs — stop a queued post from going out.
 *
 * The companion to instagram-preview.mjs. The preview arrives two hours before
 * a post; if something is wrong, this takes it out of the queue so the
 * scheduler skips it and moves to the next carousel.
 *
 *   node --env-file=.env.local scripts/instagram-hold.mjs w2-d4-aolive-calltobar
 *   node --env-file=.env.local scripts/instagram-hold.mjs --release w2-d4-aolive-calltobar
 *   node --env-file=.env.local scripts/instagram-hold.mjs --list
 *
 * A held post is not deleted. Fix its slides, release it, and it returns to the
 * queue in its original place.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data";
const APP_DIR = process.env.APP_DIR || "/home/aluxart/app";
const HOLDS = path.join(DATA_DIR, "holds.json");
const QUEUE = path.join(APP_DIR, "scripts/carousel/queue.json");

const args = process.argv.slice(2);
const RELEASE = args.includes("--release");
const LIST = args.includes("--list");
const id = args.find(a => !a.startsWith("--"));

const holds = existsSync(HOLDS) ? JSON.parse(readFileSync(HOLDS, "utf8")) : { held: [] };
holds.held ??= [];

if (LIST) {
  console.log(holds.held.length ? "held:\n  " + holds.held.join("\n  ") : "nothing held");
  process.exit(0);
}

if (!id) {
  console.error("usage: instagram-hold.mjs <carousel-id> [--release] | --list");
  process.exit(2);
}

// Refuse an id that is not in the queue: a typo would otherwise look like it
// worked while the wrong post still went out on schedule.
const queue = JSON.parse(readFileSync(QUEUE, "utf8"));
const item = queue.find(c => c.id === id);
if (!item) {
  console.error(`no carousel with id "${id}" in the queue — nothing changed`);
  process.exit(1);
}

if (RELEASE) {
  const before = holds.held.length;
  holds.held = holds.held.filter(h => h !== id);
  writeFileSync(HOLDS, JSON.stringify(holds, null, 2));
  console.log(before === holds.held.length ? `"${id}" was not held` : `released "${id}" — it will post on its next slot`);
} else {
  if (!holds.held.includes(id)) holds.held.push(id);
  writeFileSync(HOLDS, JSON.stringify(holds, null, 2));
  console.log(`held "${id}" (@${item.account}) — the scheduler will skip it and post the next one instead`);
}
