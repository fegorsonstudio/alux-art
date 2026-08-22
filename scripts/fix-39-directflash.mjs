// Look 39 did not come out reading as direct flash. Two causes.
//
// 1. The dynamic-range sentence added earlier works against the look. "Speculars
//    stay bright without clipping" plus "deep shadows hold detail rather than
//    blocking up" reads as: tame the highlights, lift the shadows. That is an HDR
//    photograph, which is the opposite of a hard flash. Range now explicitly means
//    texture surviving INSIDE the extremes, with the contrast left alone.
//
// 2. The look was written as analysis, not instruction. "Fill light is minimal,
//    resulting in a high-contrast ratio" is a caption describing a photo that
//    already exists; it does not tell a model to make one. 197 works because it
//    commands and states an exposure relationship ("THE FLASH MUST WIN... about
//    one and a half stops brighter than the room"). 39 had no such line, so
//    nothing forced the flash to dominate the ambient.
//
// The geometry of 39 is preserved exactly: camera-right at 3 o'clock, above eye
// level, shadows falling left, minimal fill, no rim or hair light, catchlights at
// 10 o'clock, neutral 5500K, warm red background cast darkest at the edges.
// 39 is NOT 197 — it stays directional side light, never flat frontal.
//
// sql.json() for the write. JSON.stringify()+::jsonb wipes all 197 looks.
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const TAIL_ANCHOR = "Keep the existing background, setting and framing exactly as they are";

const BODY =
  "Relight this image. Change nothing else except the lighting.\n" +
  "THIS IS A HARD DIRECT-FLASH PHOTOGRAPH AND MUST READ AS ONE AT A GLANCE. The " +
  "key light is a bare, undiffused speedlight mounted on a Canon R5C, fired " +
  "straight at the subject from camera-right at about 3 o'clock, slightly above " +
  "eye level. No softbox, no umbrella, no bounce, no diffusion of any kind: the " +
  "source is small and hard, so shadow edges are crisp and the light is punchy " +
  "rather than gentle or wrapping. " +
  "THE FLASH MUST WIN: expose the subject roughly two stops brighter than the " +
  "room's own light, so they read clearly brighter, cleaner and more saturated " +
  "than everything around them and never take on the room's colour. Light falls " +
  "off fast — whatever the flash does not reach drops away quickly into darkness. " +
  "Push the speculars hard: bright, sharp, wet-looking highlights on the forehead, " +
  "cheekbone, nose bridge, chin, collarbone and shoulder of the lit side, driven " +
  "right up toward white but never clipping flat, with pore structure still " +
  "readable inside them. Distinct, sharp shadows fall to the left, and a " +
  "hard-edged shadow is thrown onto the nearest surface behind the subject. " +
  "High-speed sync is what lets this flash overpower a bright ambient, so the " +
  "frame holds its full range WITHOUT giving up contrast. The picture stays hard " +
  "and high-contrast: the range shows as real texture surviving inside the " +
  "brightest highlights and real tonal separation inside the deepest shadows, " +
  "never as lifted shadows, tamed highlights or a flat HDR rendering. Deep, not " +
  "crushed. Contrasty, not soft. " +
  "Keep fill minimal and the contrast ratio high. Add no rim light and no hair " +
  "light. Shadows are deep with crisp, well-defined edges, especially under the " +
  "brow and chin. Render catchlights as small, bright, circular points at 10 " +
  "o'clock in the eyes. Hold the subject at a neutral ~5500K, and apply a warm red " +
  "colour cast to the background, falling off smoothly and darkest at the edges. ";

const TEXTURE =
  " FLASH-REVEALED SKIN TEXTURE: a hard direct flash RESOLVES skin, it does not " +
  "smooth it. At full zoom the skin must show crisp, individually separated pores " +
  "across the nose, cheeks, forehead and chin, fine vellus hair catching the light " +
  "along the jawline and hairline, and the natural micro-relief of a real surface, " +
  "with a tiny specular point struck off each raised area on the lit side. The " +
  "sheen sits ON this texture and never replaces it. Pore detail must come out " +
  "sharper and better defined than in the source photograph. No airbrushing, no " +
  "beauty-filter smoothing, no waxy, plastic or porcelain finish, and no loss of " +
  "texture inside the highlights.";

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
    if (o.kind !== "prompt" || !/^39\s+·/.test(o.name ?? "")) continue;

    const at = o.description.indexOf(TAIL_ANCHOR);
    if (at === -1) {
      console.error("could not find the lock/tail section in look 39 — nothing written");
      await sql.end();
      process.exit(1);
    }
    // Everything from the locks onward is kept verbatim, including the DEVICES
    // block added earlier. Only the lighting description in front of it is rebuilt.
    const tail = o.description.slice(at);
    console.log("before:", o.description.length, "chars");
    o.description = BODY + tail + (tail.includes("FLASH-REVEALED") ? "" : TEXTURE);
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
    if (!/^39\s+·/.test(o.name ?? "")) continue;
    const d = o.description;
    console.log("\n--- checks on look 39 ---");
    for (const [label, ok] of [
      ["flash must win / exposure stated", d.includes("THE FLASH MUST WIN")],
      ["keeps 3 o'clock geometry", d.includes("3 o'clock")],
      ["keeps shadows falling left", d.includes("fall to the left")],
      ["keeps red background cast", d.includes("warm red")],
      ["keeps 10 o'clock catchlights", d.includes("10 o'clock")],
      ["HDR-softening wording gone", !d.includes("Deep, not crushed. Fill light is minimal")],
      ["devices block intact", d.includes("DEVICES INSIDE THE FRAME")],
      ["texture block present", d.includes("FLASH-REVEALED SKIN TEXTURE")],
      ["identity lock intact", d.includes("Keep the subject identity")],
    ]) console.log(" ", ok ? "ok  " : "FAIL", label);
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");

await sql.end();
