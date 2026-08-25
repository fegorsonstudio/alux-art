import sharp from "sharp";

/**
 * The looping before/after GIF, built for a comment thread.
 *
 * Shared by the local script and the marketplace template so a customer's GIF
 * and the studio's own come off the same compositor. Deliberately NOT
 * "server-only": scripts/carousel/make-ar-gif.mts imports it directly.
 *
 * DESIGNED FOR ~200 PIXELS WIDE. That is the whole brief. A GIF in an Instagram
 * comment is thumbnail-sized, so the first version — photo floating in a dark
 * 16:9 frame with a small readout, tick marks and hairline brackets — was
 * unreadable: every piece of that detail vanishes at that size, and what is
 * left is two black bands doing nothing.
 *
 * So the layout is two blocks and nothing else:
 *
 *   a solid colour panel carrying three or four huge words
 *   the photograph beside it, full height, never cropped
 *
 * Type is sized as a fraction of the frame rather than in fixed points, so it
 * holds its weight whatever size the file is displayed at. Contrast is maximal.
 * There is no small text anywhere, because small text is a lie at this scale.
 */

export const MINT = "#43ccb2";
export const INK = "#06150f";
const FONT = "Outfit, 'Segoe UI', Roboto, Arial, sans-serif";

export type ArFrames = { frames: Buffer[]; width: number; height: number; fps: number };

export type ArGifOptions = {
  before: Buffer;
  after: Buffer;
  /** Three or four words. Anything longer cannot be read at comment size. */
  headline: string;
  /** One short line under it — a number, a camera, a year. Optional. */
  kicker?: string;
  /** Shown on the panel at the end. Omitted entirely for white-label output. */
  endCard?: string;
  /** Customer's mark, on the panel. Transparent PNG expected. */
  logo?: Buffer;
  width?: number;
  fps?: number;
};

const DEFAULT_WIDTH = 960;
const DEFAULT_FPS = 12;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Rough advance width of uppercase text, in em.
 *
 * Counting characters is not good enough. "SAME ROOM." and "ONE LIGHT." are
 * both ten characters, so an average-per-character estimate gives them the same
 * width and the same type size — and then the first one loses its full stop off
 * the edge of the panel, because M, O and A are half again as wide as I, L and
 * T. These are eyeballed advances for a heavy grotesque at weight 900; they do
 * not need to be exact, only to rank a wide line above a narrow one.
 */
const EM: Record<string, number> = {
  I: 0.30, J: 0.46, L: 0.52, T: 0.56, F: 0.54, E: 0.56, "1": 0.42,
  M: 0.88, W: 0.92, O: 0.76, Q: 0.79, G: 0.76, D: 0.73, C: 0.71,
  N: 0.75, U: 0.73, H: 0.75, A: 0.69, R: 0.69, B: 0.68, K: 0.69,
  P: 0.64, S: 0.65, V: 0.69, X: 0.67, Y: 0.64, Z: 0.61,
  " ": 0.28, ".": 0.29, ",": 0.29, "!": 0.31, "?": 0.55, "'": 0.22, "-": 0.36, "·": 0.33,
};
const widthEm = (text: string) =>
  [...text.toUpperCase()].reduce((w, ch) => w + (EM[ch] ?? 0.62), 0);

/**
 * Break a headline into lines that fill the panel.
 *
 * Measured with widthEm rather than counted, so a line of wide letters wraps
 * sooner than a line of narrow ones. Longer input shrinks the type rather than
 * overflowing the box.
 */
