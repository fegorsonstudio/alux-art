// The phone-flash constraint, extended to every look that describes a flash, and
// reworded now that the source is named: a speedlight the photographer fires,
// not the camera's own lamp.
//
//   39 · S High-Contrast Direct Flash   — gains the constraint
//   73 · S Hard Split Red Rim           — gains the constraint
//   197 · S Night Paparazzi G7X         — already has it, reworded to speedlight
//
// Only the phone constraint travels to 39 and 73. The "erase the ambient
// shadows" line stays on 197 alone: 39 asks for "distinct, sharp shadows" and 73
// for "deep shadow", so erasing shadows there would fight the look itself.
//
// 56 · C Screen Glow is deliberately excluded — it wants a lit screen.
//
// sql.json() for the write. JSON.stringify()+::jsonb stores a JSON string and
// wipes all 197 looks.
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MARKER = "DEVICES INSIDE THE FRAME";

const OPENING =
  MARKER + ": every light described above comes from a speedlight the " +
  "photographer is firing, outside this picture, never from a device inside it.";

const BODY =
  " If the subject is holding a phone or camera, or one is visible in a mirror " +
  "or anywhere in the shot, that device must not be emitting light. No flash " +
  "burst, no white starburst, no bloom or lens glare from it, and no light from " +
  "it falling on the subject, the mirror or the room. Render its flash unlit and " +
  "its screen dark or dimly reflective, keeping the body of the device clearly " +
  "visible and correctly shaped in the hand. Every bright highlight in the " +
  "picture comes from that speedlight and the room's own ambient sources.";

// What the first pass wrote into 197, replaced in place so the block does not
// get appended twice around the skin-tone text that now follows it.
const OLD_197_OPENING =
  MARKER + ": the flash described above belongs to the camera taking this " +
  "photograph, never to anything inside it.";
const OLD_197_TAIL =
  "Every bright highlight in the picture comes from the on-camera flash and the room's own ambient sources.";
const NEW_197_TAIL =
  "Every bright highlight in the picture comes from that speedlight and the room's own ambient sources.";

const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
const groups = row.option_groups;

if (!Array.isArray(groups)) {
  console.error("option_groups is not an array — refusing to write");
  await sql.end();
  process.exit(1);
}

const changed = [];
for (const g of groups) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    const num = /^(\d+)\s+·/.exec(o.name ?? "")?.[1];
    if (!["39", "73", "197"].includes(num ?? "")) continue;

    const before = o.description.length;

    if (o.description.includes(OLD_197_OPENING)) {
      o.description = o.description.replace(OLD_197_OPENING, OPENING).replace(OLD_197_TAIL, NEW_197_TAIL);
      changed.push(`${o.name}: reworded to speedlight (${before} -> ${o.description.length})`);
    } else if (o.description.includes(MARKER)) {
      changed.push(`${o.name}: already current, left alone`);
    } else {
      o.description = o.description.trimEnd() + " " + OPENING + BODY;
      changed.push(`${o.name}: constraint added (${before} -> ${o.description.length})`);
    }
  }
}

if (changed.length !== 3) {
  console.error(`expected 3 looks, matched ${changed.length} — nothing written`);
  await sql.end();
  process.exit(1);
}
changed.forEach((c) => console.log(" ", c));

await sql`UPDATE templates SET option_groups = ${sql.json(groups)} WHERE id = ${TEMPLATE}`;

// Read back rather than trusting the write.
const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
let count = 0, withMarker = [], stale = 0, screenGlow = null;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    if ((o.description ?? "").includes(MARKER)) withMarker.push(o.name);
    if ((o.description ?? "").includes("belongs to the camera taking")) stale++;
    if (/^56 /.test(o.name ?? "")) screenGlow = (o.description ?? "").includes(MARKER);
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");
console.log("looks carrying the constraint:", withMarker.length, "->", withMarker.join(" | "));
console.log("old camera wording left:", stale, "(must be 0)");
console.log("56 Screen Glow untouched:", screenGlow === false);

await sql.end();
