import sharp from "sharp";

/**
 * The carousel slide renderer — the laptop studio's slides.mjs (retired
 * 2026-10-06), moved onto the server.
 *
 * Same deck, same geometry: near-black green ground, mint rule above the
 * headline, white bold headline, grey body, corner brackets, the site in the
 * footer, a page counter, and a mint button on the closing card. Photographs
 * are not cards — a before or an after fills the frame and carries only its
 * small pill, because slide one is the thumbnail and a text card there is what
 * separated a 20,907-reach post from a 102-reach one.
 *
 * One thing changes, and it is the reason this is not a copy. The laptop wraps
 * and sizes text from a table of guessed letter widths, tuned for the fonts a
 * Windows laptop has. The server draws in Outfit (deploy/fonts), which is
 * narrower, so those guesses left long headlines filling about 70% of the
 * card. Here every line is MEASURED by drawing it — the method the GIF Maker
 * settled on in lib/gif-loop.ts after its guesses cut letters off customers'
 * files three times — so the type fills the card in whatever font the server
 * actually has, and can never run past it.
 */

export const INK = "#06150f";
export const GROUND = "#0b2018";
export const MINT = "#43ccb2";
export const PAPER = "#ffffff";
export const MUTED = "#a9c4ba";

// 4:5 is the tallest Instagram allows in feed, so it takes the most screen.
export const W = 1080;
export const H = 1350;

/**
 * Outfit is what the server has. The rest of the stack is the laptop's, and
 * the emoji font comes last so it only ever draws what nothing before it can
 * (see lib/gif-loop.ts for what happens when it does not).
 */
const FONT = "Outfit, 'Segoe UI', Roboto, Arial, sans-serif, 'Noto Color Emoji'";
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Headlines are set tight, as on the account's own deck. */
const HEAD_WEIGHT = 800;
const HEAD_TRACK = -0.02;

// ---- measuring -------------------------------------------------------------

/** Text is measured at this size; widths scale linearly to any other. */
const PROBE = 60;
/** One measured line per band of this height: room for accents and descenders. */
const ROW = PROBE * 2;
/** Pixels per measuring drawing, so a batch of long lines cannot balloon memory. */
const MAX_PROBE_PIXELS = 6_000_000;
const inkCache = new Map<string, number>();
const keyOf = (text: string, weight: number, tracking: number) => `${weight}|${tracking}|${text}`;

/**
 * Measure the drawn width of many texts at once, at font-size PROBE.
 *
 * Each text is drawn and its ink measured, so the numbers agree with the
 * renderer by construction: it IS the renderer. Width scales with size for a
 * fixed face and tracking, so one measurement serves every size.
 *
 * Batched because the drawing is the cost: every drawing pays the same setup
 * whether it holds one word or thirty, and measuring a post one word per
 * drawing took 12 to 15 seconds on the server. So texts are drawn one per row,
 * a batch to a drawing, and each row's ink is read back from the pixels.
 */
