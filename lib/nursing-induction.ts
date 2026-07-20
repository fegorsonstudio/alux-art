/**
 * nursing-induction.ts — Nigerian nursing induction portrait generation rules.
 *
 * Sibling of lib/call-to-bar.ts. Provides the buyer personalization schema
 * (name + credential titles + class year, rendered as embroidered text), a
 * deterministic per-slot wardrobe/sash matrix, and the full brief section for
 * the `nursing_induction` template category.
 */

import { getFlagSlotIndex, buildFlagShotDirective } from "@/lib/flag-shot";

// ── Selectable credential titles (multi-select, order preserved) ─────────────
// Nigerian sashes read "RN, RM, BNSc" style — comma-joined credentials.
export const NURSING_TITLES = [
  "RN",
  "RM",
  "RPHN",
  "RMN",
  "BNSc",
  "BLS",
  "SN (Student Nurse)",
  "NP",
  "CNS",
  "PHN",
  "Staff Nurse",
  "Nurse Manager",
  "RN (Pediatrics)",
  "RN (ICU)",
  "RN (Surgery)",
] as const;

export const INDUCTION_NAME_MAXLEN = 40;
export const INDUCTION_MAX_TITLES = 6;

// Dynamic year window — people who missed their induction year can still shoot
// a past "CLASS OF" year. Never hardcode years.
export function inductionYearRange(now = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= current - 10; y--) years.push(y);
  return years;
}

export interface InductionSelection {
  name: string;      // the ONLY typed field in the whole booking
  titles: string[];  // subset of NURSING_TITLES, buyer's tap order preserved
  year: number;      // CLASS OF year
}

// ── Buyer input sanitizer (book route) ────────────────────────────────────────
export function sanitizeInductionSelection(raw: unknown, now = new Date()): InductionSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const name = typeof o.name === "string"
    ? o.name.trim().replace(/"/g, "'").slice(0, INDUCTION_NAME_MAXLEN)
    : "";
  if (!name) return null;

  const validTitles = new Set<string>(NURSING_TITLES);
  const titles: string[] = [];
  for (const t of Array.isArray(o.titles) ? o.titles : []) {
    if (typeof t === "string" && validTitles.has(t) && !titles.includes(t)) {
      titles.push(t);
      if (titles.length >= INDUCTION_MAX_TITLES) break;
    }
  }

  const allowedYears = new Set(inductionYearRange(now));
  const year = typeof o.year === "number" && allowedYears.has(o.year)
    ? o.year
    : now.getFullYear();

  return { name, titles, year };
}

// Short credential string for prompt text, e.g. "RN, RM, BNSc" (strips the
// parenthetical helper from "SN (Student Nurse)" for clean sash lettering).
export function titlesLine(sel: InductionSelection): string {
  return sel.titles.map((t) => t.replace(/\s*\(.*\)$/, "")).join(", ");
}

// ── Embroidery directive (the personalization centerpiece) ───────────────────
// Reused by every slot that shows the sash. All text comes from HERE — the
// [SASH] reference plate is blank on purpose (text on references bleeds into
// outputs), so spelling and layout are locked by this directive alone.
export function buildSashTextBlock(sel: InductionSelection): string {
  const lines = [
    `"CLASS OF ${sel.year}"`,
    `"${sel.name.toUpperCase()}"`,
    ...(sel.titles.length ? [`"${titlesLine(sel)}"`] : []),
  ];
  return (
    `SASH PERSONALIZATION — ABSOLUTE TEXT LOCK: the sash carries EXACTLY these lines of ` +
    `text, stacked on the front panel below the emblem, in this order: ${lines.join(", then ")}. ` +
    `Spell every line EXACTLY as written — never alter, translate, abbreviate, or omit a ` +
    `character. Render the lettering as REALISTIC METALLIC GOLD EMBROIDERY: raised ` +
    `satin-stitch thread with visible individual stitches, slight thread sheen catching the ` +
    `light, and micro-shadows where the stitching lifts off the fabric — NEVER flat printed, ` +
    `pasted, or floating text. The lettering must follow the sash fabric's folds, curves, and ` +
    `perspective exactly as cloth-embroidered text would. No other text, monograms, or ` +
    `emblems may be invented on the sash beyond what the [SASH] reference shows.`
  );
}

