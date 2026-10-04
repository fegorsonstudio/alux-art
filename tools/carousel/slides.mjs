/**
 * The slide renderer.
 *
 * Draws the card design the account already uses, read off the 18 August post:
 * near-black green ground, mint rule above the headline, white bold headline,
 * grey body, corner brackets, the site in the footer, a page counter, and a
 * mint button on the closing card. Nothing here is invented — it is that deck,
 * made repeatable.
 *
 * Photographs are NOT cards. A before or an after fills the frame and carries
 * only its small pill, because slide one is the thumbnail and a text card there
 * is what separated a 20,907-reach post from a 102-reach one.
 */
import sharp from "sharp";

export const INK = "#06150f";
export const GROUND = "#0b2018";
export const MINT = "#43ccb2";
export const PAPER = "#ffffff";
export const MUTED = "#a9c4ba";

// 4:5 is the tallest Instagram allows in feed, so it takes the most screen.
export const W = 1080;
export const H = 1350;

const FONT = "Outfit, 'Segoe UI', Roboto, Arial, sans-serif, 'Noto Color Emoji'";
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Wrap text to a width, measured rather than counted.
 *
 * Counting characters puts "WWW" and "III" on the same line, and the GIF
 * renderer has been bitten by that three times. These are eyeballed advances
 * for a heavy grotesque; they only have to rank a wide line above a narrow one.
 */
const EM = {
  I: 0.30, J: 0.46, L: 0.52, T: 0.56, F: 0.54, E: 0.56,
  M: 0.88, W: 0.92, O: 0.76, Q: 0.79, G: 0.76, D: 0.73, C: 0.71,
  N: 0.75, U: 0.73, H: 0.75, A: 0.69, R: 0.69, B: 0.68, K: 0.69,
  P: 0.64, S: 0.65, V: 0.69, X: 0.67, Y: 0.64, Z: 0.61,
  " ": 0.28, ".": 0.29, ",": 0.29, "!": 0.31, "?": 0.55, "'": 0.22, "-": 0.36,
};
const widthEm = (t) => [...String(t)].reduce((w, c) => {
  const u = c.toUpperCase();
  if (/[0-9]/.test(c)) return w + 0.70;              // figures are tabular and wide
  return w + (EM[u] ?? (c === c.toUpperCase() && /[A-Z]/.test(u) ? 0.70 : 0.52));
}, 0);

function wrap(text, maxEm) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (widthEm(next) > maxEm && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The frame every card shares: ground, corner brackets, footer, page number. */
function chrome({ index, total, site = "aluxartandframes.shop" }) {
  const m = 54;            // margin
  const b = 46;            // bracket arm length
  const arm = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MINT}" stroke-opacity="0.45" stroke-width="3"/>`;
  return `
    <rect width="${W}" height="${H}" fill="${GROUND}"/>
    <!-- a faint lift from the centre so the ground is not a flat slab -->
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

/**
 * A text card: eyebrow, headline, body.
 *
 * The headline sizes itself to the words rather than taking a fixed size, so a
 * three-word hook fills the card and a long one still fits.
 */
export async function textCard({ eyebrow, headline, body, index, total, cta, site }) {
  const m = 90;
  const inner = W - m * 2;
  const lines = wrap(headline, 11.5);
  const widest = Math.max(...lines.map(widthEm), 0.1);
  const size = Math.min(Math.round(inner / widest), 108);
  const lead = Math.round(size * 1.08);

  let y = 300;
  let svg = chrome({ index, total, site });

  // The headline's ascender reaches about three quarters of its size above the
  // baseline, so at 108px it climbs to y-81. The eyebrow sat at y-54 and was
  // struck through by it.
  if (eyebrow) {
    svg += `<text x="${m}" y="${y - 104}" font-family="${FONT}" font-size="24" font-weight="700"
      fill="${MINT}" letter-spacing="0.18em">${esc(eyebrow.toUpperCase())}</text>`;
  }
  svg += `<rect x="${m}" y="${y - (eyebrow ? 170 : 150)}" width="64" height="4" fill="${MINT}"/>`;

  lines.forEach((l, i) => {
    svg += `<text x="${m}" y="${y + i * lead}" font-family="${FONT}" font-size="${size}"
      font-weight="800" fill="${PAPER}" letter-spacing="-0.02em">${esc(l)}</text>`;
  });
  y += lines.length * lead + 28;

  if (body) {
    const bs = 34;
    for (const l of wrap(body, 30)) {
      svg += `<text x="${m}" y="${y}" font-family="${FONT}" font-size="${bs}"
        fill="${MUTED}">${esc(l)}</text>`;
      y += Math.round(bs * 1.45);
    }
  }

  if (cta) {
    const bw = Math.round(widthEm(cta) * 30) + 80;
    svg += `
      <rect x="${m}" y="${y + 40}" width="${bw}" height="78" rx="12" fill="${MINT}"/>
      <text x="${m + bw / 2}" y="${y + 92}" text-anchor="middle" font-family="${FONT}"
        font-size="32" font-weight="800" fill="${INK}">${esc(cta)}</text>`;
  }

  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`))
    .jpeg({ quality: 92 }).toBuffer();
}

