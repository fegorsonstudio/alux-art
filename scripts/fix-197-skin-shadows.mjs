// Two more additions to look 197, asked for after the phone-flash fix:
//
//   1. Even out skin tone. Guarded explicitly against lightening, because
//      "balance the skin tone" is precisely the instruction a model answers by
//      bleaching a dark complexion. The Identity Lock rule says skin tone is
//      preserved, so evening out means evenness, never a lighter person.
//   2. Erase the shadows the room's own lighting left on the subject, so the
//      only shadow left is the one our flash throws.
//
// sql.json() for the write. JSON.stringify()+::jsonb stores a JSON string and
// wipes all 197 looks. Backup: /home/aluxart/gear-equalizer-optiongroups.backup.json
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MARKER = "EVEN SKIN TONE";

const ADDITION =
  " " + MARKER + ": hold one even skin tone across the whole body. Face, neck, " +
  "chest, shoulders, arms and hands must read as the same person under the same " +
  "light, with no patchiness, no blotching, no lighter or darker zone left where " +
  "the original photograph was unevenly lit, and no colour cast pulling any part " +
  "of the skin green, orange, grey or ashy. Even out the tone while keeping the " +
  "subject's true complexion and depth exactly as it is in the source: never " +
  "lighten, bleach, desaturate or shift the colour of their skin. Keep real skin " +
  "texture and visible pores throughout." +
  " ERASE THE ORIGINAL AMBIENT SHADOWS: the shadows the room's own lighting left " +
  "on the subject in the source photograph are gone. Remove the overhead falloff " +
  "and every shadow those sources cast on the person, under the brow, beside the " +
  "nose, under the chin and jaw, down the neck, across the chest and along the " +
  "arms, along with any dark side or patchy shading they created. The subject is " +
  "lit flatly and cleanly from the front by the flash alone, and the only shadow " +
  "anywhere in the picture is the single hard-edged one that flash throws onto " +
  "the nearest surface behind them.";

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
    if (o.kind !== "prompt" || !/^197 /.test(o.name ?? "")) continue;
    if ((o.description ?? "").includes(MARKER)) {
      console.log("already carries the addition, nothing to do");
      await sql.end();
      process.exit(0);
    }
    console.log("before:", o.description.length, "chars");
    o.description = o.description.trimEnd() + ADDITION;
    console.log("after: ", o.description.length, "chars");
    touched++;
  }
}

if (touched !== 1) {
  console.error(`expected exactly 1 look to match, matched ${touched} — nothing written`);
  await sql.end();
  process.exit(1);
}

await sql`UPDATE templates SET option_groups = ${sql.json(groups)} WHERE id = ${TEMPLATE}`;

const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
let ok = false, others = 0, count = 0;
for (const g of check.option_groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt") continue;
    count++;
    if (/^197 /.test(o.name ?? "") && (o.description ?? "").includes(MARKER)) ok = true;
    else if ((o.description ?? "").includes(MARKER)) others++;
  }
}
console.log("look 197 carries it:", ok);
console.log("other looks changed:", others, "(must be 0)");
console.log("prompt looks still present:", count, "(must be 197)");

await sql.end();
