#!/usr/bin/env node
/**
 * Copy the Gear Equalizer's lighting archive onto Nursing Induction, so nursing
 * buyers can tick "Set the lighting myself" and choose looks.
 *
 *   node --env-file=.env.local scripts/copy-looks-to-nursing.mjs            (practice: changes nothing)
 *   node --env-file=.env.local scripts/copy-looks-to-nursing.mjs --apply
 *   node --env-file=.env.local scripts/copy-looks-to-nursing.mjs --restore <backup.json>
 *
 * Run ON THE VPS. Applied 2026-10-10; a second --apply refuses, because the
 * template already has its looks. The backup from that run is
 * /home/aluxart/backups/nursing-induction-option-groups-2026-10-10T18-59-39-428Z.json
 *
 * The bots must keep reading look numbers from the Gear Equalizer only — see
 * `sellsLooks` in lib/whatsapp-triggers.ts. Without that guard, "197" in a chat
 * could land on whichever template the database returned first.
 *
 * Same result as the dashboard's "import lighting library" button for the owner:
 * every look is carried over as it is (name, hidden recipe, framing, thumbnail)
 * with a fresh id, in the same three shot-size sections.
 *
 * SAFETY. The nursing template's current option_groups are written to a backup
 * file BEFORE anything is written. The write uses sql.json() — never
 * JSON.stringify()::jsonb, which stores one quoted string and wipes the column.
 * Afterwards the column is read back and every claim below is checked.
 * updated_at is deliberately left alone, so the dashboard's lighting library
 * keeps reading its sections from the Gear Equalizer.
 */
import postgres from "postgres";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";

const SOURCE = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";   // The Gear Equalizer
const TARGET = "7b2f6595-3749-4b2c-9c55-67fe71f70a8c";   // Nursing Induction
const EXPECTED_LOOKS = 197;
const BACKUP_DIR = "/home/aluxart/backups";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESTORE = (() => { const i = args.indexOf("--restore"); return i >= 0 ? args[i + 1] : null; })();
const sql = postgres(process.env.DATABASE_URL, { ssl: false });
const md5 = (v) => createHash("md5").update(JSON.stringify(v)).digest("hex").slice(0, 10);
const stop = async (msg) => { console.log("STOPPED:", msg); await sql.end(); process.exit(1); };
const lighting = (groups) => groups.filter((g) => g.type === "lighting");
const looksIn = (groups) => lighting(groups).flatMap((g) => g.options ?? []);

if (RESTORE) {
  const saved = JSON.parse(readFileSync(RESTORE, "utf8"));
  if (!Array.isArray(saved)) await stop("that backup is not a list of groups");
  await sql`UPDATE templates SET option_groups = ${sql.json(saved)} WHERE id = ${TARGET}`;
  const [after] = await sql`SELECT jsonb_typeof(option_groups) AS t, jsonb_array_length(option_groups) AS n FROM templates WHERE id = ${TARGET}`;
  console.log(`restored: ${after.t}, ${after.n} groups`);
  await sql.end();
  process.exit(0);
}

const [src] = await sql`
  SELECT t.title, t.option_groups, c.user_id AS owner FROM templates t JOIN creators c ON c.id = t.creator_id WHERE t.id = ${SOURCE}`;
const [dst] = await sql`
  SELECT t.title, t.status, t.option_groups, t.updated_at, c.user_id AS owner FROM templates t JOIN creators c ON c.id = t.creator_id WHERE t.id = ${TARGET}`;

if (!src || !dst) await stop("a template was not found");
if (!Array.isArray(src.option_groups)) await stop("the Gear Equalizer's groups are not a list");
if (!Array.isArray(dst.option_groups)) await stop("the nursing template's groups are not a list");
if (src.owner !== dst.owner) await stop("the two templates have different owners, so the thumbnails cannot be shared");
if (lighting(dst.option_groups).length > 0) await stop(`${dst.title} already has ${looksIn(dst.option_groups).length} lighting looks — nothing to do`);

const sections = lighting(src.option_groups).filter((g) => Array.isArray(g.options) && g.options.length > 0);
const sourceLooks = sections.flatMap((g) => g.options);
if (sourceLooks.length !== EXPECTED_LOOKS) await stop(`expected ${EXPECTED_LOOKS} looks on the Gear Equalizer, found ${sourceLooks.length}`);

// Every look must be a complete recipe, with pictures the nursing template's owner is allowed to use.
const prefix = `${dst.owner}/`;
for (const o of sourceLooks) {
  if (o.kind !== "prompt") await stop(`"${o.name}" is not a lighting recipe`);
  if (typeof o.description !== "string" || !o.description.trim()) await stop(`"${o.name}" has no recipe`);
  if (o.imagePath && !o.imagePath.startsWith(prefix)) await stop(`"${o.name}" has a thumbnail outside the owner's storage`);
  if (o.beforeImagePath && !o.beforeImagePath.startsWith(prefix)) await stop(`"${o.name}" has a before picture outside the owner's storage`);
}

