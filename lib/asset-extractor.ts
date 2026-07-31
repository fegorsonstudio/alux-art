/**
 * asset-extractor.ts — "The Asset Extractor" (asset_extract category).
 *
 * A creator uploads ordinary photographs of people wearing things and gets back
 * platform-ready assets: the garment as a ghost-mannequin product shot, the wig
 * on an invisible head form, the shoes as a pair, the backdrop with everyone
 * removed. Those assets are what a template is built from, and most
 * photographers do not own product photography — they own pictures of clients.
 *
 * Every prompt here is DETERMINISTIC, built from the buyer's ticked choices with
 * no AI planner, exactly like lib/gear-equalizer.ts.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE
 *
 * 1. Ghost mannequin, always. The generation pipeline tells the model to take a
 *    garment reference and fit it to the subject's real body, never to copy the
 *    mannequin's hollow form or its proportions (lib/generate.ts, mannequinGuard).
 *    An asset that still contains a person, a head or a pair of hands breaks that
 *    and produces distorted shoots downstream.
 *
 * 2. Reproduce, never redesign. The Gear Equalizer learned this the expensive
 *    way: a child's pearl crown came back as a different jewelled tiara because
 *    the prompt asked for a better picture. An extracted asset that looks more
 *    expensive than the real object is worthless — the creator is selling the
 *    thing they own.
 */

/** Tags a template asset may carry. Mirrors TEMPLATE_TAGS in the creator dashboard
 *  and VALID_TAGS in the marketplace book route; a kind whose tag is not in that
 *  set can never be attached to a template. */
export type AssetTag =
  | "OUTFIT" | "GOWN" | "SUIT" | "SCRUBS"
  | "HAIRSTYLE" | "WIG" | "MAKEUP" | "NAIL_DESIGN"
  | "ACCESSORY" | "SASH" | "COLLAR_MALE" | "COLLAR_FEMALE"
  // LIGHTING and COLOR_GRADE are carried by choice groups rather than
  // template_images rows — they are recipes, not pictures.
  | "BACKGROUND" | "LIGHTING" | "COLOR_GRADE";

export interface AssetAngle {
  id: string;      // "front" | "back" | "side" ...
  label: string;   // shown to the buyer
  directive: string;
}

export interface AssetKind {
  id: string;
  label: string;        // card title
  blurb: string;        // one-line card subtitle
  tag: AssetTag;
  // "image" — fal renders one picture per angle, saved as a template_images row.
  // "text"  — a vision model WRITES a reusable recipe. Lighting and colour grade
  //           are not objects that can be photographed out of a picture; they are
  //           descriptions of how a picture was lit and graded, and the platform
  //           already consumes them as text: a lighting choice-group option holds
  //           its recipe in `description` (kind "prompt"), and a colour grade is a
  //           choice-group option of kind "text". Rendering them as pictures would
  //           produce something unusable by either.
  output: "image" | "text";
  angles: AssetAngle[]; // one asset per entry
  directive: string;    // what to extract and how to present it
}

// ── Shared presentation rules ────────────────────────────────────────────────
// Appended to every kind so the whole library looks like one catalogue rather
// than a pile of unrelated cut-outs.
const PRESENTATION =
  "PRESENTATION — plain seamless MID-GREY background (a clearly grey studio " +
  "backdrop, roughly 55-65% lightness — visibly grey, not white and not " +
  "near-white), consistent across every asset so a library of them reads as one " +
  "set, even " +
  "shadowless studio light with no cast shadow on the backdrop, the item centred " +
  "and filling most of the frame with a small even margin, sharp throughout, " +
  "true-to-life colour, realistic material texture (weave, grain, sheen), and " +
  "absolutely nothing else in the frame — no people, no props, no text, no " +
  "watermark, no packaging, no hanger unless the item is hung.";

