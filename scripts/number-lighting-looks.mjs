#!/usr/bin/env node
/**
 * number-lighting-looks.mjs — give every lighting look a permanent number.
 *
 *   node scripts/number-lighting-looks.mjs            # dry run
 *   node scripts/number-lighting-looks.mjs --apply    # write
 *
 * Names come out as "47 · S Night Paparazzi G7X", so the number travels with the
 * look everywhere the name is shown — including the {name, directive} snapshot
 * stored on a booking, which is what makes "which number did I use last time"
 * answerable at all.
 *
 * THE NUMBER MUST NEVER MOVE. A number that shifts is worse than no number: the
 * friend who was told "use 47" gets a different look. So the mapping lives in
 * scripts/lighting-numbers.json keyed by option **id** — not by name, not by
 * position — and once a look is in there it keeps that number through renames,
 * regroupings and reorderings. New looks take max + 1. A deleted look's number is
 * never handed to anything else.
 *
 * The registry is committed, so the numbering is reviewable and restorable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(__dirname, "lighting-numbers.json");
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MAX_NAME = 40;                       // sanitizeOptionGroups slices names here
/** "47 · Rest of name" — the number, the separator, and what follows. */
const NUMBERED = /^(\d+)\s+·\s+(.*)$/;

const APPLY = process.argv.includes("--apply");

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = postgres(env.DATABASE_URL, { ssl: false });

const lightingGroups = (groups) => (groups ?? []).filter(g => g.type === "lighting");

async function main() {
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  if (!row) throw new Error("template not found");
  const groups = row.option_groups ?? [];

  const registry = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, "utf8")) : {};
  let highest = Object.values(registry).reduce((m, n) => Math.max(m, n), 0);

  // A name already carrying its number is the other source of truth: it survives
  // a lost registry file, so recover from it rather than issuing a fresh number.
  for (const g of lightingGroups(groups)) {
    for (const o of g.options) {
      const m = NUMBERED.exec(o.name);
      if (m && !registry[o.id]) {
        registry[o.id] = Number(m[1]);
        highest = Math.max(highest, Number(m[1]));
      }
    }
  }

  const assigned = [];
  const tooLong = [];
  let numbered = 0, kept = 0;

  const next = groups.map(g => {
    if (g.type !== "lighting") return g;
    return {
      ...g,
      options: g.options.map(o => {
        const existing = registry[o.id];
        const n = existing ?? ++highest;
        if (!existing) registry[o.id] = n;
        const m = NUMBERED.exec(o.name);
        const bare = m ? m[2] : o.name;
        const name = `${n} · ${bare}`;
        if (name.length > MAX_NAME) tooLong.push(name);
        assigned.push({ n, name, group: g.label });
        if (name === o.name) kept++; else numbered++;
        return name === o.name ? o : { ...o, name };
      }),
    };
  });

  // Two looks sharing a number would make "use 47" ambiguous, which is the whole
  // point of this. Cheap to check, impossible to notice by eye across 197.
  const seen = new Map();
  const dupes = [];
  for (const a of assigned) {
    if (seen.has(a.n)) dupes.push(`${a.n}: "${seen.get(a.n)}" and "${a.name}"`);
    else seen.set(a.n, a.name);
  }
  if (dupes.length) {
    console.error("two looks would share a number — refusing:");
    for (const d of dupes) console.error(`   ${d}`);
    process.exit(1);
  }
  if (tooLong.length) {
    console.error(`${tooLong.length} name(s) would exceed ${MAX_NAME} chars and be truncated on the next save — refusing:`);
    for (const n of tooLong) console.error(`   ${n.length}  ${n}`);
    process.exit(1);
  }

  const before = lightingGroups(groups).reduce((n, g) => n + g.options.length, 0);
  const after = lightingGroups(next).reduce((n, g) => n + g.options.length, 0);
  if (after !== before) throw new Error(`look count changed ${before} -> ${after} — refusing`);
  for (const g of lightingGroups(groups)) {
    const n = lightingGroups(next).find(x => x.id === g.id);
    if (!n || n.options.length !== g.options.length) throw new Error(`group "${g.label}" changed size — refusing`);
  }

  const nums = assigned.map(a => a.n).sort((a, b) => a - b);
  console.log(`${assigned.length} looks — numbering ${numbered}, already numbered ${kept}`);
  console.log(`range ${nums[0]}–${nums[nums.length - 1]}, longest name ${Math.max(...assigned.map(a => a.name.length))} chars`);
  for (const g of lightingGroups(next)) console.log(`   ${g.label}: ${g.options.length}`);
  console.log("\nfirst and last of each group:");
  for (const g of lightingGroups(next)) {
    console.log(`   ${g.options[0].name}`);
    console.log(`   ${g.options[g.options.length - 1].name}`);
  }
  if (!APPLY) { console.log("\ndry run. add --apply to write."); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/home/aluxart/option-groups-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(groups, null, 2));
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

  await sql`UPDATE templates SET option_groups = ${sql.json(next)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const saved = lightingGroups(check.option_groups ?? []);
  const total = saved.reduce((n, g) => n + g.options.length, 0);
  const withNumber = saved.flatMap(g => g.options).filter(o => NUMBERED.test(o.name)).length;
  console.log(`\nwritten. backup: ${backup}`);
  console.log(`registry: ${REGISTRY} (${Object.keys(registry).length} looks)`);
  console.log(`in DB now: ${total} looks, ${withNumber} numbered`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
