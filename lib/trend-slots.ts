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
  // TV news-broadcast still — NOT buyer-optional (like viral): when configured, the
  // slot recreates the attached news-frame plate with the buyer as the on-camera
  // eyewitness, and the buyer's three typed lines (headline / subtitle / caption) are
  // rendered into the on-screen graphics. The plate is a clean, generic-branding
  // news frame (NEWS_FRAME).
  news?: TrendSlotPlate | null;
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

export interface NewsSelection {
  enabled: boolean;
  headline: string;  // the coloured lower-third banner, rendered ALL CAPS
  subtitle: string;  // the short ticker line beneath the banner
  caption: string;   // the top caption line (e.g. the eyewitness line)
}

export interface TrendSlotsSelection {
  mugshot?: MugshotSelection | null;
  bowl?: BowlSelection | null;
  viral?: { enabled: boolean } | null;
  news?: NewsSelection | null;
}

export const MUGSHOT_NAME_MAXLEN = 30;
export const MUGSHOT_OFFENSE_MAXLEN = 100;
export const MUGSHOT_DATE_MAXLEN = 20;

export const NEWS_HEADLINE_MAXLEN = 25;
export const NEWS_SUBTITLE_MAXLEN = 70;
export const NEWS_CAPTION_MAXLEN = 110;

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
  const news = plate(o.news);
  if (!mugshot && !bowl && !viral && !news) return null;
  return { mugshot, bowl, viral, news };
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

// The news slot is forced-on for a template that has it (not a buyer toggle), so
// `enabled` is not required here — the presence of the required text is what matters.
// headline + caption are required; the short subtitle/ticker line is optional. The
// headline is uppercased (it renders in the ALL-CAPS lower-third banner).
export function sanitizeNewsSelection(raw: unknown): NewsSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const headline = clean(o.headline, NEWS_HEADLINE_MAXLEN).toUpperCase();
  const subtitle = clean(o.subtitle, NEWS_SUBTITLE_MAXLEN);
  const caption = clean(o.caption, NEWS_CAPTION_MAXLEN);
  if (!headline || !caption) return null;
  return { enabled: true, headline, subtitle, caption };
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
  sel: { mugshotOn: boolean; bowlOn: boolean; viralOn?: boolean; flagOn?: boolean; newsOn?: boolean }
): { mugshotSlot: number | null; bowlSlot: number | null; viralSlot: number | null; flagSlot: number | null; newsSlot: number | null } {
  let next = packageSize;
  let bowlSlot: number | null = null;
  let mugshotSlot: number | null = null;
  let flagSlot: number | null = null;
  let viralSlot: number | null = null;
  let newsSlot: number | null = null;
  if (sel.bowlOn) { bowlSlot = next; next -= 1; }
  if (sel.mugshotOn) { mugshotSlot = next; next -= 1; }
  if (sel.flagOn) { flagSlot = next; next -= 1; }
  if (sel.newsOn) { newsSlot = next; next -= 1; }
  if (sel.viralOn) { viralSlot = next; }
  return { mugshotSlot, bowlSlot, viralSlot, flagSlot, newsSlot };
}

