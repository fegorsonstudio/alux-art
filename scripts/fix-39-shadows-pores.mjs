// Look 39, second pass. Two confirmed failures from a real generation.
//
// SHADOWS. 39 is side light and is BUILT on deep shadows, so "erase the shadows"
// cannot be copied from 197 or the look dies. The shadows have to be split by
// SOURCE instead of by depth: the room's original shading goes, the speedlight's
// own hard shadows stay. The test given to the model is causal — if a shadow
// cannot be explained by one hard source at camera-right 3 o'clock, it does not
// belong.
//
// PORES. Came back completely smooth, so the texture block was being ignored
// rather than under-weighted. Wording alone will not fix an ignored instruction,
// so it is promoted to a pass/fail test at the FRONT of the lighting directive,
// in the same shape the wrapper already uses successfully for the identity lock
// ("two tests apply and BOTH must pass"). That construction demonstrably survives
// this prompt; a descriptive line in the middle does not.
//
// The full description is rebuilt rather than patched, so the ordering is
// deliberate instead of accumulated. Geometry preserved: 3 o'clock, above eye
// level, shadows falling left, minimal fill, no rim or hair light, catchlights at
// 10 o'clock, neutral 5500K, warm red background darkest at the edges.
//
// sql.json() for the write. JSON.stringify()+::jsonb wipes all 197 looks.
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";

const DESCRIPTION = [
  "TWO TESTS APPLY TO THIS RELIGHT AND BOTH MUST PASS AT FULL ZOOM: (1) the picture",
  "reads instantly as a hard, undiffused, direct-flash photograph; (2) the skin shows",
  "crisp, individually separated pores and real surface texture. Smooth, poreless,",
  "airbrushed, waxy or plastic-looking skin is a FAILED result no matter how good the",
  "lighting is, and soft, diffused, ambient-looking light is a FAILED result no matter",
  "how clean the skin is.",
  "",
  "Relight this image. Change nothing else except the lighting.",
  "",
  "THE LIGHT. The key light is a bare, undiffused speedlight mounted on a Canon R5C,",
  "fired straight at the subject from camera-right at about 3 o'clock, slightly above",
  "eye level. No softbox, no umbrella, no bounce, no diffusion of any kind: the source",
  "is small and hard, so shadow edges are crisp and the light is punchy rather than",
  "gentle or wrapping.",
  "",
  "THE FLASH MUST WIN: expose the subject roughly two stops brighter than the room's",
  "own light, so they read clearly brighter, cleaner and more saturated than everything",
  "around them and never take on the room's colour. Light falls off fast — whatever the",
  "flash does not reach drops away quickly into darkness.",
  "",
  "Push the speculars hard: bright, sharp, wet-looking highlights on the forehead,",
  "cheekbone, nose bridge, chin, collarbone and shoulder of the lit side, driven right",
  "up toward white but never clipping flat, with pore structure still readable inside",
  "them. Distinct, sharp shadows fall to the left, and a hard-edged shadow is thrown",
  "onto the nearest surface behind the subject.",
  "",
  "High-speed sync is what lets this flash overpower a bright ambient, so the frame",
  "holds its full range WITHOUT giving up contrast. The picture stays hard and",
  "high-contrast: the range shows as real texture surviving inside the brightest",
  "highlights and real tonal separation inside the deepest shadows, never as lifted",
  "shadows, tamed highlights or a flat HDR rendering. Deep, not crushed. Contrasty,",
  "not soft.",
  "",
  "Keep fill minimal and the contrast ratio high. Add no rim light and no hair light.",
  "Shadows are deep with crisp, well-defined edges, especially under the brow and chin.",
  "Render catchlights as small, bright, circular points at 10 o'clock in the eyes. Hold",
  "the subject at a neutral ~5500K, and apply a warm red colour cast to the background,",
  "falling off smoothly and darkest at the edges.",
  "",
  "ERASE THE ROOM'S OWN SHADOWS, KEEP THE FLASH'S. The shading in the source",
  "photograph was made by the room's original lighting and it is gone: the overhead",
  "falloff, the shadow under the brow, beside the nose, under the chin and jaw and down",
  "the neck, and any patchy, blotchy or directionless darkening those sources left on",
  "the skin. Do not preserve, blend or soften them — remove them, then light the",
  "subject again from scratch. Every shadow in the finished picture is one the",
  "speedlight itself makes, falling to the left, consistent with a single hard source",
  "at camera-right 3 o'clock. If a shadow cannot be explained by that one light, it",
  "does not belong in the image. This does not mean a flatly lit picture: the deep,",
  "crisp shadows this look depends on are the flash's own and must stay.",
  "",
  "FLASH-REVEALED SKIN TEXTURE. A hard direct flash RESOLVES skin, it does not smooth",
  "it. At full zoom the skin must show crisp, individually separated pores across the",
  "nose, cheeks, forehead and chin, fine vellus hair catching the light along the",
  "jawline and hairline, and the natural micro-relief and slight unevenness of a real",
  "surface, with a tiny specular point struck off each raised area on the lit side. The",
  "sheen sits ON this texture and never replaces it. Pore detail must come out sharper",
  "and better defined than in the source photograph, including inside the brightest",
  "highlights. No airbrushing, no beauty-filter smoothing, no frequency-separation",
  "look, no waxy, plastic or porcelain finish, no blurred or painted skin.",
  "",
  "Keep the existing background, setting and framing exactly as they are and add",
  "nothing to the scene — only the light falling on it changes. Keep the subject",
  "identity, pose, expression, hairstyle and clothing exactly as they are.",
  "",
  "DEVICES INSIDE THE FRAME: every light described above comes from a speedlight the",
  "photographer is firing, outside this picture, never from a device inside it. If the",
  "subject is holding a phone or camera, or one is visible in a mirror or anywhere in",
  "the shot, that device must not be emitting light. No flash burst, no white starburst,",
  "no bloom or lens glare from it, and no light from it falling on the subject, the",
  "mirror or the room. Render its flash unlit and its screen dark or dimly reflective,",
  "keeping the body of the device clearly visible and correctly shaped in the hand.",
  "Every bright highlight in the picture comes from that speedlight and the room's own",
  "ambient sources.",
].join("\n");

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
    fs.writeFileSync("/home/aluxart/look-39.previous.txt", o.description);
    console.log("previous version saved to /home/aluxart/look-39.previous.txt");
    console.log("before:", o.description.length, "chars");
    o.description = DESCRIPTION;
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
      ["pores are a pass/fail test up front", d.indexOf("BOTH MUST PASS") < 200],
      ["room shadows erased", d.includes("ERASE THE ROOM'S OWN SHADOWS")],
      ["flash shadows protected", d.includes("must stay")],
      ["keeps 3 o'clock geometry", d.includes("3 o'clock")],
      ["keeps shadows falling left", d.includes("fall to the left")],
      ["keeps deep crisp shadows", d.includes("deep with crisp, well-defined edges")],
      ["keeps red background cast", d.includes("warm red")],
      ["keeps 10 o'clock catchlights", d.includes("10 o'clock")],
      ["devices block intact", d.includes("DEVICES INSIDE THE FRAME")],
      ["identity lock intact", d.includes("Keep the subject identity")],
      ["background lock intact", d.includes("Keep the existing background")],
    ]) console.log(" ", ok ? "ok  " : "FAIL", label);
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");

await sql.end();
