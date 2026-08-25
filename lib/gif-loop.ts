import sharp from "sharp";

/**
 * The looping before/after GIF, in an augmented-reality frame.
 *
 * Shared by the local script and the server fork so a customer's GIF and the
 * studio's own come off the same compositor. Deliberately NOT "server-only":
 * scripts/carousel/make-ar-gif.mts imports it directly.
 *
 * Two constraints shape the whole design, and they solve each other. The frame
 * is 16:9 and **no photograph is ever cropped**, so a portrait source leaves a
 * wide band on each side. Rather than blur-filling that band, it becomes the
 * interface: the picture reads as a specimen held inside a viewer, which is
 * what makes the AR treatment honest rather than decorative.
 *
 * No ffmpeg. It is not installed on the VPS, so frames are stacked into one
 * tall raw image and written as an animated GIF through libvips' pageHeight —
 * the same code path in both places, rather than one that works locally and
 * silently differs in production.
 */

export const MINT = "#43ccb2";
export const INK = "#06150f";
const FONT = "Outfit, 'Segoe UI', Roboto, Arial, sans-serif";

export type ArFrames = { frames: Buffer[]; width: number; height: number; fps: number };

export type ArGifOptions = {
  before: Buffer;
  after: Buffer;
  /** The line along the bottom. One word may be wrapped in *asterisks* to go mint. */
  caption?: string;
  /** Small readout in the left band, e.g. ["LOOK 197", "NIGHT PAPARAZZI G7X"]. */
  label?: string[];
  /** Shown alone on the last beat. Omitted entirely for white-label output. */
  endCard?: string;
  /** Customer's mark, bottom-left. Transparent PNG expected. */
  logo?: Buffer;
  width?: number;
  fps?: number;
};

/** 16:9 at a size where a 5MB GIF is still comfortable. */
const DEFAULT_WIDTH = 960;
const DEFAULT_FPS = 12;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Caption with one word lifted into mint.
 *
 * The single idea borrowed from the reference video: a key word in colour is
 * what stops a line reading as a title card. Marked with *asterisks* rather
 * than passed as a separate field so the caption stays one editable string.
 */
function captionSvg(text: string, w: number, y: number, size: number): string {
  const parts = text.split(/(\*[^*]+\*)/).filter(Boolean);
  let x = 0;
  const runs = parts.map((p) => {
    const mint = p.startsWith("*") && p.endsWith("*");
    const body = mint ? p.slice(1, -1) : p;
    const run = `<tspan fill="${mint ? MINT : "#ffffff"}">${esc(body)}</tspan>`;
    x += body.length;
    return run;
  }).join("");
  // xml:space="preserve" or SVG eats the spaces between runs and the line comes
  // out as "Same phone.One lightmoved."
  return `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="${FONT}"
    font-size="${size}" font-weight="800" letter-spacing="-0.01em"
    xml:space="preserve">${runs}</text>`;
}

/**
 * The interface: brackets, readout, tick marks.
 *
 * Drawn once and reused on every frame — only the scan line moves, which keeps
 * the GIF's palette stable and its file size down.
 */
function chromeSvg(
  W: number, H: number, px: number, py: number, pw: number, ph: number,
  label: string[], caption: string,
): string {
  const b = 26;                       // bracket arm length
  const bracket = (cx: number, cy: number, sx: number, sy: number) =>
    `<path d="M ${cx + sx * b} ${cy} L ${cx} ${cy} L ${cx} ${cy + sy * b}"
       stroke="${MINT}" stroke-width="2" fill="none" opacity="0.9"/>`;

  // Tick marks down the right band. Low opacity: this is texture, and texture
  // that competes with the photograph is just noise.
  const ticks = Array.from({ length: 14 }, (_, i) => {
    const y = py + (ph / 13) * i;
    const long = i % 3 === 0;
    const x2 = px + pw + 30 + (long ? 22 : 11);
    return `<line x1="${px + pw + 30}" y1="${y}" x2="${x2}" y2="${y}"
      stroke="${MINT}" stroke-width="1" opacity="${long ? 0.5 : 0.25}"/>`;
  }).join("");

  const readout = label.map((line, i) =>
    `<text x="${px - 30}" y="${py + 18 + i * 22}" text-anchor="end" font-family="${FONT}"
       font-size="${i === 0 ? 17 : 13}" font-weight="${i === 0 ? 800 : 600}"
       fill="${MINT}" opacity="${i === 0 ? 0.95 : 0.55}"
       letter-spacing="0.14em">${esc(line.toUpperCase())}</text>`).join("");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${bracket(px, py, 1, 1)}
    ${bracket(px + pw, py, -1, 1)}
    ${bracket(px, py + ph, 1, -1)}
    ${bracket(px + pw, py + ph, -1, -1)}
    ${ticks}
    ${readout}
    ${caption ? captionSvg(caption, W, H - 34, 30) : ""}
  </svg>`;
}

/** The sweep. Its whole job is to be the light arriving, not an effect over it. */
function scanSvg(W: number, H: number, px: number, py: number, pw: number, ph: number, t: number): string {
  const y = py + ph * t;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${MINT}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${MINT}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${MINT}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="${px}" y="${Math.max(py, y - 26)}" width="${pw}"
          height="${Math.min(52, py + ph - Math.max(py, y - 26))}" fill="url(#g)"/>
    <line x1="${px}" y1="${y}" x2="${px + pw}" y2="${y}" stroke="${MINT}"
          stroke-width="1" opacity="0.45"/>
  </svg>`;
}

