// What a season costs to make and what we charge — from the command line.
//   node tools/drama/budget.mjs the-silent-partner                 carousels (designed slides, no pictures)
//   node tools/drama/budget.mjs the-silent-partner --format pictures
//   node tools/drama/budget.mjs the-silent-partner --format video --episodes 6 --cast 6
//   node tools/drama/budget.mjs --json --format pictures            no story: the default 6-episode season
// The arithmetic is lib/drama/budget.ts (cost + 50 % buffer, then × 5), shared
// with the website so a sponsor sees the same number. Rates here are the
// public defaults; the website also reads the owner's app_config overrides.
import { loadStories } from "./check.mjs";

// Node prints a "typeless package.json" note when it strips the types out of budget.ts; it is noise here.
process.removeAllListeners("warning");
process.on("warning", (w) => { if (!/MODULE_TYPELESS|ExperimentalWarning/.test(`${w.name} ${w.code ?? ""} ${w.message}`)) console.warn(w); });

const { estimateSeason, specForStory, fmtUsd, fmtNgn } = await import("../../lib/drama/budget.ts");

const args = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const slug = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true && !["pictures", "video", "carousel", "1k", "2k", "4k"].includes(a));
const format = flag("format", "carousel");
if (!["carousel", "pictures", "video"].includes(format)) { console.error("--format must be carousel, pictures or video"); process.exit(2); }

let spec;
if (slug) {
  const [found] = await loadStories(slug);
  if (!found) { console.error(`no story file tools/drama/stories/${slug}.mjs`); process.exit(2); }
  spec = specForStory({ content: found.story }, format);
} else {
  spec = { format };
}
for (const [k, key] of [["episodes", "episodes"], ["cast", "castSheets"], ["slides", "pictureSlides"], ["seconds", "videoSecondsPerEpisode"]]) {
  const v = parseInt(flag(k, ""), 10);
  if (Number.isFinite(v)) spec[key] = v;
}
if (flag("size")) spec.imageSize = flag("size");
if (args.includes("--no-sound")) spec.soundtrack = false;

const b = estimateSeason(spec);
if (args.includes("--json")) { console.log(JSON.stringify(b, null, 2)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log(`${slug ?? "a season"} — ${b.spec.episodes} episodes, ${b.spec.format}, ${b.spec.castSheets} characters, ${b.spec.imageSize.toUpperCase()} pictures${b.spec.soundtrack ? ", with soundtrack" : ""}\n`);
for (const l of b.lines) console.log(`  ${pad(l.item, 62)} ${pad(`${+l.qty.toFixed(3)} ${l.unit}${l.qty === 1 || l.unit.endsWith("s") ? "" : "s"}`, 16)} ${pad(`@ ${fmtUsd(l.unitUsd)}`, 10)} ${fmtUsd(l.usd).padStart(9)}`);
console.log(`  ${"-".repeat(100)}`);
console.log(`  ${pad("Estimated cost of every paid call", 89)} ${fmtUsd(b.costUsd).padStart(9)}`);
console.log(`  ${pad(`Retake buffer (+${b.rates.bufferPct} %)`, 89)} ${fmtUsd(b.bufferUsd).padStart(9)}`);
console.log(`  ${pad("Production cost", 89)} ${fmtUsd(b.productionUsd).padStart(9)}`);
console.log(`  ${pad(`Profit (${b.rates.profitPct} % of production cost)`, 89)} ${fmtUsd(b.profitUsd).padStart(9)}`);
console.log(`  ${pad(`PRICE (at ₦${b.rates.usdNgn}/$)`, 89)} ${fmtUsd(b.priceUsd).padStart(9)}   ${fmtNgn(b.priceNgn)}`);
console.log(`\n  per episode: production ${fmtUsd(b.perEpisodeUsd)}, price ${fmtNgn(b.perEpisodePriceNgn)}`);
