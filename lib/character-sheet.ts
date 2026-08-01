/**
 * Character reference sheets — the training set for a Soul ID.
 *
 * A LoRA that locks someone's likeness needs 20+ photographs of them from varied
 * angles, in varied light, with varied expressions. Almost no buyer has that.
 * They have three or four phone pictures.
 *
 * These sheets manufacture the rest: four generated images, each a grid of views
 * of the same person, sliced back apart into ~20 individual training frames.
 *
 * Two rules here differ deliberately from the Asset Extractor's sheets
 * (lib/asset-extractor.ts), and both exist because these images are training
 * data rather than something a human looks at:
 *
 *   1. NO PRINTED LABELS. The asset sheets caption each panel so a creator can
 *      read them. A caption inside a training crop teaches the LoRA to draw
 *      text on faces.
 *   2. THE BACKDROP AND LIGHT CHANGE BETWEEN SHEETS. The asset sheets hold one
 *      grey backdrop so a library looks like one set. Doing that here would
 *      train the person *and* the grey wall together, and every boudoir image
 *      would come back on a grey wall in flat light. Identity is what must stay
 *      constant; everything around it should move.
 */

export interface SheetPanel {
  id: string;
  label: string;      // used for filenames and the approval UI, never printed
  directive: string;
}

export interface CharacterSheet {
  id: string;
  label: string;         // shown to the buyer on the approval screen
  cols: number;          // slicing geometry — we author the grid, so cropping is exact
  rows: number;
  aspect: string;        // aspect ratio to request, chosen to suit the grid
  scene: string;         // backdrop + lighting, deliberately different per sheet
  framing: string;       // what part of the body the panels show
  /**
   * Whether this sheet's panels join the LoRA training set.
   *
   * The hands sheet does not. The trainer crops each frame to its subject, so a
   * hand-only frame teaches the trigger phrase to mean "a hand" — four such
   * frames out of twenty-four is a real dilution of the face signal. It is still
   * generated and still shown, because a character bible wants hands; it just
   * does not train.
   */
  trainable: boolean;
  panels: SheetPanel[];
}

const P = (id: string, label: string, directive: string): SheetPanel => ({ id, label, directive });

/**
 * The layout contract. Same technique the Asset Extractor arrived at the hard
 * way: state the count as a number, then repeat it as a prohibition. Given any
 * latitude the model pads a grid out by duplicating views — a two-view sheet came
 * back as four panels, and a two-view sheet came back as three with one invented.
 */
function sheetRules(sheet: CharacterSheet): string {
  const n = sheet.panels.length;
  const layout = sheet.rows === 1
    ? `arranged side by side in a single row of ${sheet.cols}`
    : `arranged as ${sheet.rows} rows of ${sheet.cols}`;
  return [
    `SHEET LAYOUT — produce ONE single image containing EXACTLY ${n} panels, ${layout}, ` +
    "in the order listed, read left to right then top to bottom.",

    `THE COUNT IS FIXED: there are ${n} panels, no more and no fewer. Do not repeat a ` +
    "view, do not duplicate a panel to fill space, do not add a view that is not on the " +
    "list, and do not leave a panel empty.",

    "Every panel is exactly the same size and together they fill the whole frame edge to " +
    "edge, with no border, margin or gap around the outside and no visible dividing line " +
    "between panels — the panels sit flush against each other.",

    // Printed captions would end up inside the training crops.
    "PRINT NO TEXT ANYWHERE. No panel labels, no captions, no numbers, no watermark, no " +
    "measurement scale, no colour swatches. The sheet contains photographs and nothing else.",
  ].join(" ");
}

/**
 * What must not change between panels, and between sheets. This is the whole
 * point: the LoRA learns whatever is constant across the training set, so the
 * person has to be the only constant thing.
 */
const IDENTITY_LOCK =
  "THE SAME PERSON IN EVERY PANEL — this is one individual photographed several times, " +
  "not several similar people. Face shape, eye colour, eye spacing, nose, mouth, jawline, " +
  "brow shape, skin tone and undertone, freckles, moles, scars, hairline, hair colour and " +
  "hair texture, body build and proportions are taken from the reference photographs and " +
  "are identical in every panel. Do not slim, smooth, lighten, symmetrise, straighten " +
  "teeth, remove blemishes or otherwise beautify: the likeness is the product, and a " +
  "prettier stranger is a failed sheet. Keep real skin texture — pores, fine lines, " +
  "natural asymmetry — and photograph the person at the age they actually are.";