// Embroidered scrubs chest text (name + first credential), used in scrub slots.
export function buildScrubsEmbroideryLine(sel: InductionSelection): string {
  const cred = sel.titles.length ? titlesLine({ ...sel, titles: [sel.titles[0]] }) : "RN";
  return (
    `SCRUBS EMBROIDERY: the scrub top's left chest carries two small embroidered lines — ` +
    `"${sel.name.toUpperCase()}" above "${cred}" — in clean white thread embroidery with ` +
    `visible stitch texture, sized like a real uniform monogram (small, proportional, never ` +
    `a large graphic). Spell both exactly. No brand names or logos anywhere on the scrubs.`
  );
}

// ── Per-slot wardrobe/sash matrix ─────────────────────────────────────────────
export interface NursingInductionState {
  sashMode: "worn" | "draped" | "held" | "background" | "none";
  capMode: "grad" | "scrub" | "none";
  outfitMode: "elegant" | "scrubs" | "suit";
  // The shot framing this slot is composed for — feeds Stage 4 identity-image
  // routing in generate.ts so it never mixes a close-up into a full-body slot
  // (or vice versa) and misleads the model on height/proportions. Required
  // (no default) on the S() builder below so every slot must state it
  // explicitly rather than silently inheriting a wrong assumption.
  framing: "full-body" | "medium" | "close-up";
  dramaticLighting: boolean;
  showEmbroideredScrubs: boolean;
}

export function getNursingInductionState(slotIndex: number, totalSlots: number): NursingInductionState {
  const S = (
    sashMode: NursingInductionState["sashMode"],
    capMode: NursingInductionState["capMode"],
    outfitMode: NursingInductionState["outfitMode"],
    framing: NursingInductionState["framing"],
    dramaticLighting = false,
    showEmbroideredScrubs = false,
  ): NursingInductionState => ({ sashMode, capMode, outfitMode, framing, dramaticLighting, showEmbroideredScrubs });

  if (totalSlots === 1) {
    return S("worn", "grad", "elegant", "medium");
  }

  if (totalSlots === 5) {
    const states: NursingInductionState[] = [
      S("worn",   "grad",  "elegant", "medium"),              // 1 Ceremonial hero — cap + gown + sash
      S("draped", "none",  "elegant", "medium"),              // 2 Sash over forearm, arms crossed
      S("none",   "none",  "scrubs", "medium", false, true),  // 3 Scrubs + chest embroidery — needs waist-up to stay legible
      S("worn",   "none",  "suit", "medium"),                 // 4 Corporate + sash + scroll
      S("held",   "none",  "elegant", "full-body", true),     // 5 Editorial closer — dramatic light, silhouette carved head to toe
    ];
    return states[slotIndex] ?? S("none", "none", "elegant", "medium");
  }

  if (totalSlots === 10) {
    const states: NursingInductionState[] = [
      S("worn",    "grad",  "elegant", "medium"),              // 1 Ceremonial hero — smiling
      S("worn",    "none",  "elegant", "full-body", true),     // 2 Sash worn, full body, dramatic
      S("draped",  "none",  "elegant", "medium"),              // 3 Sash over forearm — the classic
      S("none",    "none",  "elegant", "medium"),              // 4 Stethoscope around neck, stool
      S("none",    "none",  "scrubs", "medium", false, true),  // 5 Scrubs standing + embroidery
      S("none",    "scrub", "scrubs", "medium", false, true),  // 6 Scrubs + scrub cap, chair pose
      S("worn",    "none",  "suit", "medium"),                 // 7 Corporate + sash + scroll
      S("none",    "none",  "elegant", "medium"),              // 8 Playful prop slot
      S("draped",  "none",  "elegant", "close-up"),            // 9 Close-up — embroidery legible
      S("background", "none", "elegant", "full-body", true),   // 10 Editorial closer — gown behind, wide staging
    ];
    return states[slotIndex] ?? S("none", "none", "elegant", "medium");
  }

  // Proportional fallback for other sizes
  if (slotIndex === 0) return S("worn", "grad", "elegant", "medium");
  if (slotIndex === totalSlots - 1) return S("held", "none", "elegant", "full-body", true);
  const third = Math.floor(totalSlots / 3);
  if (slotIndex <= third) return S("draped", "none", "elegant", "medium");
  if (slotIndex <= third * 2) return S("none", "none", "scrubs", "medium", false, true);
  return S("worn", "none", "suit", "medium");
}