const FIDELITY =
  "FIDELITY — reproduce the item EXACTLY as it appears in the photograph: the " +
  "same colour, cut, proportions, fabric, print, pattern, embroidery, beadwork, " +
  "sequins, lace, trim, buttons, zips, buckles, hardware, straps and lettering, " +
  "in the same positions and the same counts. Where a part is hidden or unclear " +
  "in the source, reconstruct the most plausible continuation of what IS visible " +
  "— never invent a different design. Do not tidy, restyle, simplify, recolour, " +
  "straighten, symmetrise or make the item look more expensive. An asset that " +
  "looks better than the real object is a FAILED result: the creator is selling " +
  "the thing they own. State it plainly: a beaded bodice keeps the SAME beads in " +
  "the SAME places and the same count, not a richer arrangement; a printed fabric " +
  "keeps the same print at the same scale in the same position; lace keeps its own " +
  "pattern; a plain garment stays plain and gains no decoration; buttons, zips and " +
  "hardware keep their number, size and spacing. Where the source is soft or " +
  "low-resolution, resolve the detail that is genuinely there — never upgrade the " +
  "design while sharpening it.";

const NO_PERSON =
  "NO PERSON — the human being in the source photograph must be completely " +
  "absent from the output: no face, no head, no neck, no hands, no arms, no legs, " +
  "no skin, no hair. Remove them entirely and reconstruct whatever they were " +
  "covering.";

const DISPLAY_FORM =
  "DISPLAY FORM — present the item on a plain matte white articulated display " +
  "form (the jointed white mannequin used in jewellery catalogues): smooth " +
  "featureless white material with visible segment joints, no skin texture, no " +
  "skin tone, no fingernails, no veins, no hair, no face. The form is a neutral " +
  "stand, never a person, and must read unmistakably as a mannequin.";

const GHOST =
  "GHOST MANNEQUIN — present the garment as a professional invisible-mannequin " +
  "product shot: filled out to a natural worn shape with the body removed, hollow " +
  "at the neck, cuffs and hem so the inside of the garment is visible where it " +
  "would be. No mannequin, stand, dress form, hanger or support of any kind is " +
  "visible. The garment holds its own shape as though worn by someone invisible.";

const A = (id: string, label: string, directive: string): AssetAngle => ({ id, label, directive });

// ── One asset kind = one image ───────────────────────────────────────────────
// A gown used to cost three slots (front, back, side) and arrive as three
// separate files. The creator wants one picture per thing, with the views laid
// out inside it — three images for three ticked kinds, not seven. That is also
// the better reference: a template that points at a single sheet shows the
// generator every side of the garment at once instead of one arbitrary view.
export const SHEET_ANGLE_ID = "sheet";

const SHEET_RULES =
  "SHEET LAYOUT — produce ONE single image divided into equal panels arranged " +
  "as a grid in the order listed, reading left to right then top to bottom, " +
  "separated by a thin neutral gap: FOUR panels are two rows of two, three " +
  "panels sit in one row, two panels sit side by side. The mid-grey " +
  "backdrop runs continuously behind every panel so the sheet reads as one " +
  "photograph, not a pasted-together collage. Every panel shows the SAME single " +
  "item at the SAME scale under the SAME light — only the viewing angle changes " +
  "between them. Print each panel's name in small plain grey type under it. " +
  "Where the framing rule below says the item fills the frame, it means the item " +
  "fills ITS OWN PANEL. Every panel is the same size and the grid fills the " +
  "whole frame edge to edge.";

/**
 * The single view a kind renders as. Multi-view kinds collapse into one sheet;
 * single-view kinds are unchanged and gain no layout instruction.
 */
export function assetSheetAngle(kind: AssetKind): AssetAngle {
  if (kind.angles.length <= 1) return kind.angles[0];
  return {
    id: SHEET_ANGLE_ID,
    label: kind.angles.map((a) => a.label).join(" / "),
    directive:
      SHEET_RULES + " THE PANELS, IN ORDER — " +
      kind.angles.map((a, i) => `PANEL ${i + 1} (${a.label}): ${a.directive}`).join(" "),
  };
}

/** Resolve a plan entry's angle. Shoots booked before the sheet change still
 *  carry real angle ids, so both forms have to keep working. */
export function assetAngleById(kind: AssetKind, angleId: string): AssetAngle | undefined {
  if (angleId === SHEET_ANGLE_ID) return assetSheetAngle(kind);
  return kind.angles.find((a) => a.id === angleId);
}

