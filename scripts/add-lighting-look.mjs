#!/usr/bin/env node
/**
 * add-lighting-look.mjs — add one look to one lighting group.
 *
 *   node scripts/add-lighting-look.mjs --file scripts/new-look.json [--apply]
 *
 * Without --apply it prints what it would do and writes nothing.
 *
 * The JSON is one object: { group, name, framing, description }. `group` is
 * matched against the group label, ignoring any C/S prefix on the name.
 *
 * Guards, same as the rename script: full backup first, the target group must
 * gain exactly one option and no other group may change at all, the name must
 * fit the 40-character cap that sanitizeOptionGroups silently slices at, and a
 * name already present in the group is refused rather than duplicated.
 *
 * imagePath is left unset on purpose. The thumbnail is a rendered example of
 * the look, which costs a generation to produce; until one exists the picker
 * shows its placeholder tile and the look is still fully selectable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MAX_NAME = 40;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileArg = args[args.indexOf("--file") + 1];
if (!fileArg || fileArg.startsWith("--")) { console.error("usage: --file <look.json> [--apply]"); process.exit(2); }

const spec = JSON.parse(readFileSync(fileArg, "utf8"));
for (const k of ["group", "name", "framing", "description"]) {
  if (!spec[k] || typeof spec[k] !== "string") { console.error(`missing "${k}" in ${fileArg}`); process.exit(2); }
}
if (spec.name.length > MAX_NAME) {
  console.error(`name is ${spec.name.length} chars, cap is ${MAX_NAME} — it would be silently truncated on the next save`);
  process.exit(1);
}

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = postgres(env.DATABASE_URL, { ssl: false });

const bare = (n) => n.replace(/^[CS]\s+/, "").trim().toLowerCase();

async function main() {
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  if (!row) throw new Error("template not found");
  const groups = row.option_groups ?? [];

  const target = groups.find(g => g.type === "lighting" && g.label === spec.group);
  if (!target) {
    console.error(`no lighting group labelled "${spec.group}". Groups are:`);
    for (const g of groups.filter(x => x.type === "lighting")) console.error(`   ${g.label}`);
    process.exit(1);
  }
  const clash = target.options.find(o => bare(o.name) === bare(spec.name));
  if (clash) { console.error(`"${clash.name}" is already in ${target.label} — refusing to duplicate`); process.exit(1); }

  const option = {
    id: randomUUID(),
    kind: target.options[0]?.kind ?? "prompt",
    name: spec.name,
    framing: spec.framing,
    description: spec.description,
    imageBucket: target.options[0]?.imageBucket ?? "template-images",
  };

  const next = groups.map(g => g === target ? { ...g, options: [...g.options, option] } : g);

  const before = groups.filter(g => g.type === "lighting");
  const after = next.filter(g => g.type === "lighting");
  for (const g of before) {
    const n = after.find(x => x.id === g.id);
    const expected = g === target ? g.options.length + 1 : g.options.length;
    if (!n || n.options.length !== expected) throw new Error(`group "${g.label}" changed unexpectedly — refusing`);
  }

  console.log(`group:   ${target.label}  (${target.options.length} -> ${target.options.length + 1})`);
  console.log(`name:    ${option.name}  (${option.name.length} chars)`);
  console.log(`framing: ${option.framing}`);
  console.log(`id:      ${option.id}`);
  console.log(`thumbnail: none yet — placeholder tile until one is rendered`);
  if (!APPLY) { console.log("\ndry run. add --apply to write."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/home/aluxart/option-groups-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(groups, null, 2));

  await sql`UPDATE templates SET option_groups = ${sql.json(next)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const saved = (check.option_groups ?? []).filter(g => g.type === "lighting");
  const total = saved.reduce((n, g) => n + g.options.length, 0);
  console.log(`\nwritten. backup: ${backup}`);
  console.log(`in DB now: ${total} looks`);
  for (const g of saved) console.log(`   ${g.label}: ${g.options.length}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
