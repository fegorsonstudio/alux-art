// Viral "flag shot" add-on (Empire State antenna-flag trend) for Call to Bar.
//
// The buyer, in full wig + gown, appears solo on a rooftop antenna mast holding a
// large black flag that carries their own short text. The creator uploads a clean
// empty-flag base plate once (mast + flag + skyline, no people); it's attached to the
// shoot as a FLAG_SCENE reference and the model composites the subject + renders the
// text on the flag. The flag shot REPLACES the last image of the package.

export interface FlagShotConfig {
  enabled: boolean;
  imagePath?: string;   // storage path of the empty-flag plate (also a FLAG_SCENE template_images row)
  imageBucket?: string; // defaults to "template-images"
}

export interface FlagShotSelection {
  enabled: boolean;
  text: string;
}

export const FLAG_TEXT_MAXLEN = 60;

// ── Creator config sanitizer (templates POST/PATCH) ──────────────────────────
export function sanitizeFlagShotConfig(raw: unknown, userId: string): FlagShotConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return null;
  const imagePath = typeof o.imagePath === "string" ? o.imagePath : "";
  if (!imagePath || !imagePath.startsWith(`${userId}/`)) return null; // must have a plate under the creator's folder
  return {
    enabled: true,
    imagePath,
    imageBucket: typeof o.imageBucket === "string" && o.imageBucket ? o.imageBucket : "template-images",
  };
}

// ── Buyer text sanitizer (book route) ────────────────────────────────────────
export function sanitizeFlagText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, FLAG_TEXT_MAXLEN) : "";
}

// ── Slot placement ───────────────────────────────────────────────────────────
// The flag shot replaces the LAST image of the package (0-based index).
export function getFlagSlotIndex(packageSize: number): number {
  return Math.max(0, packageSize - 1);
}

// ── Per-slot brief directive ─────────────────────────────────────────────────
// barristerRegalia: true for Call to Bar (wig + gown, the original design); false
// for any other category — the subject keeps whatever outfit is already locked in
// for the rest of the shoot instead of the legal regalia.
export function buildFlagShotDirective(text: string, barristerRegalia = true): string {
  const safe = text.replace(/"/g, "'").slice(0, FLAG_TEXT_MAXLEN);
  const subjectClause = barristerRegalia
    ? "The subject — in FULL Call to Bar regalia (white barrister wig worn on the head + black barrister gown + white collar/bib) — stands " +
      "solo and composed on a slim rooftop antenna / communications mast at extreme skyscraper " +
      "height, with a hazy city skyline stretching far below and behind."
    : "The subject — wearing the exact same outfit already locked in for the rest of this shoot " +
      "(do NOT switch to legal/barrister attire) — stands solo and composed on a slim rooftop " +
      "antenna / communications mast at extreme skyscraper height, with a hazy city skyline " +
      "stretching far below and behind.";
  const lookLockClause = barristerRegalia
    ? "Hair and grooming match the rest of the shoot exactly."
    : "OUTFIT/HAIRSTYLE/ACCESSORY CONSISTENCY LOCK — ABSOLUTE RULE: every garment, the exact " +
      "hairstyle, and every accessory (cap, bag, jewelry, etc.) MUST render identically to how " +
      "they appear in this shoot's other slots — same [OUTFIT] reference, same [HAIRSTYLE] " +
      "reference, same accessories. Do not substitute, simplify, or omit any of them for this " +
      "slot. If a worn accessory (e.g. a cap or hat) would physically conflict with holding the " +
      "flag or gripping the mast, it may be removed for this slot ONLY — but the subject's exact " +
      "locked hairstyle must still be rendered underneath it in full, faithful detail, never a " +
      "generic or lower-quality substitute.";
  return [
    "═══════════════════════════════════════════════════════",
    "THIS SLOT — VIRAL SKYSCRAPER FLAG SHOT (replaces the usual studio portrait)",
    "═══════════════════════════════════════════════════════",
    "Recreate the viral rooftop-flag scene. " + subjectClause,
    "Match the attached [FLAG_SCENE] reference image EXACTLY for the mast structure, the flag's " +
      "shape and size, the aerial skyline, the haze and the daylight. The environment is this " +
      "rooftop scene — NOT a studio backdrop.",
    "One hand grips the mast for balance; the other holds a large black flag that billows and " +
      "ripples in the wind.",
    `Render this EXACT text on the black flag in clean, bold white lettering, laid out so it ` +
      `follows the flag's folds, curve and perspective — printed on the cloth, not pasted flat on ` +
      `top. Spell it exactly and keep it legible: "${safe}".`,
    "Cinematic wide/medium-wide shot, realistic wind motion in the gown and flag, natural " +
      "atmospheric haze, documentary photograph quality. Identity locked from the identity " +
      "references — same face, skin tone and build. " + lookLockClause,
    "═══════════════════════════════════════════════════════",
  ].join("\n");
}
