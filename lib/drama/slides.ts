import "server-only";
import { CLOSES_TEXT } from "@/lib/drama/vote-rules";
import sharp from "sharp";
import { esc, fam, inkWidth, lookOf, motif, OUTFIT, type Look } from "./cover";

/**
 * An Alux Micro Drama episode as eight DESIGNED slides (4:5, 1080×1350) — the
 * way an episode goes out before its pictures exist (ENGINE.md, "Designed
 * episodes"). Same look as the story's cover: the genre's ground, grain,
 * vignette and type. Each slide is one beat: a small scene line where the eye
 * should be, then the caption, large. Every line is measured by drawing it
 * (cover.ts inkWidth), so nothing can run off a slide.
 */

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
const PROBE = 100; // inkWidth measures at font-size 100

export type DSlide = { kind: string; say: string; scene?: string; who?: string };
export type DEpisode = { n: number; title: string; slides: DSlide[]; choice: { question: string; options: { word: string; label: string }[] };
  /** The season's last episode: its vote picks how season two begins. */ finale?: boolean };
/** The line under the two words on the last slide. */
export const voteLine = (ep: Pick<DEpisode, "n" | "finale">) =>
  `Most votes by ${CLOSES_TEXT} tomorrow ${ep.finale ? "decides how season two begins" : `writes Episode ${ep.n + 1}`}.`;
export type SlideArt = { buffer: Buffer; captionAt: "top" | "bottom" };
export type DStory = { title: string; tagline: string; genre: string; city: string; minVotes: number; cast: { key: string; name: string; role: string }[] };

type Font = { font: string; weight: number; track: number };

async function widthAt(text: string, f: Font, size: number) {
  return ((await inkWidth(text, f.font, f.weight, f.track)) * size) / PROBE;
}

/** Greedy word wrap at a size, by measured widths. */
async function wrapAt(text: string, f: Font, size: number, maxW: number): Promise<string[]> {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || (await widthAt(t, f, size)) <= maxW) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The largest size from `max` down to `min` at which the text fits in `maxLines` lines. */
async function fit(text: string, f: Font, maxW: number, max: number, min: number, maxLines: number) {
  for (let size = max; size >= min; size -= 2) {
    const lines = await wrapAt(text, f, size, maxW);
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, await widthAt(l, f, size));
    if (lines.length <= maxLines && widest <= maxW) return { lines, size };
  }
  return { lines: await wrapAt(text, f, min, maxW), size: min };
}

const textLines = (lines: string[], x: number, firstBaseline: number, lineH: number, f: Font, size: number, fill: string, anchor = "middle") =>
  lines.map((l, i) => `<text x="${x}" y="${Math.round(firstBaseline + i * lineH)}" text-anchor="${anchor}" font-family="${esc(fam(f.font))}"
    font-size="${size}" font-weight="${f.weight}" letter-spacing="${f.track}em" fill="${fill}">${esc(l)}</text>`).join("");

/** The genre motif scaled into the band [top, bottom]; left out when the band is too thin to hold it. */
function motifInto(look: Look, band: { top: number; bottom: number }) {
  const h = band.bottom - band.top;
  if (h < 140) return "";
  const s = Math.min(1, h / 610);
  return `<g opacity="0.6" transform="translate(${(SLIDE_W / 2) * (1 - s) + (SLIDE_W - 1000) / 2 * s} ${band.top - 150 * s}) scale(${s})">${motif(look)}</g>`;
}

function ground(look: Look, opts: { page: number; total: number; footer: string; motifAbove?: { top: number; bottom: number } }) {
  const { page, total, footer } = opts;
  return `
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${look.bg[0]}"/><stop offset="1" stop-color="${look.bg[1]}"/></linearGradient>
      <radialGradient id="v" cx="0.5" cy="0.45" r="0.78"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${look.light ? 0.2 : 0.55}"/></radialGradient>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    </defs>
    <rect width="${SLIDE_W}" height="${SLIDE_H}" fill="url(#g)"/>
    ${opts.motifAbove ? motifInto(look, opts.motifAbove) : ""}
    <rect width="${SLIDE_W}" height="${SLIDE_H}" fill="url(#v)"/>
    <rect width="${SLIDE_W}" height="${SLIDE_H}" filter="url(#grain)" opacity="${look.light ? 0.1 : 0.07}"/>
    <rect x="40" y="40" width="${SLIDE_W - 80}" height="${SLIDE_H - 80}" fill="none" stroke="${look.accent}" stroke-opacity="0.28" stroke-width="1.5"/>
    <text x="84" y="104" font-family="${esc(OUTFIT)}" font-size="20" font-weight="600" letter-spacing="0.32em" fill="${look.accent}">ALUX MICRO DRAMA</text>
    <text x="${SLIDE_W - 84}" y="104" text-anchor="end" font-family="${esc(OUTFIT)}" font-size="20" font-weight="400" letter-spacing="0.18em" fill="${look.muted}">${page} / ${total}</text>
    <text x="${SLIDE_W / 2}" y="${SLIDE_H - 78}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="19" font-weight="500" letter-spacing="0.24em" fill="${look.muted}">${esc(footer.toUpperCase())}</text>`;
}