function layoutHeadline(text: string, maxEm: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (widthEm(next) > maxEm && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderArFrames(opts: ArGifOptions): Promise<ArFrames> {
  const W = opts.width ?? DEFAULT_WIDTH;
  const H = Math.round((W / 16) * 9);
  const FPS = opts.fps ?? DEFAULT_FPS;

  // The photograph is full height and never cropped, so its width falls out of
  // its own shape. Whatever it does not use becomes the panel — which is why
  // there is no dead space at any aspect ratio.
  const widthOf = async (buf: Buffer) => {
    const m = await sharp(buf).metadata();
    return Math.round(H * ((m.width ?? 1) / (m.height ?? 1)));
  };
  // The WIDER of the two decides the column, and the cap is generous: a customer
  // may upload a landscape product shot, and half the frame would slice it in
  // two. The panel still keeps a third of the width, which is what the type
  // needs to stay large.
  const photoW = Math.min(
    Math.max(await widthOf(opts.before), await widthOf(opts.after)),
    Math.round(W * 0.66),
  );
  const panelW = W - photoW;

  // `contain`, never `cover`. NOTHING IS EVER CROPPED — that is the brief, and
  // `cover` is the reflex that breaks it. A picture wider than its column gets
  // ink above and below instead of losing its edges. Both frames land at exactly
  // the same size, which the dissolve depends on.
  const norm = (buf: Buffer) =>
    sharp(buf).rotate()
      .resize({ width: photoW, height: H, fit: "contain", background: INK })
      .toBuffer();
  const before = await norm(opts.before);
  const after = await norm(opts.after);

  // ── The panel ──────────────────────────────────────────────────────────────
  // Mint ground, ink type: the highest-contrast pairing in the brand, and the
  // one that still reads when the whole thing is 200px wide.
  const pad = Math.round(panelW * 0.09);
  const inner = panelW - pad * 2;
  const lines = layoutHeadline(opts.headline, 6.6);

  // THREE BANDS, and the headline only gets what is left.
  //
  // The logo and the kicker were both pinned to the bottom-left corner and drew
  // straight through each other — a customer's own mark printed over their own
  // caption. The logo owns the top band now, the kicker owns the bottom band,
  // and the headline is centred in the gap between them.
  const logoH = Math.round(H * 0.09);
  const logoBand = opts.logo ? logoH + Math.round(pad * 0.7) : 0;
  // Measured on its own terms rather than as a fraction of a headline size that
  // has not been decided yet.
  const kickerSize = opts.kicker
    ? Math.min(
        Math.round((inner * 0.97) / (widthEm(opts.kicker) * 1.12)),
        Math.round(H * 0.052),
      )
    : 0;
  const kickerBand = opts.kicker ? kickerSize + Math.round(pad * 0.8) : 0;
  // The floor stops a tall logo plus a long kicker from squeezing the headline
  // out of existence on a narrow panel.
  const bandH = Math.max(Math.round(H * 0.25), H - logoBand - kickerBand - pad * 2);
  // Sized from the WIDEST line, measured, never a fixed fraction of the panel.
  // A fixed fraction clipped "YOUR PHONE" to "YOUR PHON"; counting characters
  // instead clipped the full stop off "SAME ROOM." while "ONE LIGHT." — the same
  // ten characters — sat comfortably inside. The 0.97 keeps a hair of air at the
  // right edge; the height cap stops a one-word headline growing taller than the
  // panel.
  const widest = Math.max(...lines.map(widthEm), 0.1);
  const size = Math.min(
    Math.round((inner * 0.97) / widest),
    Math.round((bandH * 0.98) / lines.length),
  );
  const lead = Math.round(size * 1.02);
  const blockH = lead * lines.length;
  // Centred in the band, not in the panel.
  const top = logoBand + pad + Math.round((bandH - blockH) / 2) + Math.round(size * 0.78);

  const panelSvg = (endText?: string) => {
    if (endText) {
      // Sized from the actual character count, not a fixed fraction: a fixed
      // one clipped "aluxartandframes.shop" off both edges of the panel.
      // 0.56em per character is a fair average for this weight of sans.
      const s2 = Math.min(
        Math.round((inner * 0.97) / Math.max(0.1, widthEm(endText) * 0.86)),
        Math.round(H * 0.09),
      );
      return `<svg width="${panelW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${panelW}" height="${H}" fill="${MINT}"/>
        <text x="${panelW / 2}" y="${H / 2 + s2 / 3}" text-anchor="middle" font-family="${FONT}"
          font-size="${s2}" font-weight="900" fill="${INK}">${esc(endText)}</text>
      </svg>`;
    }
    const body = lines.map((l, i) =>
      `<text x="${pad}" y="${top + i * lead}" font-family="${FONT}" font-size="${size}"
         font-weight="900" fill="${INK}" letter-spacing="-0.03em">${esc(l.toUpperCase())}</text>`).join("");
    const kick = opts.kicker
      ? `<text x="${pad}" y="${H - pad}" font-family="${FONT}"
           font-size="${kickerSize}" font-weight="800" fill="${INK}" opacity="0.72"
           letter-spacing="0.1em">${esc(opts.kicker.toUpperCase())}</text>`
      : "";
    return `<svg width="${panelW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${panelW}" height="${H}" fill="${MINT}"/>
      ${body}${kick}
    </svg>`;
  };

  const panel = Buffer.from(panelSvg());
  const endPanel = opts.endCard ? Buffer.from(panelSvg(opts.endCard)) : null;

  const logo = opts.logo
    ? await sharp(opts.logo).resize({ height: logoH, fit: "inside" }).png().toBuffer()
    : null;

  const base = () => sharp({ create: { width: W, height: H, channels: 3, background: INK } });

  const compose = async (photo: Buffer, thisPanel: Buffer) => {
    const layers: sharp.OverlayOptions[] = [
      { input: thisPanel, left: 0, top: 0 },
      { input: photo, left: panelW, top: 0 },
    ];
    if (logo) layers.push({ input: logo, left: pad, top: pad });
    return base().composite(layers).png({ compressionLevel: 6 }).toBuffer();
  };

  /**
   * A copy at partial opacity, for the dissolve.
   *
   * composite() has no `opacity` option — passing one is silently ignored, which
   * turns what looks like a cross-fade into a hard cut. The alpha has to be set
   * on the overlay itself.
   */
  const fade = (buf: Buffer, alpha: number) =>
    sharp(buf).ensureAlpha(Math.max(0, Math.min(1, alpha))).png().toBuffer();

  const holdBefore = Math.round(FPS * 0.85);
  const dissolve = Math.round(FPS * 0.55);   // quick: at this size a slow fade reads as a stall
  const holdAfter = Math.round(FPS * 1.5);
  const back = Math.round(FPS * 0.3);
  const endBeat = endPanel ? Math.round(FPS * 0.9) : 0;

  const frames: Buffer[] = [];
  const beforeFrame = await compose(before, panel);
  const afterFrame = await compose(after, panel);

  for (let i = 0; i < holdBefore; i++) frames.push(beforeFrame);

  for (let i = 1; i <= dissolve; i++) {
    const t = i / dissolve;
    const eased = t * t * (3 - 2 * t);
    const blended = await sharp(before).composite([{ input: await fade(after, eased) }]).toBuffer();
    frames.push(await compose(blended, panel));
  }

  for (let i = 0; i < holdAfter; i++) frames.push(afterFrame);

  // The end card swaps the PANEL, not the picture: the photograph is the proof
  // and it stays on screen while the name is said.
  if (endPanel) {
    const endFrame = await compose(after, endPanel);
    for (let i = 0; i < endBeat; i++) frames.push(endFrame);
  }

  for (let i = 1; i <= back; i++) {
    const t = i / back;
    const eased = t * t * (3 - 2 * t);
    const blended = await sharp(after).composite([{ input: await fade(before, eased) }]).toBuffer();
    frames.push(await compose(blended, panel));
  }

  return { frames, width: W, height: H, fps: FPS };
}

export const gifDuration = (fps = DEFAULT_FPS, hasEndCard = false) =>
  (Math.round(fps * 0.85) + Math.round(fps * 0.55) + Math.round(fps * 1.5) +
   Math.round(fps * 0.3) + (hasEndCard ? Math.round(fps * 0.9) : 0)) / fps;

/**
 * Frames to an animated GIF.
 *
 * Shells to ffmpeg with a generated palette. sharp composites well but cannot
 * WRITE an animated GIF on this version — constructor pageHeight,
 * gif({pageHeight}) and withMetadata all come back pages=1, so the first
 * attempt produced a single very tall still that looked like a success.
 *
 * ffmpeg was installed on the VPS for this. The two-pass palette matters more
 * than it sounds: the default 216-colour web palette bands skin tones and dark
 * amber backgrounds badly, which is most of what these pictures are.
 *
 * Writes to a temp directory rather than piping, because ffmpeg's image2
 * demuxer wants numbered files and the frame count here is small.
 */
export async function encodeGif(frames: Buffer[], fps: number): Promise<Buffer> {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  const dir = await mkdtemp(join(tmpdir(), "gifloop-"));
  try {
    await Promise.all(frames.map((f, i) =>
      writeFile(join(dir, `f${String(i).padStart(4, "0")}.png`), f)));

    const pattern = join(dir, "f%04d.png");
    const palette = join(dir, "pal.png");
    const out = join(dir, "out.gif");

    await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(fps),
      "-i", pattern, "-vf", "palettegen=stats_mode=diff", palette]);
    await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(fps),
      "-i", pattern, "-i", palette,
      "-lavfi", "paletteuse=dither=sierra2_4a", "-loop", "0", out]);

    return await readFile(out);
  } finally {
    // Always, even on failure: these are ~50 PNGs at 960x540 and a server that
    // leaks them fills its disk quietly.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Compose and encode in one call — what the server fork uses. */
export async function renderGif(opts: ArGifOptions): Promise<Buffer> {
  const { frames, fps } = await renderArFrames(opts);
  return encodeGif(frames, fps);
}