// Single source of truth for per-slot framing — thin wrapper so callers that
// only need the framing decision (Stage 4 identity routing in generate.ts)
// don't need to pull in the full wardrobe state.
export function getNursingInductionFraming(slotIndex: number, totalSlots: number): NursingInductionState["framing"] {
  return getNursingInductionState(slotIndex, totalSlots).framing;
}

// ── Per-slot directive text ───────────────────────────────────────────────────
function buildSlotDirectives(
  state: NursingInductionState,
  sel: InductionSelection,
  hasScrubsRef: boolean,
  hasSuitRef: boolean,
): string {
  const out: string[] = [];

  // Sash
  if (state.sashMode === "worn") {
    out.push(
      "SASH: WORN — the personalized induction sash from the [SASH] reference is worn around " +
        "the neck, both panels hanging flat down the front of the torso, embroidery fully " +
        "legible and facing the camera. " + buildSashTextBlock(sel)
    );
  } else if (state.sashMode === "draped") {
    out.push(
      "SASH: DRAPED — the personalized induction sash from the [SASH] reference is folded " +
        "once and draped over the subject's forearm, the embroidered front panel facing the " +
        "camera and clearly legible. " + buildSashTextBlock(sel)
    );
  } else if (state.sashMode === "held") {
    out.push(
      "SASH: HELD — the subject holds the personalized induction sash from the [SASH] " +
        "reference elegantly in their hands, embroidered panel toward the camera. " +
        buildSashTextBlock(sel)
    );
  } else if (state.sashMode === "background") {
    out.push(
      "SASH: BACKGROUND PROP — the personalized sash rests folded on the subject's lap or on " +
        "a nearby stool, embroidered panel angled toward the camera and legible in the " +
        "shallow depth of field. " + buildSashTextBlock(sel)
    );
  } else {
    out.push("SASH: NOT IN THIS SLOT — do not render the sash.");
  }

  // Cap
  if (state.capMode === "grad") {
    out.push(
      "CAP: GRADUATION CAP ON — black mortarboard with tassel worn level on the head. The " +
        "subject's locked [HAIRSTYLE] hair remains styled and visible beneath it; never a " +
        "generic substitute hairstyle."
    );
  } else if (state.capMode === "scrub") {
    out.push(
      "CAP: SCRUB CAP ON — the scrub cap from its reference image worn covering the hairline " +
        "as in real theatre wear. No text or logos on the cap."
    );
  } else {
    out.push("CAP: NONE — no headwear in this slot; the locked hairstyle is fully visible.");
  }

  // Outfit
  if (state.outfitMode === "scrubs") {
    out.push(
      hasScrubsRef
        ? "OUTFIT: SCRUBS — the subject wears the scrubs set from the [SCRUBS] reference " +
            "(the buyer's chosen colorway). Replicate its exact color, trim, pocket layout, and " +
            "fabric. Clean modern fit."
        : "OUTFIT: SCRUBS — a clean modern V-neck scrubs set in a deep professional color, " +
            "well-fitted, no logos."
    );
    if (state.showEmbroideredScrubs) out.push(buildScrubsEmbroideryLine(sel));
  } else if (state.outfitMode === "suit") {
    out.push(
      hasSuitRef
        ? "OUTFIT: CORPORATE — the tailored look from the [SUIT] reference, replicated exactly " +
            "in color, cut, and fabric."
        : "OUTFIT: CORPORATE — a sharply tailored professional suit or two-piece in a rich " +
            "solid color, elegant and modern; if the buyer selected an [OUTFIT] reference that " +
            "reads as corporate, use it here instead."
    );
  } else {
    out.push(
      "OUTFIT: ELEGANT — the buyer's chosen [OUTFIT] reference is the garment for this slot. " +
        "Replicate its exact color, cut, silhouette, and fabric."
    );
  }

  // Ghost-mannequin shape guard — applies to every garment reference.
  out.push(
    "GARMENT FIT — ABSOLUTE RULE: wardrobe references are ghost-mannequin product shots. " +
      "Extract ONLY the garment (color, cut, fabric, trim, construction) and fit it " +
      "naturally to the subject's actual body shape, build, and proportions from the " +
      "identity references — never reproduce the mannequin's hollow form, stance, or " +
      "proportions."
  );

  if (state.dramaticLighting) {
    out.push(
      "LIGHTING (THIS SLOT — DRAMATIC EDITORIAL): hard directional key light, deep sculpted " +
        "shadows, high-contrast falloff, moody low-key exposure, crisp rim light carving the " +
        "silhouette. The environment remains the locked backdrop — only light changes."
    );
  }

  return out.join("\n");
}

