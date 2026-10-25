import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import sql from "@/lib/db";
import { nanoBananaEdit } from "@/lib/fal-edit"; // also configures the fal client
import { r2Download, r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";
import { withShootLock } from "@/lib/worker-lock";
import type { DramaRole, StoryRow } from "@/lib/drama/data";
import { lightFor, lightingBlock, SHEET_LIGHT as SHEET_STUDIO_LIGHT } from "@/lib/drama/lighting";
import { SHEET_LAYOUT, SHEET_BACKDROP } from "@/lib/character-sheet-order";
import { writtenEpisode } from "@/lib/drama/episodes";

/**
 * Phase 2 (owner, 2026-10-25): one generated picture per slide 2–7, drawn from
 * the cast's character sheets and the story's location image, so the same
 * people appear in every picture. The prompt follows the Alux Cinematic Prompt
 * Writer (tools/drama/skills/alux-cinematic-prompt-writer.md): the house
 * Scene / Subject / Important Details / Use Case / Constraints blocks, the
 * genre's light, the frame read from the slide's `see` direction, and a quiet
 * third kept for the caption. Every picture is judged against the sheet
 * before it is accepted (one retake), and every call is logged with its cost.
 *
 * Who is in a picture comes from the slide's `who` and the names in `see`.
 * A role a fan plays uses THEIR sheet (drama_cast); any other role uses the
 * story's HOUSE sheet (drama_sheets), made once from the role's `look`.
 *
 * Caps: slides 2–7 only, two tries each, `drama_pictures_daily_cap` a day.
 * DRAMA_FAKE_RENDER=1 makes stand-ins from the sheets, no model call.
 */

const KEEP_BUCKET = "generated-4k";
const TEXT_TO_IMAGE = "fal-ai/nano-banana-2";
const MAX_TRIES = 2;
const MAX_REFS = 3;
const PASS = 7;
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const JUDGE = "gemini-3.1-pro-preview";
const USD = { image2k: 0.12, judge: 0.012 };

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const FAKE = () => process.env.DRAMA_FAKE_RENDER === "1";

type Slide = { kind: string; see: string; say: string; who?: string; scene?: string };
type Ep = { n: number; title: string; slides: Slide[] };
type Ref = { roleKey: string; name: string; url: string; who: string };

// ── Who is in the shot (tools/drama/shotlist.mjs, in TypeScript) ─────────────
const TITLES = /^(The|Chief|Madam|Mama|Mrs|Mr|Ms|Alhaji|Hajiya|Malam|Baba|Barrister|Inspector|Director|Papa|Dr|Prof)$/;
export function charactersIn(see: string, who: string | undefined, cast: DramaRole[]): string[] {
  const keys = new Set(who ? [who] : []);
  for (const c of cast) {
    const names = c.name.replace(/[“”"]/g, "").split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}$/.test(w) && !TITLES.test(w));
    const roleNoun = (c.role.match(/\b([A-Z][a-z]{3,})$/) ?? [])[1];
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(see)) || (roleNoun && new RegExp(`\\b${roleNoun}\\b`).test(see))) keys.add(c.key);
  }
  return [...keys].slice(0, MAX_REFS);
}
export function framingOf(see: string): "close" | "medium" | "wide" {
  if (/^\s*(close on|close-up|extreme close)/i.test(see)) return "close";
  if (/^\s*(wide|exterior|aerial|high view|establishing)/i.test(see) || /\bwide\b/i.test(see.slice(0, 40))) return "wide";
  return "medium";
}
/** Where the words sit: the picture direction may say so; a time slide reads best with words low. */
export function captionAtOf(see: string, kind: string): "top" | "bottom" {
  if (/caption[^.]*\btop\b|\btop third\b[^.]*(quiet|caption|dark|plain)/i.test(see)) return "top";
  if (/caption[^.]*\bbottom\b|\bbottom third\b[^.]*(quiet|caption|dark|plain)/i.test(see)) return "bottom";
  return kind === "time" ? "bottom" : "top";
}

// ── Prompts ──────────────────────────────────────────────────────────────────
const NO_TEXT = "PRINT NO TEXT anywhere in the picture: no captions, signs with words, screens with legible text, logos or watermark — the words are added later.";
const PHOTO_REAL = "A still frame from a prestige Nigerian streaming drama: a real photograph, realistic skin texture, natural asymmetry, realistic fabric folds, physically plausible light, subtle film grain, editorial lens feel. No illustration, no 3D render, no plastic sheen, no beauty filter.";

const FRAME: Record<ReturnType<typeof framingOf>, string> = {
  close: "CLOSE-UP: 18° field of view (a 100mm portrait lens), the camera at eye level about 1.5 m away, the face or the object filling the frame, shallow depth of field.",
  medium: "MEDIUM SHOT: 29° field of view (an 85mm lens), the camera at chest height about 3 m away, from the waist up, the room readable but soft behind.",
  wide: "WIDE SHOT: 47° field of view (a 50mm lens), the camera at hip height about 5 m away, the whole figure and the room in frame.",
};

function picturePrompt(story: StoryRow, ep: Ep, slide: Slide, idx: number, refs: Ref[], hasLocation: boolean, captionAt: "top" | "bottom") {
  const light = lightFor(story.genre);
  const time = ep.slides[1]?.say ?? "";
  const refLines = refs.map((r, i) => `Image ${i + 1} is the character sheet of ${r.name} (${r.who}): their face from the portrait panel, their body, hair and outfit from the full-length panels — face, hair, skin tone, build and outfit 100% match Image ${i + 1}.`);
  const locLine = hasLocation ? `Image ${refs.length + 1} is the location: the same place, the same furniture, windows and light, seen from the angle this shot needs.` : `The place: ${story.city}, Nigeria — ${time}.`;
  const quiet = captionAt === "top"
    ? "THE TOP THIRD OF THE FRAME IS QUIET: plain, dark or softly out of focus, no faces, no bright objects, no hands — the caption will sit there. Eyes and hands in the lower two thirds."
    : "THE BOTTOM THIRD OF THE FRAME IS QUIET: plain, dark or softly out of focus, no faces, no bright objects — the caption will sit there. Eyes and hands in the upper two thirds.";
  const spoken = slide.kind === "line" && slide.say ? `The character is speaking the line ${slide.say} — mouth and expression mid-sentence, the listener's reaction visible if they are in frame.` : "";
  const subject = refs.length
    ? refs.map((r) => `${r.name}, ${r.who}`).join("; ")
    : "no named character — the objects and the place carry the moment";
  return [
    `Scene: Episode ${ep.n} of "${story.title}", a ${story.genre} drama set in ${story.city}, Nigeria. ${time}\n` +
    `${locLine}\nTHE SHOT — ${slide.see}\n${FRAME[framingOf(slide.see)]}\n${quiet}\n${lightingBlock(light)}`,
    `Subject: ${subject}. ${refLines.join(" ")} ${spoken} Performance in muscle movement, not labels: the eyes, the jaw, the hands, the breath; when two people read the moment differently, both reactions are visible.`.trim(),
    "Important Details: the objects the story turns on are exactly as described in the shot and clearly readable; the outfit is the sheet's outfit, element for element; realistic skin, fabric and light; the colour grade of the genre.",
    "Use Case: a still frame from a prestige Nigerian streaming drama, portrait 4:5, an Instagram carousel slide.",
    `Constraints: preserve each character's identity and outfit exactly as their sheet; the only people in frame are the ones named — nobody extra; change only pose, angle, expression and composition. ${idx === 1 ? "" : ""}${NO_TEXT} ${PHOTO_REAL}`,
  ].join("\n\n");
}

function houseSheetPrompt(story: StoryRow, role: DramaRole) {
  return [
    `CHARACTER SHEET of a fictional Nigerian person who plays ${role.name}, ${role.role}, in a ${story.genre} drama set in ${story.city}. Not a real or famous person.`,
    `WHO — ${role.age ? `${role.age} years old. ` : ""}${role.look}`,
    SHEET_LAYOUT, SHEET_BACKDROP, lightingBlock(SHEET_STUDIO_LIGHT, false),
    "A real studio photograph with realistic skin texture; the same person, same outfit, in all three panels. " + NO_TEXT,
  ].join("\n\n");
}

function locationPrompt(story: StoryRow) {
  const first = story.content.episodes?.[0] as unknown as Ep | undefined;
  const time = first?.slides?.[1]?.say ?? "";
  const seen = (first?.slides ?? []).slice(1, 4).map((s) => s.see).join(" ");
  return [
    `THE MAIN LOCATION of "${story.title}", a ${story.genre} drama set in ${story.city}, Nigeria: ${story.logline}`,
    `WHAT THE SCENES NEED — ${time} ${seen}`,
    "A THREE-QUARTER VIEW of the whole space, wide (47° field of view), eye level, showing the full layout the scenes will use — where the main character sits or stands, the paths people walk, the door they enter through, the windows. NO PEOPLE in the picture. Real, specific Nigerian detail — the furniture, the materials, the weather outside — never a postcard.",
    lightingBlock(lightFor(story.genre)),
    "A real photograph, landscape 16:9. " + NO_TEXT,
  ].join("\n\n");
}

// ── Paid calls ───────────────────────────────────────────────────────────────
async function textToImage(prompt: string, aspect: "16:9" | "4:5"): Promise<{ buffer: Buffer; model: string }> {
  if (FAKE()) {
    const [w, h] = aspect === "16:9" ? [2048, 1152] : [1638, 2048];
    const buffer = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 110, g: 112, b: 116 } } }).jpeg().toBuffer();
    return { buffer, model: "fake" };
  }
  const r = await fal.subscribe(TEXT_TO_IMAGE as "fal-ai/nano-banana-2", { input: { prompt, aspect_ratio: aspect, resolution: "2K", num_images: 1, output_format: "jpeg", safety_tolerance: "6" } as never });
  const data = ((r as Record<string, unknown>).data || r) as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("the model returned no image");
  const res = await fetch(url);
  return { buffer: Buffer.from(await res.arrayBuffer()), model: TEXT_TO_IMAGE };
}

