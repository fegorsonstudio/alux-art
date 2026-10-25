import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { fal } from "@fal-ai/client";
import { nanoBananaEdit } from "@/lib/fal-edit"; // also configures the fal client

/**
 * A character sheet from REAL photographs (owner, 2026-10-25 — "I'm a
 * photographer; real pictures make a better sheet"): the person's own
 * front-facing full-body photo and front-facing portrait are the two real
 * panels; the ONLY generated panel is the back view, made without the head.
 *
 *   | full body FRONT (their photo, face erased) | BACK (generated, headless) | PORTRAIT (their photo) |
 *
 * Same three-panel layout as the AI sheet (lib/character-sheet-order.ts
 * SHEET_LAYOUT), so every later picture reads it the same way. Steps:
 *   1. cut both photos out (fal BiRefNet v2) and stand them on one grey;
 *   2. erase the face on the full-body figure — a smooth oval in their skin
 *      tone, like the tutorial — so the portrait is the only face reference;
 *   3. generate the back view from the two photos (fal-ai/nano-banana-2/edit),
 *      cropped below the neck, on grey, and cut it out too;
 *   4. compose the 16:9 sheet with sharp: two figures on one ground line in
 *      the left half, the head-and-shoulders portrait filling the right half.
 *
 * Paid calls: three cut-outs (cents) and one edit image (≈ $0.12 at 2K).
 * DRAMA_FAKE_RENDER=1 skips every paid call and draws stand-ins.
 */

export const SHEET_W = 3840;
export const SHEET_H = 2160;
const GREY = { r: 141, g: 143, b: 145 };     // #8d8f91, the tutorial's backdrop
const FLOOR = { r: 122, g: 124, b: 126 };    // #7a7c7e
const CUTOUT = "fal-ai/birefnet/v2";
const FAKE = () => process.env.DRAMA_FAKE_RENDER === "1";

export type Figure = { png: Buffer; width: number; height: number; box: { left: number; top: number; width: number; height: number } };
export type ComposeInput = {
  /** The person's front-facing full-body photo (bytes). */
  body: Buffer;
  /** The person's front-facing portrait (bytes). */
  face: Buffer;
  /** How the character dresses, when the back view must follow a costume rather than the photo (drama roles). */
  wardrobe?: string;
  /** Where the photos can be fetched by the image model (signed URLs for the same two files). */
  urls: { body: string; face: string };
};
export type ComposeResult = { sheet: Buffer; back: Buffer; model: string; usd: number; notes: Record<string, unknown> };

// ── Cut-outs ─────────────────────────────────────────────────────────────────
async function cutOut(imageUrl: string, kind: "portrait" | "body"): Promise<Buffer> {
  const r = await fal.subscribe(CUTOUT as "fal-ai/birefnet/v2", { input: {
    image_url: imageUrl, model: kind === "portrait" ? "Portrait" : "General Use (Light 2K)", operating_resolution: "2048x2048",
    output_format: "png", refine_foreground: true,
  } as never });
  const data = ((r as Record<string, unknown>).data || r) as { image?: { url: string } };
  const url = data.image?.url;
  if (!url) throw new Error("the cut-out returned no image");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cut-out download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The figure's bounding box from the alpha channel (where the person actually is). */
async function alphaBox(png: Buffer): Promise<Figure> {
  const img = sharp(png).ensureAlpha();
  const { width = 0, height = 0 } = await img.metadata();
  const alpha = await img.extractChannel("alpha").raw().toBuffer();
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] > 40) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error("the cut-out is empty — nobody was found in the photo");
  return { png, width, height, box: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}

// ── The face on the full-body photo ──────────────────────────────────────────
type FaceBox = { x: number; y: number; w: number; h: number };