// ── Combined brief section (both slots, with their slot numbers) ─────────────
export function buildTrendSlotsBriefSection(packageSize: number, sel: TrendSlotsSelection, flagOn = false): string {
  const mugshotOn = !!sel.mugshot?.enabled;
  const bowlOn = !!sel.bowl?.enabled;
  const viralOn = !!sel.viral?.enabled;
  const newsOn = !!sel.news?.enabled;
  const { mugshotSlot, bowlSlot, viralSlot, newsSlot } = getTrendSlotNumbers(packageSize, { mugshotOn, bowlOn, viralOn, flagOn, newsOn });
  const parts: string[] = [];
  if (newsOn && sel.news && newsSlot) {
    parts.push(
      `SLOT ${newsSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${newsSlot}:\n` +
      buildNewsShotDirective(sel.news.headline, sel.news.subtitle, sel.news.caption)
    );
  }
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

// The TV news-broadcast still — the whole image on a 1-image news template. The buyer
// becomes the on-camera eyewitness inside a recreated broadcast frame, and their three
// typed lines are rendered into the on-screen graphics. Uses ONLY the generic branding
// in the attached [NEWS_FRAME] plate — never a real news organisation's identity.
export function buildNewsShotDirective(headline: string, subtitle: string, caption: string): string {
  const safe = (t: string, max: number) => t.replace(/"/g, "'").slice(0, max);
  const h = safe(headline, NEWS_HEADLINE_MAXLEN).toUpperCase();
  const s = safe(subtitle, NEWS_SUBTITLE_MAXLEN);
  const c = safe(caption, NEWS_CAPTION_MAXLEN);
  const tickerLine = s
    ? `- TICKER (the thin line beneath the banner, short): "${s}"`
    : "- TICKER (the thin line beneath the banner): leave it as a plain coloured bar with no text.";
  return [
    "═══════════════════════════════════════════════════════",
    "THIS SLOT — VIRAL TV NEWS-BROADCAST STILL (this is the whole image)",
    "═══════════════════════════════════════════════════════",
    // The single most important rule, stated FIRST: the plate is a blank layout, not
    // content to copy. Without this the edit model reproduces the reference's own
    // baked-in lettering pixel-for-pixel and silently ignores the buyer's text.
    "USE THE [NEWS_FRAME] REFERENCE FOR TWO THINGS: (1) THE SETTING — recreate the same location, " +
      "environment and backdrop the reference was shot in, with the same time of day, weather and " +
      "surroundings behind the subject. Do NOT invent a different place, and never substitute a " +
      "generic park, street or studio. (2) THE GRAPHICS LAYOUT — copy the position, shape, " +
      "proportions, colours and font styling of its on-screen bars (top caption bar, coloured " +
      "lower-third headline banner, ticker strip, corner branding block).",
    "THE ONE THING NOT TO TAKE FROM IT IS THE WORDING. Treat every bar as EMPTY and re-letter it " +
      "from scratch with the exact text specified below. Keeping the scene while replacing the words " +
      "is the whole job.",
    "DO NOT COPY ANY LETTERING FROM THE REFERENCE PLATE. Every word, letter, logo, website, handle " +
      "and station name visible in the reference is a PLACEHOLDER from an unrelated broadcast and " +
      "MUST NOT appear anywhere in the output — not in the corner, not in the caption bar, not in " +
      "the banner, not in the ticker. In particular NEVER render \"frankstantv\", \"frankstan\", " +
      "\"FTV\", \"@ftvreport\", \"Eye witness\", \"recount\", or any other wording carried over from the " +
      "reference. If a word appears in the reference and is not listed below, it is FORBIDDEN.",
    "CHANNEL BRANDING — ABSOLUTE, RENDER IN EVERY IMAGE: in the top corner (matching the reference's " +
      "handle position), render THIS channel's branding on two lines — the website " +
      "\"www.aluxartandframes.shop\" and beneath it the handle \"@aluxartandframes\" — clean, crisp and " +
      "legible. This REPLACES and overrides any website, handle, logo, or station name shown in the " +
      "reference plate.",
    "THE ON-CAMERA PERSON: place the identity-locked subject as the interviewee / eyewitness, framed " +
      "waist-up and facing the camera as if being interviewed outdoors on location, with a reporter's " +
      "handheld microphone held up near their mouth — matching the framing, wardrobe feel and setting " +
      "of the reference plate. Identity locked from the identity references (same face, skin tone and " +
      "build). Natural documentary-news daylight. THE LOCATION BEHIND THEM IS THE REFERENCE PLATE'S " +
      "OWN LOCATION — same place, same background elements, same time of day — not an invented one.",
    "RENDER THIS EXACT TEXT — these are the ONLY words allowed in the finished image, spelled EXACTLY " +
      "and clearly legible, each in its correct zone. ALL THREE ZONES MUST BE VISIBLY FILLED:",
    `- TOP CAPTION (the upper caption bar): render "${c}" in white text, BUT with its single most ` +
      `important / attention-grabbing keyword highlighted inside a bright YELLOW rectangular marker box ` +
      `with dark near-black bold text — exactly like a live-news keyword highlight. Highlight ONLY that ` +
      `one word; the rest of the caption stays plain white.`,
    `- HEADLINE (bold, inside the coloured lower-third banner, ALL CAPS): "${h}"`,
    tickerLine,
    // The supplied plate can be cropped so tightly that the lower third is barely
    // visible; the model must still draw the banner rather than omit the headline.
    "BANNER GEOMETRY: the coloured lower-third headline banner and the ticker strip beneath it must " +
      "both be FULLY VISIBLE inside the frame, wide enough for their text to fit on one line. If the " +
      "reference plate's banner or ticker is cropped, cut off at the edge, partially hidden or absent, " +
      "DRAW a clean full-width one in the same broadcast style and colours anyway, positioned in the " +
      "lower third — never omit the headline or ticker because the reference lacked room for it.",
    "Keep every letter accurate. The text must look like real crisp broadcast graphics printed on the " +
      "overlay — not handwritten, not warped, not misspelled. Do not add any other text or watermarks " +
      "beyond the Alux Art channel branding and the lines above.",
    "Photojournalistic, true-to-life TV-broadcast still. This slot IGNORES any studio backdrop " +
      "selection — the on-location news scene is its own environment.",
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