const FRONT = A("front", "Front", "Show the front of the item, squared to camera at eye level.");
const BACK  = A("back",  "Back",  "Show the BACK of the item, squared to camera at eye level — the reverse of the front view, reconstructed faithfully from the construction visible in the source.");
const SIDE  = A("side",  "Side",  "Show the item in profile from its left side, so the silhouette and depth read clearly.");
// The fourth garment view. A close-up detail crop would read better for prints
// and beadwork, but it breaks the same-scale rule that lets the four panels be
// compared — so the turnaround gains an angle instead of a zoom.
const THREE_QUARTER = A("three-quarter", "Three-quarter",
  "Show the item turned roughly forty-five degrees between the front and the left side, " +
  "so the way the front meets the side reads clearly and the true volume and depth of " +
  "the shape are visible.");

// ── The catalogue ────────────────────────────────────────────────────────────
export const ASSET_KINDS: AssetKind[] = [
  {
    id: "outfit",
    label: "Outfit",
    blurb: "One sheet — front, three-quarter, side and back",
    tag: "OUTFIT",
    output: "image" as const,
    angles: [FRONT, THREE_QUARTER, SIDE, BACK],
    directive:
      "Extract the complete outfit the person is wearing — every garment layer " +
      "together as one coordinated look (dress, top, trousers, skirt, jacket, " +
      "wrapper) but NOT the shoes, bag, jewellery, headwear or hair.",
  },
  {
    id: "gown",
    label: "Gown / dress",
    blurb: "One sheet — front, three-quarter, side and back",
    tag: "GOWN",
    output: "image" as const,
    angles: [FRONT, THREE_QUARTER, SIDE, BACK],
    directive:
      "Extract the gown or dress only, full length including any train, and " +
      "nothing else the person is wearing or holding.",
  },
  {
    id: "suit",
    label: "Suit",
    blurb: "One sheet — front, three-quarter, side and back",
    tag: "SUIT",
    output: "image" as const,
    angles: [FRONT, THREE_QUARTER, SIDE, BACK],
    directive:
      "Extract the suit as worn — jacket over shirt with trousers, keeping the " +
      "lapel shape, button stance, pocket style and any tie or pocket square in " +
      "place. Exclude shoes and accessories.",
  },
  {
    id: "scrubs",
    label: "Scrubs",
    blurb: "One sheet — front and back",
    tag: "SCRUBS",
    output: "image" as const,
    angles: [FRONT, BACK],
    directive:
      "Extract the scrubs set — top and trousers together — keeping the exact " +
      "colour, neckline, pocket placement and any embroidery or badge.",
  },
  {
    id: "wig",
    label: "Wig / hairstyle",
    blurb: "On an invisible head form — front and back",
    tag: "WIG",
    output: "image" as const,
    angles: [FRONT, BACK],
    directive:
      "Extract the hair or wig as a standalone hairpiece, holding its styled " +
      "shape on an invisible head form. Keep the exact length, colour, parting, " +
      "curl pattern, braid pattern, density and any beads or accessories in the " +
      "hair. No face, scalp or skin is visible anywhere.",
  },
  {
    id: "shoes",
    label: "Shoes",
    blurb: "The pair, three-quarter view",
    tag: "ACCESSORY",
    output: "image" as const,
    angles: [A("pair", "Pair", "Show BOTH shoes as a pair, angled three-quarter to camera, one slightly ahead of the other, both fully visible from toe to heel.")],
    directive:
      "Extract the footwear only, both shoes of the pair, keeping the exact " +
      "colour, material, heel height and shape, sole, straps, buckles and any " +
      "embellishment.",
  },
  {
    id: "bag",
    label: "Bag",
    blurb: "Standing upright, front three-quarter",
    tag: "ACCESSORY",
    output: "image" as const,
    angles: [A("front", "Front", "Show the bag standing upright, angled slightly three-quarter, handles or straps arranged naturally and fully visible.")],
    directive:
      "Extract the bag or purse only, keeping the exact shape, colour, material, " +
      "hardware, clasp, stitching and any logo or charm exactly as they appear.",
  },
  {
    id: "jewellery",
    label: "Jewellery",
    blurb: "One sheet — hands, neck and ears, as worn",
    tag: "ACCESSORY",
    output: "image" as const,
    angles: [
      A("hands",
        "Hands",
        "Show a pair of matte white articulated display hands side by side, backs " +
        "of the hands to camera, fingers together and straight, wrists at the top " +
        "of the frame. Place each hand-worn piece on the SAME hand and the SAME " +
        "finger it is worn on in the source: a ring on the third finger of the " +
        "right hand appears on the third finger of the right hand here, a watch on " +
        "the left wrist stays on the left wrist. Label the two hands with small " +
        "neutral grey text reading LEFT HAND and RIGHT HAND above each wrist. If " +
        "the source shows only one hand, show only that hand and label it."),
      A("neck",
        "Neck and ears",
        "Show the neck-worn and ear-worn pieces on plain matte white forms: a " +
        "necklace or pendant hung on a featureless white neck-and-shoulders bust " +
        "with the chain falling naturally and the pendant centred, and any " +
        "earrings on small white ear forms beside it, left and right kept on their " +
        "own sides. Omit this view entirely if no neck or ear jewellery is worn."),
    ],
    directive:
      "Extract every piece of jewellery worn — rings, bracelets, bangles, watch, " +
      "necklace, pendant, earrings, brooch — keeping the exact design, metal " +
      "colour, stone shape, stone colour, stone count and the size relationships " +
      "between pieces. Which hand, which finger and which wrist each piece is worn " +
      "on is part of the item and must be preserved.",
  },
  {
    id: "belt",
    label: "Belt",
    blurb: "Full length with the buckle square to camera",
    tag: "ACCESSORY",
    output: "image" as const,
    angles: [A("front",
      "Front",
      "Lay the belt out with a gentle even curve so its full length is in frame, " +
      "buckle at the centre and squared to camera so its shape, mechanism and any " +
      "engraving read clearly, strap tapering away evenly on both sides with the " +
      "tip and the punched holes visible.")],
    directive:
      "Extract the belt only, keeping the exact strap width, length, material, " +
      "colour, texture and stitching, and reproducing the buckle precisely — its " +
      "shape, metal colour, mechanism, prong, keeper loops and any logo, monogram " +
      "or engraving on it.",
  },
  {
    id: "headwear",
    label: "Headwear",
    blurb: "Gele, cap, hat, crown or veil",
    tag: "ACCESSORY",
    output: "image" as const,
    angles: [FRONT, BACK],
    directive:
      "Extract the headwear only — gele, headwrap, cap, hat, crown, tiara or " +
      "veil — holding its tied or worn shape on an invisible head form, with the " +
      "exact fabric, print, folds, pleats, stones and structure preserved. No " +
      "face, hair or skin visible.",
  },
  {
    id: "nails",
    label: "Nails",
    blurb: "Hand only, design legible",
    tag: "NAIL_DESIGN",
    output: "image" as const,
    angles: [A("hand", "Hand", "Show one hand in a relaxed neutral pose with all five nails clearly visible and in focus, cropped at the wrist.")],
    directive:
      "Extract the nail design: the hand and nails only, keeping the exact nail " +
      "shape, length, base colour, art, glitter, stones and finish. Everything " +
      "above the wrist is removed.",
  },
  {
    id: "makeup",
    label: "Makeup look",
    blurb: "Face crop, the look readable",
    tag: "MAKEUP",
    output: "image" as const,
    angles: [A("face", "Face", "Crop tightly to the face, squared to camera, evenly lit so every part of the makeup reads clearly.")],
    directive:
      "Extract the makeup look — foundation finish, brow shape, eyeshadow " +
      "placement and colours, liner, lashes, blush, contour, highlight and lip " +
      "colour — reproduced exactly as applied.",
  },
  {
    id: "sash",
    label: "Sash",
    blurb: "Flat, full length, lettering legible",
    tag: "SASH",
    output: "image" as const,
    angles: [A("flat", "Flat", "Lay the sash flat and straight, full length in frame, with any lettering upright and completely legible.")],
    directive:
      "Extract the sash only, keeping the exact fabric, colour, trim and — most " +
      "importantly — any lettering or emblem reproduced character for character " +
      "in the same font, size and position.",
  },
  {
    id: "backdrop",
    label: "Backdrop",
    blurb: "The setting with all people removed",
    tag: "BACKGROUND",
    output: "image" as const,
    angles: [A("scene", "Scene", "Show the full setting as an empty space, from the same camera position and lens as the source photograph.")],
    directive:
      "Extract the environment: keep the setting exactly as photographed — the " +
      "walls, floor, furniture, decor, depth and the light in the room — and " +
      "remove every person, reconstructing whatever they were standing in front " +
      "of. This asset is the only one where the background is the subject, so the " +
      "PRESENTATION rule below does not apply to the backdrop itself: keep the " +
      "room's own lighting and colour rather than replacing it with studio light.",
  },
  {
    id: "lighting",
    label: "Lighting recipe",
    blurb: "The lighting setup, written as a reusable recipe",
    tag: "LIGHTING",
    output: "text",
    angles: [A("recipe", "Recipe", "")],
    directive:
      "Describe the LIGHTING SETUP of the photograph so it can be recreated on a " +
      "completely different photo.",
  },
  {
    id: "color_grade",
    label: "Colour grade",
    blurb: "The colour treatment, written as a reusable recipe",
    tag: "COLOR_GRADE",
    output: "text",
    angles: [A("recipe", "Recipe", "")],
    directive:
      "Describe the COLOUR AND TONE treatment of the photograph so it can be " +
      "applied to a completely different photo.",
  },
];

