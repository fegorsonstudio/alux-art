// Look 197, room block v2. v1 changed the background instead of relighting it.
//
// v1 enumerated fixtures — "bulbs, lamps, sconces, pendant lights, LED strips,
// ceiling coves, spotlights, signage... walls, steps, shelves, wood, stone and
// metal". Read as an instruction that is a shopping list: the model installed
// them. It also out-shouted the wrapper's own "do not add, remove, move, resize
// or re-imagine any object" rule, because v1 was louder and more specific than
// the general lock it contradicted.
//
// v2 keeps the intensity demand and removes every noun that could be built.
// Practical lights are referred to only conditionally — whatever is ALREADY
// there — and the block now reinforces the no-new-objects rule rather than
// fighting it. It also answers the case v1 ignored: if the photograph has no warm
// practical in it, nothing is invented.
//
// sql.json() for the write. JSON.stringify()+::jsonb wipes all 197 looks.
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const OLD_MARKER = "THE ROOM MUST GLOW";
const NEW_MARKER = "EXAGGERATE THE WARMTH THAT IS ALREADY THERE";
const END_ANCHOR = "(Canon G7X III";

const ROOM =
  NEW_MARKER + " - NEVER INVENT IT. This is a change of colour and intensity " +
  "only, never a change of set. Add nothing to the background: no new lamp, bulb, " +
  "fitting, strip, window, doorway, sign, screen, reflection, furniture, surface " +
  "or architectural feature that is not already in IMAGE 1. Remove nothing, move " +
  "nothing, resize nothing and replace nothing. Every object in the background, " +
  "its shape, position, material and place in the frame, stays exactly as it is. " +
  "Now take the warm light the photograph ALREADY contains and push it much " +
  "further. Whatever warm practical light is already visible in the frame burns " +
  "hotter and more golden, with a brighter core and a stronger bloom around it, " +
  "and casts its colour more strongly onto the very surfaces it was already " +
  "touching - the same surfaces, lit harder. The ambient already in the room " +
  "deepens into rich, saturated tungsten (2700K-3200K), warmest nearest whatever " +
  "is producing it and falling away toward deep amber further off. " +
  "If the source photograph contains no warm practical light, do not create one: " +
  "carry the ambient that IS there toward warm gold at a lower level and leave the " +
  "scene otherwise exactly as it stands. " +
  "The background sits lower in intensity than the flash-lit subject, but LOWER " +
  "MUST NEVER MEAN DULLER: it stays deep, warm and saturated, never grey, never " +
  "neutral, never washed out, never merely dim. The split between a cool clean " +
  "subject and a warm room is the point of this look, and it is achieved entirely " +
  "by changing the light falling on what is already in the photograph. ";

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

    const start = o.description.indexOf(OLD_MARKER);
    const end = o.description.indexOf(END_ANCHOR);
    if (start === -1 || end === -1 || end < start) {
      console.error("could not locate the v1 room block — nothing written");
      await sql.end();
      process.exit(1);
    }

    fs.writeFileSync("/home/aluxart/look-197.before-room-v2.txt", o.description);
    console.log("previous version saved to /home/aluxart/look-197.before-room-v2.txt");
    console.log("before:", o.description.length, "chars");
    console.log("replacing", end - start, "chars of v1 room block");

    o.description = o.description.slice(0, start) + ROOM + o.description.slice(end);
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
let count = 0;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    if (!/^197\s+·/.test(o.name ?? "")) continue;
    const d = o.description;
    console.log("\n--- checks on look 197 ---");
    for (const [label, ok] of [
      ["v1 fixture shopping-list gone", !d.includes("sconces, pendant lights")],
      ["v1 marker gone", !d.includes(OLD_MARKER)],
      ["v2 block present", d.includes(NEW_MARKER)],
      ["explicit add-nothing rule", d.includes("Add nothing to the background")],
      ["handles the no-practicals case", d.includes("do not create one")],
      ["keeps the lower-not-duller rule", d.includes("LOWER\n MUST NEVER MEAN DULLER") || d.includes("LOWER MUST NEVER MEAN DULLER")],
      ["reference description intact", d.includes("(Canon G7X III")],
      ["flash still wins on subject", d.includes("THE FLASH MUST WIN ON THE SUBJECT")],
      ["devices block intact", d.includes("DEVICES INSIDE THE FRAME")],
      ["even skin tone intact", d.includes("EVEN SKIN TONE")],
      ["pore texture block intact", d.includes("FLASH-REVEALED SKIN TEXTURE")],
      ["ambient shadow erase intact", d.includes("ERASE THE ORIGINAL AMBIENT SHADOWS")],
    ]) console.log(" ", ok ? "ok  " : "FAIL", label);
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");

await sql.end();
