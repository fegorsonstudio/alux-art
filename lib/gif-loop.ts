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
  /**
   * The story, one line per beat, cut fast.
   *
   * A single headline held for four seconds does not explain anything — people
   * saw the loop and could not tell what was being sold. A sequence can:
   * "RELIGHT YOUR PHONE PHOTOS" / "SAME ROOM" / "SAME OUTFIT" / "DIFFERENT
   * LIGHT" / "aluxartandframes.shop". Each line lands, cuts, and the next
   * arrives before attention moves on.
   *
   * Cuts, not dissolves, between lines. At this speed a cross-fade reads as
   * mush; a hard cut reads as deliberate. The one dissolve left in the film is
   * the before/after itself, which is the product and has to be seen happening.
   *
   * A beat may carry its own picture. When it does not, it inherits: the BEFORE
   * photograph until the reveal, the AFTER photograph from the reveal onward.
   */
  beats?: Array<{ text: string; image?: Buffer }>;
  /**
   * Which beat the picture changes on. Defaults to the second from last, since
   * the last line is usually an address rather than part of the argument.
   */
  revealAt?: number;
  /** Customer's mark, on the panel. Transparent PNG expected. */
  logo?: Buffer;
  width?: number;
  fps?: number;
  /**
   * "16:9" for a feed or a comment, "9:16" for a story or a reel.
   *
   * Not a crop of one another — the furniture moves. Landscape stands the panel
   * and the photograph side by side; portrait puts the photograph on top and
   * the words underneath, because a panel down one side of a phone screen is a
   * column two words wide.
   */
  ratio?: "16:9" | "9:16";
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
  const portrait = opts.ratio === "9:16";
  // Even numbers, always: H.264 chroma subsampling cannot encode an odd
  // dimension, and a one-pixel rounding error here fails the MP4 outright.
  const even = (n: number) => (n % 2 === 0 ? n : n + 1);
  const W = even(opts.width ?? (portrait ? 720 : DEFAULT_WIDTH));
  const H = even(portrait ? Math.round((W / 9) * 16) : Math.round((W / 16) * 9));
  const FPS = opts.fps ?? DEFAULT_FPS;

  // The photograph is full height and never cropped, so its width falls out of
  // its own shape. Whatever it does not use becomes the panel — which is why
  // there is no dead space at any aspect ratio.
  const widthOf = async (buf: Buffer) => {
    const m = await sharp(buf).metadata();
    return Math.round(H * ((m.width ?? 1) / (m.height ?? 1)));
  };
  // How tall the photograph would be if it filled the width — used by portrait,
  // where the picture takes the top of the frame rather than the side.
  const heightOf = async (buf: Buffer) => {
    const m = await sharp(buf).metadata();
    return Math.round(W * ((m.height ?? 1) / (m.width ?? 1)));
  };
  // The WIDER of the two decides the column, and the cap is generous: a customer
  // may upload a landscape product shot, and half the frame would slice it in
  // two. The panel still keeps a third of the width, which is what the type
  // needs to stay large.
  // Landscape: the photograph owns a column on the right, the panel takes what
  // is left. Portrait: the photograph owns a band across the top and the panel
  // is the full width beneath it. Both are capped so neither can crowd out the
  // other, and both hold the photograph whole.
  const photoW = portrait
    ? W
    : Math.min(
        Math.max(await widthOf(opts.before), await widthOf(opts.after)),
        Math.round(W * 0.66),
      );
  const photoH = portrait
    ? Math.min(
        Math.max(await heightOf(opts.before), await heightOf(opts.after)),
        Math.round(H * 0.68),
      )
    : H;
  const panelW = portrait ? W : W - photoW;
  const panelH = portrait ? H - photoH : H;

  // `contain`, never `cover`. NOTHING IS EVER CROPPED — that is the brief, and
  // `cover` is the reflex that breaks it. A picture wider than its column gets
  // ink above and below instead of losing its edges. Both frames land at exactly
  // the same size, which the dissolve depends on.
  const norm = (buf: Buffer) =>
    sharp(buf).rotate()
      .resize({ width: photoW, height: photoH, fit: "contain", background: INK })
      .toBuffer();
  const before = await norm(opts.before);
  const after = await norm(opts.after);

  // ── The panel ──────────────────────────────────────────────────────────────
  // Mint ground, ink type: the highest-contrast pairing in the brand, and the
  // one that still reads when the whole thing is 200px wide.
  const pad = Math.round(Math.min(panelW, panelH) * 0.09);
  const inner = panelW - pad * 2;
  // THREE BANDS: logo on top, kicker at the bottom, words in the gap.
  //
  // The logo and the kicker were both pinned to the bottom-left corner and drew
  // straight through each other — a customer's own mark printed over their own
  // caption. Separating them is what fixed it.
  const logoH = Math.round(Math.min(panelH * 0.17, panelW * 0.3));
  const logoBand = opts.logo ? logoH + Math.round(pad * 0.7) : 0;
  const kickerSize = opts.kicker
    ? Math.min(
        Math.round((inner * 0.97) / (widthEm(opts.kicker) * 1.12)),
        Math.round(panelH * 0.09),
      )
    : 0;
  const kickerBand = opts.kicker ? kickerSize + Math.round(pad * 0.8) : 0;

  /**
   * One panel, sized for the words it actually carries.
   *
   * This used to be computed once for a single headline. With a sequence of
   * beats every line is a different length — "SAME ROOM" and "RELIGHT YOUR
   * PHONE PHOTOS" cannot share a type size without one of them being wrong — so
   * the wrap, the size and the vertical centring are all worked out per beat.
   *
   * `address` styles a line that is a web address: centred and a little smaller,
   * because a URL set in the same huge weight as a headline reads as shouting
   * and wraps horribly.
   */
  const panelFor = (text: string, opts2: { address?: boolean; kicker?: boolean } = {}): Buffer => {
    const showKicker = opts2.kicker !== false && !!opts.kicker && !opts2.address;
    const kBand = showKicker ? kickerBand : 0;
    const bandH = Math.max(Math.round(panelH * 0.25), panelH - logoBand - kBand - pad * 2);

    if (opts2.address) {
      // Sized from the measured width: a fixed fraction clipped
      // "aluxartandframes.shop" off both edges of the panel.
      const s2 = Math.min(
        Math.round((inner * 0.97) / Math.max(0.1, widthEm(text) * 0.86)),
        Math.round(panelH * 0.16),
      );
      return Buffer.from(`<svg width="${panelW}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${panelW}" height="${panelH}" fill="${MINT}"/>
        <text x="${panelW / 2}" y="${panelH / 2 + s2 / 3}" text-anchor="middle" font-family="${FONT}"
          font-size="${s2}" font-weight="900" fill="${INK}">${esc(text)}</text>
      </svg>`);
    }

    const lines = layoutHeadline(text, portrait ? 11 : 6.6);
    // Sized from the WIDEST line, measured, never a fixed fraction of the panel.
    // A fixed fraction clipped "YOUR PHONE" to "YOUR PHON"; counting characters
    // instead clipped the full stop off "SAME ROOM." while "ONE LIGHT." — the
    // same ten characters — sat comfortably inside.
    const widest = Math.max(...lines.map(widthEm), 0.1);
    const size = Math.min(
      Math.round((inner * 0.97) / widest),
      Math.round((bandH * 0.98) / lines.length),
    );
    const lead = Math.round(size * 1.02);
    const blockH = lead * lines.length;
    const top = logoBand + pad + Math.round((bandH - blockH) / 2) + Math.round(size * 0.78);

    const body = lines.map((l, i) =>
      `<text x="${pad}" y="${top + i * lead}" font-family="${FONT}" font-size="${size}"
         font-weight="900" fill="${INK}" letter-spacing="-0.03em">${esc(l.toUpperCase())}</text>`).join("");
    const kick = showKicker
      ? `<text x="${pad}" y="${panelH - pad}" font-family="${FONT}"
           font-size="${kickerSize}" font-weight="800" fill="${INK}" opacity="0.72"
           letter-spacing="0.1em">${esc(opts.kicker!.toUpperCase())}</text>`
      : "";
    return Buffer.from(`<svg width="${panelW}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${panelW}" height="${panelH}" fill="${MINT}"/>
      ${body}${kick}
    </svg>`);
  };


  // Trimmed, then resampled properly. Two separate faults were visible in the
  // first renders: the mark was too small to read, and it was surrounded by its
  // own file's flat padding, which shrank the part that carries the meaning and
  // showed as a hard rectangle against the mint. trim() removes a uniform
  // border; lanczos3 keeps fine gold lettering legible where the default kernel
  // smears it. A trim that fails (a logo with no flat border, or a gradient to
  // the very edge) falls back to the original rather than dropping the logo.
  const logoSrc = opts.logo
    ? await sharp(opts.logo).trim({ threshold: 12 }).toBuffer().catch(() => opts.logo!)
    : null;
  const logo = logoSrc
    ? await sharp(logoSrc)
        .resize({
          height: logoH, width: Math.round(panelW - pad * 2),
          fit: "inside", withoutEnlargement: false, kernel: "lanczos3",
        })
        .png({ compressionLevel: 6 }).toBuffer()
    : null;

  const base = () => sharp({ create: { width: W, height: H, channels: 3, background: INK } });

  const compose = async (photo: Buffer, thisPanel: Buffer) => {
    // Portrait stacks: picture on top, words beneath. Landscape sits them side
    // by side with the panel on the left.
    const panelX = 0;
    const panelY = portrait ? photoH : 0;
    const photoX = portrait ? 0 : panelW;
    const photoY = 0;
    const layers: sharp.OverlayOptions[] = [
      { input: thisPanel, left: panelX, top: panelY },
      { input: photo, left: photoX, top: photoY },
    ];
    // Top-left of the PANEL, wherever the panel happens to be. The bottom-left
    // corner belongs to the kicker.
    if (logo) layers.push({ input: logo, left: panelX + pad, top: panelY + pad });
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

  // ── THE STORY, AS BEATS ───────────────────────────────────────────────────
  //
  // Callers who pass no beats get the original film: one headline, a
  // before/after dissolve, an optional address at the end. Everything below
  // treats that as a two-beat sequence so there is one timeline, not two.
  const looksLikeAddress = (t: string) => /\.[a-z]{2,}(\/|$)/i.test(t.trim()) && !/\s/.test(t.trim());

  const beats = (opts.beats && opts.beats.length)
    ? opts.beats.filter(b => b.text?.trim())
    : [
        { text: opts.headline },
        ...(opts.endCard ? [{ text: opts.endCard }] : []),
      ];

  // Where the photograph changes. The last line is usually an address rather
  // than part of the argument, so the reveal lands on the one before it — which
  // for "…/ SAME OUTFIT / DIFFERENT LIGHT / theirsite.com" is exactly the beat
  // that says the light changed.
  const revealAt = opts.revealAt !== undefined
    ? Math.max(0, Math.min(beats.length - 1, opts.revealAt))
    : (beats.length >= 3 && looksLikeAddress(beats[beats.length - 1].text)
        ? beats.length - 2
        : beats.length - 1);

  // Fast. Each line is short and the reader only has to take in one idea, so
  // holding longer just invites a scroll. The reveal beat is the exception:
  // that is the payoff and it needs time to be seen.
  const BEAT = Math.max(2, Math.round(FPS * 0.62));
  const REVEAL_HOLD = Math.max(3, Math.round(FPS * 1.25));
  const DISSOLVE = Math.max(2, Math.round(FPS * 0.32));

  /** Normalise a per-beat picture to the same box the others occupy. */
  const normalised = new Map<number, Buffer>();
  for (let i = 0; i < beats.length; i++) {
    const img = beats[i].image;
    if (img) normalised.set(i, await norm(img));
  }
  const photoFor = (i: number) => normalised.get(i) ?? (i < revealAt ? before : after);

  const frames: Buffer[] = [];

  for (let i = 0; i < beats.length; i++) {
    const isAddress = looksLikeAddress(beats[i].text);
    const panel = panelFor(beats[i].text, { address: isAddress });
    const photo = photoFor(i);

    // The one dissolve in the film. It happens ON the reveal beat, so the words
    // that explain the change and the change itself are the same moment.
    if (i === revealAt && !normalised.has(i)) {
      const from = i > 0 ? photoFor(i - 1) : before;
      if (from !== photo) {
        for (let d = 1; d <= DISSOLVE; d++) {
          const t = d / DISSOLVE;
          const eased = t * t * (3 - 2 * t);
          const blended = await sharp(from).composite([{ input: await fade(photo, eased) }]).toBuffer();
          frames.push(await compose(blended, panel));
        }
      }
    }

    // Everything else is a hard cut. At this speed a cross-fade between two
    // lines of text reads as a smear rather than as a change.
    const hold = i === revealAt ? REVEAL_HOLD : BEAT;
    const still = await compose(photo, panel);
    for (let f = 0; f < hold; f++) frames.push(still);
  }

  // Back to the top, so the loop does not jump. Only needed when the last beat
  // is not already showing the opening picture.
  const lastPhoto = photoFor(beats.length - 1);
  const firstPhoto = photoFor(0);
  if (lastPhoto !== firstPhoto) {
    const backPanel = panelFor(beats[0].text, { address: looksLikeAddress(beats[0].text) });
    const back = Math.max(2, Math.round(FPS * 0.3));
    for (let d = 1; d <= back; d++) {
      const t = d / back;
      const eased = t * t * (3 - 2 * t);
      const blended = await sharp(lastPhoto).composite([{ input: await fade(firstPhoto, eased) }]).toBuffer();
      frames.push(await compose(blended, backPanel));
    }
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
async function withFrameDir<T>(
  frames: Buffer[],
  fn: (pattern: string, run: (args: string[]) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  const dir = await mkdtemp(join(tmpdir(), "gifloop-"));
  try {
    await Promise.all(frames.map((f, i) =>
      writeFile(join(dir, `f${String(i).padStart(4, "0")}.png`), f)));
    return await fn(join(dir, "f%04d.png"),
      (args) => exec("ffmpeg", ["-y", "-v", "error", ...args]));
  } finally {
    // Always, even on failure: these are ~50 PNGs at up to 1280x720 and a
    // server that leaks them fills its disk quietly.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function encodeGif(frames: Buffer[], fps: number, maxWidth?: number): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");

  return withFrameDir(frames, async (pattern, run) => {
    const dir = dirname(pattern);
    const palette = join(dir, "pal.png");
    const out = join(dir, "out.gif");
    // Frames are composited at video resolution; the GIF is the small copy.
    // -2 keeps the height even and lets ffmpeg pick it from the aspect.
    const scale = maxWidth ? `scale=${maxWidth}:-2:flags=lanczos,` : "";

    await run(["-framerate", String(fps), "-i", pattern,
      "-vf", `${scale}palettegen=stats_mode=diff`, palette]);
    // bayer, not sierra2_4a. Error-diffusion scatters visible speckle across
    // large flat areas, and this frame is mostly one flat mint panel with a
    // dark gradient logo on it — exactly the case it handles worst. An ordered
    // dither leaves those regions clean.
    const use = "paletteuse=dither=bayer:bayer_scale=4";
    await run(["-framerate", String(fps), "-i", pattern, "-i", palette,
      "-lavfi", scale
        ? `[0:v]${scale.replace(/,$/, "")}[x];[x][1:v]${use}`
        : `[0:v][1:v]${use}`,
      "-loop", "0", out]);

    return readFile(out);
  });
}

/**
 * The same loop as an MP4.
 *
 * Worth having beside the GIF rather than instead of it. A GIF is what pastes
 * into a comment and what GIPHY takes; an MP4 is what a feed, a story and a
 * reel want, it carries no 256-colour palette so gradients and a logo stay
 * clean, and it is several times smaller.
 *
 * yuv420p and +faststart are not optional: without the pixel format Safari and
 * most Android players show nothing at all, and without faststart the file has
 * to download completely before it starts.
 */
export async function encodeMp4(frames: Buffer[], fps: number): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");

  return withFrameDir(frames, async (pattern, run) => {
    const out = join(dirname(pattern), "out.mp4");
    // EVERY input first, then the codecs. ffmpeg reads options positionally:
    // a -c:v before the next -i is a request for a DECODER of that name, and
    // "Unknown decoder libx264" is what that mistake says out loud.
    await run([
      "-framerate", String(fps), "-i", pattern,
      // Silent, but with a track: some players and some upload validators
      // refuse a video that has no audio stream at all.
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-c:v", "libx264", "-preset", "slow", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-c:a", "aac", "-shortest",
      out,
    ]);
    return readFile(out);
  });
}

/** Compose and encode in one call — what the server fork uses. */
export async function renderGif(opts: ArGifOptions): Promise<Buffer> {
  const { frames, fps } = await renderArFrames(opts);
  return encodeGif(frames, fps);
}

/**
 * One composition, both formats.
 *
 * The frames are the expensive part — every one is a full sharp composite — so
 * they are built once and handed to both encoders rather than rendering the
 * same loop twice.
 */
export async function renderLoop(
  opts: ArGifOptions,
  gifWidth = 960,
): Promise<{ gif: Buffer; mp4: Buffer; width: number; height: number }> {
  const { frames, fps, width, height } = await renderArFrames(opts);
  const [gif, mp4] = await Promise.all([
    encodeGif(frames, fps, width > gifWidth ? gifWidth : undefined),
    encodeMp4(frames, fps),
  ]);
  return { gif, mp4, width, height };
}
