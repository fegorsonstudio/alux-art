#!/usr/bin/env node
/**
 * fix-lighting-before-images.mjs — give every lighting group all three
 * "before" sources.
 *
 *   node --env-file=.env.local scripts/fix-lighting-before-images.mjs --plan
 *   node --env-file=.env.local scripts/fix-lighting-before-images.mjs --apply
 *
 * THE BUG THIS FIXES. CheckoutPanel resolves the before image like this:
 *
 *   const lightingBeforeByFraming = lightingGroups
 *     .map(g => g.beforeImageUrls).find(m => m && Object.keys(m).length > 0);
 *   const beforeUrlFor = (framing) =>
 *     (framing && lightingBeforeByFraming?.[framing]) || lightingBeforeUrl;
 *
 * It takes the FIRST group's map and uses it for EVERY group. When the archive
 * was grouped by mood that was harmless, because each mood group carried all
 * three framings. Regrouping by shot type gave each group only its own framing
 * — so with "Headshots" first, every medium and full-body look missed the
 * lookup and fell back to the shared headshot. Buyers saw a close-up "before"
 * against a full-length "after": two different photographs, which reads as a
 * fake comparison rather than a relight.
 *
 * The fix is data, not code: put all three sources on every group, exactly as
 * the mood groups had them. Backs up before writing.
 */

import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const args = process.argv.slice(2);
const PLAN = args.includes("--plan");
const APPLY = args.includes("--apply");
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";

const env = process.env.DATABASE_URL ? process.env : Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const sql = postgres(env.DATABASE_URL, { ssl: false });

async function main() {
  if (!PLAN && !APPLY) { console.error("choose --plan or --apply"); process.exitCode = 2; await sql.end(); return; }

  const [row] = await sql`SELECT title, option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  if (!row) throw new Error("template not found");
  const groups = row.option_groups ?? [];

  // The three sources, gathered from wherever they already appear. Prefer a
  // backup of the pre-regroup state if one is to hand, but the current groups
  // still carry one framing each, which between them is all three.
  const sources = {};
  let bucket;
  for (const g of groups) {
    if (g.type !== "lighting") continue;
    for (const [framing, path] of Object.entries(g.beforeImages ?? {})) {
      if (!sources[framing]) sources[framing] = path;
    }
    if (!bucket && g.beforeImageBucket) bucket = g.beforeImageBucket;
  }

  const missing = ["head", "medium", "full"].filter(f => !sources[f]);
  if (missing.length) throw new Error(`no before source found for: ${missing.join(", ")} — restore from a backup first`);

  console.log(`${row.title}\n`);
  console.log("before sources in use:");
  for (const [f, p] of Object.entries(sources)) console.log(`  ${f.padEnd(7)} ${p.split("/").pop()}`);

  const rebuilt = groups.map(g => {
    if (g.type !== "lighting") return g;
    return {
      ...g,
      // ALL three on every group. The UI reads only the first group's map, so a
      // partial map on that group silently mis-serves every other framing.
      beforeImages: { ...sources },
      beforeImagePath: g.beforeImagePath ?? sources.medium,
      ...(bucket ? { beforeImageBucket: bucket } : {}),
    };
  });

  const lighting = rebuilt.filter(g => g.type === "lighting");
  console.log(`\n${lighting.length} lighting group(s) will each carry all 3 framings:`);
  for (const g of lighting) {
    console.log(`  ${String(g.options.length).padStart(3)}  ${g.label.padEnd(26)} → ${Object.keys(g.beforeImages).sort().join(", ")}`);
  }

  // Nothing about the looks themselves may change.
  const before = groups.filter(g => g.type === "lighting").reduce((a, g) => a + g.options.length, 0);
  const after = lighting.reduce((a, g) => a + g.options.length, 0);
  if (before !== after) throw new Error(`look count changed (${before} → ${after}) — refusing to write`);

  if (PLAN) { console.log("\nPLAN ONLY — nothing written."); await sql.end(); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(__dirname, `lighting-groups-backup-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(groups, null, 2));
  await sql`UPDATE templates SET option_groups = ${sql.json(rebuilt)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;
  console.log(`\nwritten. backup: ${backup}`);
  await sql.end();
}

main().catch(async (e) => { console.error("fix error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
