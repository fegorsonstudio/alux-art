import "server-only";
import sharp from "sharp";

/**
 * Alux Micro Drama covers: 2:3 posters for the game page's shelves.
 *
 * Until a story has cover art, its poster is pure typography in the genre's
 * look (tools/drama/ENGINE.md §7) — the style of a good book jacket, not a
 * placeholder. When art exists (drama_stories.cover_path) it fills the frame
 * and the type sits over a dark fade.
 *
 * Text is MEASURED by drawing it (same method as lib/carousel/render.ts), so a
 * long title shrinks to fit instead of running off the poster in any font.
 * Fonts: deploy/fonts (Outfit + the four drama faces), installed on the server
 * by deploy/install-fonts.sh.
 */

export const COVER_W = 1000;
export const COVER_H = 1500;

type Look = {
  bg: [string, string]; ink: string; accent: string; muted: string;
  titleFont: string; titleWeight: number; titleCase: "upper" | "as-is"; titleTrack: number;
  subFont: string; motif: "slit" | "bands" | "arch" | "moon" | "rule" | "tab" | "curve" | "diagonal";
  light?: boolean;
};

const OUTFIT = "Outfit, 'DejaVu Sans', sans-serif";
const LOOKS: Record<string, Look> = {
  power:     { bg: ["#07090a", "#1a2427"], ink: "#f4f1ea", accent: "#55cdbc", muted: "#9fb3b5", titleFont: "Bodoni Moda", titleWeight: 600, titleCase: "upper", titleTrack: 0.02, subFont: "Cormorant Garamond", motif: "slit" },
  political: { bg: ["#0c1013", "#262e33"], ink: "#eef2f3", accent: "#c4423a", muted: "#a2adb2", titleFont: "Bodoni Moda", titleWeight: 600, titleCase: "upper", titleTrack: 0.02, subFont: "Oswald", motif: "tab" },
  thriller:  { bg: ["#0d0405", "#3b0a0e"], ink: "#fbecec", accent: "#e0383f", muted: "#c79b9d", titleFont: "Oswald", titleWeight: 600, titleCase: "upper", titleTrack: 0.04, subFont: "Oswald", motif: "bands" },
  crime:     { bg: ["#0d0405", "#3b0a0e"], ink: "#fbecec", accent: "#e0383f", muted: "#c79b9d", titleFont: "Oswald", titleWeight: 600, titleCase: "upper", titleTrack: 0.04, subFont: "Oswald", motif: "bands" },
  family:    { bg: ["#140e07", "#3d2b16"], ink: "#f6ead3", accent: "#d4ac62", muted: "#bba88a", titleFont: "Cormorant Garamond", titleWeight: 600, titleCase: "upper", titleTrack: 0.08, subFont: "Cormorant Garamond", motif: "arch" },
  mystery:   { bg: ["#050a14", "#14243b"], ink: "#e8f0fa", accent: "#a9cdf0", muted: "#8ea6c2", titleFont: "Cormorant Garamond", titleWeight: 500, titleCase: "upper", titleTrack: 0.18, subFont: "Cormorant Garamond", motif: "moon" },
  supernatural: { bg: ["#050a14", "#14243b"], ink: "#e8f0fa", accent: "#a9cdf0", muted: "#8ea6c2", titleFont: "Cormorant Garamond", titleWeight: 500, titleCase: "upper", titleTrack: 0.18, subFont: "Cormorant Garamond", motif: "moon" },
  romance:   { bg: ["#12080b", "#3c1b24"], ink: "#fbefe6", accent: "#ecc9a0", muted: "#c9a596", titleFont: "Pinyon Script", titleWeight: 400, titleCase: "as-is", titleTrack: 0, subFont: "Cormorant Garamond", motif: "curve" },
  romcom:    { bg: ["#fff6ea", "#ffe0cc"], ink: "#2a1f22", accent: "#d9506f", muted: "#7a5d60", titleFont: "Pinyon Script", titleWeight: 400, titleCase: "as-is", titleTrack: 0, subFont: "Oswald", motif: "diagonal", light: true },
  period:    { bg: ["#efe2c6", "#d4bb8e"], ink: "#2a180e", accent: "#b23a24", muted: "#6c5038", titleFont: "Oswald", titleWeight: 700, titleCase: "upper", titleTrack: 0.02, subFont: "Pinyon Script", motif: "rule", light: true },
};
export const lookOf = (genre: string): Look => LOOKS[genre] ?? LOOKS.power;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fam = (f: string) => `'${f}', ${OUTFIT}`;

// ---- measuring -------------------------------------------------------------
const PROBE = 100;
const widthCache = new Map<string, number>();

