/**
 * call-to-bar.ts — Nigerian Call to Bar portrait generation rules.
 *
 * Provides deterministic per-slot wardrobe state and structured prompt directives
 * for the `call_to_bar` template category. Injected into the shoot brief builder
 * as a text block so Gemini/Claude receives the full matrix before generating prompts.
 */

export interface CallToBarState {
  wearGown: boolean;
  wearWig: boolean;
  wigContext: "worn" | "none" | "held" | "background";
  /** Dramatic editorial lighting for this slot (2 of 10, 1 of 5) instead of the soft studio look. */
  dramaticLighting: boolean;
}

/**
 * Returns the wardrobe configuration for a given slot index within a package.
 * slotIndex is 0-based (slot 0 = first image).
 */
export function getCallToBarState(slotIndex: number, totalSlots: number): CallToBarState {
  if (totalSlots === 1) {
    return { wearGown: true, wearWig: true, wigContext: "worn", dramaticLighting: false };
  }

  if (totalSlots === 5) {
    const states: CallToBarState[] = [
      { wearGown: true,  wearWig: true,  wigContext: "worn", dramaticLighting: false },   // Slot 1: Ceremonial
      { wearGown: true,  wearWig: false, wigContext: "none", dramaticLighting: false },   // Slot 2: Modern Gown
      { wearGown: false, wearWig: false, wigContext: "none", dramaticLighting: false },   // Slot 3: Corporate Standing
      { wearGown: false, wearWig: false, wigContext: "none", dramaticLighting: false },   // Slot 4: Corporate Seated
      { wearGown: false, wearWig: false, wigContext: "held", dramaticLighting: true },    // Slot 5: Wig in hand — editorial closer
    ];
    return states[slotIndex] ?? { wearGown: false, wearWig: false, wigContext: "none", dramaticLighting: false };
  }

  if (totalSlots === 10) {
    if (slotIndex === 0)                    return { wearGown: true,  wearWig: true,  wigContext: "worn", dramaticLighting: false };
    if (slotIndex === 1)                    return { wearGown: true,  wearWig: true,  wigContext: "worn", dramaticLighting: true };  // dramatic ceremonial hero
    if (slotIndex === 2)                    return { wearGown: true,  wearWig: false, wigContext: "none", dramaticLighting: false };
    if (slotIndex >= 3 && slotIndex <= 6)   return { wearGown: false, wearWig: false, wigContext: "none", dramaticLighting: false };
    if (slotIndex === 7)                    return { wearGown: false, wearWig: false, wigContext: "held", dramaticLighting: false };
    if (slotIndex === 8)                    return { wearGown: false, wearWig: false, wigContext: "held", dramaticLighting: true };  // dramatic editorial closer
    return { wearGown: false, wearWig: false, wigContext: "background", dramaticLighting: false };
  }

  // Proportional fallback for dynamic package sizes — last slot gets the dramatic treatment
  const gownCount = Math.max(1, Math.round(totalSlots * 0.3));
  const wearGown = slotIndex < gownCount;
  const wearWig = slotIndex === 0;
  return {
    wearGown,
    wearWig,
    wigContext: wearWig ? "worn" : slotIndex === totalSlots - 1 ? "held" : "none",
    dramaticLighting: slotIndex === totalSlots - 1,
  };
}

/**
 * Builds the wardrobe and hair layering directive text for a single slot.
 */