/** Kinds displayed on a white mannequin form rather than free-standing. */
const FORM_KINDS = new Set(["jewellery", "wig", "headwear"]);

export const ASSET_KIND_IDS = new Set(ASSET_KINDS.map((k) => k.id));
export const assetKindById = (id: string): AssetKind | undefined =>
  ASSET_KINDS.find((k) => k.id === id);

/**
 * The analysis prompt for a TEXT asset. Sent to the vision model with the source
 * photograph; the reply IS the asset.
 *
 * This mirrors the "professional lighting director" instructions in
 * scripts/lighting-import.mjs that produced the 193 looks already selling on the
 * Gear Equalizer, including the two rules learned there:
 *
 *   - never mention the subject, their clothing, or the location. The recipe is
 *     applied to a DIFFERENT photograph, so any detail of this one gets wrongly
 *     recreated on someone else.
 *   - never mention closed eyes or a hidden gaze. Saying "the eyes are not
 *     visible" reads as an instruction to close them when the recipe is applied,
 *     which is exactly what happened to the first batch and had to be rewritten.
 */
export function buildAssetAnalysisPrompt(kind: AssetKind): string {
  if (kind.id === "color_grade") {
    return [
      "You are a professional colourist. Your ONLY job is to describe the COLOUR " +
        "AND TONE treatment of the attached photograph so it can be applied to a " +
        "completely different photograph.",
      "DESCRIBE, in this order and only what is visible: the overall colour cast; " +
        "where the highlights, midtones and shadows sit in hue (for example warm " +
        "highlights against teal shadows); saturation level and whether any colour " +
        "is pushed or muted; contrast and where the black point and white point " +
        "fall; any lifted or crushed blacks; grain; and a technical name for the " +
        "look if one fits (teal and orange, bleach bypass, cross-processed, faded " +
        "film, day for night, monochrome).",
      "IGNORE COMPLETELY — never mention the person, their face, skin tone, " +
        "expression, pose, clothing, hair, accessories, the location, the objects " +
        "in the frame, the composition, the crop, or the lighting setup. You " +
        "describe how the picture was GRADED, not what is in it or how it was lit. " +
        "Never mention eyes or a gaze.",
      "OUTPUT — begin with exactly: \"Apply this colour grade. Change nothing else " +
        "except colour and tone.\" Then ONE tight paragraph of 1-3 sentences in " +
        "concrete photographic language. Then a new line reading " +
        "\"Suggested name: <a short 2-4 word name>\".",
    ].join(" ");
  }

  return [
    "You are a professional lighting director and cinematographer. Your ONLY job " +
      "is to describe the LIGHTING SETUP of the attached photograph so it can be " +
      "recreated on a completely different photograph.",
    "DESCRIBE, in this order, whatever is visible or can be confidently inferred: " +
      "the key light (direction as a clock position and height, hard or soft, its " +
      "apparent size and modifier, relative intensity); the fill and the resulting " +
      "contrast ratio; any rim, hair or kicker light and how it separates the " +
      "subject; the shadows (direction, hardness, depth, edge transition); the " +
      "colour temperature in Kelvin terms and any gels; how the light falls off on " +
      "the background; and a technical name for the setup (Rembrandt, butterfly, " +
      "split, loop, clamshell, rim-lit editorial, window light, high-key, low-key " +
      "chiaroscuro).",
    "IGNORE COMPLETELY — never mention the person, their face, identity, skin " +
      "tone, expression, pose, hands, body, clothing, hair, makeup, accessories, " +
      "props, the location, the background objects, the composition, the crop or " +
      "the camera angle. Say \"the brow\", never \"the hat\"; say \"the back of the " +
      "head\", never \"the veil\". If the eyes are closed, hidden or turned away, say " +
      "NOTHING about catchlights at all — never explain their absence, because " +
      "that reads as an instruction to close the subject's eyes when the recipe is " +
      "applied to someone else.",
    "OUTPUT — begin with exactly: \"Relight this image. Change nothing else except " +
      "the lighting.\" Then ONE tight paragraph of 1-3 sentences in concrete " +
      "photographic language, phrased as a reusable setup (\"key light from " +
      "camera-left at 45 degrees\"), not as a description of this picture. Then a " +
      "new line reading \"Suggested name: <a short 2-4 word name>\".",
  ].join(" ");
}