const added = sections.map((g) => ({
  id: randomUUID(),
  type: "lighting",
  label: g.label,
  options: g.options.map((o) => ({ ...o, id: randomUUID() })),
  ...(g.beforeImages && Object.keys(g.beforeImages).length ? { beforeImages: g.beforeImages } : {}),
  ...((g.beforeImages && Object.keys(g.beforeImages).length) || g.beforeImagePath
    ? { beforeImageBucket: g.beforeImageBucket || "template-images" } : {}),
  ...(g.beforeImagePath ? { beforeImagePath: g.beforeImagePath } : {}),
}));
const next = [...dst.option_groups, ...added];

console.log(`from : ${src.title}`);
console.log(`to   : ${dst.title} (${dst.status}), last edited ${new Date(dst.updated_at).toISOString().slice(0, 10)}`);
console.log(`now  : ${dst.option_groups.length} groups — ${dst.option_groups.map((g) => `${g.type} ${g.options?.length ?? 0}`).join(", ")}`);
console.log(`add  : ${added.map((g) => `${g.label} (${g.options.length})`).join(" · ")} = ${looksIn(added).length} looks`);
console.log(`after: ${next.length} groups`);

if (!APPLY) { console.log("\npractice run — nothing was written. Add --apply to do it."); await sql.end(); process.exit(0); }

mkdirSync(BACKUP_DIR, { recursive: true });
const backup = `${BACKUP_DIR}/nursing-induction-option-groups-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(dst.option_groups, null, 1));
console.log(`\nbackup written: ${backup}`);

await sql`UPDATE templates SET option_groups = ${sql.json(next)} WHERE id = ${TARGET}`;

// ── Read it back and check every claim ──────────────────────────────────────
const [check] = await sql`
  SELECT jsonb_typeof(option_groups) AS kind, option_groups, updated_at FROM templates WHERE id = ${TARGET}`;
const now = check.option_groups;
const problems = [];
if (check.kind !== "array") problems.push(`the column is a ${check.kind}, not a list`);
if (!Array.isArray(now)) problems.push("the groups did not come back as a list");
else {
  if (now.length !== dst.option_groups.length + added.length) problems.push(`${now.length} groups, expected ${dst.option_groups.length + added.length}`);
  dst.option_groups.forEach((g, i) => { if (md5(now[i]) !== md5(g)) problems.push(`the existing "${g.type}" group changed`); });
  const got = looksIn(now);
  if (got.length !== EXPECTED_LOOKS) problems.push(`${got.length} lighting looks, expected ${EXPECTED_LOOKS}`);
  const byName = new Map(sourceLooks.map((o) => [o.name, o]));
  for (const o of got) {
    const s = byName.get(o.name);
    if (!s) { problems.push(`"${o.name}" is not on the Gear Equalizer`); continue; }
    if (o.description !== s.description) problems.push(`"${o.name}" recipe differs`);
    if ((o.framing ?? null) !== (s.framing ?? null)) problems.push(`"${o.name}" framing differs`);
    if ((o.imagePath ?? null) !== (s.imagePath ?? null)) problems.push(`"${o.name}" thumbnail differs`);
    if (o.kind !== "prompt") problems.push(`"${o.name}" is not a recipe`);
  }
  const ids = now.flatMap((g) => [g.id, ...(g.options ?? []).map((o) => o.id)]);
  if (new Set(ids).size !== ids.length) problems.push("two things share an id");
  const sourceIds = new Set(sourceLooks.map((o) => o.id));
  if (got.some((o) => sourceIds.has(o.id))) problems.push("a look kept the Gear Equalizer's id");
}
if (+new Date(check.updated_at) !== +new Date(dst.updated_at)) problems.push("the last-edited date moved");

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S) — restoring the backup:`);
  for (const p of problems.slice(0, 12)) console.log("  -", p);
  await sql`UPDATE templates SET option_groups = ${sql.json(dst.option_groups)} WHERE id = ${TARGET}`;
  const [back] = await sql`SELECT jsonb_typeof(option_groups) AS kind, jsonb_array_length(option_groups) AS n FROM templates WHERE id = ${TARGET}`;
  console.log(`restored: ${back.kind}, ${back.n} groups`);
  await sql.end();
  process.exit(1);
}

console.log(`\nchecked: the column is a list of ${now.length} groups`);
console.log(`checked: the ${dst.option_groups.length} existing groups are byte-for-byte unchanged`);
console.log(`checked: lighting looks now on ${dst.title}: ${looksIn(now).length} (must be ${EXPECTED_LOOKS})`);
console.log("checked: every recipe, framing and thumbnail matches the Gear Equalizer; every id is new and unique");
console.log("checked: the last-edited date did not move");
await sql.end();