export function buildCallToBarPromptDirectives(
  state: CallToBarState,
  _slotIndex: number,
  _totalSlots: number,
  isFemale: boolean
): string {
  let out = "";

  // ── Gender-specific collar ────────────────────────────────────────────────
  if (isFemale) {
    out += `COLLAR (FEMALE): Elegant white barrister collarette — curved bib-style collar with a subtle structured grey border trim, tucked neatly at the neckline. Reference [COLLAR_FEMALE] for exact detail.\n`;
  } else {
    out += `COLLAR (MALE): Clean stiff white wing collar with a pleated white legal bib (tabs) secured by a visible gold metallic stud. Reference [COLLAR_MALE] for exact detail.\n`;
  }

  // ── Gown ──────────────────────────────────────────────────────────────────
  if (state.wearGown) {
    out += `GOWN: ON — heavy premium pleated black barrister's robe draped over shoulders, open at front, revealing the white collar and a clean black suit jacket underneath. Reference [GOWN] for fabric texture.\n`;
  } else {
    out += `GOWN: OFF — sharp custom-tailored plain black suit jacket (male) or clean black suit jacket/dress (female). White collar fully exposed. Absolute restriction: no pin-stripes, patterns, or waistcoats.\n`;
  }

  // ── Wig on head ───────────────────────────────────────────────────────────
  if (state.wearWig) {
    if (isFemale) {
      out += `WIG: ON HEAD — iconic white synthetic ribbed short barrister's wig. Reference [WIG] for texture.
HAIR LAYERING PROTECTION (FEMALE):
- The white wig [WIG] is the OUTERMOST layer — rendered completely on top of her natural hair.
- Her [HAIRSTYLE] hair must be styled flat-laid, sleeked tightly back, or in a tight low-profile bun tucked entirely underneath the white wig.
- Only the clean frontal hairline/edges of her black hair are subtly visible at her forehead and temples under the front band of the white wig.
- HARD CONSTRAINT: Zero black hair strands overlapping, clipping through, or seeping into the white synthetic curls. The wig remains perfectly pristine white on top.\n`;
    } else {
      out += `WIG: ON HEAD — iconic white synthetic ribbed short barrister's wig. Reference [WIG] for texture.
HAIR LAYERING PROTECTION (MALE):
- Natural hair styled flat-laid and tucked completely underneath the white wig.
- No loose strands clipping through the structured curls of the white wig.\n`;
    }
  } else {
    // Wig off head
    if (isFemale) {
      out += `WIG: OFF HEAD — do NOT render the white wig on her head. Her [HAIRSTYLE] hair (bone straight, flat-laid frontal, or professional low bun) is fully exposed and styled beautifully for the corporate portrait look.\n`;
    } else {
      out += `WIG: OFF HEAD — do NOT render the white wig on his head. His natural low-cut or neatly styled hair is fully visible.\n`;
    }

    // Alternative wig placement
    if (state.wigContext === "held") {
      out += `WIG PLACEMENT — HELD: Subject holds the white barrister wig [WIG] elegantly in their hands, white synthetic curls and ribbing resting against the black suit in a polished editorial post-ceremony pose.\n`;
    } else if (state.wigContext === "background") {
      out += `WIG PLACEMENT — BACKGROUND: White barrister wig [WIG] sits as a prop on top of a stack of vintage leather-bound legal books or on a polished dark mahogany desk in the shallow-depth-of-field background.\n`;
    }
  }

  // ── Dramatic editorial lighting override ──────────────────────────────────
  if (state.dramaticLighting) {
    out += `LIGHTING (THIS SLOT — DRAMATIC EDITORIAL): hard directional key light from a steep angle, deep sculpted chiaroscuro shadows, high-contrast falloff, moody low-key exposure, a crisp rim light carving the silhouette out of the darkness. Cinematic magazine-cover mood. The environment remains the locked backdrop — only the light direction, quality, and contrast change.\n`;
  }

  return out.trim();
}

/**
 * Builds the full Call to Bar brief section — all slots in one block — for injection
 * into the shoot brief builder prompt. The brief builder produces ALL slot prompts in
 * a single model call, so we must supply the entire matrix up front.
 */
export function buildCallToBarBriefSection(packageSize: number, isFemale: boolean): string {
  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "CATEGORY: CALL TO BAR (NIGERIAN LEGAL PORTRAIT STUDIO)",
    "═══════════════════════════════════════════════════════",
    "",
    "This is a premium Nigerian Call to Bar portrait session. Newly called lawyers",
    "require high-fidelity legal attire rendering. Any inaccuracy in the wig, collar,",
    "or gown is an instant rejection by the client.",
    "",
    "WARDROBE MATRIX — apply exactly per slot:",
    "",
  ];

  for (let i = 0; i < packageSize; i++) {
    const state = getCallToBarState(i, packageSize);
    const slotNum = i + 1;
    const wigLabel = state.wearWig
      ? "Wig ON"
      : state.wigContext === "held"
      ? "Wig HELD in hands"
      : state.wigContext === "background"
      ? "Wig as BG prop"
      : "Wig OFF";
    const gownLabel = state.wearGown ? "Gown ON" : "Gown OFF";
    const lightLabel = state.dramaticLighting ? " | DRAMATIC LIGHT" : "";
    lines.push(`SLOT ${slotNum} [${gownLabel} | ${wigLabel} | Collar ON${lightLabel}]`);
    lines.push(buildCallToBarPromptDirectives(state, i, packageSize, isFemale));
    lines.push("");
  }

  lines.push(
    "UNIVERSAL STUDIO AESTHETIC:",
    "- Backgrounds: follow the [BACKGROUND] reference / PER-SLOT BACKGROUND ALLOCATION when present; otherwise deep charcoal gray, chocolate brown, deep navy, or warm library wood.",
    "- Lighting: soft warm key light, crisp white rim light separating dark gown/suit from dark background, balanced fill — EXCEPT slots marked DRAMATIC LIGHT, which follow their own lighting directive.",
    "- Camera: Hasselblad medium-format editorial feel. Realistic skin texture — no plasticky AI smoothing.",
    "- Fabric: realistic fine-knit wool suits, linen bib tabs, synthetic ribbed wig curls — all physically accurate.",
    "- Output: 4K, documentary photograph quality, natural asymmetry, subtle film grain.",
    "- Avoid: hype words (stunning, masterpiece, epic, ultra-detailed). Use concrete photographic terms only.",
    "═══════════════════════════════════════════════════════",
  );

  return lines.join("\n");
}
