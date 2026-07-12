// "Trending" category custom slots — the Shift-for-me template's two viral shots.
//
// MUGSHOT: the buyer poses like a police mugshot in front of a height-measurement
// chart, holding the Alux Art forensics board. Their NAME / OFFENSE / DATE (typed at
// checkout) are rendered on the board in red handwritten lettering. The creator
// attaches a clean plate (board + height chart, no person) as a MUGSHOT_BOARD
// template image; its path lives in templates.trend_slots.mugshot.imagePath.
//
// BOWL ("carry your business on your head"): the buyer uploads a product photo or
// company logo (BOWL_CONTENT shoot reference). Product mode → the white enamel bowl
// ([BOWL_PROP] plate) rides on their head overflowing with comically oversized
// product. Logo mode → the bowl is branded with the logo instead.
//
// Both slots are optional buyer toggles; each enabled slot replaces one image at the
// END of the package (bowl last, mugshot before it). The mugshot slot is EXEMPT from
// the background plan (the height chart IS its background); the bowl slot keeps the
// buyer's chosen studio backdrop.

export interface TrendSlotPlate {
  enabled: boolean;
  imagePath?: string;
  imageBucket?: string;
}

export interface TrendSlotsConfig {
  mugshot?: TrendSlotPlate | null;
  bowl?: TrendSlotPlate | null;
  // Viral chair pose — NOT buyer-optional: when configured, EVERY booking of the
  // template gets one slot recreating the original viral post exactly (the plate
  // is the viral reference photo itself).
  viral?: TrendSlotPlate | null;
}

export interface MugshotSelection {
  enabled: boolean;
  name: string;
  offense: string;
  date: string;
}

export interface BowlSelection {
  enabled: boolean;
  mode: "product" | "logo";
}

export interface TrendSlotsSelection {
  mugshot?: MugshotSelection | null;
  bowl?: BowlSelection | null;
  viral?: { enabled: boolean } | null;
}

export const MUGSHOT_NAME_MAXLEN = 30;
export const MUGSHOT_OFFENSE_MAXLEN = 100;
export const MUGSHOT_DATE_MAXLEN = 20;

// ── Creator config sanitizer (templates POST/PATCH) ──────────────────────────
export function sanitizeTrendSlotsConfig(raw: unknown, userId: string): TrendSlotsConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const plate = (v: unknown): TrendSlotPlate | null => {
    if (!v || typeof v !== "object") return null;
    const p = v as Record<string, unknown>;
    if (p.enabled !== true) return null;
    const imagePath = typeof p.imagePath === "string" ? p.imagePath : "";
    if (!imagePath || !imagePath.startsWith(`${userId}/`)) return null;
    return {
      enabled: true,
      imagePath,
      imageBucket: typeof p.imageBucket === "string" && p.imageBucket ? p.imageBucket : "template-images",
    };
  };

  const mugshot = plate(o.mugshot);
  const bowl = plate(o.bowl);
  const viral = plate(o.viral);
  if (!mugshot && !bowl && !viral) return null;
  return { mugshot, bowl, viral };
}

// ── Buyer text sanitizers (book route) ───────────────────────────────────────
const clean = (raw: unknown, max: number) =>
  typeof raw === "string" ? raw.trim().replace(/"/g, "'").slice(0, max) : "";

export function sanitizeMugshotSelection(raw: unknown): MugshotSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return null;
  const name = clean(o.name, MUGSHOT_NAME_MAXLEN);
  const offense = clean(o.offense, MUGSHOT_OFFENSE_MAXLEN);
  const date = clean(o.date, MUGSHOT_DATE_MAXLEN);
  if (!name || !offense) return null; // date may fall back to booking date server-side
  return { enabled: true, name, offense, date };
}

export function sanitizeBowlSelection(raw: unknown): BowlSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return null;
  const mode = o.mode === "logo" ? "logo" : "product";
  return { enabled: true, mode };
}