async function editImage(prompt: string, imageUrls: string[], fakeFrom?: string): Promise<{ buffer: Buffer; model: string }> {
  if (FAKE()) {
    const src = fakeFrom ? await fetch(fakeFrom).then((r) => r.arrayBuffer()) : null;
    const base = src
      ? sharp(Buffer.from(src)).rotate().resize(1638, 2048, { fit: "cover", position: "attention" }).modulate({ saturation: 0.3 })
      : sharp({ create: { width: 1638, height: 2048, channels: 3, background: { r: 40, g: 44, b: 48 } } });
    return { buffer: await base.jpeg({ quality: 85 }).toBuffer(), model: "fake" };
  }
  const { data, model } = await nanoBananaEdit({ prompt, image_urls: imageUrls, num_images: 1, aspect_ratio: "4:5", resolution: "2K", output_format: "jpeg", safety_tolerance: "6", limit_generations: false });
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("the model returned no image");
  const res = await fetch(url);
  return { buffer: Buffer.from(await res.arrayBuffer()), model };
}

type Verdict = { likeness: number; frame: number; quiet: number; text_free: boolean; problems: string[]; pass: boolean };
/** The release check: the picture against the sheets and the shot. Never throws — an unreadable answer is a soft pass with a note. */
async function judge(picture: Buffer, refs: Ref[], slide: Slide, captionAt: "top" | "bottom"): Promise<Verdict> {
  if (FAKE()) return { likeness: 9, frame: 9, quiet: 9, text_free: true, problems: [], pass: true };
  try {
    const parts: ({ text: string } | { inlineData: { mimeType: "image/jpeg"; data: string } })[] = [];
    const small = await sharp(picture).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    parts.push({ inlineData: { mimeType: "image/jpeg", data: small.toString("base64") } });
    for (const r of refs) {
      const b = await fetch(r.url).then((x) => x.arrayBuffer());
      const s = await sharp(Buffer.from(b)).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      parts.push({ inlineData: { mimeType: "image/jpeg", data: s.toString("base64") } });
    }
    parts.push({ text:
      `You are the picture editor of a Nigerian micro drama. The FIRST image is a generated slide picture. ${refs.length ? `The next ${refs.length} image(s) are the character sheets of ${refs.map((r) => r.name).join(", ")}, in that order.` : "No character sheet is attached."}\n` +
      `The shot was meant to be: "${slide.see}"\nThe caption will be placed over the ${captionAt} third of the picture.\n` +
      `Score 0-10: likeness (does each named person in the picture look like the SAME individual as their sheet — face, skin tone, hair, build, outfit; 10 if no named person), frame (does the picture show the shot as described), quiet (is the ${captionAt} third plain enough to carry white words). text_free: true if no legible words, logos or captions appear in the picture. problems: short plain sentences.\n` +
      `Answer as JSON only: {"likeness": n, "frame": n, "quiet": n, "text_free": bool, "problems": [..]}` });
    const model = genai.getGenerativeModel({ model: JUDGE });
    const r = await model.generateContent({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 600 } });
    const raw = JSON.parse(r.response.text()) as Partial<Verdict> | Partial<Verdict>[];
    const v = (Array.isArray(raw) ? raw[0] : raw) ?? {};
    const likeness = Number(v.likeness ?? 0), frame = Number(v.frame ?? 0), quiet = Number(v.quiet ?? 0);
    const textFree = v.text_free !== false;
    const problems = Array.isArray(v.problems) ? v.problems.map(String).slice(0, 6) : [];
    return { likeness, frame, quiet, text_free: textFree, problems, pass: likeness >= PASS && frame >= PASS && quiet >= 6 && textFree };
  } catch (e) {
    return { likeness: 0, frame: 0, quiet: 0, text_free: true, problems: [`the check did not run: ${(e as Error).message.slice(0, 120)}`], pass: false };
  }
}

