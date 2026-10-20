// The Unreal studio's brief for one episode: who is in each shot, how close
// the camera is, where the words will sit, the light of the genre, and the
// exact size to render. Read by tools/unreal/python/alux_drama.py.
//   node tools/drama/shotlist.mjs the-silent-partner 1 [--out shots.json]
import fs from "node:fs";
import { loadStories } from "./check.mjs";

// The light of each genre (ENGINE.md §7), in words a lighting artist uses.
export const MOOD = {
  power: "Night. Glass and steel, cool key light from city windows, one warm practical lamp, deep shadows, a teal-cyan accent.",
  political: "Flat fluorescent corridors, grey-green walls, one red accent object, late-afternoon haze through blinds.",
  thriller: "Sodium-orange street light and red tail lights, wet surfaces, hard contrast, faces half in shadow.",
  crime: "Sodium-orange street light and red tail lights, wet surfaces, hard contrast, faces half in shadow.",
  family: "Warm tungsten interiors, rain outside tall windows, gold and dark wood, soft window light.",
  mystery: "Blue dawn mist over water, low contrast, silver highlights, thin backlight.",
  supernatural: "Blue dawn mist over water, low contrast, silver highlights, thin backlight.",
  romance: "Warm low light, champagne highlights, shallow depth of field, dust in light beams.",
  romcom: "Bright daylight, saturated fabric colours, open shade, lively background.",
  period: "1960s tungsten practicals, smoke haze, film grain, painted-poster warmth.",
};

/** Close, medium or wide, read from the camera direction. */
export function framingOf(see) {
  if (/^\s*(close on|close-up|extreme close)/i.test(see)) return "close";
  if (/^\s*(wide|exterior|aerial|high view|establishing)/i.test(see) || /\bwide\b/i.test(see.slice(0, 40))) return "wide";
  return "medium";
}

/** Which cast members the shot names (by first name, last name or the noun of their role). */
export function charactersIn(see, who, cast) {
  const keys = new Set(who ? [who] : []);
  for (const c of cast) {
    const names = c.name.replace(/[“”"]/g, "").split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}$/.test(w) && !/^(The|Chief|Madam|Mama|Mrs|Mr|Alhaji|Hajiya|Malam|Baba|Barrister|Inspector|Director)$/.test(w));
    const roleNoun = (c.role.match(/\b([A-Z][a-z]{3,})$/) ?? [])[1];
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(see)) || (roleNoun && new RegExp(`\\b${roleNoun}\\b`).test(see))) keys.add(c.key);
  }
  return [...keys];
}

export function shotList(story, n) {
  const ep = (story.episodes ?? []).find((e) => e.n === n);
  if (!ep) throw new Error(`${story.slug} has no episode ${n}`);
  return {
    story: { slug: story.slug, title: story.title, genre: story.genre, city: story.city, mood: MOOD[story.genre] ?? MOOD.power },
    episode: { n: ep.n, title: ep.title },
    render: { width: 2160, height: 2700, aspect: "4:5", format: "png", note: "Keep the caption third of the frame quiet (no faces, no bright highlights there)." },
    cast: story.cast.map((c) => ({ key: c.key, name: c.name, age: c.age, role: c.role, look: c.look })),
    shots: ep.slides.map((s, i) => ({
      slide: i + 1,
      file: `${String(i + 1).padStart(2, "0")}.png`,
      kind: s.kind,
      see: s.see,
      framing: framingOf(s.see),
      characters: charactersIn(s.see, s.who, story.cast),
      captionAt: /caption space:\s*top/i.test(s.see) ? "top" : "bottom",
      words: s.say || null,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]:)/, "/$1")}` || process.argv[1]?.endsWith("shotlist.mjs")) {
  const [slug, nArg] = process.argv.slice(2);
  const outAt = process.argv.indexOf("--out");
  if (!slug) { console.error("usage: node tools/drama/shotlist.mjs <slug> [episode] [--out file.json]"); process.exit(1); }
  const [{ story } = {}] = await loadStories(slug);
  if (!story) { console.error(`no story ${slug}`); process.exit(1); }
  const list = shotList(story, Number(nArg ?? 1));
  const json = JSON.stringify(list, null, 2);
  if (outAt > 0) { fs.writeFileSync(process.argv[outAt + 1], json); console.log(`wrote ${process.argv[outAt + 1]}: ${list.shots.length} shots`); }
  else console.log(json);
}
