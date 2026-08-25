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
 * Break a headline into lines that fill the panel.
 *
 * Balanced by character count rather than measured: without font metrics an
 * estimate is all that is available, and three or four short words are
 * forgiving. Longer input shrinks the type rather than overflowing the box.
 */
function layoutHeadline(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) { lines.push(line); line = w; }
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
  const photoW = Math.min(await widthOf(opts.before), await widthOf(opts.after), Math.round(W * 0.5));
  const panelW = W - photoW;

  // Both sources are already the same shape to within a pixel or two, so this
  // reconciles that difference and loses nothing. A genuinely different aspect
  // would need letterboxing instead.
  const norm = (buf: Buffer) =>
    sharp(buf).rotate()
      .resize({ width: photoW, height: H, fit: "cover", position: "centre" })
      .toBuffer();
  const before = await norm(opts.before);
  const after = await norm(opts.after);

  // ── The panel ──────────────────────────────────────────────────────────────
  // Mint ground, ink type: the highest-contrast pairing in the brand, and the
  // one that still reads when the whole thing is 200px wide.
  const pad = Math.round(panelW * 0.09);
  const inner = panelW - pad * 2;
  const lines = layoutHeadline(opts.headline, 11);
  // Sized from the LONGEST line's character count, never a fixed fraction of the
  // panel. A fixed fraction clipped "YOUR PHONE" to "YOUR PHON" — the type has
  // to know how much text it is actually carrying. 0.6em per character is a fair
  // average for uppercase at weight 900; the height cap stops a one-word
  // headline growing taller than the panel.
  const longest = Math.max(...lines.map(l => l.length), 1);
  const size = Math.min(
    Math.round(inner / (longest * 0.6)),
    Math.round((H * 0.66) / lines.length),
  );
  const lead = Math.round(size * 1.02);
  const blockH = lead * lines.length;
  const top = Math.round((H - blockH) / 2) + Math.round(size * 0.78);

  const panelSvg = (endText?: string) => {
    if (endText) {
      // Sized from the actual character count, not a fixed fraction: a fixed
      // one clipped "aluxartandframes.shop" off both edges of the panel.
      // 0.56em per character is a fair average for this weight of sans.
      const s2 = Math.min(
        Math.round(inner / Math.max(1, endText.length * 0.56)),
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
      ? (() => {
          // Same rule as the headline: the kicker is long and was running off
          // the panel. Letter-spacing widens it, so 0.66em per character.
          const ks = Math.min(
            Math.round(inner / (opts.kicker!.length * 0.66)),
            Math.round(size * 0.26),
          );
          return `<text x="${pad}" y="${H - pad}" font-family="${FONT}"
           font-size="${ks}" font-weight="800" fill="${INK}" opacity="0.72"
           letter-spacing="0.1em">${esc(opts.kicker!.toUpperCase())}</text>`;
        })() : "";
    return `<svg width="${panelW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${panelW}" height="${H}" fill="${MINT}"/>
      ${body}${kick}
    </svg>`;
  };

  const panel = Buffer.from(panelSvg());
  const endPanel = opts.endCard ? Buffer.from(panelSvg(opts.endCard)) : null;

  const logoH = Math.round(H * 0.09);
  const logo = opts.logo
    ? await sharp(opts.logo).resize({ height: logoH, fit: "inside" }).png().toBuffer()
    : null;

  const base = () => sharp({ create: { width: W, height: H, channels: 3, background: INK } });

  const compose = async (photo: Buffer, thisPanel: Buffer) => {
    const layers: sharp.OverlayOptions[] = [
      { input: thisPanel, left: 0, top: 0 },
      { input: photo, left: panelW, top: 0 },
    ];
    if (logo) layers.push({ input: logo, left: pad, top: H - logoH - pad });
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