// ── References ───────────────────────────────────────────────────────────────
async function storyById(id: string) {
  const [s] = await sql<(StoryRow & { location_bucket: string | null; location_path: string | null })[]>`
    SELECT id, slug, title, tagline, genre, city, logline, status, featured, min_votes, ig_account, updated_at, content, location_bucket, location_path
    FROM drama_stories WHERE id = ${id}`;
  return s ?? null;
}

/** The sheet that plays a role: a fan's accepted sheet, else the house sheet (made now if missing). Returns a signed URL. */
async function sheetFor(story: StoryRow, role: DramaRole, log: (m: string) => void): Promise<{ url: string; from: "fan" | "house" }> {
  const [fan] = await sql<{ sheet_bucket: string; sheet_path: string }[]>`
    SELECT sheet_bucket, sheet_path FROM drama_cast
    WHERE story_id = ${story.id} AND role_key = ${role.key} AND sheet_path IS NOT NULL AND status IN ('accepted', 'sheet_ready', 'approved')
    ORDER BY (status = 'accepted') DESC, updated_at DESC LIMIT 1`;
  if (fan) return { url: await r2SignedDownloadUrl(fan.sheet_bucket, fan.sheet_path, 3600), from: "fan" };
  const [house] = await sql<{ sheet_bucket: string; sheet_path: string }[]>`SELECT sheet_bucket, sheet_path FROM drama_sheets WHERE story_id = ${story.id} AND role_key = ${role.key}`;
  if (house) return { url: await r2SignedDownloadUrl(house.sheet_bucket, house.sheet_path, 3600), from: "house" };
  log(`making the house sheet for ${role.name}`);
  const made = await textToImage(houseSheetPrompt(story, role), "16:9");
  const path = `drama/sheets/${story.slug}/${role.key}-${Date.now().toString(36)}.jpg`;
  await r2Upload(KEEP_BUCKET, path, made.buffer, "image/jpeg");
  await sql`INSERT INTO drama_sheets (story_id, role_key, sheet_bucket, sheet_path, meta)
            VALUES (${story.id}, ${role.key}, ${KEEP_BUCKET}, ${path}, ${sql.json({ model: made.model, light: SHEET_STUDIO_LIGHT, at: new Date().toISOString() })})
            ON CONFLICT (story_id, role_key) DO UPDATE SET sheet_bucket = EXCLUDED.sheet_bucket, sheet_path = EXCLUDED.sheet_path, meta = EXCLUDED.meta`;
  await sql`INSERT INTO drama_picture_runs (story_id, episode_n, slide, model, prompt, bucket, path, accepted, usd)
            VALUES (${story.id}, 0, 0, ${made.model}, ${`house sheet ${role.key}`}, ${KEEP_BUCKET}, ${path}, true, ${FAKE() ? 0 : USD.image2k})`;
  return { url: await r2SignedDownloadUrl(KEEP_BUCKET, path, 3600), from: "house" };
}

