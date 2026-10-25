// A brand's own series, from their product pictures (owner, 2026-10-25).
//   node --env-file=.env.local tools/drama/brand-series.mjs <request id> [--episodes 6] [--write]
//
// 1. Reads the request (drama_brand_series): the products, their pictures, links, notes.
// 2. Learns what each product is: the product page's text when there is a link (free), the
//    brand's own words, and — when a vision model has credits — a description of the
//    picture (DeepSeek cannot see pictures; Gemini can, and is switched off while it has
//    no credits). Writes the BRIEF with DeepSeek: what each product is, who buys it, how it
//    would naturally appear in a Nigerian drama, three story pitches scored the skill's
//    way, and the pick.
// 3. --write: runs the engine-2 screenwriter with that pitch and the products, so every
//    episode places a product where the story needs it. Nothing posts: the brand reads
//    the season first (the preview page), then approves and pays.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { chat, configured, parseJson, MODEL } from "./brain.mjs";
import { GENRES } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const id = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
if (!id) { console.error("usage: node --env-file=.env.local tools/drama/brand-series.mjs <request id> [--episodes 6] [--write]"); process.exit(2); }
if (!configured()) { console.error("DEEPSEEK_API_KEY is not set"); process.exit(2); }
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
const [req] = await sql`SELECT * FROM drama_brand_series WHERE id = ${id}`;
if (!req) { console.error("no such request"); await sql.end(); process.exit(1); }

// ── What the products are ────────────────────────────────────────────────────
async function pageText(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (AluxArt drama brief)" }, signal: AbortSignal.timeout(15_000) });
    const html = await r.text();
    const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim();
    const desc = (/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? "").trim();
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500);
    return `${title}\n${desc}\n${body}`.trim();
  } catch (e) { return `(the page could not be read: ${e.message})`; }
}
const known = [];
for (const p of req.products) {
  const text = p.url ? await pageText(p.url) : "";
  known.push({ key: p.key, name: p.name || p.key, url: p.url, note: p.note, page: text.slice(0, 2500), picture: p.path });
}

// ── The brief ────────────────────────────────────────────────────────────────
const skill = fs.readFileSync(path.join(HERE, "skills/source/higgsfield-short-drama-screenwriter.md"), "utf8").replace(/^---[\s\S]*?---\n/, "");
const briefUser = [
  `Brand: ${req.brand_name}${req.instagram ? ` (@${req.instagram})` : ""}. ${req.audience ? `They want to reach: ${req.audience}.` : ""} ${req.city ? `City: ${req.city}.` : ""} ${req.genre ? `Preferred genre: ${req.genre}.` : ""} ${req.message ? `In their words: ${req.message}` : ""}`,
  `Their products (name, their note, and the text of the product page when there is one):`,
  ...known.map((p) => `--- ${p.key}: ${p.name}${p.note ? ` — ${p.note}` : ""}${p.url ? `\n${p.url}` : ""}\n${p.page || "(no page — go by the name and the note)"}`),
  `\nWrite the BRAND BRIEF for a Nigerian micro drama series built around these products, following Step 1 of the Short Drama Screenwriter (score the ideas 1–5 on the six points). Answer as JSON:`,
  `{ "products": [{ "key", "what": "what it is, in one sentence", "who": "who buys it", "inStory": "how it would naturally appear in a Nigerian drama — what a character does with it" }],`,
  `  "audience": "who the series is for", "city": "the best city for it", "genre": one of ${GENRES.join("|")},`,
  `  "pitches": [3 × { "title", "premise": "two sentences", "feeling", "opensOn", "scores": { "instant", "feeling", "peak", "reaction", "produce", "series" }, "total", "productsRole": "how the products serve the plot" }],`,
  `  "pick": <index of the strongest pitch>, "brief": "the full brief for the screenwriter, 80–150 words: the story, the city, the feeling, the peak, and what each product does in it" }`,
].join("\n");
process.stdout.write(`brief with ${MODEL}… `);
const r = await chat({ system: `You are the Short Drama Screenwriter. Follow this skill:\n\n${skill}\n\nAnswer with JSON only.`, user: briefUser, json: true, maxTokens: 12_000, temperature: 0.7 });
console.log(`${r.usage.input} in / ${r.usage.output} out, $${r.usd}`);
const brief = parseJson(r.text);
await sql`UPDATE drama_brand_series SET brief = ${sql.json(brief)}, status = 'briefed', updated_at = now() WHERE id = ${id}`;
const pick = brief.pitches?.[brief.pick ?? 0] ?? brief.pitches?.[0];
console.log(`\n${req.brand_name}: ${brief.products?.map((p) => `${p.key} = ${p.what}`).join("; ")}`);
for (const [i, p] of (brief.pitches ?? []).entries()) console.log(`${i === (brief.pick ?? 0) ? "★" : " "} ${p.title} (${p.total}) — ${p.premise}`);

// ── The season ───────────────────────────────────────────────────────────────
if (args.includes("--write")) {
  const slug = `${req.brand_name}-${pick?.title ?? "series"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 59);
  const productsFile = path.join(HERE, "stories", `.products-${slug}.json`);
  fs.writeFileSync(productsFile, JSON.stringify(known.map((k) => ({ key: k.key, name: k.name, url: k.url, note: k.note, what: brief.products?.find((x) => x.key === k.key)?.what, picture: k.picture })), null, 2));
  const episodes = flag("episodes", "6");
  console.log(`\nwriting the season as ${slug}…`);
  execFileSync(process.execPath, ["--env-file=.env.local", path.join(HERE, "screenwriter2.mjs"), "--brief", brief.brief, "--slug", slug, "--city", brief.city || req.city || "Lagos", "--genre", GENRES.includes(brief.genre) ? brief.genre : "romcom", "--episodes", episodes, "--brand", req.brand_name, "--products", productsFile, "--force"], { stdio: "inherit", cwd: path.join(HERE, "..", "..") });
  await sql`UPDATE drama_brand_series SET story_slug = ${slug}, status = 'written', updated_at = now() WHERE id = ${id}`;
  console.log(`\nwritten: tools/drama/stories/${slug}.mjs — make the preview page for the brand, then seed when they approve.`);
}
await sql.end();
