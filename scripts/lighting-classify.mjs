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
const RESOLVE = args.includes("--resolve");
const APPLY = args.includes("--apply");
if (!DRAFT && !RESOLVE && !APPLY) { console.error("choose --draft, --resolve or --apply"); process.exit(2); }

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

/**
 * TIER 2 — only ever runs on rows the first pass left as `?`, so the labels the
 * owner already approved are never re-decided.
 *
 * Reading the 59 unlabelled recipes in full showed the first pass missed three
 * things, none of which needed guessing:
 *
 *   1. Some of these are not lighting setups at all. Six say outright "change
 *      nothing else except the colour and tone; keep the existing light
 *      direction and shadow shapes" — they are grades. Another group changes
 *      the lens, not the light: flare, prism, diffusion filter, foreground
 *      bokeh, aperture starbursts. A C or S on those would answer a question
 *      the look does not ask, so they take NO prefix.
 *   2. Named natural light (sunlight, a window, golden hour, a street lamp, an
 *      LED panel) was being cancelled out by shadow-quality words. "Hard direct
 *      sunlight" is not ambiguous; the sun outranks the word "hard".
 *   3. Real rig vocabulary the first pass had no words for: bare bulb, focused
 *      spot, gobo, background light, bounce surface.
 *
 * Anything still standing after those takes the stated default below, which is
 * a judgement and is flagged as one in the evidence column.
 */
const NOT_A_FIXTURE = [
  [/except the colour and tone/i, "grade only — keeps the existing light"],
  [/except the lighting and a lens flare/i, "lens flare, not a fixture"],
  [/except the lighting and an optical refraction/i, "optical effect, not a fixture"],
  [/except the lighting and a diffusion filter/i, "lens diffusion, not a fixture"],
  [/except the lighting and out-of-focus elements/i, "lens effect, not a fixture"],
  [/narrow aperture renders/i, "aperture rendering, not a fixture"],
];
const NATURAL = [
  [/\bsunlight\b|direct sun\b|late afternoon sun/i, "sunlight named"],
  [/golden hour/i, "golden hour"],
  [/\bwindow\b/i, "window named"],
  [/available light/i, "available light"],
  [/sodium-?vapour|sodium vapor|street ?lamp/i, "street lamp"],
  [/LED panel|flat panel of/i, "LED panel"],
  [/tungsten source/i, "tungsten source"],
];
const RIG = [
  [/bare bulb|bare strobe/i, "bare bulb / strobe"],
  [/\bgobo\b|focused light|focused source|hard focused/i, "focused head / gobo"],
  [/background light|separate background/i, "separate background light"],
  [/\bgel(led)?\b/i, "gelled head"],
  [/bounced off|reflected light|bounce/i, "bounce surface"],
  [/\brims?\b|backlight|hair light/i, "rim / back light"],
  [/beauty key|softbox|clamshell/i, "beauty rig"],
  [/\bspot\b|narrow beam|small reflector/i, "spot / narrow beam"],
];