/** The story's location image, made once. */
async function locationFor(story: StoryRow & { location_bucket: string | null; location_path: string | null }, log: (m: string) => void): Promise<string> {
  if (story.location_bucket && story.location_path) return r2SignedDownloadUrl(story.location_bucket, story.location_path, 3600);
  log("making the location image");
  const made = await textToImage(locationPrompt(story), "16:9");
  const path = `drama/locations/${story.slug}-${Date.now().toString(36)}.jpg`;
  await r2Upload(KEEP_BUCKET, path, made.buffer, "image/jpeg");
  await sql`UPDATE drama_stories SET location_bucket = ${KEEP_BUCKET}, location_path = ${path}, location_meta = ${sql.json({ model: made.model, prompt: locationPrompt(story), at: new Date().toISOString() })}, updated_at = now() WHERE id = ${story.id}`;
  await sql`INSERT INTO drama_picture_runs (story_id, episode_n, slide, model, prompt, bucket, path, accepted, usd)
            VALUES (${story.id}, 0, 0, ${made.model}, 'location', ${KEEP_BUCKET}, ${path}, true, ${FAKE() ? 0 : USD.image2k})`;
  return r2SignedDownloadUrl(KEEP_BUCKET, path, 3600);
}

async function dailyUsed(): Promise<{ used: number; cap: number }> {
  const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM drama_picture_runs WHERE created_at > now() - interval '1 day' AND usd > 0`;
  const [c] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = 'drama_pictures_daily_cap'`;
  const cap = parseInt(c?.value ?? "", 10);
  return { used: r?.n ?? 0, cap: Number.isFinite(cap) ? cap : 60 };
}