export async function renderArFrames(opts: ArGifOptions): Promise<ArFrames> {
  const W = opts.width ?? DEFAULT_WIDTH;
  const H = Math.round((W / 16) * 9);
  const FPS = opts.fps ?? DEFAULT_FPS;

  // The picture is fitted to the frame's height, never cropped. Everything left
  // over is interface.
  // The picture sits high, leaving a clear band at the bottom for the caption.
  // Centring it vertically ran the words across the subject's legs.
  const ph = Math.round(H * 0.76);
  const py = Math.round(H * 0.045);

  const fit = async (buf: Buffer) => {
    const m = await sharp(buf).metadata();
    const ratio = (m.width ?? 1) / (m.height ?? 1);
    const w = Math.round(ph * ratio);
    return { buf: await sharp(buf).rotate().resize({ width: w, height: ph, fit: "contain" }).toBuffer(), w };
  };

  const a = await fit(opts.before);
  const b = await fit(opts.after);
  // One width for both, or the frame twitches mid-dissolve.
  const pw = Math.min(a.w, b.w);
  const px = Math.round((W - pw) / 2);

  const norm = (buf: Buffer) =>
    sharp(buf).resize({ width: pw, height: ph, fit: "contain", background: INK }).toBuffer();
  const before = await norm(a.buf);
  const after = await norm(b.buf);

  const chrome = Buffer.from(chromeSvg(W, H, px, py, pw, ph, opts.label ?? [], opts.caption ?? ""));

  const logo = opts.logo
    ? await sharp(opts.logo).resize({ height: 34, fit: "inside", withoutEnlargement: false }).png().toBuffer()
    : null;

  const base = () => sharp({ create: { width: W, height: H, channels: 3, background: INK } });

  const compose = async (photo: Buffer, extra: sharp.OverlayOptions[] = []) => {
    const layers: sharp.OverlayOptions[] = [
      { input: photo, left: px, top: py },
      ...extra,
      { input: chrome, left: 0, top: 0 },
    ];
    if (logo) layers.push({ input: logo, left: 28, top: H - 62 });
    return base().composite(layers).png({ compressionLevel: 6 }).toBuffer();
  };

  /**
   * A copy at partial opacity, for the dissolve.
   *
   * composite() has no `opacity` option — passing one is silently ignored, which
   * turns what looks like a cross-fade into a hard cut. The alpha channel has to
   * be set on the overlay itself.
   */
  const fade = (buf: Buffer, alpha: number) =>
    sharp(buf).ensureAlpha(Math.max(0, Math.min(1, alpha))).png().toBuffer();

  // Timing. The payoff gets the longest look; the return is quick so the loop
  // closes without drawing attention to itself.
  const holdBefore = Math.round(FPS * 0.8);
  const dissolve = Math.round(FPS * 0.9);
  const holdAfter = Math.round(FPS * 1.3);
  const back = Math.round(FPS * 0.4);
  const endBeat = opts.endCard ? Math.round(FPS * 1.0) : 0;

  const frames: Buffer[] = [];
  const beforeFrame = await compose(before);
  const afterFrame = await compose(after);

  for (let i = 0; i < holdBefore; i++) frames.push(beforeFrame);

  for (let i = 1; i <= dissolve; i++) {
    const t = i / dissolve;
    const eased = t * t * (3 - 2 * t);
    const blended = await sharp(before).composite([{ input: await fade(after, eased) }]).toBuffer();
    // The scan rides the dissolve exactly, so the sweep and the light are one event.
    frames.push(await compose(blended, [
      { input: Buffer.from(scanSvg(W, H, px, py, pw, ph, eased)), left: 0, top: 0 },
    ]));
  }

  for (let i = 0; i < holdAfter; i++) frames.push(afterFrame);

  if (endBeat) {
    const card = Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="${INK}"/>
        <text x="${W / 2}" y="${H / 2 + 10}" text-anchor="middle" font-family="${FONT}"
          font-size="34" font-weight="800" fill="${MINT}"
          letter-spacing="0.02em">${esc(opts.endCard!)}</text>
      </svg>`);
    const cardFrame = await base().composite([{ input: card, left: 0, top: 0 }]).png().toBuffer();
    for (let i = 0; i < endBeat; i++) frames.push(cardFrame);
  }

  for (let i = 1; i <= back; i++) {
    const t = i / back;
    const eased = t * t * (3 - 2 * t);
    const blended = await sharp(after).composite([{ input: await fade(before, eased) }]).toBuffer();
    frames.push(await compose(blended));
  }

  // Frames out, encoding left to the caller.
  //
  // sharp cannot WRITE an animated GIF on this version — constructor
  // pageHeight, gif({pageHeight}) and withMetadata all return pages=1, checked
  // rather than assumed. So compositing (which sharp does well, and which is
  // the part worth sharing) stops here, and whoever wants a GIF encodes these.
  return { frames, width: W, height: H, fps: FPS };
}

/** Frame count for a given fps, so callers can report duration without rendering. */
export const gifDuration = (fps = DEFAULT_FPS, hasEndCard = false) =>
  (Math.round(fps * 0.8) + Math.round(fps * 0.9) + Math.round(fps * 1.3) +
   Math.round(fps * 0.4) + (hasEndCard ? Math.round(fps * 1.0) : 0)) / fps;