// ── Slot placement ───────────────────────────────────────────────────────────
// Enabled custom slots occupy the END of the package (keeping the background
// plan's contiguous slot mapping intact for the normal portraits): bowl last,
// mugshot before it, flag before that, viral before that. Returns 1-based slot
// numbers. flagOn is accepted here (rather than only in lib/flag-shot.ts) so a
// Trending template with BOTH a flag slot and a bowl/mugshot slot enabled gets
// distinct slot numbers instead of every "last slot" mechanism independently
// claiming the same final slot.
export function getTrendSlotNumbers(
  packageSize: number,
  sel: { mugshotOn: boolean; bowlOn: boolean; viralOn?: boolean; flagOn?: boolean }
): { mugshotSlot: number | null; bowlSlot: number | null; viralSlot: number | null; flagSlot: number | null } {
  let next = packageSize;
  let bowlSlot: number | null = null;
  let mugshotSlot: number | null = null;
  let flagSlot: number | null = null;
  let viralSlot: number | null = null;
  if (sel.bowlOn) { bowlSlot = next; next -= 1; }
  if (sel.mugshotOn) { mugshotSlot = next; next -= 1; }
  if (sel.flagOn) { flagSlot = next; next -= 1; }
  if (sel.viralOn) { viralSlot = next; }
  return { mugshotSlot, bowlSlot, viralSlot, flagSlot };
}

// ── Combined brief section (both slots, with their slot numbers) ─────────────
export function buildTrendSlotsBriefSection(packageSize: number, sel: TrendSlotsSelection, flagOn = false): string {
  const mugshotOn = !!sel.mugshot?.enabled;
  const bowlOn = !!sel.bowl?.enabled;
  const viralOn = !!sel.viral?.enabled;
  const { mugshotSlot, bowlSlot, viralSlot } = getTrendSlotNumbers(packageSize, { mugshotOn, bowlOn, viralOn, flagOn });
  const parts: string[] = [];
  if (viralOn && viralSlot) {
    parts.push(
      `SLOT ${viralSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${viralSlot}:\n` +
      buildViralLookDirective()
    );
  }
  if (mugshotOn && sel.mugshot && mugshotSlot) {
    parts.push(
      `SLOT ${mugshotSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${mugshotSlot}:\n` +
      buildMugshotDirective(sel.mugshot.name, sel.mugshot.offense, sel.mugshot.date)
    );
  }
  if (bowlOn && sel.bowl && bowlSlot) {
    parts.push(
      `SLOT ${bowlSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${bowlSlot}:\n` +
      buildBowlDirective(sel.bowl.mode)
    );
  }
  return parts.join("\n\n");
}

// The signature viral chair pose — the post everyone is recreating. EVERY booking
// of a template with this slot configured gets this exact composition, male or
// female, overriding the buyer's own outfit/shoe picks FOR THIS SLOT ONLY.
export function buildViralLookDirective(): string {
  return [
    "═══════════════════════════════════════════════════════",
    "THIS SLOT — THE VIRAL CHAIR POSE (replaces the usual portrait)",
    "═══════════════════════════════════════════════════════",
    "Recreate the attached [VIRAL_LOOK] reference image EXACTLY — pose, outfit style, colors, " +
      "framing, backdrop mood. This recreates a specific viral post; faithfulness to the " +
      "reference is the entire point of this image.",
    "POSE: the subject sits on a wooden chair/stool against a warm brown studio backdrop, " +
      "body angled with confident poise, leaning back slightly, ONE LEG CROSSED HIGH over the " +
      "other with the raised foot pointing toward the camera. One hand rests relaxed; the gaze " +
      "is straight into the lens over the glasses — composed, powerful, unbothered.",
    "OUTFIT (this slot IGNORES the buyer's outfit and shoe selections — the viral look IS the " +
      "outfit): a light tan/beige tailored waistcoat with matching wide-leg tan trousers over a " +
      "crisp white shirt with a dark chocolate-brown tie. THE SIGNATURE DETAIL: a chocolate-brown " +
      "longline overcoat DRAPED OVER THE SHOULDERS LIKE A CAPE — arms NOT through the sleeves. " +
      "Dark rectangular glasses worn; statement gold/pearl earrings (female) or a subtle watch " +
      "(male); female: sleek pulled-back low bun + pale yellow pointed heels; male: neat natural " +
      "hair + polished dark loafers. Same pose, same drape, same tan-suit styling for EVERY " +
      "buyer, man or woman.",
    "Warm, softly directional studio lighting matching the reference. Identity locked from the " +
      "identity references — same face, skin tone and build. Realistic fabric folds in the " +
      "draped coat, editorial lens feel.",
    "═══════════════════════════════════════════════════════",
  ].join("\n");
}