// ── The job ──────────────────────────────────────────────────────────────────
export type PictureResult = { slide: number; ok: boolean; tries: number; verdict?: Verdict; path?: string; error?: string };
export type PicturesSummary = { ok: boolean; made: number; failed: number; skipped: number; usd: number; results: PictureResult[]; log: string[] };

/**
 * Make the missing pictures of episode n (slides 2–7). `force` remakes slides
 * that already have an AI picture; uploaded or Unreal pictures are never replaced.
 */
export async function makeEpisodePictures(storyId: string, n: number, opts: { slides?: number[]; force?: boolean; log?: (m: string) => void } = {}): Promise<PicturesSummary> {
  const logLines: string[] = [];
  const log = (m: string) => { logLines.push(m); opts.log?.(m); console.log(`[drama pictures] ${m}`); };
  const run = await withShootLock(`drama-pictures:${storyId}:${n}`, async (): Promise<PicturesSummary> => {
    const story = await storyById(storyId);
    if (!story) throw new Error("no such story");
    const ep = writtenEpisode(story, n) as unknown as Ep | undefined;
    if (!ep) throw new Error(`episode ${n} is not written`);
    const cast = story.content.cast ?? [];
    const existing = await sql<{ slide: number; source: string }[]>`SELECT slide, source FROM drama_art WHERE story_id = ${story.id} AND episode_n = ${n}`;
    const wanted = (opts.slides?.length ? opts.slides : [2, 3, 4, 5, 6, 7]).filter((s) => s >= 2 && s <= 7);
    const todo = wanted.filter((s) => {
      const have = existing.find((e) => e.slide === s);
      return !have || (opts.force && have.source === "ai");
    });
    const results: PictureResult[] = [];
    let usd = 0;
    if (!todo.length) return { ok: true, made: 0, failed: 0, skipped: wanted.length, usd, results, log: logLines };

    const quota = await dailyUsed();
    if (!FAKE() && quota.used + todo.length * 1 > quota.cap) {
      throw new Error(`the daily picture cap would be passed (${quota.used} of ${quota.cap} used today) — raise drama_pictures_daily_cap or wait`);
    }
    const location = await locationFor(story, log);
    const sheetCache = new Map<string, { url: string; from: "fan" | "house" }>();

    for (const slideNo of todo) {
      const slide = ep.slides[slideNo - 1];
      const keys = charactersIn(slide.see, slide.who, cast);
      const refs: Ref[] = [];
      for (const k of keys) {
        const role = cast.find((c) => c.key === k);
        if (!role) continue;
        let s = sheetCache.get(k);
        if (!s) { s = await sheetFor(story, role, log); sheetCache.set(k, s); }
        refs.push({ roleKey: k, name: role.name, url: s.url, who: role.role });
      }
      const captionAt = captionAtOf(slide.see, slide.kind);
      const prompt = picturePrompt(story, ep, slide, slideNo, refs, true, captionAt);
      let accepted: { path: string; verdict: Verdict } | null = null;
      let last: Verdict | undefined, tries = 0, error: string | undefined;
      for (let attempt = 1; attempt <= MAX_TRIES && !accepted; attempt++) {
        tries = attempt;
        try {
          const retake = attempt > 1 && last ? `\n\nRETAKE — the first try was refused: ${last.problems.join("; ") || "likeness or framing too weak"}. Fix exactly that and keep everything else.` : "";
          const made = await editImage(prompt + retake, [...refs.map((r) => r.url), location], refs[0]?.url);
          const verdict = await judge(made.buffer, refs, slide, captionAt);
          const path = `drama/art/${story.slug}/ep${n}/${String(slideNo).padStart(2, "0")}-ai-${Date.now().toString(36)}.jpg`;
          await r2Upload(KEEP_BUCKET, path, made.buffer, "image/jpeg");
          const cost = FAKE() ? 0 : USD.image2k + USD.judge;
          usd += cost;
          await sql`INSERT INTO drama_picture_runs (story_id, episode_n, slide, attempt, model, prompt, bucket, path, verdict, accepted, usd)
                    VALUES (${story.id}, ${n}, ${slideNo}, ${attempt}, ${made.model}, ${prompt}, ${KEEP_BUCKET}, ${path}, ${sql.json(verdict)}, ${verdict.pass}, ${cost})`;
          log(`slide ${slideNo} try ${attempt}: likeness ${verdict.likeness} frame ${verdict.frame} quiet ${verdict.quiet}${verdict.text_free ? "" : " TEXT"} → ${verdict.pass ? "accepted" : "refused"}${verdict.problems.length ? ` (${verdict.problems.join("; ")})` : ""}`);
          last = verdict;
          if (verdict.pass) accepted = { path, verdict };
        } catch (e) {
          error = (e as Error).message.slice(0, 200);
          log(`slide ${slideNo} try ${attempt} failed: ${error}`);
          if (/content_policy|content policy|moderation|safety|prohibited/i.test(error)) break;
        }
      }
      if (accepted) {
        await sql`INSERT INTO drama_art (story_id, episode_n, slide, bucket, path, source, caption_at)
                  VALUES (${story.id}, ${n}, ${slideNo}, ${KEEP_BUCKET}, ${accepted.path}, 'ai', ${captionAt})
                  ON CONFLICT (story_id, episode_n, slide) DO UPDATE SET bucket = EXCLUDED.bucket, path = EXCLUDED.path, source = 'ai', caption_at = EXCLUDED.caption_at, updated_at = now()`;
        results.push({ slide: slideNo, ok: true, tries, verdict: accepted.verdict, path: accepted.path });
      } else {
        results.push({ slide: slideNo, ok: false, tries, verdict: last, error });
      }
    }
    const made = results.filter((r) => r.ok).length, failed = results.length - made;
    return { ok: failed === 0, made, failed, skipped: wanted.length - todo.length, usd: +usd.toFixed(3), results, log: logLines };
  });
  if (!run.locked) return { ok: false, made: 0, failed: 0, skipped: 0, usd: 0, results: [], log: ["another run is making this episode's pictures"] };
  return run.value;
}