/** The face box from the free YuNet checker (tools/drama/photo_check.py), when it is installed; null otherwise. */
export async function faceBoxOf(jpeg: Buffer): Promise<FaceBox | null> {
  const py = process.env.DRAMA_PY || "/home/aluxart/drama-venv/bin/python";
  const script = path.join(process.cwd(), "tools", "drama", "photo_check.py");
  const dir = await mkdtemp(path.join(tmpdir(), "drama-face-"));
  try {
    const file = path.join(dir, "photo.jpg");
    await writeFile(file, await sharp(jpeg).rotate().jpeg({ quality: 92 }).toBuffer());
    return await new Promise((resolve) => {
      execFile("bash", ["-c", 'ulimit -v 1500000; exec "$0" "$1" "$2" "$3"', py, script, "body", file], { timeout: 45_000 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          const out = JSON.parse(String(stdout).trim().split("\n").pop() ?? "") as { box?: number[] };
          resolve(out.box && out.box.length === 4 ? { x: out.box[0], y: out.box[1], w: out.box[2], h: out.box[3] } : null);
        } catch { resolve(null); }
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Erase the face: a smooth oval in the person's own skin tone over the face,
 * soft-edged, hair and ears left as they are. With no detector the oval sits
 * where a face is on a standing figure: the top of the figure, a head wide.
 */
async function eraseFace(fig: Figure, detected: FaceBox | null): Promise<Buffer> {
  const b = fig.box;
  const face: FaceBox = detected ?? {
    w: b.height * 0.085 * 1.25, h: b.height * 0.11,
    x: b.left + b.width / 2 - (b.height * 0.085 * 1.25) / 2, y: b.top + b.height * 0.015,
  };
  // The skin tone: the average colour of the middle of the face.
  const sx = Math.max(0, Math.round(face.x + face.w * 0.3)), sy = Math.max(0, Math.round(face.y + face.h * 0.35));
  const sw = Math.max(2, Math.round(face.w * 0.4)), sh = Math.max(2, Math.round(face.h * 0.3));
  const stats = await sharp(fig.png).extract({ left: sx, top: sy, width: Math.min(sw, fig.width - sx), height: Math.min(sh, fig.height - sy) }).removeAlpha().stats();
  const [r, g, bl] = stats.channels.map((c) => Math.round(c.mean));
  const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
  const rx = face.w * 0.56, ry = face.h * 0.62;
  const blur = Math.max(2, Math.round(face.w * 0.06));
  const oval = Buffer.from(`<svg width="${fig.width}" height="${fig.height}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgb(${r},${g},${bl})" filter="url(#s)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.86}" ry="${ry * 0.86}" fill="rgb(${r},${g},${bl})"/>
  </svg>`);
  // Keep the figure's own alpha: the oval only paints where the person is.
  const painted = await sharp(fig.png).composite([{ input: oval, blend: "over" }]).png().toBuffer();
  const alpha = await sharp(fig.png).ensureAlpha().extractChannel("alpha").toBuffer();
  return sharp(painted).removeAlpha().joinChannel(alpha).png().toBuffer();
}

// ── The generated back view ──────────────────────────────────────────────────
function backPrompt(wardrobe?: string) {
  return [
    "Subject: the SAME person as in the attached photographs (Image 1 is their full-length front view, Image 2 their portrait) — the same build, height, skin tone and posture, seen from DIRECTLY BEHIND.",
    "Scene: a plain seamless mid-grey studio backdrop (about 18% grey) with the floor blending into the wall, a soft contact shadow under the shoes; even studio light, 5600K, a large soft key with a 2:1 fill, no colour cast.",
    wardrobe
      ? `Important Details: the outfit from behind — ${wardrobe} — the back of the same garments, their true colours, seams, hem and shoes exactly as they would look from behind. The hair is NOT in the picture.`
      : "Important Details: the back of the EXACT outfit in Image 1 — the same garments, colours, prints, seams, hem, belt and shoes, nothing added or redesigned — as they look from behind. The hair is NOT in the picture.",
    "Use Case: the back-view panel of a character reference sheet.",
    "Constraints: FULL LENGTH FROM THE SHOULDERS TO THE SOLES OF THE SHOES, CROPPED BELOW THE NECK — the frame begins at the top of the shoulders; NO HEAD, NO HAIR, NO NECK in the picture. Standing straight, feet hip-width apart, arms relaxed at the sides, hands open and empty, a little floor under the shoes. One person only, seen from behind, nobody else, no props, no text anywhere. A real studio photograph with realistic fabric folds.",
  ].join("\n\n");
}

async function makeBack(input: ComposeInput): Promise<{ buffer: Buffer; model: string }> {
  if (FAKE()) {
    // A stand-in: the front figure, darkened, so the layout can be checked for free.
    const buffer = await sharp(input.body).rotate().resize(1152, 2048, { fit: "cover", position: "attention" }).modulate({ brightness: 0.6, saturation: 0.4 }).png().toBuffer();
    return { buffer, model: "fake" };
  }
  const { data, model } = await nanoBananaEdit({
    prompt: backPrompt(input.wardrobe), image_urls: [input.urls.body, input.urls.face], num_images: 1,
    aspect_ratio: "9:16", resolution: "2K", output_format: "png", safety_tolerance: "6", limit_generations: false,
  });
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("the model returned no back view");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`back view download failed: ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), model };
}

// ── The sheet ────────────────────────────────────────────────────────────────
function backdrop(): sharp.Sharp {
  const groundY = Math.round(SHEET_H * 0.9);
  const svg = Buffer.from(`<svg width="${SHEET_W}" height="${SHEET_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgb(${GREY.r + 6},${GREY.g + 6},${GREY.b + 6})"/><stop offset="1" stop-color="rgb(${GREY.r},${GREY.g},${GREY.b})"/>
      </linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgb(${GREY.r},${GREY.g},${GREY.b})"/><stop offset="1" stop-color="rgb(${FLOOR.r},${FLOOR.g},${FLOOR.b})"/>
      </linearGradient>
    </defs>
    <rect width="${SHEET_W}" height="${SHEET_H}" fill="url(#wall)"/>
    <rect y="${groundY - 60}" width="${SHEET_W}" height="${SHEET_H - groundY + 60}" fill="url(#floor)"/>
  </svg>`);
  return sharp(svg);
}

async function fitFigure(fig: Figure, maxW: number, maxH: number): Promise<{ png: Buffer; w: number; h: number }> {
  const crop = await sharp(fig.png).extract(fig.box).png().toBuffer();
  const scale = Math.min(maxW / fig.box.width, maxH / fig.box.height);
  const w = Math.max(1, Math.round(fig.box.width * scale)), h = Math.max(1, Math.round(fig.box.height * scale));
  return { png: await sharp(crop).resize(w, h).png().toBuffer(), w, h };
}

/** Head and shoulders from the portrait cut-out: the top of the figure, to the upper chest. */
async function portraitCrop(fig: Figure): Promise<Figure> {
  const b = fig.box;
  // A photo that is already head-and-shoulders (about as tall as it is wide) is kept
  // whole; a taller photo (half body or more) keeps its top part — head, neck, shoulders.
  const share = b.height > b.width * 2.2 ? 0.55 : b.height > b.width * 1.5 ? 0.72 : 1;
  const height = Math.round(b.height * share);
  return { ...fig, box: { ...b, height } };
}

export async function composeSheet(input: ComposeInput): Promise<ComposeResult> {
  const notes: Record<string, unknown> = { at: new Date().toISOString(), fake: FAKE() };
  let usd = 0;
  // 1. Cut-outs (or, in tests, the photos as they are with a full alpha).
  const asPng = (b: Buffer) => sharp(b).rotate().ensureAlpha().png().toBuffer();
  const [bodyPng, facePng] = FAKE()
    ? await Promise.all([asPng(input.body), asPng(input.face)])
    : await Promise.all([cutOut(input.urls.body, "body"), cutOut(input.urls.face, "portrait")]);
  usd += FAKE() ? 0 : 0.004;
  const [bodyFig, faceFig] = await Promise.all([alphaBox(bodyPng), alphaBox(facePng)]);

  // 2. The face on the full-body figure is erased.
  const detected = await faceBoxOf(input.body);
  notes.faceBox = detected ?? "estimated";
  const bodyErased = await eraseFace(bodyFig, detected);

  // 3. The back view, generated, then cut out so it stands on the same grey.
  const back = await makeBack(input);
  usd += FAKE() ? 0 : 0.12;
  const backPng = FAKE() ? await asPng(back.buffer) : await cutOut(await uploadForFal(back.buffer), "body").catch(() => sharp(back.buffer).ensureAlpha().png().toBuffer());
  usd += FAKE() ? 0 : 0.002;
  const backFig = await alphaBox(backPng);
  notes.model = back.model;

  // 4. Compose: two full-length figures in the left half on one ground line, the portrait in the right half.
  const groundY = Math.round(SHEET_H * 0.9);
  const figH = Math.round(SHEET_H * 0.82);
  const colW = Math.round(SHEET_W * 0.5 / 2);
  const front = await fitFigure({ ...bodyFig, png: bodyErased }, colW * 0.78, figH);
  // The back view has no head: it stands the same height as the front figure's shoulders-down, so the two match in scale.
  const shoulderShare = 0.86;
  const backTarget = Math.round(front.h * shoulderShare);
  const backFit = await fitFigure(backFig, colW * 0.78, backTarget);
  const port = await fitFigure(await portraitCrop(faceFig), SHEET_W * 0.5 * 0.8, SHEET_H * 0.86);
  const shadow = (cx: number, w: number) => Buffer.from(`<svg width="${SHEET_W}" height="${SHEET_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="b"><feGaussianBlur stdDeviation="22"/></filter></defs>
    <ellipse cx="${cx}" cy="${groundY}" rx="${w * 0.42}" ry="${Math.max(14, w * 0.06)}" fill="#000" opacity="0.22" filter="url(#b)"/></svg>`);
  const c1 = Math.round(colW * 0.5), c2 = Math.round(colW * 1.5), c3 = Math.round(SHEET_W * 0.75);
  const sheet = await backdrop().composite([
    { input: shadow(c1, front.w), blend: "over" },
    { input: shadow(c2, backFit.w), blend: "over" },
    { input: front.png, left: Math.round(c1 - front.w / 2), top: groundY - front.h },
    { input: backFit.png, left: Math.round(c2 - backFit.w / 2), top: groundY - backFit.h },
    { input: port.png, left: Math.round(c3 - port.w / 2), top: Math.round((SHEET_H - port.h) / 2) },
  ]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { sheet, back: back.buffer, model: back.model, usd: +usd.toFixed(3), notes };
}

/** fal needs a URL for the cut-out of the generated back view; its storage takes the bytes. */
async function uploadForFal(buffer: Buffer): Promise<string> {
  const file = new File([new Uint8Array(buffer)], "back.png", { type: "image/png" });
  return fal.storage.upload(file);
}

/**
 * Which of two photos is the full body and which the portrait, from the cut-out
 * boxes: a standing figure is far taller than wide. Returns null when the two
 * cannot be told apart (both portraits, or both full bodies).
 */
export async function tellApart(a: Buffer, b: Buffer): Promise<{ body: Buffer; face: Buffer } | null> {
  const ratio = async (buf: Buffer) => {
    const m = await sharp(buf).rotate().metadata();
    return (m.height ?? 1) / Math.max(1, m.width ?? 1);
  };
  const [ra, rb] = await Promise.all([ratio(a), ratio(b)]);
  const fa = await faceBoxOf(a), fb = await faceBoxOf(b);
  const ha = fa ? fa.h : 0, hb = fb ? fb.h : 0;
  const ma = await sharp(a).rotate().metadata(), mb = await sharp(b).rotate().metadata();
  const shareA = ha / Math.max(1, ma.height ?? 1), shareB = hb / Math.max(1, mb.height ?? 1);
  if (shareA && shareB) {
    if (shareA < shareB * 0.6) return { body: a, face: b };
    if (shareB < shareA * 0.6) return { body: b, face: a };
    return null;
  }
  // No detector: the taller frame is the full body.
  if (ra > rb * 1.15) return { body: a, face: b };
  if (rb > ra * 1.15) return { body: b, face: a };
  return null;
}