/** Where a finished asset is stored. Text recipes are choice-group options, not
 *  template_images rows — see the note on AssetKind.output. */
export function assetDestination(kind: AssetKind): "template_image" | "choice_option" {
  return kind.output === "text" ? "choice_option" : "template_image";
}

/** Images produced by a set of ticked kinds — this is the slot count AND the
 *  price. One ticked kind is one image: its views share a single sheet. */
export function assetImageCount(kindIds: string[]): number {
  return kindIds.reduce((n, id) => {
    const k = assetKindById(id);
    return n + (k && k.output === "image" ? 1 : 0);
  }, 0);
}

/** Text recipes produced by a selection. These cost a vision call rather than an
 *  image render, so they are counted — and can be priced — separately. */
export function assetTextCount(kindIds: string[]): number {
  return kindIds.reduce((n, id) => {
    const k = assetKindById(id);
    return n + (k && k.output === "text" ? 1 : 0);
  }, 0);
}

/** What a selection renders as, in a stable order — one entry per ticked kind. */
export function expandAssetSelection(kindIds: string[]): Array<{ kind: AssetKind; angle: AssetAngle }> {
  const out: Array<{ kind: AssetKind; angle: AssetAngle }> = [];
  for (const id of kindIds) {
    const kind = assetKindById(id);
    if (!kind) continue;
    out.push({ kind, angle: assetSheetAngle(kind) });
  }
  return out;
}

