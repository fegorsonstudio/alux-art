#!/usr/bin/env node
/**
 * build-meta-audiences.mjs — turn the target list into something you can paste
 * into Ads Manager without thinking.
 *
 *   node scripts/ads/build-meta-audiences.mjs                 # all three audiences
 *   node scripts/ads/build-meta-audiences.mjs --audience ng-women
 *   node scripts/ads/build-meta-audiences.mjs --nights        # what runs which night
 *
 * Ads Manager has no bulk import for pin-and-radius locations — each one is
 * typed into the search box, which geocodes as you type. So the useful output is
 * an ordered list of exactly what to type and what radius to set after it
 * resolves, not an API payload.
 *
 * Reach is bought per person, not per pin. Where several venues sit inside one
 * radius the list already collapses them, and the `covers` line tells you what a
 * single pin is standing in for so nobody later "fixes" it by adding nine more.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS = join(__dirname, "nightlife-targets.json");

const DAYS = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

const AUDIENCES = {
  "ng-women": {
    label: "NG Nightlife — Women 22-35",
    tiers: ["core", "secondary"],
    who: "Women, 22-35",
    locationType: "People recently in this location",
    interests: "(none — location and age carry it)",
    sells: "Look 197 only, the G7X night look",
    why: "Location is the whole targeting. Someone standing in Wuse 2 on a Saturday with a phone photo they hate is the buyer; no interest list finds her better than the pin does.",
  },
  "ng-photographers": {
    label: "NG Nightlife — Photographers",
    tiers: ["core", "secondary"],
    who: "All genders, 22-45",
    locationType: "People living in this location",
    interests: "Photography, Camera, Adobe Lightroom, Adobe Photoshop, Portrait photography",
    sells: "The full 197-look archive, plus creator resale",
    why: "Living in, not recently in: a photographer is worth reaching at home where they edit, not only when they are out.",
  },
  "diaspora-women": {
    label: "Diaspora Nightlife — Women 22-35",
    tiers: ["diaspora"],
    who: "Women, 22-35",
    locationType: "People recently in this location",
    interests: "Afrobeats, Nigerian culture, Amapiano (layer only if reach is too wide)",
    sells: "Look 197 only",
    why: "Higher CPM than Nigeria, but they pay in pounds and dollars. Worth a separate ad set so its cost never hides inside the Nigerian numbers.",
  },
};

const args = process.argv.slice(2);
const only = args.includes("--audience") ? args[args.indexOf("--audience") + 1] : null;
const NIGHTS_VIEW = args.includes("--nights");

if (!existsSync(TARGETS)) { console.error(`missing ${TARGETS}`); process.exit(2); }
const { targets } = JSON.parse(readFileSync(TARGETS, "utf8"));

const nightsOf = (t) => (t.nights?.length ? t.nights.map(n => DAYS[n]).join("/") : "every night");

function nightsView() {
  const byNight = new Map(Object.values(DAYS).map(d => [d, []]));
  for (const t of targets) {
    for (const n of (t.nights?.length ? t.nights : [1, 2, 3, 4, 5, 6, 7])) {
      byNight.get(DAYS[n]).push(`${t.city} — ${t.name}`);
    }
  }
  console.log("WHICH PINS MATTER ON WHICH NIGHT\n");
  for (const [day, list] of byNight) {
    console.log(`${day}  (${list.length})`);
    for (const l of list) console.log(`    ${l}`);
    console.log();
  }
  console.log("Ad scheduling needs a LIFETIME budget with a start and an end date.");
  console.log("On a daily budget Meta hides the schedule control entirely.");
}

function audienceView(key) {
  const a = AUDIENCES[key];
  const rows = targets.filter(t => a.tiers.includes(t.tier));
  const line = "=".repeat(74);

  console.log(`\n${line}\nSAVED AUDIENCE:  ${a.label}\n${line}`);
  console.log(`Who              ${a.who}`);
  console.log(`Location type    ${a.locationType}`);
  console.log(`Interests        ${a.interests}`);
  console.log(`Sells            ${a.sells}`);
  console.log(`Why              ${a.why}`);
  console.log(`\nLOCATIONS — type each into the search box, then set the radius:\n`);

  let i = 0;
  for (const t of rows) {
    i++;
    console.log(`  ${String(i).padStart(2)}. ${t.search}`);
    console.log(`      radius ${t.radiusKm}km   ${t.kind}   nights: ${nightsOf(t)}`);
    if (t.covers?.length) console.log(`      stands in for: ${t.covers.length} venue(s) — ${t.covers[0].split(" — ")[0]}${t.covers.length > 1 ? `, +${t.covers.length - 1} more` : ""}`);
    if (t.note) console.log(`      note: ${t.note}`);
  }

  const venues = rows.reduce((n, t) => n + (t.covers?.length ?? 0), 0);
  console.log(`\n  ${rows.length} pins, standing in for ${venues} named venues.`);
  console.log(`  Save as: "${a.label}"`);
}

if (NIGHTS_VIEW) {
  nightsView();
} else {
  const keys = only ? [only] : Object.keys(AUDIENCES);
  for (const k of keys) {
    if (!AUDIENCES[k]) { console.error(`unknown audience "${k}". Options: ${Object.keys(AUDIENCES).join(", ")}`); process.exit(2); }
    audienceView(k);
  }
  console.log(`\n${"-".repeat(74)}`);
  console.log("Then: Audiences > Create > Saved Audience, one per block above.");
  console.log("Campaigns reuse these, so the pins are typed once and never again.");
  console.log("Run with --nights to see the day schedule.");
}