// ── Per-slot brief directives ────────────────────────────────────────────────
export function buildMugshotDirective(name: string, offense: string, date: string): string {
  return [
    "═══════════════════════════════════════════════════════",
    "THIS SLOT — VIRAL MUGSHOT SHOT (replaces the usual portrait)",
    "═══════════════════════════════════════════════════════",
    "Recreate a playful police-mugshot scene. The subject stands DIRECTLY IN FRONT of a " +
      "white height-measurement chart backdrop (horizontal black lines with feet/inch " +
      "markings) — match the attached [MUGSHOT_BOARD] reference EXACTLY for the board design, " +
      "the chart style, and the framing. The subject is BETWEEN the board and the chart: " +
      "chart behind them, board held in front.",
    "The subject HOLDS the white forensics board with BOTH hands at chest height, fingers " +
      "visible gripping its edges. The board's printed layout (ALUX ART logo and title, " +
      "NAME / OFFENSE / DATE lines, 'Forensics and Crime Laboratory Services Department' " +
      "footer) must match the reference exactly.",
    `On the board's blank lines, render this text in RED HANDWRITTEN marker lettering — ` +
      `casual, slightly uneven, clearly hand-written, spelled EXACTLY:`,
    `- NAME: "${name}"`,
    `- OFFENSE: "${offense}"`,
    `- DATE: "${date}"`,
    "Deadpan, unamused mugshot expression (that is the joke). Flat, even, unflattering " +
      "front lighting like a booking photo. Identity locked from the identity references — " +
      "same face, skin tone and build. This slot IGNORES the studio backdrop selection; " +
      "the height chart is the only background.",
    "OUTFIT/HAIRSTYLE/ACCESSORY CONSISTENCY LOCK — ABSOLUTE RULE: every garment, the exact " +
      "hairstyle, and every accessory (cap, bag, jewelry, etc.) MUST render identically to how " +
      "they appear in this shoot's other slots — same [OUTFIT] reference, same [HAIRSTYLE] " +
      "reference, same accessories. Do not substitute, simplify, or omit any of them unless " +
      "physically impossible while holding the board (in which case keep the exact locked " +
      "hairstyle rendered in full, faithful detail).",
    "═══════════════════════════════════════════════════════",
  ].join("\n");
}

export function buildBowlDirective(mode: "product" | "logo"): string {
  const shared = [
    "═══════════════════════════════════════════════════════",
    "THIS SLOT — BUSINESS-ON-MY-HEAD SHOT (replaces the usual portrait)",
    "═══════════════════════════════════════════════════════",
    "The subject walks confidently toward the camera in stylish editorial fashion, " +
      "carrying the white enamel basin/bowl from the attached [BOWL_PROP] reference " +
      "balanced ON TOP of their head, with the coiled fabric head-roll beneath it exactly " +
      "as in the reference. One hand may steady it or swing free — poised, elegant, " +
      "full-body shot on the buyer's selected studio backdrop.",
  ];
  if (mode === "product") {
    shared.push(
      "PRODUCT MODE: fill the bowl with the buyer's product from the attached " +
        "[BOWL_CONTENT] reference — replicate the product's exact design, packaging, " +
        "colors and branding. Render the products COMICALLY OVERSIZED: piled high, " +
        "overflowing, visibly bigger than the bowl itself so the load looks hilariously " +
        "heavy. The humor is intentional; keep the subject's styling serious and chic " +
        "for contrast. Do not invent other products."
    );
  } else {
    shared.push(
      "LOGO MODE: keep the bowl EMPTY, and brand its outer side with the buyer's logo " +
        "from the attached [BOWL_CONTENT] reference — rendered cleanly and legibly like a " +
        "professional printed wrap on the bowl's curved surface, colors and lettering " +
        "faithful to the logo. No products inside the bowl."
    );
  }
  shared.push(
    "Identity locked from the identity references — same face, skin tone and build. " +
      "The concept: this person proudly carries their business on their head.",
    "OUTFIT/HAIRSTYLE/ACCESSORY CONSISTENCY LOCK — ABSOLUTE RULE: every garment, the exact " +
      "hairstyle, and every accessory (cap, bag, jewelry, etc.) MUST render identically to how " +
      "they appear in this shoot's other slots — same [OUTFIT] reference, same [HAIRSTYLE] " +
      "reference, same accessories. Do not substitute, simplify, or omit any of them for this " +
      "slot. If a worn accessory (e.g. a cap or hat) would physically conflict with the bowl " +
      "balanced on the head, it may be removed for this slot ONLY — but the subject's exact " +
      "locked hairstyle must still be rendered underneath it in full, faithful detail, never a " +
      "generic or lower-quality substitute.",
    "═══════════════════════════════════════════════════════",
  );
  return shared.join("\n");
}