/**
 * The extraction prompt for one asset. The source photograph is IMAGE 1.
 *
 * Order is deliberate and was learned from the Gear Equalizer: the model reads
 * what must be preserved BEFORE it is told to produce anything. When the
 * "produce a beautiful product shot" instruction came first, the model treated
 * the real object as a starting point to improve on.
 */
export function buildAssetExtractPrompt(kind: AssetKind, angle: AssetAngle): string {
  return [
    "PRODUCT ASSET EXTRACTION from the attached photograph (IMAGE 1). IMAGE 1 is a " +
      "real photograph of a real person wearing or holding real objects. Your job is " +
      "to isolate ONE of those objects and present it on its own as a catalogue " +
      "product shot. This is extraction, not design: the object in the output must be " +
      "recognisably the SAME object, item for item, detail for detail.",

    "WHAT TO EXTRACT — " + kind.directive + " Everything else in IMAGE 1 is discarded.",

    FIDELITY,

    NO_PERSON,

    ...(kind.tag === "OUTFIT" || kind.tag === "GOWN" || kind.tag === "SUIT" || kind.tag === "SCRUBS"
      ? [GHOST]
      : []),

    // Jewellery, wigs and headwear are meaningless without something to sit on:
    // a flat-laid ring loses which finger it was worn on, and a wig loses its
    // styled shape. They get a white mannequin form, which the NO PERSON rule
    // above would otherwise be read as forbidding.
    ...(FORM_KINDS.has(kind.id) ? [DISPLAY_FORM] : []),

    "VIEW — " + angle.directive,

    kind.tag === "BACKGROUND" ? "" : PRESENTATION,
  ].filter(Boolean).join(" ");
}

/** Tells the model what the attached image is. */
export function buildAssetReferenceMapText(): string {
  return " REFERENCE IMAGE MAP — the attached image: IMAGE 1: the source photograph " +
    "containing the item to extract. It is the only input; nothing else is attached.";
}