const svgDoc = (inner: string) => `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const jpeg = (svg: string) => sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

const unquote = (s: string) => s.trim().replace(/^[“"]/, "").replace(/[”"]$/, "");

/**
 * A slide drawn over its picture (an Unreal render, or any other). The picture
 * fills the frame; a soft fade where the caption sits keeps the words readable
 * on any image; the type is the episode's own, in white. The picture is the
 * scene, so the scene line is left out. The choice slide darkens its picture
 * and keeps the two comment words as designed panels.
 */
async function photoSlide(a: {
  look: Look; story: DStory; ep: DEpisode; s: DSlide; page: number; total: number; footer: string;
  picture: SlideArt; captionFont: Font; display: Font; nameOf: (k?: string) => { name: string; role: string } | undefined;
}): Promise<Buffer> {
  const { look, story, ep, s, page, total, footer, picture, captionFont, display } = a;
  const W = SLIDE_W, H = SLIDE_H;
  const white = "#ffffff", soft = "rgba(255,255,255,0.82)";
  const atTop = picture.captionAt === "top";
  const base = await sharp(picture.buffer).rotate().resize(W, H, { fit: "cover", position: "attention" })
    .modulate(s.kind === "choice" ? { brightness: 0.38 } : { brightness: 1 }).toBuffer();

  const fade = atTop
    ? `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.92"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0.36" stop-color="#000" stop-opacity="0"/><stop offset="0.72" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/></linearGradient>`;
  const chrome = `
    <defs>${fade}<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    ${s.kind === "choice" ? "" : `<rect width="${W}" height="${H}" fill="url(#f)"/>`}
    <rect width="${W}" height="200" fill="url(#t)"/>
    <text x="84" y="104" font-family="${esc(OUTFIT)}" font-size="20" font-weight="600" letter-spacing="0.32em" fill="${white}" opacity="0.92">ALUX MICRO DRAMA</text>
    <text x="${W - 84}" y="104" text-anchor="end" font-family="${esc(OUTFIT)}" font-size="20" font-weight="400" letter-spacing="0.18em" fill="${soft}">${page} / ${total}</text>
    <text x="${W / 2}" y="${H - 66}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="19" font-weight="500" letter-spacing="0.24em" fill="${soft}">${esc(footer.toUpperCase())}</text>`;

  let words = "";
  if (s.kind === "cover") {
    const title = look.titleCase === "upper" ? story.title.toUpperCase() : story.title;
    const isScript = look.titleFont === "Pinyon Script";
    const t = await fit(title, display, W - 200, isScript ? 190 : 130, 56, 3);
    const lh = Math.round(t.size * (isScript ? 1.05 : 1.08));
    const block = lh * t.lines.length + 150;
    const top = atTop ? 190 : H - 150 - block;
    words = `${textLines(t.lines, W / 2, top + lh * 0.8, lh, display, t.size, white)}
      <text x="${W / 2}" y="${top + lh * t.lines.length + 52}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="24" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">${esc(`EPISODE ${ep.n} · ${ep.title.toUpperCase()}`)}</text>
      <text x="${W / 2}" y="${top + lh * t.lines.length + 112}" text-anchor="middle" font-family="${esc(fam("Cormorant Garamond"))}" font-size="38" font-weight="500" fill="${soft}">${esc(story.tagline)}</text>`;
  } else if (s.kind === "choice") {
    const q = await fit(ep.choice.question, captionFont, W - 240, 64, 40, 3);
    const qlh = Math.round(q.size * 1.18);
    const panel = (o: { word: string; label: string }, y: number) => `
      <rect x="150" y="${y}" width="${W - 300}" height="220" rx="26" fill="rgba(0,0,0,0.45)" stroke="${look.accent}" stroke-opacity="0.75" stroke-width="1.5"/>
      <text x="${W / 2}" y="${y + 56}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="20" font-weight="600" letter-spacing="0.32em" fill="${soft}">COMMENT</text>
      <text x="${W / 2}" y="${y + 145}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="86" font-weight="700" letter-spacing="0.08em" fill="${look.accent}">${esc(o.word)}</text>
      <text x="${W / 2}" y="${y + 192}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="30" font-weight="400" fill="${white}">${esc(o.label)}</text>`;
    const y0 = 250 + qlh * q.lines.length + 40;
    words = `<text x="${W / 2}" y="190" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="22" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">YOU DECIDE</text>
      ${textLines(q.lines, W / 2, 250 + qlh * 0.8, qlh, captionFont, q.size, white)}
      ${panel(ep.choice.options[0], y0)}
      <text x="${W / 2}" y="${y0 + 285}" text-anchor="middle" font-family="${esc(fam("Cormorant Garamond"))}" font-size="38" font-weight="500" fill="${soft}">or</text>
      ${panel(ep.choice.options[1], y0 + 330)}
      <text x="${W / 2}" y="${Math.min(H - 130, y0 + 650)}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="25" font-weight="400" fill="${soft}">${esc(voteLine(ep))}</text>`;
  } else if (s.kind === "text") {
    const m = /^([^:“"]{1,30}):\s*(.+)$/.exec(s.say.trim());
    const sender = m ? m[1].trim() : (a.nameOf(s.who)?.name ?? "Message");
    const msg = unquote(m ? m[2] : s.say);
    const msgFont: Font = { font: "Outfit", weight: 400, track: 0 };
    const t = await fit(msg, msgFont, 720, 48, 32, 5);
    const lh = Math.round(t.size * 1.3);
    const cardH = 140 + lh * t.lines.length + 36;
    const cardY = atTop ? 180 : H - 150 - cardH;
    words = `<rect x="140" y="${cardY}" width="${W - 280}" height="${cardH}" rx="34" fill="rgba(18,22,24,0.72)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
      <circle cx="210" cy="${cardY + 70}" r="28" fill="${look.accent}"/>
      <text x="210" y="${cardY + 80}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="26" font-weight="600" fill="#0b1214">${esc(sender[0] ?? "•")}</text>
      <text x="258" y="${cardY + 64}" font-family="${esc(OUTFIT)}" font-size="27" font-weight="600" fill="${white}">${esc(sender)}</text>
      <text x="258" y="${cardY + 98}" font-family="${esc(OUTFIT)}" font-size="21" font-weight="400" fill="${soft}">now</text>
      ${textLines(t.lines, 180, cardY + 140 + lh * 0.75, lh, msgFont, t.size, white, "start")}`;
  } else {
    const isSpoken = s.kind === "line" || (s.kind === "cliff" && /^[“"]/.test(s.say.trim()));
    const t = await fit(s.say, s.kind === "cliff" && !isSpoken ? display : captionFont, W - 200, s.kind === "time" ? 60 : 66, 40, 4);
    const lh = Math.round(t.size * 1.2);
    const speaker = isSpoken ? a.nameOf(s.who) : undefined;
    const blockH = lh * t.lines.length + (speaker ? 64 : 0) + (s.kind === "cliff" ? 70 : 0);
    const top = atTop ? 190 : H - 150 - blockH;
    // White on pictures, always: an accent colour cannot be trusted on an image it has never seen.
    const fill = white;
    words = textLines(t.lines, W / 2, top + lh * 0.8, lh, s.kind === "cliff" && !isSpoken ? display : captionFont, t.size, fill);
    let y = top + lh * t.lines.length;
    if (speaker) {
      words += `<text x="${W / 2}" y="${y + 48}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="21" font-weight="600" letter-spacing="0.24em" fill="${soft}">${esc(`— ${speaker.name} · ${speaker.role}`.toUpperCase())}</text>`;
      y += 64;
    }
    if (s.kind === "cliff") {
      words += `<text x="${W / 2}" y="${y + 56}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="21" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">SWIPE · YOU DECIDE WHAT HAPPENS</text>`;
    }
  }
  const overlay = Buffer.from(svgDoc(chrome + words));
  return sharp(base).composite([{ input: overlay }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/**
 * The eight slides of one episode, in order. `art` holds the pictures made for
 * it (slide number → picture): those slides are drawn over the picture, the
 * rest stay designed.
 */
export async function renderEpisodeSlides(story: DStory, ep: DEpisode, art?: Map<number, SlideArt>): Promise<Buffer[]> {
  const look = lookOf(story.genre);
  const total = ep.slides.length;
  const footer = `${story.title} · Episode ${ep.n}`;
  const captionFont: Font = look.titleFont === "Oswald" ? { font: "Oswald", weight: 400, track: 0.01 } : { font: "Cormorant Garamond", weight: 600, track: 0 };
  const display: Font = { font: look.titleFont, weight: look.titleWeight, track: look.titleTrack };
  const sceneFont: Font = { font: "Outfit", weight: 600, track: 0.22 };
  const nameOf = (key?: string) => story.cast.find((c) => c.key === key);
  const out: Buffer[] = [];

  for (let i = 0; i < ep.slides.length; i++) {
    const s = ep.slides[i];
    const page = i + 1;
    const picture = art?.get(page);
    if (picture) {
      out.push(await photoSlide({ look, story, ep, s, page, total, footer, picture, captionFont, display, nameOf }));
      continue;
    }
    let body = "";

    if (s.kind === "cover") {
      const title = look.titleCase === "upper" ? story.title.toUpperCase() : story.title;
      const isScript = look.titleFont === "Pinyon Script";
      const t = await fit(title, display, SLIDE_W - 220, isScript ? 220 : 150, 60, 3);
      const lh = Math.round(t.size * (isScript ? 1.05 : 1.08));
      const top = 820 - lh * t.lines.length;
      body = `${ground(look, { page, total, footer: "Swipe to read", motifAbove: { top: 140, bottom: top - 30 } })}
        ${textLines(t.lines, SLIDE_W / 2, top + lh * 0.8, lh, display, t.size, look.ink)}
        <text x="${SLIDE_W / 2}" y="905" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="26" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">${esc(`EPISODE ${ep.n} · ${ep.title.toUpperCase()}`)}</text>
        <rect x="${SLIDE_W / 2 - 34}" y="945" width="68" height="1.5" fill="${look.accent}" opacity="0.7"/>
        <text x="${SLIDE_W / 2}" y="1020" text-anchor="middle" font-family="${esc(fam("Cormorant Garamond"))}" font-size="40" font-weight="500" fill="${look.muted}">${esc(story.tagline)}</text>
        <text x="${SLIDE_W / 2}" y="1130" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="20" font-weight="500" letter-spacing="0.28em" fill="${look.muted}">${esc(story.city.toUpperCase())}</text>`;
    } else if (s.kind === "choice") {
      const q = await fit(ep.choice.question, captionFont, SLIDE_W - 240, 66, 40, 3);
      const qlh = Math.round(q.size * 1.18);
      const qTop = 250;
      const [a, b] = ep.choice.options;
      const panel = (o: { word: string; label: string }, y: number) => `
        <rect x="150" y="${y}" width="${SLIDE_W - 300}" height="230" rx="26" fill="${look.light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)"}" stroke="${look.accent}" stroke-opacity="0.55" stroke-width="1.5"/>
        <text x="${SLIDE_W / 2}" y="${y + 58}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="20" font-weight="600" letter-spacing="0.32em" fill="${look.muted}">COMMENT</text>
        <text x="${SLIDE_W / 2}" y="${y + 150}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="88" font-weight="700" letter-spacing="0.08em" fill="${look.accent}">${esc(o.word)}</text>
        <text x="${SLIDE_W / 2}" y="${y + 200}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="32" font-weight="400" fill="${look.ink}">${esc(o.label)}</text>`;
      const y0 = qTop + qlh * q.lines.length + 40;
      body = `${ground(look, { page, total, footer })}
        <text x="${SLIDE_W / 2}" y="190" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="22" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">YOU DECIDE</text>
        ${textLines(q.lines, SLIDE_W / 2, qTop + qlh * 0.8, qlh, captionFont, q.size, look.ink)}
        ${panel(a, y0)}
        <text x="${SLIDE_W / 2}" y="${y0 + 300}" text-anchor="middle" font-family="${esc(fam("Cormorant Garamond"))}" font-size="40" font-weight="500" fill="${look.muted}">or</text>
        ${panel(b, y0 + 350)}
        <text x="${SLIDE_W / 2}" y="${Math.min(SLIDE_H - 150, y0 + 690)}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="26" font-weight="400" fill="${look.muted}">${esc(voteLine(ep))}</text>`;
    } else if (s.kind === "text") {
      // A message on a phone: "Sender: “words”" → a notification card.
      const m = /^([^:“"]{1,30}):\s*(.+)$/.exec(s.say.trim());
      const sender = m ? m[1].trim() : (nameOf(s.who)?.name ?? "Message");
      const msg = unquote(m ? m[2] : s.say);
      const msgFont: Font = { font: "Outfit", weight: 400, track: 0 };
      const t = await fit(msg, msgFont, 720, 52, 34, 5);
      const lh = Math.round(t.size * 1.3);
      const cardH = 150 + lh * t.lines.length + 40;
      const cardY = Math.round((SLIDE_H - cardH) / 2) + 40;
      const sceneSvg = s.scene ? textLines([s.scene.toUpperCase()], SLIDE_W / 2, cardY - 70, 30, sceneFont, 24, look.muted) : "";
      body = `${ground(look, { page, total, footer })}
        ${sceneSvg}
        <rect x="140" y="${cardY}" width="${SLIDE_W - 280}" height="${cardH}" rx="34" fill="${look.light ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.07)"}" stroke="${look.light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.16)"}" stroke-width="1.5"/>
        <circle cx="210" cy="${cardY + 74}" r="30" fill="${look.accent}" opacity="0.9"/>
        <text x="210" y="${cardY + 85}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="28" font-weight="600" fill="${look.light ? "#ffffff" : look.bg[0]}">${esc(sender[0] ?? "•")}</text>
        <text x="262" y="${cardY + 68}" font-family="${esc(OUTFIT)}" font-size="28" font-weight="600" fill="${look.ink}">${esc(sender)}</text>
        <text x="262" y="${cardY + 104}" font-family="${esc(OUTFIT)}" font-size="22" font-weight="400" fill="${look.muted}">now</text>
        ${textLines(t.lines, 180, cardY + 150 + lh * 0.75, lh, msgFont, t.size, look.ink, "start")}`;
    } else {
      // time / beat / line / cliff: a scene line, then the caption, large.
      const isSpoken = s.kind === "line" || (s.kind === "cliff" && /^[“"]/.test(s.say.trim()));
      const caption = isSpoken ? unquote(s.say) : s.say;
      const capFont: Font = s.kind === "cliff" && !isSpoken ? display : captionFont;
      const t = await fit(caption, capFont, SLIDE_W - 260, s.kind === "time" ? 70 : 78, 44, 6);
      const lh = Math.round(t.size * 1.2);
      const blockH = lh * t.lines.length;
      const quoteH = isSpoken ? 150 : 0;
      const sceneH = s.scene ? 90 : 0;
      const speaker = isSpoken ? nameOf(s.who) : undefined;
      const speakerH = speaker ? 80 : 0;
      const top = Math.round((SLIDE_H - (quoteH + sceneH + blockH + speakerH)) / 2) + 10;
      let y = top;
      let inner = "";
      if (s.scene) {
        inner += textLines([s.scene.toUpperCase()], SLIDE_W / 2, y + 30, 30, sceneFont, 24, look.muted);
        inner += `<rect x="${SLIDE_W / 2 - 24}" y="${y + 58}" width="48" height="1.5" fill="${look.accent}" opacity="0.7"/>`;
        y += sceneH;
      }
      if (isSpoken) {
        inner += `<text x="${SLIDE_W / 2}" y="${y + 150}" text-anchor="middle" font-family="${esc(fam("Bodoni Moda"))}" font-size="230" font-weight="600" fill="${look.accent}" opacity="0.85">“</text>`;
        y += quoteH;
      }
      const fill = s.kind === "cliff" ? look.accent : look.ink;
      inner += textLines(t.lines, SLIDE_W / 2, y + lh * 0.8, lh, capFont, t.size, fill);
      y += blockH;
      if (speaker) {
        inner += `<text x="${SLIDE_W / 2}" y="${y + 60}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="22" font-weight="600" letter-spacing="0.24em" fill="${look.muted}">${esc(`— ${speaker.name} · ${speaker.role}`.toUpperCase())}</text>`;
      }
      if (s.kind === "cliff") {
        inner += `<text x="${SLIDE_W / 2}" y="${SLIDE_H - 150}" text-anchor="middle" font-family="${esc(OUTFIT)}" font-size="22" font-weight="600" letter-spacing="0.3em" fill="${look.accent}">SWIPE · YOU DECIDE WHAT HAPPENS</text>`;
      }
      body = `${ground(look, { page, total, footer })}${inner}`;
    }
    out.push(await jpeg(svgDoc(body)));
  }
  return out;
}