// ── Full brief section ────────────────────────────────────────────────────────
export function buildNursingInductionBriefSection(
  packageSize: number,
  sel: InductionSelection,
  hasScrubsRef: boolean,
  hasSuitRef: boolean,
  flagShot: { text: string } | null = null,
): string {
  const flagSlotIndex = flagShot ? getFlagSlotIndex(packageSize) : -1;
  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "CATEGORY: NURSING INDUCTION (NIGERIAN NURSING PORTRAIT STUDIO)",
    "═══════════════════════════════════════════════════════",
    "",
    "This is a premium Nigerian nursing induction session — the client's once-in-a-lifetime",
    "celebration of joining the nursing profession. The personalized sash text and any",
    "uniform embroidery must be rendered with flawless spelling and realistic stitched",
    "texture; any text inaccuracy is an instant rejection.",
    "",
    `CLIENT PERSONALIZATION: name "${sel.name.toUpperCase()}", credentials "${titlesLine(sel) || "(none selected)"}", class year ${sel.year}.`,
    "",
    "WARDROBE & SASH MATRIX — apply exactly per slot:",
    "",
  ];

  for (let i = 0; i < packageSize; i++) {
    const slotNum = i + 1;
    if (i === flagSlotIndex && flagShot) {
      lines.push(`SLOT ${slotNum} [VIRAL SKYSCRAPER FLAG SHOT — shoot outfit, rooftop scene]`);
      lines.push(buildFlagShotDirective(flagShot.text, false));
      lines.push("");
      continue;
    }
    const state = getNursingInductionState(i, packageSize);
    const sashLabel =
      state.sashMode === "worn" ? "Sash WORN"
      : state.sashMode === "draped" ? "Sash DRAPED on arm"
      : state.sashMode === "held" ? "Sash HELD"
      : state.sashMode === "background" ? "Sash as prop"
      : "Sash OFF";
    const capLabel = state.capMode === "grad" ? "Grad cap ON" : state.capMode === "scrub" ? "Scrub cap ON" : "No cap";
    const lightLabel = state.dramaticLighting ? " | DRAMATIC LIGHT" : "";
    lines.push(`SLOT ${slotNum} [${state.outfitMode.toUpperCase()} | ${sashLabel} | ${capLabel}${lightLabel}]`);
    lines.push(buildSlotDirectives(state, sel, hasScrubsRef, hasSuitRef));
    lines.push("");
  }

  lines.push(
    "PROPS ROTATION: if the buyer selected prop references (stethoscope, RN letters, roses,",
    "BP monitor, scroll tube, stool, chair, etc.), DISTRIBUTE them across suitable slots —",
    "each prop appears in 1-3 slots where it fits the scene naturally. NEVER cram every",
    "prop into every image; most slots carry at most one hero prop. The stethoscope suits",
    "scrub and elegant slots; celebratory props (letters, roses, confetti) suit the playful",
    "and hero slots.",
    "",
    "UNIVERSAL STUDIO AESTHETIC:",
    "- Backgrounds: follow the PER-SLOT BACKGROUND ALLOCATION / [BACKGROUND] reference when",
    "  present; otherwise clean seamless paper in warm celebratory tones.",
    "- Lighting: soft warm key, crisp rim light, balanced fill — EXCEPT slots marked",
    "  DRAMATIC LIGHT, which follow their own directive.",
    "- Mood: joyful and proud — this celebrates a life milestone. Use the smile allocation",
    "  rules where a genuine smiling identity reference exists.",
    "- Camera: Hasselblad medium-format editorial feel. Realistic skin texture — no",
    "  plasticky AI smoothing.",
    "- Fabric: realistic satin sash sheen, embroidered thread relief, matte scrub cotton,",
    "  wool suiting — all physically accurate.",
    "- Output: 4K, documentary photograph quality, natural asymmetry, subtle film grain.",
    "- Avoid hype words (stunning, masterpiece, epic, ultra-detailed). Concrete photographic",
    "  terms only.",
    "═══════════════════════════════════════════════════════",
  );

  return lines.join("\n");
}