/** Drawn width (px) of one line at font-size PROBE. */
async function inkWidth(text: string, font: string, weight: number, track: number): Promise<number> {
  const key = `${font}|${weight}|${track}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  if (widthCache.size > 5000) widthCache.clear();
  const w = Math.ceil([...text].length * PROBE * (1.3 + track) + PROBE * 4);
  const h = PROBE * 3;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#fff"/>
    <text x="${PROBE * 2}" y="${PROBE * 2}" font-family="${esc(fam(font))}" font-size="${PROBE}" font-weight="${weight}"
      letter-spacing="${track}em" fill="#000">${esc(text)}</text></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let min = info.width, max = -1;
  for (let y = 0; y < info.height; y++) {
    const off = y * info.width;
    for (let x = 0; x < min; x++) if (data[off + x] < 245) { min = x; break; }
    for (let x = info.width - 1; x > max; x--) if (data[off + x] < 245) { max = x; break; }
  }
  const out = max >= min ? max - min + 1 : 0;
  widthCache.set(key, out);
  return out;
}

/** Break a title into at most `maxLines` lines and the largest size that fits `maxW`. */
async function fitTitle(text: string, look: Look, maxW: number, maxSize: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  // Try every way of cutting the words into 1..maxLines lines; keep the biggest size.
  let best = { lines: [text], size: 0 };
  const cuts = (n: number, k: number): number[][] => {
    if (k === 1) return [[n]];
    const out: number[][] = [];
    for (let i = 1; i <= n - k + 1; i++) for (const rest of cuts(n - i, k - 1)) out.push([i, ...rest]);
    return out;
  };
  for (let k = 1; k <= Math.min(maxLines, words.length); k++) {
    for (const parts of cuts(words.length, k)) {
      let at = 0;
      const lines = parts.map((p) => { const l = words.slice(at, at + p).join(" "); at += p; return l; });
      let widest = 0;
      for (const l of lines) widest = Math.max(widest, await inkWidth(l, look.titleFont, look.titleWeight, look.titleTrack));
      const size = Math.min(maxSize, Math.floor((maxW / Math.max(1, widest)) * PROBE));
      // Prefer fewer lines unless more lines make the title clearly bigger.
      if (size > best.size * 1.12 || (best.size === 0)) best = { lines, size };
    }
  }
  return best;
}

function motif(look: Look): string {
  const a = look.accent;
  switch (look.motif) {
    case "slit": return `<rect x="${COVER_W / 2 - 1}" y="150" width="2" height="560" fill="${a}" opacity="0.55"/>
      <rect x="${COVER_W / 2 - 60}" y="430" width="120" height="1" fill="${a}" opacity="0.35"/>`;
    case "bands": return `<rect x="0" y="380" width="${COVER_W}" height="14" fill="${a}" opacity="0.85"/>
      <rect x="0" y="410" width="${COVER_W}" height="4" fill="${a}" opacity="0.45"/>
      <circle cx="300" cy="560" r="46" fill="none" stroke="${a}" stroke-width="2" opacity="0.5"/>
      <circle cx="700" cy="560" r="46" fill="none" stroke="${a}" stroke-width="2" opacity="0.5"/>`;
    case "arch": return `<path d="M290 760 L290 420 A210 210 0 0 1 710 420 L710 760" fill="none" stroke="${a}" stroke-width="2" opacity="0.6"/>
      <path d="M330 760 L330 430 A170 170 0 0 1 670 430 L670 760" fill="none" stroke="${a}" stroke-width="1" opacity="0.35"/>`;
    case "moon": return `<circle cx="${COVER_W / 2}" cy="430" r="190" fill="${a}" opacity="0.10"/>
      <circle cx="${COVER_W / 2}" cy="430" r="150" fill="none" stroke="${a}" stroke-width="1.5" opacity="0.55"/>
      <rect x="120" y="700" width="${COVER_W - 240}" height="1" fill="${a}" opacity="0.4"/>`;
    case "rule": return `<rect x="120" y="300" width="${COVER_W - 240}" height="6" fill="${a}"/>
      <rect x="120" y="316" width="${COVER_W - 240}" height="2" fill="${a}"/>
      <circle cx="${COVER_W / 2}" cy="520" r="120" fill="none" stroke="${look.ink}" stroke-width="2" opacity="0.25"/>`;
    case "tab": return `<rect x="300" y="300" width="400" height="300" rx="6" fill="${a}" opacity="0.9"/>
      <rect x="300" y="270" width="150" height="40" rx="6" fill="${a}" opacity="0.9"/>
      <rect x="340" y="350" width="320" height="3" fill="#000" opacity="0.25"/>
      <rect x="340" y="380" width="240" height="3" fill="#000" opacity="0.25"/>`;
    case "curve": return `<path d="M140 620 C 360 300, 640 300, 860 620" fill="none" stroke="${a}" stroke-width="1.5" opacity="0.6"/>
      <circle cx="${COVER_W / 2}" cy="380" r="4" fill="${a}" opacity="0.9"/>`;
    case "diagonal": return `<rect x="-200" y="430" width="${COVER_W + 400}" height="120" fill="${a}" opacity="0.14" transform="rotate(-12 500 490)"/>
      <rect x="-200" y="470" width="${COVER_W + 400}" height="6" fill="${a}" opacity="0.6" transform="rotate(-12 500 490)"/>`;
  }
}

/**
 * The motifs are drawn in a nominal box (y 150–760). A three-line title starts
 * higher than that box ends, so the box is scaled into the space between the
 * header and the title — the decoration never touches a letter.
 */
function motifAbove(look: Look, titleTop: number): string {
  const top = 175, bottom = titleTop - 45;
  const s = Math.max(0.35, Math.min(1, (bottom - top) / 610));
  return `<g transform="translate(${(COVER_W / 2) * (1 - s)} ${top - 150 * s}) scale(${s})">${motif(look)}</g>`;
}

export type CoverInput = {
  title: string; tagline: string; genre: string; city: string;
  badge: string;            // e.g. "COMING SOON" or "NOW SHOWING · EPISODE 1"
  art?: Buffer | null;      // cover art, if made
};

/** The poster as a JPEG at COVER_W×COVER_H. */
export async function renderCover(c: CoverInput): Promise<Buffer> {
  const look = lookOf(c.genre);
  const title = look.titleCase === "upper" ? c.title.toUpperCase() : c.title;
  const isScript = look.titleFont === "Pinyon Script";
  const fit = await fitTitle(title, look, COVER_W - 220, isScript ? 230 : 150, 3);
  const lineH = Math.round(fit.size * (isScript ? 1.05 : 1.08));
  const blockH = lineH * fit.lines.length;
  const titleTop = 1010 - blockH; // the title's block ends just above the tagline
  const ink = c.art ? "#ffffff" : look.ink;
  const muted = c.art ? "rgba(255,255,255,0.78)" : look.muted;

  const titleSvg = fit.lines.map((l, i) =>
    `<text x="${COVER_W / 2}" y="${titleTop + lineH * (i + 1) - Math.round(lineH * 0.22)}" text-anchor="middle"
      font-family="${esc(fam(look.titleFont))}" font-size="${fit.size}" font-weight="${look.titleWeight}"
      letter-spacing="${look.titleTrack}em" fill="${ink}">${esc(l)}</text>`).join("");

  const genreLabel = c.genre === "romcom" ? "Romantic comedy" : c.genre[0].toUpperCase() + c.genre.slice(1);
  const svg = `<svg width="${COVER_W}" height="${COVER_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${look.bg[0]}"/><stop offset="1" stop-color="${look.bg[1]}"/></linearGradient>
      <radialGradient id="v" cx="0.5" cy="0.42" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${look.light ? 0.22 : 0.55}"/></radialGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.88"/></linearGradient>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    </defs>
    ${c.art ? `<rect width="${COVER_W}" height="${COVER_H}" fill="url(#fade)"/>` : `<rect width="${COVER_W}" height="${COVER_H}" fill="url(#g)"/>${motifAbove(look, titleTop)}<rect width="${COVER_W}" height="${COVER_H}" fill="url(#v)"/>`}
    <rect width="${COVER_W}" height="${COVER_H}" filter="url(#grain)" opacity="${look.light ? 0.10 : 0.07}"/>
    <rect x="36" y="36" width="${COVER_W - 72}" height="${COVER_H - 72}" fill="none" stroke="${c.art ? "#ffffff" : look.accent}" stroke-opacity="0.32" stroke-width="1.5"/>
    <text x="${COVER_W / 2}" y="104" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="21" font-weight="600" letter-spacing="0.34em" fill="${c.art ? "#ffffff" : look.accent}">ALUX MICRO DRAMA</text>
    <text x="${COVER_W / 2}" y="140" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="19" font-weight="400" letter-spacing="0.22em" fill="${muted}">${esc(`${c.city} · ${genreLabel}`.toUpperCase())}</text>
    ${titleSvg}
    <text x="${COVER_W / 2}" y="1080" text-anchor="middle" font-family="${esc(fam(look.subFont === "Pinyon Script" ? "Cormorant Garamond" : look.subFont))}" font-size="${look.subFont === "Oswald" ? 30 : 38}" font-weight="${look.subFont === "Oswald" ? 400 : 500}" letter-spacing="${look.subFont === "Oswald" ? "0.12em" : "0.02em"}" fill="${muted}">${esc(look.subFont === "Oswald" ? c.tagline.toUpperCase() : c.tagline)}</text>
    <rect x="${COVER_W / 2 - 30}" y="1128" width="60" height="1.5" fill="${c.art ? "#ffffff" : look.accent}" opacity="0.7"/>
    <text x="${COVER_W / 2}" y="${COVER_H - 92}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="20" font-weight="600" letter-spacing="0.28em" fill="${c.art ? "#ffffff" : look.accent}">${esc(c.badge.toUpperCase())}</text>
  </svg>`;

  const overlay = Buffer.from(svg);
  if (c.art) {
    return sharp(c.art).rotate().resize(COVER_W, COVER_H, { fit: "cover", position: "attention" })
      .composite([{ input: overlay }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }
  return sharp(overlay).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