/**
 * A photograph slide: the picture fills the frame, with one small pill.
 *
 * `cover` here, deliberately and unlike the product renderer: a feed slide that
 * letterboxes wastes the only space it has, and these are the studio's own
 * marketing rather than a customer's paid file.
 */
export async function photoCard({ file, pill }) {
  const photo = await sharp(file).rotate().resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
  if (!pill) return sharp(photo).jpeg({ quality: 92 }).toBuffer();

  const label = String(pill).toUpperCase();
  const pw = Math.round(widthEm(label) * 26) + 56;
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
 * This card holds a Sabri Suby title, which runs to five and six lines where
 * the old hooks ran to two. So the headline is laid out first and the
 * photographs take whatever height is left, never the other way round: with a
 * fixed photo height, 43 of the 44 covers pushed the pair past the bottom edge
 * of the card, the worst by 145px.
 *
 * Two bounds keep that from coming back however long a future headline is.
 * HEAD_MAX caps what the type may take, shrinking it to fit rather than growing
 * the block; and the photo height is clamped to the gap above the footer.
 */
export async function pairCard({ before, after, headline, body, index, total, site }) {
  const m = 90;
  const FOOT = 150;        // keep-out strip for the site and the page number
  const HEAD_TOP = 230;    // first baseline, just under the mint rule
  const HEAD_MAX = 520;    // the headline may not take more of the card than this

  const lines = wrap(headline, 11.5);
  let size = Math.min(Math.round((W - m * 2) / Math.max(...lines.map(widthEm), 0.1)), 96);
  let lead = Math.round(size * 1.08);
  if (lines.length * lead > HEAD_MAX) {
    lead = Math.floor(HEAD_MAX / lines.length);
    size = Math.round(lead / 1.08);
  }

  const lastBaseline = HEAD_TOP + (lines.length - 1) * lead;
  const textBottom = lastBaseline + (body ? 74 : 40);

  const gw = Math.round((W - m * 2 - 16) / 2);
  const gh = Math.min(Math.round(gw * 1.25), H - FOOT - (textBottom + 30));
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
    svg += `<text x="${m}" y="${HEAD_TOP + i * lead}" font-family="${FONT}" font-size="${size}"
      font-weight="800" fill="${PAPER}" letter-spacing="-0.02em">${esc(l)}</text>`;
  });
  if (body) {
    svg += `<text x="${m}" y="${lastBaseline + 58}" font-family="${FONT}" font-size="30" fill="${MUTED}">${esc(body)}</text>`;
  }

  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`))
    .composite([
      { input: b, left: m, top: imgTop },
      { input: a, left: m + gw + 16, top: imgTop },
    ])
    .jpeg({ quality: 92 }).toBuffer();
}