async function measure(texts: string[], weight: number, tracking = 0): Promise<void> {
  // A few thousand distinct words and lines covers every post there is; the
  // ceiling only stops a long-running server growing this without bound.
  if (inkCache.size > 20_000) inkCache.clear();
  const todo = [...new Set(texts.filter((t) => t && t.trim()))]
    .filter((t) => !inkCache.has(keyOf(t, weight, tracking)))
    // Similar lengths share a drawing, so the canvas stays narrow.
    .sort((a, b) => [...a].length - [...b].length);

  let i = 0;
  while (i < todo.length) {
    // Wide enough for the widest capitals with room either side: a line that
    // overflowed its probe would measure short and come out too big.
    const widthFor = (t: string) => Math.ceil([...t].length * PROBE * (1.05 + Math.abs(tracking)) + PROBE * 4);
    let end = i + 1;
    while (end < todo.length && widthFor(todo[end]) * ROW * (end - i + 1) <= MAX_PROBE_PIXELS) end++;
    const chunk = todo.slice(i, end);
    i = end;

    const w = widthFor(chunk[chunk.length - 1]);
    const h = ROW * chunk.length;
    const rows = chunk.map((t, r) =>
      `<text x="${PROBE}" y="${r * ROW + Math.round(PROBE * 1.35)}" font-family="${FONT}" font-size="${PROBE}"
        font-weight="${weight}" fill="#000" letter-spacing="${tracking}em">${esc(t)}</text>`).join("");
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="#fff"/>${rows}</svg>`;
    const { data, info } = await sharp(Buffer.from(svg)).extractChannel(0).raw()
      .toBuffer({ resolveWithObject: true });

    // Ink is anything 10 levels darker than the white ground — the same line
    // sharp's trim() draws, which is what lib/gif-loop.ts measures with.
    const stride = info.width * info.channels;
    for (let r = 0; r < chunk.length; r++) {
      let min = info.width;
      let max = -1;
      for (let y = r * ROW; y < (r + 1) * ROW; y++) {
        const off = y * stride;
        for (let x = 0; x < min; x++) if (data[off + x * info.channels] < 245) { min = x; break; }
        for (let x = info.width - 1; x > max; x--) if (data[off + x * info.channels] < 245) { max = x; break; }
      }
      inkCache.set(keyOf(chunk[r], weight, tracking), max >= min ? max - min + 1 : 0);
    }
  }
}

/** The drawn width of one text at font-size PROBE; 0 if it draws nothing. */
async function inkWidth(text: string, weight: number, tracking = 0): Promise<number> {
  await measure([text], weight, tracking);
  return inkCache.get(keyOf(text, weight, tracking)) ?? 0;
}

/** The space between two words as drawn, bearings included. */
async function wordGap(weight: number, tracking: number): Promise<number> {
  await measure(["n n", "n"], weight, tracking);
  const pair = inkCache.get(keyOf("n n", weight, tracking)) ?? 0;
  const one = inkCache.get(keyOf("n", weight, tracking)) ?? 0;
  return Math.max(0, pair - one * 2);
}

const wordsOf = (text: string | null | undefined) => String(text ?? "").trim().split(/\s+/).filter(Boolean);

/**
 * Break text into lines no wider than `maxPx` at `size`.
 *
 * Words are measured once each and summed, which is fast; it can be a pixel
 * or two out at a word boundary, which is why every caller checks or fits the
 * finished lines exactly.
 */
async function wrap(text: string, size: number, weight: number, tracking: number, maxPx: number): Promise<string[]> {
  const words = wordsOf(text);
  if (!words.length) return [];
  const scale = size / PROBE;
  await measure(words, weight, tracking);
  const widths = words.map((w) => inkCache.get(keyOf(w, weight, tracking)) ?? 0);
  const gap = (await wordGap(weight, tracking)) * scale;

  const lines: string[] = [];
  let line: string[] = [];
  let lineW = 0;
  words.forEach((word, i) => {
    const wpx = widths[i] * scale;
    if (line.length && lineW + gap + wpx > maxPx) {
      lines.push(line.join(" "));
      line = [word];
      lineW = wpx;
    } else {
      lineW += line.length ? gap + wpx : wpx;
      line.push(word);
    }
  });
  if (line.length) lines.push(line.join(" "));
  return lines;
}

/** Wrap at a fixed size, then prove every line fits; tighten and retry if one does not. */
async function wrapToFit(text: string, size: number, weight: number, tracking: number, maxPx: number): Promise<string[]> {
  let budget = maxPx;
  let lines: string[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    lines = await wrap(text, size, weight, tracking, budget);
    await measure(lines, weight, tracking);
    const inks = lines.map((l) => inkCache.get(keyOf(l, weight, tracking)) ?? 0);
    if (Math.max(0, ...inks) * (size / PROBE) <= maxPx) return lines;
    budget *= 0.95;
  }
  return lines;
}

/**
 * The largest size at which every one of `lines` fits inside `maxPx`.
 * Exact: the finished lines themselves are measured, not their words.
 */
async function fitSize(lines: string[], weight: number, tracking: number, maxPx: number): Promise<number> {
  await measure(lines, weight, tracking);
  let size = Number.POSITIVE_INFINITY;
  for (const l of lines) {
    const ink = inkCache.get(keyOf(l, weight, tracking)) ?? 0;
    if (ink) size = Math.min(size, Math.floor((maxPx * PROBE) / ink));
  }
  return Number.isFinite(size) ? size : 96;
}

/** Narrow to wide: a short headline tries the narrow wraps, set large, first. */
const WRAPS_EM = [7.5, 9, 10, 11.5];

/** The candidate wraps of a headline, with every candidate line measured in one go. */
async function headlineWraps(headline: string | null | undefined): Promise<string[][]> {
  const wraps: string[][] = [];
  for (const em of WRAPS_EM) wraps.push(await wrap(headline ?? "", PROBE, HEAD_WEIGHT, HEAD_TRACK, em * PROBE));
  await measure(wraps.flat(), HEAD_WEIGHT, HEAD_TRACK);
  return wraps;
}

// ---- the frame -------------------------------------------------------------

/** The frame every card shares: ground, corner brackets, footer, page number. */
function chrome({ index, total, site = "aluxartandframes.shop" }: { index?: number; total?: number; site?: string }) {
  const m = 54;            // margin
  const b = 46;            // bracket arm length
  const arm = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MINT}" stroke-opacity="0.45" stroke-width="3"/>`;
  return `
    <rect width="${W}" height="${H}" fill="${GROUND}"/>
    <radialGradient id="g" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#12352a"/>
      <stop offset="100%" stop-color="${GROUND}"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    ${arm(m, m, m + b, m)}${arm(m, m, m, m + b)}
    ${arm(W - m - b, m, W - m, m)}${arm(W - m, m, W - m, m + b)}
    ${arm(m, H - m, m + b, H - m)}${arm(m, H - m - b, m, H - m)}
    ${arm(W - m - b, H - m, W - m, H - m)}${arm(W - m, H - m - b, W - m, H - m)}
    <text x="${m}" y="${H - m - 8}" font-family="${FONT}" font-size="22"
      fill="${MUTED}" fill-opacity="0.75">${esc(site)}</text>
    ${total ? `<text x="${W - m}" y="${H - m - 8}" text-anchor="end" font-family="${FONT}"
      font-size="22" fill="${MUTED}" fill-opacity="0.75">${index}/${total}</text>` : ""}`;
}

const toJpeg = (svg: string) =>
  sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`))
    .jpeg({ quality: 92 }).toBuffer();

// ---- text card -------------------------------------------------------------

/** Where a text card's words may sit: inside the corner brackets, clear of the footer. */
const AREA_TOP = 130;
const AREA_BOTTOM = 1200;
const INNER = W - 90 * 2;
/** A short line is set big, like a title card; never bigger than this. */
const HEADLINE_MAX = 124;
const HEADLINE_MAX_LINES = 4;
const BODY_SIZE = 34;
const BODY_STEP = Math.round(BODY_SIZE * 1.45);

export type TextParts = { eyebrow?: string | null; headline?: string | null; body?: string | null; cta?: string | null };

/**
 * Lay out a text card without drawing it.
 *
 * SIZE: narrower wraps are tried first, so a short headline breaks into two or
 * three lines set large; the biggest size that keeps it to four lines and
 * leaves room for everything else wins. A long headline gets the wide wrap and
 * shrinks only if it would otherwise run past the footer.
 *
 * POSITION: the finished block sits in the space between the brackets,
 * slightly above centre — where the eye lands — not from a fixed line.
 */
export async function layoutText({ eyebrow, headline, body, cta }: TextParts) {
  const bodyLines = body ? await wrapToFit(body, BODY_SIZE, 400, 0, INNER) : [];
  const room = AREA_BOTTOM - AREA_TOP;

  const geometry = (lines: string[], size: number) => {
    const lead = Math.round(size * 1.08);
    const headTop = eyebrow ? 66 + 30 : 64;
    const first = headTop + Math.round(size * 0.76);
    const last = first + (lines.length - 1) * lead;
    const bodyFirst = last + Math.round(size * 0.3) + 66;
    const bodyLast = bodyFirst + (bodyLines.length - 1) * BODY_STEP;
    const afterText = bodyLines.length ? bodyLast : last + Math.round(size * 0.3);
    const buttonTop = cta ? afterText + 52 : null;
    const height = cta ? (buttonTop as number) + 78 : afterText + (bodyLines.length ? 12 : 0);
    return { lead, first, bodyFirst, buttonTop, height };
  };

  // Wrap widths in the units the laptop used (em at the probe size). Measured
  // widths for Outfit sit close to those guesses, so the four candidates give
  // the same choice of two-, three- and four-line settings.
  const wraps = await headlineWraps(headline);
  let best: { lines: string[]; size: number; g: ReturnType<typeof geometry> } | null = null;
  for (const lines of wraps) {
    const size = Math.min(HEADLINE_MAX, await fitSize(lines, HEAD_WEIGHT, HEAD_TRACK, INNER));
    const g = geometry(lines, size);
    if (lines.length <= HEADLINE_MAX_LINES && g.height <= room && (!best || size > best.size)) {
      best = { lines, size, g };
    }
  }
  if (!best) {
    // A long headline: the wide wrap, shrunk step by step until it fits.
    const lines = wraps[wraps.length - 1];
    let size = Math.min(108, await fitSize(lines, HEAD_WEIGHT, HEAD_TRACK, INNER));
    let g = geometry(lines, size);
    while (g.height > room && size > 40) { size = Math.floor(size * 0.94); g = geometry(lines, size); }
    best = { lines, size, g };
  }

  const top = AREA_TOP + Math.max(0, Math.round((room - best.g.height) * 0.42));
  return { top, lines: best.lines, size: best.size, ...best.g, bodyLines };
}

/** A text card: eyebrow, headline, body, and on the last card a button. */
export async function textCard(
  { eyebrow, headline, body, index, total, cta, site }: TextParts & { index?: number; total?: number; site?: string },
): Promise<Buffer> {
  const m = 90;
  const L = await layoutText({ eyebrow, headline, body, cta });
  let svg = chrome({ index, total, site });

  svg += `<rect x="${m}" y="${L.top}" width="64" height="4" fill="${MINT}"/>`;
  if (eyebrow) {
    svg += `<text x="${m}" y="${L.top + 66}" font-family="${FONT}" font-size="24" font-weight="700"
      fill="${MINT}" letter-spacing="0.18em">${esc(eyebrow.toUpperCase())}</text>`;
  }
  L.lines.forEach((l, i) => {
    svg += `<text x="${m}" y="${L.top + L.first + i * L.lead}" font-family="${FONT}" font-size="${L.size}"
      font-weight="${HEAD_WEIGHT}" fill="${PAPER}" letter-spacing="${HEAD_TRACK}em">${esc(l)}</text>`;
  });
  L.bodyLines.forEach((l, i) => {
    svg += `<text x="${m}" y="${L.top + L.bodyFirst + i * BODY_STEP}" font-family="${FONT}" font-size="${BODY_SIZE}"
      fill="${MUTED}">${esc(l)}</text>`;
  });
  if (cta && L.buttonTop != null) {
    const bw = Math.round((await inkWidth(cta, 800)) * (32 / PROBE)) + 80;
    const y = L.top + L.buttonTop;
    svg += `
      <rect x="${m}" y="${y}" width="${bw}" height="78" rx="12" fill="${MINT}"/>
      <text x="${m + bw / 2}" y="${y + 52}" text-anchor="middle" font-family="${FONT}"
        font-size="32" font-weight="800" fill="${INK}">${esc(cta)}</text>`;
  }
  return toJpeg(svg);
}

// ---- photograph slides ------------------------------------------------------

/**
 * A photograph slide: the picture fills the frame, with one small pill.
 *
 * `cover`, deliberately: a feed slide that letterboxes wastes the only space
 * it has. A story picture from Google Flow is 3:4, so this trims about 6% off
 * its top and bottom — the prompts keep heads clear of that.
 */
export async function photoCard({ file, pill }: { file: Buffer; pill?: string | null }): Promise<Buffer> {
  const photo = await sharp(file).rotate().resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  if (!pill) return sharp(photo).jpeg({ quality: 92 }).toBuffer();

  const label = String(pill).toUpperCase();
  const pw = Math.round((await inkWidth(label, 800, 0.14)) * (26 / PROBE)) + 56;
  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="54" y="${H - 54 - 62}" width="${pw}" height="62" rx="31" fill="${INK}" fill-opacity="0.82"/>
    <text x="${54 + pw / 2}" y="${H - 54 - 20}" text-anchor="middle" font-family="${FONT}"
      font-size="26" font-weight="800" fill="${MINT}" letter-spacing="0.14em">${esc(label)}</text>
  </svg>`);
  return sharp(photo).composite([{ input: overlay }]).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Before and after side by side, carrying the cover headline.
 *
 * The cover holds a Sabri Suby title, five or six lines long, so the headline
 * is laid out first and the photographs take whatever height is left — never
 * the other way round. HEAD_MAX caps what the type may take, and the photo
 * height is clamped to the gap above the footer.
 */