/**
 * People change their hair. The reference photographs for one buyer came back
 * with three different hairstyles — long and straight, a bob with a fringe, and
 * a burgundy bob — so each sheet picked a different one and the set disagreed
 * with itself. A LoRA trained on that either bakes in an arbitrary style or
 * blends them.
 *
 * So one hairstyle is chosen and every sheet is held to it.
 */
const HAIR_LOCK =
  "ONE HAIRSTYLE ACROSS THE WHOLE SHEET — the reference photographs may show this " +
  "person with different hair on different days. Choose the single hairstyle that " +
  "appears in the clearest, most front-facing reference and use ONLY that one: the " +
  "same length, the same cut, the same parting, the same colour and the same texture " +
  "in every panel. Do not mix two hairstyles and do not change the hair between panels.";

/** The anchor clause used for every sheet after the first. */
export function anchorClause(): string {
  return "MATCH THE ANCHOR — the FIRST attached image is a reference sheet of this same " +
    "person that has already been approved. It is the authority on their appearance: " +
    "copy its hairstyle, hair length, hair colour, skin tone and facial features exactly. " +
    "Where the anchor and the other photographs disagree, the anchor wins. The remaining " +
    "attached photographs are supporting likeness references only.";
}

const PHOTOGRAPHIC =
  "Photographic, not illustrated: a real camera, realistic depth of field, physically " +
  "plausible light, natural skin. No 3D render, no painting, no plastic sheen, no beauty " +
  "filter, no CGI look.";

export const CHARACTER_SHEETS: CharacterSheet[] = [
  {
    id: "turnaround",
    trainable: true,
    label: "Full-body turnaround",
    cols: 4, rows: 1, aspect: "16:9",
    // Plain and even, because this sheet carries proportion information and
    // shadows would hide the silhouette.
    scene:
      "Plain seamless light-grey studio backdrop, even soft frontal light from a large " +
      "softbox, minimal shadow, the full figure from head to feet inside every panel with " +
      "a small margin above the head and below the feet.",
    framing:
      "FULL BODY in all four panels, standing, feet apart at hip width, arms relaxed at " +
      "the sides, weight even. The head and the feet sit at the SAME height in every " +
      "panel so the four views can be compared — the subject does not grow or shrink " +
      "between panels. Simple fitted neutral clothing (a plain top and plain trousers or " +
      "leggings) that shows the true body shape without hiding or exaggerating it.",
    panels: [
      P("front", "Front", "Squared to camera, facing straight forward at eye level."),
      P("three-quarter", "Three-quarter", "Turned about forty-five degrees to the subject's left, still facing generally toward camera."),
      P("side", "Side profile", "Full left profile, ninety degrees to camera, looking straight ahead."),
      P("back", "Back", "Facing directly away from camera, showing the back of the head, shoulders, back and legs."),
    ],
  },
  {
    id: "expression",
    trainable: true,
    label: "Expressions",
    cols: 3, rows: 2, aspect: "1:1",
    // Warm and directional, so the LoRA sees this face lit differently from the
    // flat turnaround. Different light on the same face is what stops the LoRA
    // baking one lighting setup into every future generation.
    scene:
      "Warm neutral backdrop in soft focus, directional window light from the subject's " +
      "left, gentle falloff to the right of the face, shallow depth of field.",
    framing:
      "HEAD AND SHOULDERS in every panel, squared to camera at eye level, the face " +
      "occupying most of the panel, eyes on the upper third. The framing, distance and " +
      "lighting are identical across all six panels — only the expression changes.",
    panels: [
      P("neutral", "Neutral", "Relaxed neutral face, lips closed, eyes open and looking into the lens."),
      P("soft-smile", "Soft smile", "A small closed-lip smile, eyes softly engaged."),
      P("open-smile", "Open smile", "A genuine open smile showing the upper teeth, eyes creasing naturally at the corners."),
      P("laughing", "Laughing", "Caught mid-laugh, head very slightly back, eyes narrowed by the laugh."),
      P("serious", "Serious", "Composed and direct, brows level, chin slightly down, holding the lens."),
      P("sultry", "Sultry", "Lids slightly lowered, lips softly parted, chin a little down and turned, gaze held on the lens."),
    ],
  },
  {
    id: "head",
    trainable: true,
    label: "Head angles",
    cols: 3, rows: 2, aspect: "1:1",
    // Cooler and harder, a third distinct lighting character.
    scene:
      "Deep charcoal backdrop, crisp key light slightly above and to the subject's right " +
      "with a soft fill opposite, clean catchlights in the eyes.",
    framing:
      "TIGHT HEAD CROP in every panel — the whole head and the top of the neck, cropped " +
      "just below the chin line of the frame, hair fully visible. Neutral relaxed " +
      "expression throughout; only the angle of the head changes between panels. This " +
      "sheet exists to record the face from every side, so keep it sharp and evenly " +
      "exposed on the face.",
    panels: [
      P("front", "Front", "Head squared to camera, eyes to lens."),
      P("profile-left", "Left profile", "Full left profile, ninety degrees, looking straight ahead."),
      P("profile-right", "Right profile", "Full right profile, ninety degrees, looking straight ahead."),
      P("three-quarter", "Three-quarter", "Head turned about forty-five degrees to the subject's left, eyes to lens."),
      P("tilt-up", "Chin up", "Camera slightly below eye level, chin lifted, showing the jawline and underside of the chin."),
      P("tilt-down", "Chin down", "Camera slightly above eye level, chin lowered, showing the forehead, hairline and top of the head."),
    ],
  },
  {
    id: "hands",
    trainable: false,
    label: "Hands",
    cols: 2, rows: 2, aspect: "1:1",
    scene:
      "Plain soft mid-tone backdrop, even diffused light, shallow depth of field, hands " +
      "sharp throughout.",
    framing:
      "HANDS ONLY in every panel, cropped at the forearm, filling the panel. The same " +
      "person's hands in all four: the same skin tone, the same finger length and shape, " +
      "the same nails. Anatomically correct — five fingers on every hand, natural joints, " +
      "no extra or fused digits.",
    panels: [
      P("relaxed", "Relaxed", "One hand open and relaxed, palm down, fingers slightly apart, seen from above."),
      P("soft-fist", "Soft fist", "One hand loosely closed, seen from the side, knuckles toward camera."),
      P("touching-face", "Near the face", "One hand raised as if about to touch the jaw, fingers gently curved, seen three-quarter."),
      P("both", "Both hands", "Both hands together, one resting over the other, seen from above."),
    ],
  },
];