function classifyTier2(name, desc) {
  const text = `${name} ${desc}`;
  for (const [re, why] of NOT_A_FIXTURE) if (re.test(text)) return ["-", `tier2: ${why}`];
  // The sun and a strobe named in the same breath is a real coin-flip; the
  // recipe itself is hedging ("likely direct sunlight or a bare strobe").
  let nat = NATURAL.find(([re]) => re.test(text));
  // "reminiscent of late golden hour or tungsten light" next to "a bare bulb or
  // focused light" is a colour simile, not a source. A named fixture in the same
  // recipe beats it. Only golden hour is demoted this way; "hard direct
  // sunlight" states its source outright and keeps precedence.
  if (nat && nat[1] === "golden hour"
      && /reminiscent of|golden-?hour feel|bare bulb|focused light/i.test(text)) {
    nat = undefined;
  }
  const hedged = /or a bare strobe|or a gelled strobe|gelled strobe/i.test(text);
  if (nat && !hedged) return ["C", `tier2: ${nat[1]}`];
  const rig = RIG.find(([re]) => re.test(text));
  if (rig) return ["S", `tier2: ${rig[1]}`];
  return ["S", "tier2: DEFAULT — studio look, no natural-light or atmosphere cue (judgement, flip if wrong)"];
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

// Fills in only the `?` rows, leaving every already-decided row byte-identical.
async function resolve() {
  if (!existsSync(TSV)) throw new Error(`no ${TSV} — run --draft first`);
  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const byName = new Map(lightingGroups(row.option_groups).flatMap(g => g.options).map(o => [o.name, o]));

  const lines = readFileSync(TSV, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0];
  let touched = 0;
  const counts = { C: 0, S: 0, "-": 0 };
  const out = lines.slice(1).map(l => {
    const cells = l.split("\t");
    if (cells[2] !== "?") return l;
    const o = byName.get(cells[3]);
    if (!o) return l;
    const [label, why] = classifyTier2(o.name, o.description ?? "");
    counts[label]++; touched++;
    return [cells[0], cells[1], label, cells[3], why].join("\t");
  });
  writeFileSync(TSV, [head, ...out].join("\n") + "\n", "utf8");

  console.log(`resolved ${touched} previously-unlabelled row(s)`);
  console.log(`  C ${counts.C}   S ${counts.S}   no prefix ${counts["-"]}`);
  const still = out.filter(l => l.split("\t")[2] === "?").length;
  console.log(still ? `  ${still} still unlabelled` : `  nothing left unlabelled`);
}

async function apply() {
  if (!existsSync(TSV)) throw new Error(`no ${TSV} — run --draft first`);
  const rows = readFileSync(TSV, "utf8").split(/\r?\n/).filter(Boolean).slice(1)
    .map(l => l.split("\t"))
    .map(([group, framing, proposed, name]) => ({ group, framing, proposed: (proposed || "").trim().toUpperCase(), name }));

  // "-" is a decision too: this look changes the grade or the lens, not the
  // fixture, so it deliberately carries no prefix.
  const unresolved = rows.filter(r => !["C", "S", "-"].includes(r.proposed));
  if (unresolved.length) {
    console.error(`${unresolved.length} row(s) still unlabelled — refusing to write:`);
    for (const r of unresolved.slice(0, 10)) console.error(`   [${r.proposed || "?"}] ${r.name}`);
    process.exit(1);
  }

  // Names are not unique across groups ("Golden Hour Backlight" exists in both
  // Medium and Full body), and the lookup below is keyed by name. Identical
  // labels collapse harmlessly; disagreeing ones would silently mislabel a look.
  const conflicting = [...rows.reduce((m, r) => m.set(r.name, (m.get(r.name) ?? new Set()).add(r.proposed)), new Map())]
    .filter(([, labels]) => labels.size > 1);
  if (conflicting.length) {
    console.error("same look name labelled two different ways — refusing:");
    for (const [name, labels] of conflicting) console.error(`   ${name}: ${[...labels].join(" vs ")}`);
    process.exit(1);
  }

  const byName = new Map(rows.map(r => [r.name, r.proposed]));

  const [row] = await sql`SELECT option_groups FROM templates WHERE id = ${TEMPLATE_ID}`;
  const groups = row.option_groups ?? [];
  const before = lightingGroups(groups).reduce((n, g) => n + g.options.length, 0);

  let renamed = 0, skipped = 0, noPrefix = 0;
  const tooLong = [];
  const next = groups.map(g => {
    if (g.type !== "lighting") return g;
    return {
      ...g,
      options: g.options.map(o => {
        if (PREFIXED.test(o.name)) { skipped++; return o; }
        const label = byName.get(o.name);
        if (label === "-") { noPrefix++; return o; }
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

  console.log(`renamed ${renamed}`
    + (noPrefix ? `, left ${noPrefix} unprefixed (grade or lens effect, not a fixture)` : "")
    + (skipped ? `, skipped ${skipped} (already prefixed or not in the TSV)` : ""));
  console.log(`backup: ${backup}`);
  console.log(`in DB now: ${saved.reduce((n, g) => n + g.options.length, 0)} looks — C ${cCount}, S ${sCount}`);
  for (const g of saved) console.log(`   ${g.label}: ${g.options.length}`);
}

(DRAFT ? draft() : RESOLVE ? resolve() : apply())
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