export async function pairCard(
  { before, after, headline, body, index, total, site }:
  { before: Buffer; after: Buffer; headline?: string | null; body?: string | null; index?: number; total?: number; site?: string },
): Promise<Buffer> {
  const m = 90;
  const FOOT = 150;        // keep-out strip for the site and the page number
  const HEAD_TOP = 230;    // first baseline, just under the mint rule
  const HEAD_MAX = 520;    // the headline may not take more of the card than this
  const BODY = 30;
  const BODY_LEAD = 40;
  const gw = Math.round((W - m * 2 - 16) / 2);
  const fullPhoto = Math.round(gw * 1.25);
  /** The photographs are the proof; type never squeezes them below this. */
  const MIN_PHOTO = 480;

  // The laptop set this on one line and let a long one run off the card.
  const bodyLines = body ? await wrapToFit(body, BODY, 400, 0, W - m * 2) : [];

  const setting = async (lines: string[]) => {
    let size = Math.min(96, await fitSize(lines, HEAD_WEIGHT, HEAD_TRACK, W - m * 2));
    let lead = Math.round(size * 1.08);
    if (lines.length * lead > HEAD_MAX) {
      lead = Math.floor(HEAD_MAX / lines.length);
      size = Math.round(lead / 1.08);
    }
    // HEAD_TOP suits the usual cover size. Large type moves down with its own
    // height, or its capitals would touch the mint rule above.
    const first = Math.max(HEAD_TOP, HEAD_TOP - 46 + Math.round(size * 0.76));
    const lastBaseline = first + (lines.length - 1) * lead;
    const textBottom = lastBaseline + (bodyLines.length ? 74 + (bodyLines.length - 1) * BODY_LEAD : 40);
    return { lines, size, lead, first, lastBaseline, textBottom, photoRoom: H - FOOT - (textBottom + 30) };
  };

  // The laptop always took the widest wrap, which set a short cover small
  // with a hole under it. The narrower wraps are tried too and the biggest
  // type wins — as long as the photographs keep their height.
  const wraps = await headlineWraps(headline);
  let pick = await setting(wraps[wraps.length - 1]);
  for (const lines of wraps.slice(0, -1)) {
    const s = await setting(lines);
    if (s.photoRoom >= Math.min(MIN_PHOTO, fullPhoto) && s.size > pick.size) pick = s;
  }
  const { lines, size, lead, first, lastBaseline, textBottom } = pick;

  const gh = Math.max(120, Math.min(fullPhoto, H - FOOT - (textBottom + 30)));
  // Sit the pair against the footer when the headline is short, so a short
  // cover reads as composed rather than top-heavy with a hole underneath.
  const imgTop = Math.max(textBottom + 30, H - FOOT - gh);

  const [b, a] = await Promise.all([
    sharp(before).rotate().resize(gw, gh, { fit: "cover" }).toBuffer(),
    sharp(after).rotate().resize(gw, gh, { fit: "cover" }).toBuffer(),
  ]);

  let svg = chrome({ index, total, site });
  svg += `<rect x="${m}" y="${HEAD_TOP - 80}" width="64" height="4" fill="${MINT}"/>`;
  lines.forEach((l, i) => {
    svg += `<text x="${m}" y="${first + i * lead}" font-family="${FONT}" font-size="${size}"
      font-weight="${HEAD_WEIGHT}" fill="${PAPER}" letter-spacing="${HEAD_TRACK}em">${esc(l)}</text>`;
  });
  bodyLines.forEach((l, i) => {
    svg += `<text x="${m}" y="${lastBaseline + 58 + i * BODY_LEAD}" font-family="${FONT}" font-size="${BODY}"
      fill="${MUTED}">${esc(l)}</text>`;
  });

  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`))
    .composite([
      { input: b, left: m, top: imgTop },
      { input: a, left: m + gw + 16, top: imgTop },
    ])
    .jpeg({ quality: 92 }).toBuffer();
}

// ---- a whole post -----------------------------------------------------------

export type Card = { eyebrow?: string | null; headline?: string | null; body?: string | null };

export type SlidePost = {
  cards: Card[];
  /** The button on the closing card. */
  buttonText?: string | null;
  before?: Buffer | null;
  after?: Buffer | null;
  /** Which card each story picture follows (1-based), from the storyboard. */
  scenes?: { after: number }[];
  /** The story pictures, by scene; null where one is still to be made. */
  sceneImages?: (Buffer | null)[];
  site?: string;
};

/**
 * Every slide of a post, in posting order.
 *
 * Slide order is not the author's choice. A post opens on the before and the
 * after, because slide one is the thumbnail. Story pictures go in full-screen
 * and wordless straight after the card they illustrate; a missing one is
 * skipped, so a preview works while the owner is still making them — the
 * post's status is what stops it going out.
 */
export async function renderSlides(post: SlidePost): Promise<Buffer[]> {
  const slides: Buffer[] = [];
  const { before, after } = post;
  const cards = (post.cards ?? []).filter((c) => (c.headline ?? "").trim());
  const total = cards.length;
  const scenes = post.scenes ?? [];
  const sceneImages = post.sceneImages ?? [];

  // Every word in the post, measured up front in two drawings rather than
  // card by card.
  await Promise.all([
    measure(cards.flatMap((c) => wordsOf(c.headline)).concat(["n n", "n"]), HEAD_WEIGHT, HEAD_TRACK),
    measure(cards.flatMap((c) => wordsOf(c.body)).concat(["n n", "n"]), 400, 0),
  ]);

  if (before) slides.push(await photoCard({ file: before, pill: "Before" }));
  if (after) slides.push(await photoCard({ file: after, pill: "After" }));

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const common = { index: i + 1, total, site: post.site };
    if (i === 0 && before && after) {
      slides.push(await pairCard({ before, after, headline: c.headline, body: c.body, ...common }));
    } else {
      slides.push(await textCard({
        eyebrow: c.eyebrow, headline: c.headline, body: c.body,
        cta: i === cards.length - 1 ? (post.buttonText || null) : null,
        ...common,
      }));
    }
    for (let s = 0; s < scenes.length; s++) {
      const img = sceneImages[s];
      if (scenes[s].after === i + 1 && img) slides.push(await photoCard({ file: img }));
    }
  }
  return slides;
}
