// Look 197 ("Night Paparazzi G7X") tells the model a hard flash fires straight
// at the subject. When the source is a mirror selfie, the model reads that as a
// property of the *phone in the frame* and fires that too, so the buyer gets a
// white starburst blown across their own picture.
//
// The look itself is correct. What is missing is a boundary: our flash is the
// camera taking the photograph, never a device inside the photograph.
//
// Applied to 197 only. Look 56 ("C Screen Glow") wants a lit screen on purpose
// and must not be touched. Backup: /home/aluxart/gear-equalizer-optiongroups.backup.json
import postgres from "postgres";
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TEMPLATE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MARKER = "DEVICES INSIDE THE FRAME";

const CONSTRAINT =
  " " + MARKER + ": the flash described above belongs to the camera taking this " +
  "photograph, never to anything inside it. If the subject is holding a phone or " +
  "camera, or one is visible in a mirror or anywhere in the shot, that device must " +
  "not be emitting light. No flash burst, no white starburst, no bloom or lens glare " +
  "from it, and no light from it falling on the subject, the mirror or the room. " +
  "Render its flash unlit and its screen dark or dimly reflective, keeping the body " +
  "of the device clearly visible and correctly shaped in the hand. Every bright " +
  "highlight in the picture comes from the on-camera flash and the room's own " +
  "ambient sources.";

const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE}`;
const groups = row.option_groups;

let touched = 0;
for (const g of groups ?? []) {
  for (const o of g.options ?? []) {
    if (o.kind !== "prompt" || !/^197 /.test(o.name ?? "")) continue;
    if ((o.description ?? "").includes(MARKER)) {
      console.log("already carries the constraint, nothing to do");
      await sql.end();
      process.exit(0);
    }
    console.log("before:", o.description.length, "chars");
    o.description = o.description.trimEnd() + CONSTRAINT;
    console.log("after: ", o.description.length, "chars");
    touched++;
  }
}

if (touched !== 1) {
  console.error(`expected exactly 1 look to match, matched ${touched} — nothing written`);
  await sql.end();
  process.exit(1);
}

// sql.json(), NOT JSON.stringify()+::jsonb. The latter parameterises the text
// and jsonb-casts it into a JSON *string*, which silently replaced all 197
// looks with one quoted blob. Restored from backup; do not write it that way.
await sql`UPDATE templates SET option_groups = ${sql.json(groups)} WHERE id = ${TEMPLATE}`;

// Read it back rather than trusting the write.
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