export const CHARACTER_SHEET_IDS = new Set(CHARACTER_SHEETS.map((s) => s.id));
export const characterSheetById = (id: string): CharacterSheet | undefined =>
  CHARACTER_SHEETS.find((s) => s.id === id);

/** Total training frames the four sheets yield. */
export const TOTAL_SHEET_PANELS = CHARACTER_SHEETS.reduce((n, s) => n + s.panels.length, 0);

/**
 * The generation prompt for one sheet. Reference photographs of the real person
 * are attached alongside; identityProfile is the written description Stage 1
 * already produced, which anchors details a photograph can leave ambiguous.
 */
export function buildCharacterSheetPrompt(
  sheet: CharacterSheet,
  identityProfile?: string,
  hasAnchor = false
): string {
  return [
    "CHARACTER REFERENCE SHEET. The attached photographs show one real person. Produce a " +
    "single studio reference sheet of THAT SAME PERSON, photographed from the views listed " +
    "below. This is a likeness task, not a design task.",

    IDENTITY_LOCK,

    hasAnchor ? anchorClause() : HAIR_LOCK,

    identityProfile?.trim()
      ? "WRITTEN IDENTITY PROFILE — treat this as binding wherever the photographs are " +
        "unclear: " + identityProfile.trim()
      : "",

    "SCENE — " + sheet.scene,

    "FRAMING — " + sheet.framing,

    sheetRules(sheet),

    "THE PANELS, IN ORDER — " +
      sheet.panels.map((p, i) => `PANEL ${i + 1}: ${p.directive}`).join(" "),

    PHOTOGRAPHIC,
  ].filter(Boolean).join(" ");
}

/**
 * Where each panel sits in the finished image, as fractions of width and height.
 * We author the grid and forbid outer margins, so these rectangles are exact and
 * no vision call is needed to find the panels.
 *
 * A small inset is taken off every edge: the model tends to soften the last few
 * pixels where two panels meet, and a sliver of the neighbouring panel inside a
 * training crop is worse than losing a little of the subject.
 */
export const PANEL_INSET = 0.012;

export function panelRects(sheet: CharacterSheet): Array<{ panel: SheetPanel; left: number; top: number; width: number; height: number }> {
  const cw = 1 / sheet.cols;
  const ch = 1 / sheet.rows;
  return sheet.panels.map((panel, i) => {
    const col = i % sheet.cols;
    const row = Math.floor(i / sheet.cols);
    return {
      panel,
      left: col * cw + PANEL_INSET,
      top: row * ch + PANEL_INSET,
      width: cw - PANEL_INSET * 2,
      height: ch - PANEL_INSET * 2,
    };
  });
}
