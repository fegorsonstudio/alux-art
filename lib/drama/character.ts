import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import sql from "@/lib/db";
import { nanoBananaEdit } from "@/lib/fal-edit";
import { SHEET_LAYOUT } from "@/lib/character-sheet-order";
import { composeSheet } from "@/lib/drama/sheet-compose";
import { r2Copy, r2Download, r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { sendAdminImage, tellAdmin } from "@/lib/telegram";
import { withShootLock } from "@/lib/worker-lock";
import type { DramaRole, StoryRow } from "@/lib/drama/data";
import { emailCastMember } from "@/lib/drama/notify";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/drama/photo-kinds";
import { SHEET_LIGHT, lightFor, lightingBlock } from "@/lib/drama/lighting";
import { makePosterSoon } from "@/lib/drama/poster";
import { processVoices, voiceLines } from "@/lib/drama/voice";

/**
 * A cast member's character, made by itself (owner, 2026-10-21: no approving).
 *
 *   paid ('submitted') → free photo check → 'photos_needed' (they send another)
 *                                         → 'making' → character sheet + portrait → 'sheet_ready'
 *   'sheet_ready' → they say "this is me" → 'accepted', or ask once → 'making' again
 *
 * The sheet (full body front with the face erased, full body back, one portrait, in costume) is what every
 * future picture of the character is drawn from; the portrait is the one they
 * see first and can share. Both at 2K: Instagram shows 1080 px, so 4K would only
 * double the cost. Paid model runs are counted per member and capped, so a
 * render that keeps failing can never keep spending. The owner hears only of a
 * new member (with the portrait once it exists) and of failures.
 */

export const KEEP_BUCKET = "generated-4k";
export { PHOTO_KINDS, type PhotoKind } from "@/lib/drama/photo-kinds";
export type CastPhoto = { kind: PhotoKind; bucket: string; path: string };

/** Two images per make (sheet, portrait): a first make, one retry, one "make it again". */
const MAX_RENDERS = 6;
/** A 'making' row untouched this long was interrupted (a restart); the sweep picks it up again. */
const STALE_MINUTES = 8;

const PROBLEM_TEXT: Record<string, string> = {
  unreadable: "We couldn't open this photo. Send it as a JPEG — on an iPhone: Settings → Camera → Formats → Most Compatible.",
  small: "This photo is too small. Send the original from your camera, not a screenshot.",
  no_face: "We couldn't find a face in this photo.",
  two_people: "There's more than one person in this photo. Send one of just you.",
  face_small: "Your face is too small in this photo — come closer to the camera.",
  not_full_body: "This looks like a close-up. We need your whole body, head to feet.",
  blurry: "This photo is blurry. Hold the camera still, or wipe the lens.",
  dark: "This photo is too dark. Face a window or a light.",
  bright: "This photo is too bright. Step out of direct sun.",
};
export const problemText = (code: string) => PROBLEM_TEXT[code] ?? "This photo can't be used. Send another one.";

type CastRow = {
  id: string; story_id: string; role_key: string; display_name: string; email: string | null; status: string;
  photos: CastPhoto[]; renders: number; redo_used: boolean; updated_at: string; sheet_mode?: "real" | "ai";
  sheet_bucket: string | null; sheet_path: string | null; portrait_bucket: string | null; portrait_path: string | null;
};

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const ext = (p: string) => (/\.(jpe?g|png|webp|heic)$/i.exec(p)?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");

async function loadCast(id: string) {
  const [c] = await sql<CastRow[]>`SELECT * FROM drama_cast WHERE id = ${id}`;
  if (!c) return null;
  const [s] = await sql<StoryRow[]>`SELECT id, slug, title, city, genre, status, content FROM drama_stories WHERE id = ${c.story_id}`;
  const role = (s?.content.cast ?? []).find((r) => r.key === c.role_key);
  return s && role ? { c, story: s, role } : null;
}

/** Copy every photo out of identity-images (purged 48 h after use) into storage that lasts the whole story. */
export async function keepCastPhotos(castId: string): Promise<void> {
  const [r] = await sql<{ photos: CastPhoto[] }[]>`SELECT photos FROM drama_cast WHERE id = ${castId}`;
  if (!r) return;
  const kept: CastPhoto[] = [];
  for (const p of r.photos ?? []) {
    if (p.bucket === KEEP_BUCKET) { kept.push(p); continue; }
    const to = `drama/cast/${castId}/${p.kind}-${Date.now().toString(36)}.${ext(p.path)}`;
    await r2Copy(p.bucket, p.path, KEEP_BUCKET, to);
    kept.push({ kind: p.kind, bucket: KEEP_BUCKET, path: to });
  }
  const face = kept.find((p) => p.kind === "face") ?? kept[0];
  await sql`UPDATE drama_cast SET photos = ${sql.json(kept)}, photo_bucket = ${face?.bucket ?? null}, photo_path = ${face?.path ?? null}, updated_at = now()
            WHERE id = ${castId}`;
}

// ── The free photo check ──────────────────────────────────────────────────────
type Check = { kind: PhotoKind; ok: boolean; problems: string[]; skipped?: boolean };

function runChecker(kind: PhotoKind, file: string): Promise<{ ok: boolean; problems: string[] } | null> {
  const py = process.env.DRAMA_PY || "/home/aluxart/drama-venv/bin/python";
  const script = path.join(process.cwd(), "tools", "drama", "photo_check.py");
  return new Promise((resolve) => {
    // A memory cap, as every image job on this server has (the site must never starve).
    execFile("bash", ["-c", 'ulimit -v 1500000; exec "$0" "$1" "$2" "$3"', py, script, kind, file], { timeout: 45_000 }, (err, stdout) => {
      if (err) { console.warn("[drama check] checker did not run:", err.message.slice(0, 200)); resolve(null); return; }
      try { resolve(JSON.parse(String(stdout).trim().split("\n").pop() ?? "")); } catch { resolve(null); }
    });
  });
}

async function checkPhoto(p: CastPhoto): Promise<Check> {
  const dir = await mkdtemp(path.join(tmpdir(), "drama-check-"));
  try {
    const { buffer } = await r2Download(p.bucket, p.path);
    let jpeg: Buffer;
    try {
      // Upright and no wider than 2000 px: plenty to find and judge a face.
      jpeg = await sharp(buffer, { limitInputPixels: 120_000_000 }).rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch {
      return { kind: p.kind, ok: false, problems: ["unreadable"] };
    }
    const file = path.join(dir, "photo.jpg");
    await writeFile(file, jpeg);
    const out = await runChecker(p.kind, file);
    // The checker itself failing is our problem, not the member's: let the photo through.
    if (!out) return { kind: p.kind, ok: true, problems: [], skipped: true };
    return { kind: p.kind, ok: !!out.ok, problems: out.problems ?? [] };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── The paid part: sheet and portrait ─────────────────────────────────────────
const LIKENESS =
  "THE SAME PERSON — the attached photographs are all of one real person. Face shape, eye shape and spacing, nose, " +
  "lips, jawline, brows, skin tone and undertone, freckles, moles and scars, hairline, hair colour and texture, body " +
  "build and height come from those photographs and must not change. Keep their own hair exactly as it is in the " +
  "clearest, most front-facing photograph. Do not slim, smooth, lighten, symmetrise or beautify; keep real skin " +
  "texture and their real age. The likeness is the whole point: a prettier stranger is a failure.";
const PHOTO_REAL =
  "A real photograph: a real camera, natural skin, physically plausible light, realistic fabric folds. No illustration, " +
  "no painting, no 3D render, no plastic sheen, no beauty filter.";
const NO_TEXT = "PRINT NO TEXT anywhere: no labels, captions, names, numbers, logos or watermark.";
const wardrobe = (role: DramaRole) =>
  `WARDROBE — dress them as the character. Take ONLY clothing, accessories and props from this description, never their ` +
  `face, hair, skin or build, which come from the photographs; ignore any hairstyle or body shape it mentions: "${role.look}"`;

function sheetPrompt(role: DramaRole, story: StoryRow): string {
  // The same three-panel layout as the Character Sheet product (owner, 2026-10-25):
  // full body front with the face erased, full body back, one large portrait.
  return [
    `CHARACTER SHEET for a cast member of a picture drama set in ${story.city}, Nigeria. They play ${role.name}, ${role.role}.`,
    SHEET_LAYOUT,
    LIKENESS, wardrobe(role),
    "BACKDROP — one plain mid-grey seamless studio backdrop behind all three panels, the floor blending into the wall, a " +
    "soft contact shadow under the shoes; the face sharp in the portrait.",
    lightingBlock(SHEET_LIGHT, false),
    PHOTO_REAL, NO_TEXT,
  ].join("\n\n");
}

function portraitPrompt(role: DramaRole, story: StoryRow): string {
  return [
    `A PORTRAIT of this person in character as ${role.name}, ${role.role}, for the poster of a picture drama set in ${story.city}, Nigeria.`,
    "The FIRST attached image is this person's character sheet: it is the authority on their face, hair, build and costume — " +
    "copy them exactly. The other attached photographs are the same person and support the likeness.",
    "FRAMING — from the waist up, body turned slightly, face toward the camera, a quiet, composed expression, eyes to the lens.",
    LIKENESS, wardrobe(role),
    `SETTING — a dark, simple background that suits ${story.city} and the story's world, softly out of focus. Keep the top fifth of the frame dark and plain.`,
    lightingBlock(lightFor(story.genre)),
    PHOTO_REAL, NO_TEXT,
  ].join("\n\n");
}

const refused = (e: unknown) => /content_policy|content policy|content checker|moderation|safety|nsfw|prohibited/i
  .test(`${(e as { message?: string })?.message ?? ""} ${JSON.stringify((e as { body?: unknown })?.body ?? "")}`);

/** One paid image, counted against the member's cap before it runs. */
async function paidImage(castId: string, input: Record<string, unknown>): Promise<{ buffer: Buffer; url: string; model: string }> {
  const [n] = await sql<{ renders: number }[]>`
    UPDATE drama_cast SET renders = renders + 1, updated_at = now() WHERE id = ${castId} AND renders < ${MAX_RENDERS} RETURNING renders`;
  if (!n) throw new CapReached();
  if (process.env.DRAMA_FAKE_RENDER === "1") {
    // Tests only: a stand-in made from the first photo, no model call, no cost.
    const first = await fetch(String((input.image_urls as string[])[0])).then((r) => r.arrayBuffer());
    const [w, h] = input.aspect_ratio === "16:9" ? [2048, 1152] : [1638, 2048];
    const buffer = await sharp(Buffer.from(first)).rotate().resize(w, h, { fit: "cover" }).modulate({ saturation: 0.2 }).jpeg({ quality: 85 }).toBuffer();
    return { buffer, url: (input.image_urls as string[])[0], model: "fake" };
  }
  const { data, model } = await nanoBananaEdit({
    num_images: 1, safety_tolerance: "6", limit_generations: false, resolution: "2K", ...input,
  });
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("the model returned no image");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), url, model };
}
class CapReached extends Error { constructor() { super("render cap reached"); } }

async function makeCharacter(c: CastRow, story: StoryRow, role: DramaRole): Promise<void> {
  const urls = (await Promise.all((c.photos ?? []).map((p) => r2SignedDownloadUrl(p.bucket, p.path, 3600).catch(() => ""))))
    .filter(Boolean);
  if (!urls.length) throw new Error("no photos could be read");
  const stamp = Date.now().toString(36);
  // A sheet without a portrait is a make that stopped half way: keep the sheet, it already cost money.
  let sheet: { url: string };
  if (c.sheet_path && !c.portrait_path) {
    sheet = { url: await r2SignedDownloadUrl(c.sheet_bucket ?? KEEP_BUCKET, c.sheet_path, 3600) };
  } else if (c.sheet_mode === "real") {
    // Their own photos are the sheet (owner, 2026-10-25): the full body as shot with the
    // face erased, the portrait as shot; only the back view is generated, without the head.
    const body = (c.photos ?? []).find((p) => p.kind === "body"), face = (c.photos ?? []).find((p) => p.kind === "face");
    if (!body || !face) throw new Error("a real-photo sheet needs the whole-body photo and the face photo");
    const [bodyBytes, faceBytes] = await Promise.all([r2Download(body.bucket, body.path), r2Download(face.bucket, face.path)]);
    // The back view is a paid call: counted against the member's cap like any other.
    const [n] = await sql<{ renders: number }[]>`UPDATE drama_cast SET renders = renders + 1, updated_at = now() WHERE id = ${c.id} AND renders < ${MAX_RENDERS} RETURNING renders`;
    if (!n) throw new CapReached();
    const made = await composeSheet({
      body: bodyBytes.buffer, face: faceBytes.buffer,
      urls: { body: await r2SignedDownloadUrl(body.bucket, body.path, 3600), face: await r2SignedDownloadUrl(face.bucket, face.path, 3600) },
    });
    const sheetPath = `drama/cast/${c.id}/sheet-${stamp}.jpg`;
    await r2Upload(KEEP_BUCKET, sheetPath, made.sheet, "image/jpeg");
    await sql`UPDATE drama_cast SET sheet_bucket = ${KEEP_BUCKET}, sheet_path = ${sheetPath}, render_model = ${made.model}, updated_at = now() WHERE id = ${c.id}`;
    sheet = { url: await r2SignedDownloadUrl(KEEP_BUCKET, sheetPath, 3600) };
  } else {
    const made = await paidImage(c.id, { prompt: sheetPrompt(role, story), aspect_ratio: "16:9", output_format: "png", image_urls: urls.slice(0, 6) });
    const sheetPath = `drama/cast/${c.id}/sheet-${stamp}.png`;
    await r2Upload(KEEP_BUCKET, sheetPath, made.buffer, "image/png");
    // Written as soon as it lands, so a failed portrait does not throw away a sheet that already cost money.
    await sql`UPDATE drama_cast SET sheet_bucket = ${KEEP_BUCKET}, sheet_path = ${sheetPath}, render_model = ${made.model}, updated_at = now() WHERE id = ${c.id}`;
    sheet = made;
  }
  const portrait = await paidImage(c.id, { prompt: portraitPrompt(role, story), aspect_ratio: "4:5", output_format: "jpeg", image_urls: [sheet.url, ...urls.slice(0, 5)] });
  const portraitPath = `drama/cast/${c.id}/portrait-${stamp}.jpg`;
  await r2Upload(KEEP_BUCKET, portraitPath, portrait.buffer, "image/jpeg");
  // Every image keeps the lighting and grade it was made with.
  const notes = { sheet: SHEET_LIGHT, portrait: lightFor(story.genre), model: portrait.model, at: new Date().toISOString() };
  await sql`UPDATE drama_cast SET portrait_bucket = ${KEEP_BUCKET}, portrait_path = ${portraitPath}, render_notes = ${sql.json(notes)},
            status = 'sheet_ready', last_error = NULL, updated_at = now()
            WHERE id = ${c.id} AND status = 'making'`;
}

/** Move one cast member as far as it can go now. Safe to call any number of times. */
export async function runCast(castId: string): Promise<string> {
  const run = await withShootLock(`drama-cast:${castId}`, async () => {
    const got = await loadCast(castId);
    if (!got) return "gone";
    const { story, role } = got;
    let c = got.c;

    if (c.status === "submitted") {
      const results = await Promise.all((c.photos ?? []).map(checkPhoto));
      const failed = results.filter((r) => !r.ok);
      await sql`UPDATE drama_cast SET photo_check = ${sql.json({ at: new Date().toISOString(), results })},
                status = ${failed.length ? "photos_needed" : "making"}, updated_at = now() WHERE id = ${c.id} AND status = 'submitted'`;
      if (failed.length) {
        await emailCastMember({ to: c.email, castId: c.id, displayName: c.display_name, roleName: role.name, storyTitle: story.title, kind: "photos_needed" });
        return "photos_needed";
      }
      c = (await loadCast(castId))!.c;
    }

    if (c.status !== "making") return c.status;
    try {
      await makeCharacter(c, story, role);
    } catch (e) {
      const capped = e instanceof CapReached;
      const msg = (e as Error).message.slice(0, 300);
      if (capped || refused(e)) {
        await sql`UPDATE drama_cast SET status = 'failed', last_error = ${msg}, updated_at = now() WHERE id = ${c.id}`;
        await tellAdmin(`🎭 <b>Character could not be made</b> — ${esc(c.display_name)} as ${esc(role.name)} in ${esc(story.title)}: ${esc(capped ? "it failed every time it was tried" : "the model refused the photos")}.\nTheir page tells them a person will finish it. Open /admin/drama.`).catch(() => false);
        return "failed";
      }
      // Anything else (network, the model busy) is tried again by the sweep.
      await sql`UPDATE drama_cast SET last_error = ${msg}, updated_at = now() WHERE id = ${c.id}`;
      console.warn(`[drama cast] ${c.id} will retry:`, msg);
      return "retry";
    }
    const done = (await loadCast(castId))!.c;
    await emailCastMember({ to: done.email, castId: done.id, displayName: done.display_name, roleName: role.name, storyTitle: story.title, kind: "sheet_ready" });
    const url = done.portrait_path ? await r2SignedDownloadUrl(KEEP_BUCKET, done.portrait_path, 3600).catch(() => null) : null;
    if (url) await sendAdminImage(url, `${done.display_name} as ${role.name} — ${story.title}`).catch(() => false);
    return "sheet_ready";
  });
  return run.locked ? run.value : "busy";
}

/** Start the work for a member without making the caller wait (payment, new photos, "make it again"). */
export function runCastSoon(castId: string): void {
  void runCast(castId).then((r) => console.log(`[drama cast] ${castId}: ${r}`)).catch((e) => console.error(`[drama cast] ${castId} failed:`, (e as Error).message));
}

/** The ten-minute sweep: anything paid and waiting, or interrupted part way. */
export async function processCast(): Promise<{ id: string; result: string }[]> {
  const due = await sql<{ id: string }[]>`
    SELECT id FROM drama_cast
    WHERE status = 'submitted' OR (status = 'making' AND updated_at < now() - make_interval(mins => ${STALE_MINUTES}))
    ORDER BY created_at LIMIT 3`; // a make is two model calls of up to a minute each: three fit in one sweep
  const out = [];
  for (const d of due) out.push({ id: d.id, result: await runCast(d.id).catch((e) => `error: ${(e as Error).message.slice(0, 120)}`) });
  // Voices recorded on the member page are copied here too (a retry after a failure).
  for (const v of await processVoices().catch(() => [])) out.push({ id: v.id, result: `voice: ${v.result}` });
  return out;
}

/** The member's own actions on their page. */
export async function castAction(castId: string, action: "accept" | "redo"): Promise<string> {
  if (action === "accept") {
    const r = await sql<{ story_id: string; role_key: string }[]>`
      UPDATE drama_cast SET status = 'accepted', updated_at = now() WHERE id = ${castId} AND status = 'sheet_ready' RETURNING story_id, role_key`;
    if (!r.length) return "unchanged";
    // A lead or main role, before the story starts: the poster is remade with their face.
    const got = await loadCast(castId);
    if (got && got.story.status === "upcoming" && (got.role.tier === "lead" || got.role.tier === "main")) {
      makePosterSoon(r[0].story_id, `${got.c.display_name} plays ${got.role.name}`);
    }
    return "accepted";
  }
  // Both images are made again (the old files stay in storage, unreferenced).
  const r = await sql`UPDATE drama_cast SET status = 'making', redo_used = true, sheet_path = NULL, portrait_path = NULL, updated_at = now()
                      WHERE id = ${castId} AND status = 'sheet_ready' AND NOT redo_used RETURNING id`;
  if (!r.length) return "unchanged";
  runCastSoon(castId);
  return "making";
}

/** New photos for the ones that failed the check; the rest stay. */
export async function replacePhotos(castId: string, userId: string, next: { kind: PhotoKind; path: string }[]): Promise<string> {
  const [c] = await sql<{ photos: CastPhoto[]; status: string }[]>`SELECT photos, status FROM drama_cast WHERE id = ${castId}`;
  if (!c || c.status !== "photos_needed") return "unchanged";
  const kinds = new Set(PHOTO_KINDS.map((k) => k.kind));
  const photos = [...(c.photos ?? [])];
  for (const n of next) {
    if (!kinds.has(n.kind) || !n.path.startsWith(`${userId}/`)) continue;
    const at = photos.findIndex((p) => p.kind === n.kind);
    const p = { kind: n.kind, bucket: "identity-images", path: n.path };
    if (at >= 0) photos[at] = p; else photos.push(p);
  }
  const moved = await sql`UPDATE drama_cast SET photos = ${sql.json(photos)}, status = 'submitted', updated_at = now()
                          WHERE id = ${castId} AND status = 'photos_needed' RETURNING id`;
  if (!moved.length) return "unchanged";
  await keepCastPhotos(castId);
  runCastSoon(castId);
  return "submitted";
}

// ── What the member's own page shows ─────────────────────────────────────────
export type CastView = {
  id: string; status: string; displayName: string; redoUsed: boolean;
  story: { slug: string; title: string }; role: { name: string; job: string; enters: number | null };
  photos: { kind: PhotoKind; label: string; url: string | null; problems: string[] }[];
  portraitUrl: string | null; sheetUrl: string | null;
  sheetMode: "real" | "ai";
  voice: { sample: boolean; consent: boolean; ready: boolean; error: string | null; lines: { consent: string; sample: string } };
};

/** The member's view of their character, or null if this visitor is not them (admins see everyone's). */
export async function castView(castId: string, viewer: { id: string; admin: boolean }): Promise<CastView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(castId)) return null;
  const got = await loadCast(castId);
  if (!got) return null;
  const { story, role } = got;
  const [row] = await sql<(CastRow & { user_id: string | null; photo_check: { results?: Check[] } | null; voice_sample_path: string | null; voice_consent_path: string | null; voice_id: string | null; voice_meta: { error?: string } | null })[]>`SELECT * FROM drama_cast WHERE id = ${castId}`;
  if (!row || (!viewer.admin && row.user_id !== viewer.id)) return null;
  if (row.status === "pending_payment" && !viewer.admin) return null;
  const sign = (b: string | null, p: string | null) => (b && p ? r2SignedDownloadUrl(b, p, 3600).catch(() => null) : Promise.resolve(null));
  const checks = row.photo_check?.results ?? [];
  return {
    id: row.id, status: row.status, displayName: row.display_name, redoUsed: row.redo_used,
    story: { slug: story.slug, title: story.title },
    role: { name: role.name, job: role.role, enters: role.enters ?? null },
    photos: await Promise.all(PHOTO_KINDS.map(async (k) => {
      const p = (row.photos ?? []).find((x) => x.kind === k.kind);
      const c = row.status === "photos_needed" ? checks.find((x) => x.kind === k.kind) : undefined;
      return { kind: k.kind, label: k.label, url: p ? await sign(p.bucket, p.path) : null, problems: (c?.problems ?? []).map(problemText) };
    })),
    portraitUrl: row.status === "sheet_ready" || row.status === "accepted" || row.status === "approved" ? await sign(row.portrait_bucket, row.portrait_path) : null,
    sheetUrl: row.status === "sheet_ready" || row.status === "accepted" || row.status === "approved" ? await sign(row.sheet_bucket, row.sheet_path) : null,
    sheetMode: row.sheet_mode === "real" ? "real" : "ai",
    voice: { sample: !!row.voice_sample_path, consent: !!row.voice_consent_path, ready: !!row.voice_id, error: row.voice_meta?.error ?? null, lines: voiceLines(row.display_name, story.title, role.name) },
  };
}
