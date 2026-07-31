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
  | "BACKGROUND";

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
  angles: AssetAngle[]; // one generated image per angle
  directive: string;    // what to extract and how to present it
}

// ── Shared presentation rules ────────────────────────────────────────────────
// Appended to every kind so the whole library looks like one catalogue rather
// than a pile of unrelated cut-outs.
const PRESENTATION =
  "PRESENTATION — plain seamless neutral background (very light warm grey), even " +
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
  "the thing they own.";

const NO_PERSON =
  "NO PERSON — the human being in the source photograph must be completely " +
  "absent from the output: no face, no head, no neck, no hands, no arms, no legs, " +
  "no skin, no hair. Remove them entirely and reconstruct whatever they were " +
  "covering.";

const GHOST =
  "GHOST MANNEQUIN — present the garment as a professional invisible-mannequin " +
  "product shot: filled out to a natural worn shape with the body removed, hollow " +
  "at the neck, cuffs and hem so the inside of the garment is visible where it " +
  "would be. No mannequin, stand, dress form, hanger or support of any kind is " +
  "visible. The garment holds its own shape as though worn by someone invisible.";

const A = (id: string, label: string, directive: string): AssetAngle => ({ id, label, directive });

const FRONT = A("front", "Front", "Show the front of the item, squared to camera at eye level.");
const BACK  = A("back",  "Back",  "Show the BACK of the item, squared to camera at eye level — the reverse of the front view, reconstructed faithfully from the construction visible in the source.");
const SIDE  = A("side",  "Side",  "Show the item in profile from its left side, so the silhouette and depth read clearly.");

// ── The catalogue ────────────────────────────────────────────────────────────
export const ASSET_KINDS: AssetKind[] = [
  {
    id: "outfit",
    label: "Outfit",
    blurb: "Ghost mannequin — front, back and side",
    tag: "OUTFIT",
    angles: [FRONT, BACK, SIDE],
    directive:
      "Extract the complete outfit the person is wearing — every garment layer " +
      "together as one coordinated look (dress, top, trousers, skirt, jacket, " +
      "wrapper) but NOT the shoes, bag, jewellery, headwear or hair.",
  },
  {
    id: "gown",
    label: "Gown / dress",
    blurb: "Ghost mannequin — front, back and side",
    tag: "GOWN",
    angles: [FRONT, BACK, SIDE],
    directive:
      "Extract the gown or dress only, full length including any train, and " +
      "nothing else the person is wearing or holding.",
  },
  {
    id: "suit",
    label: "Suit",
    blurb: "Ghost mannequin — front, back and side",
    tag: "SUIT",
    angles: [FRONT, BACK, SIDE],
    directive:
      "Extract the suit as worn — jacket over shirt with trousers, keeping the " +
      "lapel shape, button stance, pocket style and any tie or pocket square in " +
      "place. Exclude shoes and accessories.",
  },
  {
    id: "scrubs",
    label: "Scrubs",
    blurb: "Ghost mannequin — front and back",
    tag: "SCRUBS",
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
    angles: [A("front", "Front", "Show the bag standing upright, angled slightly three-quarter, handles or straps arranged naturally and fully visible.")],
    directive:
      "Extract the bag or purse only, keeping the exact shape, colour, material, " +
      "hardware, clasp, stitching and any logo or charm exactly as they appear.",
  },
  {
    id: "jewellery",
    label: "Jewellery",
    blurb: "Every piece, laid out and separated",
    tag: "ACCESSORY",
    angles: [A("flat", "Flat lay", "Lay every piece flat and separated with clear space between them, each fully visible and none overlapping.")],
    directive:
      "Extract every piece of jewellery worn — earrings, necklace, bracelet, " +
      "watch, rings, brooch, hair jewellery — keeping the exact design, metal " +
      "colour, stone count, stone colour and size relationships between pieces.",
  },
  {
    id: "headwear",
    label: "Headwear",
    blurb: "Gele, cap, hat, crown or veil",
    tag: "ACCESSORY",
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
    angles: [A("scene", "Scene", "Show the full setting as an empty space, from the same camera position and lens as the source photograph.")],
    directive:
      "Extract the environment: keep the setting exactly as photographed — the " +
      "walls, floor, furniture, decor, depth and the light in the room — and " +
      "remove every person, reconstructing whatever they were standing in front " +
      "of. This asset is the only one where the background is the subject, so the " +
      "PRESENTATION rule below does not apply to the backdrop itself: keep the " +
      "room's own lighting and colour rather than replacing it with studio light.",
  },
];

export const ASSET_KIND_IDS = new Set(ASSET_KINDS.map((k) => k.id));
export const assetKindById = (id: string): AssetKind | undefined =>
  ASSET_KINDS.find((k) => k.id === id);

/** Images produced by a set of ticked kinds — this is the slot count AND the price. */
export function assetImageCount(kindIds: string[]): number {
  return kindIds.reduce((n, id) => n + (assetKindById(id)?.angles.length ?? 0), 0);
}

/** Every (kind, angle) pair a selection expands to, in a stable order. */
export function expandAssetSelection(kindIds: string[]): Array<{ kind: AssetKind; angle: AssetAngle }> {
  const out: Array<{ kind: AssetKind; angle: AssetAngle }> = [];
  for (const id of kindIds) {
    const kind = assetKindById(id);
    if (!kind) continue;
    for (const angle of kind.angles) out.push({ kind, angle });
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

    "VIEW — " + angle.directive,

    kind.tag === "BACKGROUND" ? "" : PRESENTATION,
  ].filter(Boolean).join(" ");
}

/** Tells the model what the attached image is. */
export function buildAssetReferenceMapText(): string {
  return " REFERENCE IMAGE MAP — the attached image: IMAGE 1: the source photograph " +
    "containing the item to extract. It is the only input; nothing else is attached.";
}