/** Make the pictures and tell the owner; never throws (the caller decides what to do with a short set). */
export async function makePicturesForAdvance(story: StoryRow, n: number): Promise<PicturesSummary | null> {
  try {
    const out = await makeEpisodePictures(story.id, n);
    const line = out.results.map((r) => `${r.slide}${r.ok ? "✓" : "✗"}`).join(" ");
    await tellAdmin(`🖼 <b>${esc(story.title)}</b> — Episode ${n} pictures: ${out.made} made${out.failed ? `, ${out.failed} refused (those slides stay designed)` : ""}${out.skipped ? `, ${out.skipped} already there` : ""} · ${esc(line)} · about $${out.usd}`).catch(() => false);
    return out;
  } catch (e) {
    await tellAdmin(`🖼 <b>${esc(story.title)}</b> — Episode ${n} pictures could not be made: ${esc((e as Error).message.slice(0, 200))}. It posts with designed slides.`).catch(() => false);
    return null;
  }
}

/** For the admin desk: a signed look at the pictures made so far for an episode. */
export async function pictureRuns(storyId: string, n: number) {
  const rows = await sql<{ slide: number; attempt: number; accepted: boolean; verdict: Verdict | null; usd: number; bucket: string | null; path: string | null; created_at: string }[]>`
    SELECT slide, attempt, accepted, verdict, usd, bucket, path, created_at FROM drama_picture_runs WHERE story_id = ${storyId} AND episode_n = ${n} ORDER BY slide, attempt`;
  return Promise.all(rows.map(async (r) => ({ ...r, url: r.bucket && r.path ? await r2SignedDownloadUrl(r.bucket, r.path, 3600).catch(() => null) : null })));
}

export const _test = { picturePrompt, houseSheetPrompt, locationPrompt };
export { r2Download };
