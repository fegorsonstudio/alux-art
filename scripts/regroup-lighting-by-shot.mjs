#!/usr/bin/env node
/**
 * regroup-lighting-by-shot.mjs — sort the lighting archive by shot type.
 *
 *   node --env-file=.env.local scripts/regroup-lighting-by-shot.mjs --plan
 *   node --env-file=.env.local scripts/regroup-lighting-by-shot.mjs --apply
 *   node --env-file=.env.local scripts/regroup-lighting-by-shot.mjs --restore <backup.json>
 *
 * WHY. The archive is grouped by MOOD (Atmosphere, Dark Romantic, Neon…), which
 * answers "what feeling do I want" but not "I shot a headshot — which of these
 * 195 looks is even meant for a headshot?". Every look already carries a
 * `framing` (head / medium / full) that drives the before/after preview pairing,
 * so the information is there; it just was not the thing you could browse by.
 *
 * WHAT IT DOES. Rebuilds the lighting groups as three: headshots, medium, full
 * body. Within each, looks stay clustered by their original mood family so the
 * curation is not lost — related looks still sit together, they are just under
 * the shot size they were designed for.
 *
 * WHAT IT PRESERVES. Every option object is carried over byte-for-byte: its id,
 * its name, its thumbnail, and critically its `description`, which for a
 * lighting option is the hidden generation prompt. Losing or rewriting that
 * would change what the product produces. `beforeImages` is rebuilt per group
 * from the sources already in use.
 *
 * SAFETY. --plan changes nothing. --apply writes a timestamped backup of the
 * existing option_groups next to this script BEFORE writing, and --restore puts
 * it back. This edits a live published template.
 */

import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const PLAN = args.includes("--plan");
const APPLY = args.includes("--apply");
const RESTORE = (() => { const i = args.indexOf("--restore"); return i >= 0 ? args[i + 1] : null; })();
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";

const env = process.env.DATABASE_URL ? process.env : Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

/** Shot type → what a buyer calls it. Order is the order they appear. */
const SHOTS = [
  { framing: "head",   label: "Headshots & close-ups" },
  { framing: "medium", label: "Medium shots — waist up" },
  { framing: "full",   label: "Full body" },
];
/** A look with no framing recorded is treated as medium, the commonest crop. */
const DEFAULT_FRAMING = "medium";

const sql = postgres(env.DATABASE_URL, { ssl: false });

async function main() {
  if (RESTORE) {
    const groups = JSON.parse(readFileSync(RESTORE, "utf8"));
    await sql`UPDATE templates SET option_groups = ${sql.json(groups)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;
    console.log(`restored ${groups.length} group(s) from ${RESTORE}`);
    await sql.end(); return;
  }
  if (!PLAN && !APPLY) { console.error("choose --plan, --apply or --restore <file>"); process.exitCode = 2; await sql.end(); return; }

  const [row] = await sql`SELECT title, option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  if (!row) throw new Error("template not found");
  const groups = row.option_groups ?? [];
  const lighting = groups.filter(g => g.type === "lighting");
  const others = groups.filter(g => g.type !== "lighting");
  if (!lighting.length) throw new Error("no lighting groups to regroup");

  // Already regrouped? Bail rather than nest shot types inside shot types.
  if (lighting.some(g => SHOTS.some(s => g.label === s.label))) {
    console.log("Already grouped by shot type — nothing to do.");
    await sql.end(); return;
  }

  // Flatten, remembering which mood family each look came from so the curation
  // survives as clustering inside the new groups.
  const flat = [];
  for (const g of lighting) {
    for (const o of g.options ?? []) {
      flat.push({ option: o, mood: g.label, framing: o.framing || DEFAULT_FRAMING });
    }
  }

  // The before/after preview needs a source per framing. Take whatever the
  // existing groups already use rather than inventing one.
  const beforeByFraming = {};
  let beforeBucket;
  for (const g of lighting) {
    for (const [framing, path] of Object.entries(g.beforeImages ?? {})) {
      if (!beforeByFraming[framing]) beforeByFraming[framing] = path;
    }
    if (!beforeBucket && g.beforeImageBucket) beforeBucket = g.beforeImageBucket;
  }

  const rebuilt = [];
  for (const shot of SHOTS) {
    const mine = flat.filter(f => f.framing === shot.framing);
    if (!mine.length) continue;
    // Cluster by mood, and keep each mood's original order within the cluster.
    const moods = [...new Set(mine.map(f => f.mood))];
    const options = moods.flatMap(m => mine.filter(f => f.mood === m).map(f => f.option));
    rebuilt.push({
      id: randomUUID(),
      type: "lighting",
      label: shot.label,
      options,
      ...(beforeByFraming[shot.framing]
        ? { beforeImages: { [shot.framing]: beforeByFraming[shot.framing] },
            beforeImagePath: beforeByFraming[shot.framing],
            ...(beforeBucket ? { beforeImageBucket: beforeBucket } : {}) }
        : {}),
    });
  }

  const before = flat.length;
  const after = rebuilt.reduce((a, g) => a + g.options.length, 0);
  console.log(`${row.title}\n`);
  console.log(`${lighting.length} mood group(s) → ${rebuilt.length} shot-type group(s)`);
  for (const g of rebuilt) {
    const moods = new Set(flat.filter(f => g.options.some(o => o.id === f.option.id)).map(f => f.mood));
    console.log(`  ${String(g.options.length).padStart(3)}  ${g.label.padEnd(26)} (${moods.size} mood families)`);
  }
  console.log(`\nlooks in: ${before}   looks out: ${after}`);
  if (before !== after) throw new Error(`look count changed (${before} → ${after}) — refusing to write`);

  // Every option must come through untouched, prompt included.
  const idsIn = new Set(flat.map(f => f.option.id));
  const idsOut = new Set(rebuilt.flatMap(g => g.options.map(o => o.id)));
  if (idsIn.size !== idsOut.size) throw new Error("option ids changed — refusing to write");
  const promptsLost = flat.filter(f => f.option.description && !rebuilt.some(g => g.options.some(o => o.id === f.option.id && o.description === f.option.description)));
  if (promptsLost.length) throw new Error(`${promptsLost.length} generation prompt(s) would be lost — refusing to write`);

  if (PLAN) { console.log("\nPLAN ONLY — nothing written."); await sql.end(); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(__dirname, `lighting-groups-backup-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(groups, null, 2));
  console.log(`\nbackup: ${backup}`);

  await sql`
    UPDATE templates SET option_groups = ${sql.json([...others, ...rebuilt])}, updated_at = NOW()
    WHERE id = ${TEMPLATE_ID}`;
  console.log("written. Restore with:");
  console.log(`  node --env-file=.env.local scripts/regroup-lighting-by-shot.mjs --restore "${backup}"`);
  await sql.end();
}

main().catch(async (e) => { console.error("regroup error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
