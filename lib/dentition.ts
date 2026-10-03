import "server-only";
import sharp from "sharp";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Reading a subject's teeth properly.
 *
 * WHY THIS EXISTS. A buyer with a clear gap between her front teeth came back
 * looking like someone else, and the identity analyser had written "no visible
 * gaps" about a photograph where the gap is obvious to anyone who looks. The
 * photograph was fine. The problem is scale: her mouth is a few percent of a
 * selfie, and a diastema at that size is a couple of dark pixels the model
 * reads straight past. Sharpening the wording did not help — tried, it either
 * changed nothing or broke the output format.
 *
 * So this does what a person does: find the mouth, get closer, then look. Two
 * cheap passes per photograph — locate, then describe the enlarged crop — and
 * the same model that missed the gap at full frame describes its width
 * correctly once the mouth fills the picture.
 *
 * CONSENSUS, NOT A SINGLE OPINION. When the locate pass returns a bad box the
 * describe pass is looking at something else entirely, and it does not always
 * say so: one bad crop in testing produced "decorative or glittery teeth with a
 * heart-shaped diastema", confidently, about a bouquet. A single reading is
 * therefore not trusted — two independent photographs must agree before a gap
 * is written into somebody's identity, and obvious nonsense is discarded first.
 */

const MAX_IMAGES = 4;
const MODEL = "gemini-2.5-flash";

/** Answers that mean the crop was not a mouth. One of these described roses. */
const NONSENSE = /\b(not a (person|mouth|human)|roses?|flowers?|bouquet|cannot describe|no (visible )?(mouth|teeth) (is|are)|decorative|glittery|jewel)/i;
const SAYS_GAP = /\b(gap|diastema|space)\b/i;
const SAYS_NO_GAP = /\b(no (visible |noticeable |discernible )?(gap|diastema|space)|without a (gap|diastema)|gapless|no separation)\b/i;

type Reading = { gap: boolean; text: string };

/**
 * One photograph: find the mouth, enlarge it, and describe what is there.
 * Returns null when this image cannot contribute — no teeth showing, a box that
 * makes no sense, or an answer that is plainly about something else.
 */
async function readOne(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  url: string,
): Promise<Reading | null> {
  let buf: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } catch { return null; }

  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.width || !meta?.height) return null;
  const part = (b: Buffer) => ({ inlineData: { data: b.toString("base64"), mimeType: "image/jpeg" } });

  // Pass 1 — is a mouth showing teeth, and where is it?
  let box: number[] | null = null;
  try {
    const out = (await model.generateContent([part(buf),
      'Does this photograph show the person\'s teeth (mouth open or smiling)? ' +
      'Answer ONLY with compact JSON: {"teeth":true|false,"box":[ymin,xmin,ymax,xmax]} ' +
      'where box is the mouth region normalised 0-1000. If teeth are not visible use {"teeth":false,"box":null}.',
    ])).response.text();
    const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
    if (!parsed?.teeth || !Array.isArray(parsed.box) || parsed.box.length !== 4) return null;
    box = parsed.box.map(Number);
  } catch { return null; }
  if (!box || box.some((n) => !Number.isFinite(n))) return null;

  const [ymin, xmin, ymax, xmax] = box;
  const h = (ymax - ymin) / 1000, w = (xmax - xmin) / 1000;
  // A mouth is never most of a frame nor a handful of pixels; either means the
  // locate pass has pointed somewhere useless.
  if (!(h > 0.005 && w > 0.005 && h < 0.6 && w < 0.6)) return null;

  // Crop with padding — the lips and both corners matter for judging a gap.
  const pad = 0.35;
  const left = Math.max(0, Math.round((xmin / 1000 - w * pad) * meta.width));
  const top = Math.max(0, Math.round((ymin / 1000 - h * pad) * meta.height));
  const cw = Math.min(meta.width - left, Math.round(w * (1 + pad * 2) * meta.width));
  const ch = Math.min(meta.height - top, Math.round(h * (1 + pad * 2) * meta.height));
  if (cw < 24 || ch < 24) return null;

  let crop: Buffer;
  try {
    crop = await sharp(buf).extract({ left, top, width: cw, height: ch })
      .resize({ width: 1024, kernel: "lanczos3" }).sharpen().jpeg({ quality: 95 }).toBuffer();
  } catch { return null; }

  // Pass 2 — now that the mouth fills the frame, describe it.
  let answer: string;
  try {
    answer = (await model.generateContent([part(crop),
      "This is a close-up of one person's mouth. In ONE sentence: is there a visible gap " +
      "(diastema) between the two central front teeth, and if so roughly how wide relative to " +
      "one tooth? Also note alignment, relative size and shade. Be literal about what you can " +
      "actually see. If this is not a mouth, say exactly: NOT A MOUTH.",
    ])).response.text().trim();
  } catch { return null; }

  if (!answer || NONSENSE.test(answer) || /NOT A MOUTH/i.test(answer)) return null;
  // Cut off mid-sentence: the budget ran out before the model finished. Half a
  // description is worse than none — it reads as fact and stops at a comma.
  if (!/[.!?]\s*$/.test(answer)) {
    console.warn(`[dentition] discarding a truncated reading: ...${answer.slice(-40)}`);
    return null;
  }
  // "no gap" has to be tested before "gap", since it contains the word.
  if (SAYS_NO_GAP.test(answer)) return { gap: false, text: answer };
  if (SAYS_GAP.test(answer)) return { gap: true, text: answer };
  return { gap: false, text: answer };
}

/**
 * The Teeth line for an identity profile, or null to leave the existing one.
 *
 * Null is the honest answer far more often than not: most references never show
 * teeth at all, and inventing a description from nothing is exactly the failure
 * this is meant to prevent.
 */
export async function readDentition(imageUrls: string[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: MODEL,
    // Generous, because gemini-2.5 spends part of this budget on internal
    // reasoning before it writes anything. At 900 the answer came back cut
    // mid-sentence — "...1/20th the width of one tooth; the" — and that
    // fragment was what got written into a customer's identity.
    generationConfig: { maxOutputTokens: 2048 },
  });

  const urls = imageUrls.filter(Boolean).slice(0, MAX_IMAGES);
  const readings = (await Promise.all(urls.map((u) => readOne(model, u).catch(() => null))))
    .filter((r): r is Reading => r !== null);
  if (readings.length === 0) return null;

  const withGap = readings.filter((r) => r.gap);
  const withoutGap = readings.filter((r) => !r.gap);
  console.log(`[dentition] ${readings.length} usable reading(s): ${withGap.length} see a gap, ${withoutGap.length} do not`);

  // Two independent photographs must agree before a gap goes into someone's
  // identity — a single reading can be a bad crop described confidently.
  if (withGap.length >= 2) {
    const best = withGap.reduce((a, b) => (a.text.length >= b.text.length ? a : b));
    return `${best.text.replace(/\s+/g, " ").trim()} This is a defining feature of this person's face — reproduce the gap at this width whenever teeth are visible.`;
  }
  // Exactly one sighting, nothing contradicting it: worth recording, hedged, so
  // a real gap seen in the only usable photograph is not thrown away.
  if (withGap.length === 1 && withoutGap.length === 0) {
    return `${withGap[0].text.replace(/\s+/g, " ").trim()} Reproduce this gap whenever teeth are visible.`;
  }
  if (withoutGap.length > 0) {
    return `${withoutGap[0].text.replace(/\s+/g, " ").trim()}`;
  }
  return null;
}
