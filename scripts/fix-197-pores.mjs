// Look 197: make the flash RESOLVE skin instead of polishing it away.
//
// Two changes, and the first is the cause of the second being needed.
//
// 1. The look currently says the speculars clip "toward white where the flash
//    lands most directly, pores still visible". Those two halves fight: a
//    clipped highlight has no information left in it, so the pores it promises
//    cannot survive. That is why the output reads glassy. The clause now asks
//    the highlight to approach white without clipping flat.
//
// 2. A dedicated texture block. Direct on-axis flash is unflattering precisely
//    because it resolves micro-relief — each pore and vellus hair throws its own
//    tiny specular. Naming that mechanism gives the model something physical to
//    render, where "visible pores" alone reads as a style word it can ignore.
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
const MARKER = "FLASH-REVEALED SKIN TEXTURE";

const OLD_CLIP =
  "clipping toward white where the flash lands most directly, pores still visible " +
  "so skin reads glossy and lit, not retouched.";

const NEW_CLIP =
  "driven right up toward white where the flash lands most directly but never " +
  "clipping flat: even the brightest sheen keeps pore structure readable inside " +
  "it, so skin reads glossy and lit, not retouched and not blown out.";

const TEXTURE =
  " " + MARKER + ": a hard direct flash RESOLVES skin, it does not smooth it. " +
  "At full zoom the skin must show crisp, individually separated pores across the " +
  "nose, cheeks, forehead and chin, fine vellus hair catching the light along the " +
  "jawline, hairline, shoulders and forearms, and the natural micro-relief and " +
  "slight unevenness of a real surface, with a tiny specular point struck off each " +
  "raised area by the on-axis flash. The wet-looking sheen sits ON this texture and " +
  "never replaces it. Pore detail must come out sharper and better defined than in " +
  "the source photograph. No airbrushing, no beauty-filter smoothing, no frequency " +
  "separation look, no waxy, plastic or porcelain finish, no blurred or painted " +
  "skin, and no loss of texture inside the highlights.";

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
      console.log("already carries the texture block, nothing to do");
      await sql.end();
      process.exit(0);
    }
    if (!o.description.includes(OLD_CLIP)) {
      console.error("the clipping clause does not match — nothing written");
      await sql.end();
      process.exit(1);
    }
    console.log("before:", o.description.length, "chars");
    o.description = o.description.replace(OLD_CLIP, NEW_CLIP).trimEnd() + TEXTURE;
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
let count = 0, ok = false, others = 0, stale = 0;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    const has = (o.description ?? "").includes(MARKER);
    if (/^197\s+·/.test(o.name ?? "")) ok = has;
    else if (has) others++;
    if ((o.description ?? "").includes("clipping toward white")) stale++;
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");
console.log("look 197 carries the texture block:", ok);
console.log("other looks changed:", others, "(must be 0)");
console.log("old clipping clause left:", stale, "(must be 0)");

await sql.end();
