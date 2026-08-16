#!/usr/bin/env node
/**
 * lighting-classify.mjs — label every lighting look C (continuous) or S (strobe).
 *
 *   node scripts/lighting-classify.mjs --draft    # writes a TSV to review
 *   node scripts/lighting-classify.mjs --apply    # renames, after you correct it
 *
 * WHY THIS IS TWO STEPS AND NOT ONE.
 *
 * The recipes carry no fixture information. A whole-word search across all 196
 * returns zero hits for strobe, flash, speedlight, continuous, LED, candle,
 * window, practical or neon. They describe quality and position — "a hard source
 * at 90 degrees camera-left", "a large soft key, high and wrapping" — which is
 * equally true of a strobe or a continuous fixture. So a single automated pass
 * would be inventing labels for most of the archive, and a wrong C/S is worse
 * than none: a photographer picks by it.
 *
 * The draft therefore guesses only where a recipe gives it grounds to, marks
 * everything else `?`, and refuses to apply until no `?` is left.
 *
 * THE HEURISTIC, stated so it can be argued with:
 *   C — light that is visibly PRESENT in the frame or behaves like ambience:
 *       haze and beams you can see, fire and candlelight, practicals and lamps
 *       in shot, neon and screen glow, sunlight and windows, projections.
 *   S — light that behaves like a fired flash: frozen, crisp specular edges,
 *       hard shadow transitions, clamshell/beauty-dish/gridded-spot geometry,
 *       high-key sweeps that need power to hold an aperture.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSV = join(__dirname, "lighting-cs-draft.tsv");
const TEMPLATE_ID = process.env.LIGHTING_TEMPLATE_ID || "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const MAX_NAME = 40;                 // sanitizeOptionGroups slices names here
const PREFIXED = /^[CS]\s/;

const args = process.argv.slice(2);
const DRAFT = args.includes("--draft");
const APPLY = args.includes("--apply");
if (!DRAFT && !APPLY) { console.error("choose --draft or --apply"); process.exit(2); }

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = postgres(env.DATABASE_URL, { ssl: false });

// Each rule carries the phrase it matched, so the reviewer sees WHY, not just what.
const CONTINUOUS = [
  [/\bhaze\b|\bsmoke\b|\bfog\b|\bmist\b|atmospher/i, "visible atmosphere"],
  [/candle|firelight|by fire|lantern/i, "flame source"],
  [/practical|table lamp|floor lamp|standing lamp|chandelier/i, "practical in shot"],
  [/neon|screen glow|monitor|television|\bTV\b/i, "neon / screen"],
  [/window|daylight|sunlight|golden hour|blue hour|overcast/i, "daylight"],
  [/projection|gobo|projected|shaft|beam of light|light beam/i, "projected beam"],
  [/street ?light|sodium|tungsten|fluorescent|halation/i, "ambient fixture"],
];
const STROBE = [
  [/clamshell|beauty dish|paramount|butterfly lighting/i, "clamshell / beauty dish"],
  [/high-?key|white sweep|blown white|pure white background/i, "high-key sweep"],
  [/crisp|hard-?edged|sharp shadow|frozen|snap/i, "crisp / frozen"],
  [/grid|snoot|barn ?door|strip ?box|octa/i, "modifier geometry"],
  [/rim light|kicker|edge light|separation light/i, "rim / kicker rig"],
  [/gel|gelled/i, "gelled head"],
];

const matchAll = (rules, text) => rules.filter(([re]) => re.test(text)).map(([, why]) => why);

function classify(name, desc) {
  const text = `${name} ${desc}`;
  const c = matchAll(CONTINUOUS, text);
  const s = matchAll(STROBE, text);
  // Visible atmosphere or a real flame/practical is the strongest signal there
  // is; it outranks rig-shaped words, which appear in continuous setups too.
  if (c.length && !s.length) return ["C", c.join("; ")];
  if (s.length && !c.length) return ["S", s.join("; ")];
  if (c.length && s.length) {
    const decisive = c.find(x => x === "visible atmosphere" || x === "flame source" || x === "practical in shot");
    if (decisive) return ["C", `${decisive} (outranks: ${s.join("; ")})`];
    return ["?", `conflicting: C[${c.join("; ")}] vs S[${s.join("; ")}]`];
  }
  return ["?", "no fixture cue in the recipe"];
}

function lightingGroups(optionGroups) {
  return (optionGroups ?? []).filter(g => g.type === "lighting");
}

async function draft() {
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  if (!row) throw new Error("template not found");

  const lines = ["group\tframing\tproposed\tname\tevidence"];
  let c = 0, s = 0, unknown = 0, already = 0;
  for (const g of lightingGroups(row.option_groups)) {
    for (const o of (g.options ?? [])) {
      if (PREFIXED.test(o.name)) { already++; continue; }
      const [label, why] = classify(o.name, o.description ?? "");
      if (label === "C") c++; else if (label === "S") s++; else unknown++;
      lines.push([g.label, o.framing ?? "-", label, o.name, why].join("\t"));
    }
  }
  writeFileSync(TSV, lines.join("\n") + "\n", "utf8");

  console.log(`wrote ${TSV}`);
  console.log(`  C ${c}   S ${s}   ? ${unknown}${already ? `   (already prefixed: ${already})` : ""}`);
  console.log(`\nEdit the "proposed" column. Every ? must become C or S.`);
  console.log(`Then: node scripts/lighting-classify.mjs --apply`);
}

async function apply() {
  if (!existsSync(TSV)) throw new Error(`no ${TSV} — run --draft first`);
  const rows = readFileSync(TSV, "utf8").split(/\r?\n/).filter(Boolean).slice(1)
    .map(l => l.split("\t"))
    .map(([group, framing, proposed, name]) => ({ group, framing, proposed: (proposed || "").trim().toUpperCase(), name }));

  const unresolved = rows.filter(r => r.proposed !== "C" && r.proposed !== "S");
  if (unresolved.length) {
    console.error(`${unresolved.length} row(s) still unlabelled — refusing to write:`);
    for (const r of unresolved.slice(0, 10)) console.error(`   [${r.proposed || "?"}] ${r.name}`);
    process.exit(1);
  }

  const byName = new Map(rows.map(r => [r.name, r.proposed]));

  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const groups = row.option_groups ?? [];
  const before = lightingGroups(groups).reduce((n, g) => n + g.options.length, 0);

  let renamed = 0, skipped = 0;
  const tooLong = [];
  const next = groups.map(g => {
    if (g.type !== "lighting") return g;
    return {
      ...g,
      options: g.options.map(o => {
        if (PREFIXED.test(o.name)) { skipped++; return o; }
        const label = byName.get(o.name);
        if (!label) { skipped++; return o; }
        const name = `${label} ${o.name}`;
        // A name over the cap would be silently truncated by the sanitizer the
        // next time anyone opens this template in the editor.
        if (name.length > MAX_NAME) tooLong.push(name);
        renamed++;
        return { ...o, name };
      }),
    };
  });

  if (tooLong.length) {
    console.error(`${tooLong.length} name(s) would exceed ${MAX_NAME} chars and be truncated on the next save — refusing:`);
    for (const n of tooLong.slice(0, 8)) console.error(`   ${n.length}  ${n}`);
    process.exit(1);
  }

  const after = lightingGroups(next).reduce((n, g) => n + g.options.length, 0);
  if (after !== before) throw new Error(`look count changed ${before} -> ${after} — refusing`);
  for (const g of lightingGroups(groups)) {
    const n = lightingGroups(next).find(x => x.id === g.id);
    if (!n || n.options.length !== g.options.length) throw new Error(`group "${g.label}" changed size — refusing`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `/home/aluxart/option-groups-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(groups, null, 2));

  await sql`UPDATE templates SET option_groups = ${sql.json(next)}, updated_at = NOW() WHERE id = ${TEMPLATE_ID}`;

  const [check] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const saved = lightingGroups(check.option_groups ?? []);
  const cCount = saved.flatMap(g => g.options).filter(o => o.name.startsWith("C ")).length;
  const sCount = saved.flatMap(g => g.options).filter(o => o.name.startsWith("S ")).length;

  console.log(`renamed ${renamed}${skipped ? `, skipped ${skipped} (already prefixed)` : ""}`);
  console.log(`backup: ${backup}`);
  console.log(`in DB now: ${saved.reduce((n, g) => n + g.options.length, 0)} looks — C ${cCount}, S ${sCount}`);
  for (const g of saved) console.log(`   ${g.label}: ${g.options.length}`);
}

(DRAFT ? draft() : apply())
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
