// Look 39: name the gear behind the key light.
//
// Speedlight on a Canon R5C, fired in high-speed sync. HSS is the part that
// carries real information here: it is what lets a hard direct flash sit against
// a bright ambient without the highlights clipping, so the "dynamic range" line
// is spelled out as retained detail at both ends rather than left as a word.
//
// Written to keep "distinct, sharp shadows that fall to the left" and the deep,
// crisp shadows the look is built on. Deep is not the same as crushed, so the
// range clause asks for detail INSIDE the shadows, not for lifting them.
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

const OLD =
  "The key light is a hard, intense direct flash from camera-right at about 3 o'clock, " +
  "slightly above eye level, creating distinct, sharp shadows that fall to the left.";

const NEW =
  "The key light is a hard, intense direct flash from a speedlight mounted on a " +
  "Canon R5C, fired in high-speed sync, from camera-right at about 3 o'clock, " +
  "slightly above eye level, creating distinct, sharp shadows that fall to the " +
  "left. High-speed sync holds the full dynamic range of the frame: the speculars " +
  "on skin stay bright and clean without clipping to blank white, highlights in " +
  "the brightest areas keep their texture, and the deep shadows hold real detail " +
  "and tonal separation inside them rather than blocking up into flat black. Deep, " +
  "not crushed.";

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
    if ((o.description ?? "").includes("Canon R5C")) {
      console.log("look 39 already names the R5C, nothing to do");
      await sql.end();
      process.exit(0);
    }
    if (!o.description.includes(OLD)) {
      console.error("the key-light sentence in look 39 does not match — nothing written");
      console.error("found:", o.description.slice(0, 300));
      await sql.end();
      process.exit(1);
    }
    console.log("before:", o.description.length, "chars");
    o.description = o.description.replace(OLD, NEW);
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
let count = 0, ok = false, others = 0;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    const has = (o.description ?? "").includes("Canon R5C");
    if (/^39\s+·/.test(o.name ?? "")) {
      ok = has;
      console.log("\n--- look 39 now opens ---");
      console.log(o.description.slice(0, 760));
    } else if (has) others++;
  }
}
console.log("\nprompt looks present:", count, "(must be 197)");
console.log("look 39 names the R5C:", ok);
console.log("other looks changed:", others, "(must be 0)");

await sql.end();
