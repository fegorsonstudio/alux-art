// Look 197: the room did not glow. Two reasons, both structural.
//
// 1. The warm-ambient instruction lives INSIDE a parenthetical. Parentheses read
//    as an aside, and this prompt has already shown twice that anything phrased
//    as commentary rather than command gets skipped. The subject half of the look
//    has a shouted directive ("THE FLASH MUST WIN ON THE SUBJECT"); the room half
//    had nothing equivalent, so only one half of the split was enforced.
//
// 2. It contradicts itself inside one sentence: "very rich overly exaggerated
//    warm, golden" is immediately tempered by "should be lower in relative
//    intensity but create a soft, inviting, warm diffused glow". Soft and lower
//    is what came back. The hedge is rewritten so that lower intensity no longer
//    implies lower saturation — darker, but never duller.
//
// The parenthetical reference description is otherwise left intact: it is what
// the look was built from and the look is selling.
//
// sql.json() for the write. JSON.stringify()+::jsonb wipes all 197 looks.
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MARKER = "THE ROOM MUST GLOW";

// Insert the new directive straight after the aesthetic statement, so the two
// halves of the split sit together: flash wins on the subject, room burns warm.
const ANCHOR =
  "This rule ensures all images have the distinct direct-flash, high-saturation, " +
  "cool-foreground-warm-background aesthetic seen in these references.";

const ROOM =
  " " + MARKER + ", AND IT MUST BE OBVIOUS AT A GLANCE: while the subject stays " +
  "cool and neutral, push the whole background hard into rich, saturated, golden " +
  "tungsten (2700K-3200K). Every practical light visible in the frame burns " +
  "visibly warm and is exaggerated well past what the original photograph " +
  "recorded: bulbs, lamps, sconces, pendant lights, LED strips, ceiling coves, " +
  "spotlights, signage and any light spilling from a doorway or an adjoining room " +
  "each show a bright glowing core with a soft golden bloom around it, and each " +
  "throws its colour visibly onto the nearby walls, ceiling, floor and furniture. " +
  "Walls, steps, shelves, wood, stone and metal all take that tungsten cast and " +
  "deepen toward amber as they fall away from the source. The background sits " +
  "lower in intensity than the flash-lit subject, but LOWER MUST NEVER MEAN " +
  "DULLER: it stays deep, warm and heavily saturated, never grey, never neutral, " +
  "never washed out, never merely dim. If the room does not read as obviously, " +
  "richly golden against a cool clean subject, this look has failed - that split " +
  "is the entire point of it.";

// The hedge that cancelled the exaggeration.
const OLD_HEDGE =
  "This background ambient light should be lower in relative intensity but create " +
  "a soft, inviting, warm diffused glow, setting a dramatic and luxurious";
const NEW_HEDGE =
  "This background ambient light sits lower in intensity than the flash while " +
  "staying deeply saturated and richly golden, setting a dramatic and luxurious";

const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
const groups = row.option_groups;

if (!Array.isArray(groups)) {
  console.error("option_groups is not an array — refusing to write");
  await sql.end();
  process.exit(1);
}

let touched = 0;
for (const g of groups) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt" || !/^197\s+·/.test(o.name ?? "")) continue;
    if ((o.description ?? "").includes(MARKER)) {
      console.log("already carries the room block, nothing to do");
      await sql.end();
      process.exit(0);
    }
    if (!o.description.includes(ANCHOR)) {
      console.error("aesthetic anchor not found — nothing written");
      await sql.end();
      process.exit(1);
    }
    fs.writeFileSync("/home/aluxart/look-197.previous.txt", o.description);
    console.log("previous version saved to /home/aluxart/look-197.previous.txt");
    console.log("before:", o.description.length, "chars");

    let d = o.description.replace(ANCHOR, ANCHOR + ROOM);
    if (d.includes(OLD_HEDGE)) {
      d = d.replace(OLD_HEDGE, NEW_HEDGE);
      console.log("hedge sentence rewritten");
    } else {
      console.log("WARNING: hedge sentence not found, left as-is");
    }
    o.description = d;
    console.log("after: ", o.description.length, "chars");
    touched++;
  }
}

if (touched !== 1) {
  console.error(`expected exactly 1 look, matched ${touched} — nothing written`);
  await sql.end();
  process.exit(1);
}

await sql`UPDATE templates SET option_groups = ${sql.json(groups)} WHERE id = ${TEMPLATE}`;

const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
let count = 0, others = 0;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    const has = (o.description ?? "").includes(MARKER);
    if (!/^197\s+·/.test(o.name ?? "")) { if (has) others++; continue; }
    const d = o.description;
    console.log("\n--- checks on look 197 ---");
    for (const [label, ok] of [
      ["room directive present", d.includes(MARKER)],
      ["it is outside the parentheses", d.indexOf(MARKER) < d.indexOf("(Canon G7X III")],
      ["soft/diffused hedge gone", !d.includes("soft, inviting, warm diffused glow")],
      ["flash still wins on subject", d.includes("THE FLASH MUST WIN ON THE SUBJECT")],
      ["devices block intact", d.includes("DEVICES INSIDE THE FRAME")],
      ["even skin tone intact", d.includes("EVEN SKIN TONE")],
      ["ambient shadow erase intact", d.includes("ERASE THE ORIGINAL AMBIENT SHADOWS")],
      ["pore texture block intact", d.includes("FLASH-REVEALED SKIN TEXTURE")],
    ]) console.log(" ", ok ? "ok  " : "FAIL", label);
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");
console.log("other looks changed:", others, "(must be 0)");

await sql.end();
