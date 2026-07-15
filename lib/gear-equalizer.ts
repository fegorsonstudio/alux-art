/**
 * gear-equalizer.ts — "The Gear Equalizer" photo-upgrade rules (photo_upgrade category).
 *
 * A photographer uploads photos they already shot (any camera, any lighting) and
 * taps a lighting rig + a camera look (+ optional backdrop swap). Every prompt is
 * DETERMINISTIC — built here from the clicked presets, no AI planner involved.
 * The uploaded photo itself is the edit base sent to fal; the directives below
 * relight and upgrade it while preserving the subject pixel-faithfully.
 */

export interface GearPreset {
  id: string;
  name: string;   // card title shown to buyers
  blurb: string;  // one-line card subtitle
  directive: string;
}

// ── Lighting rigs ─────────────────────────────────────────────────────────────
export const LIGHTING_PRESETS: GearPreset[] = [
  {
    id: "rembrandt",
    name: "The Master Class",
    blurb: "Rembrandt light — sculpted, moody, timeless",
    directive:
      "Relight the scene as a classic Rembrandt portrait setup: a single large key light " +
      "at roughly 45 degrees camera-left and slightly above eye level, sculpting the face " +
      "with a soft graduated falloff and forming the signature small triangle of light on " +
      "the shadow-side cheek just below the eye. Gentle controlled fill keeps shadow detail; " +
      "the background falls off darker and moodier than the subject. Catchlights sit high " +
      "in the eyes, consistent with the key position.",
  },
  {
    id: "rim_editorial",
    name: "The Editorial Edge",
    blurb: "Rim light separation — bold magazine look",
    directive:
      "Relight the scene with a high-dynamic editorial rig: crisp rim/kicker lights from " +
      "behind-left and behind-right tracing bright clean edges along the subject's hair, " +
      "shoulders, and arms, separating them cleanly from a background that falls off darker. " +
      "A controlled soft key from the front keeps the face well exposed with confident " +
      "contrast. Highlights are precise, never blown; the rim glow follows real edge geometry.",
  },
  {
    id: "beauty_dish",
    name: "The Beauty Dish",
    blurb: "High-key clamshell glamour — luminous, even skin",
    directive:
      "Relight the scene as a high-key beauty setup: a beauty dish directly in front and " +
      "slightly above the subject with a soft fill reflector from below (clamshell), " +
      "producing bright, even, near-shadowless glamour light with luminous skin, a subtle " +
      "shadow under the chin, and round catchlights centered-high in the eyes. The overall " +
      "exposure is bright and clean without clipping highlights.",
  },
  {
    id: "butterfly",
    name: "Hollywood Butterfly",
    blurb: "Classic Paramount glamour light",
    directive:
      "Relight the scene as classic Hollywood butterfly (Paramount) lighting: the key light " +
      "centered directly in front of and above the subject, casting the signature small " +
      "symmetric butterfly-shaped shadow directly under the nose, with elegant symmetrical " +
      "modelling of the cheekbones and a gentle vignette of light on the background behind " +
      "the head. Glamorous, symmetric, and polished.",
  },
  {
    id: "golden_hour",
    name: "Golden Hour",
    blurb: "Warm low sun — cinematic and flattering",
    directive:
      "Relight the scene as true golden-hour sunlight: a warm, low-angle sun as the key, " +
      "casting rich golden highlights across the face, hair, and shoulders with long soft " +
      "shadows and a gentle warm haze in the ambience. Skin glows warm; shadow areas stay " +
      "soft and readable. The color temperature shifts warm coherently across subject and " +
      "environment alike.",
  },
  {
    id: "window_soft",
    name: "The Natural Window",
    blurb: "Soft directional daylight — honest and editorial",
    directive:
      "Relight the scene with a single large window of soft natural daylight from one side: " +
      "gentle directional wraparound light with smooth, wide highlight-to-shadow transitions, " +
      "soft natural catchlights shaped like a window pane, and a calm, honest editorial mood. " +
      "No artificial-looking hotspots; everything reads as beautiful available light.",
  },
  {
    id: "split_drama",
    name: "The Split Drama",
    blurb: "Half-lit chiaroscuro — maximum mood",
    directive:
      "Relight the scene as dramatic split lighting: the key light exactly to one side so one " +
      "half of the face is lit and the other falls into deep, clean shadow with a knife-edge " +
      "transition down the middle. Low-key exposure, rich chiaroscuro contrast, a restrained " +
      "rim on the shadow side to hold separation, and a dark, quiet background.",
  },
];

// ── Camera & lens looks ───────────────────────────────────────────────────────
export const CAMERA_PRESETS: GearPreset[] = [
  {
    id: "medium_format",
    name: "Hasselblad Medium-Format",
    blurb: "100MP depth — texture, dynamic range, presence",
    directive:
      "Render the photograph at the quality of a Hasselblad medium-format digital back: " +
      "enormous dynamic range with detailed highlights and open shadows, rich accurate color " +
      "depth, and true-to-life micro texture — real skin pores, individual hair strands, " +
      "fabric weave — with absolutely no plastic smoothing or artificial sharpening halos.",
  },
  {
    id: "f12_bokeh",
    name: "85mm f/1.2 Prime",
    blurb: "Tack-sharp subject, melted creamy background",
    directive:
      "Render the photograph as if shot on an 85mm f/1.2 portrait prime wide open: the " +
      "subject's eyes and face tack-sharp with crisp micro-detail, while the EXISTING " +
      "background content melts into gorgeous creamy bokeh with soft round highlight discs — " +
      "the background's content and colors stay the same, only optically defocused with a " +
      "natural depth falloff (sharpness gradually decreasing behind the subject's focal plane).",
  },
  {
    id: "leica_cine",
    name: "Leica Cinematic",
    blurb: "Filmic contrast and micro-contrast — moody, artistic",
    directive:
      "Render the photograph with the Leica cinematic signature: high micro-contrast and " +
      "crisp detail, a moody filmic tonal curve with deep but readable blacks, restrained " +
      "saturation with character, and an overall high-end cinema-still feel.",
  },
  {
    id: "portra_film",
    name: "Kodak Portra Film",
    blurb: "Legendary film color — soft rolloff, organic grain",
    directive:
      "Render the photograph with Kodak Portra 400 film color science: gentle highlight " +
      "rolloff, warm natural skin tones, softly muted yet rich colors, and a fine organic " +
      "film grain structure — an analog, timeless print feel with modern sharpness underneath.",
  },
  {
    id: "crisp_digital",
    name: "Modern Mirrorless",
    blurb: "Flagship digital — neutral, ultra-clean, precise",
    directive:
      "Render the photograph at flagship modern mirrorless quality: neutral accurate color, " +
      "ultra-clean noise-free files, precise white balance, crisp edge-to-edge sharpness, " +
      "and technically perfect exposure — a spotless contemporary commercial finish.",
  },
];

export const LIGHTING_PRESET_IDS = new Set(LIGHTING_PRESETS.map((p) => p.id));
export const CAMERA_PRESET_IDS = new Set(CAMERA_PRESETS.map((p) => p.id));

// ── Buyer selection ───────────────────────────────────────────────────────────
export interface EnhanceSelection {
  lighting: string;              // LIGHTING_PRESETS id
  camera: string;                // CAMERA_PRESETS id
  backdropOptionId: string | null; // background_options option id, null = keep own background
}

export function sanitizeEnhanceSelection(
  raw: unknown,
  validBackdropIds: Set<string>
): EnhanceSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lighting = typeof o.lighting === "string" && LIGHTING_PRESET_IDS.has(o.lighting) ? o.lighting : null;
  const camera = typeof o.camera === "string" && CAMERA_PRESET_IDS.has(o.camera) ? o.camera : null;
  if (!lighting || !camera) return null;
  const backdropOptionId =
    typeof o.backdropOptionId === "string" && validBackdropIds.has(o.backdropOptionId)
      ? o.backdropOptionId
      : null;
  return { lighting, camera, backdropOptionId };
}

// ── The deterministic edit prompt ─────────────────────────────────────────────
// The source photo is IMAGE 1 (the edit base). When swapping backgrounds, the
// backdrop plate rides along as IMAGE 2.
export function buildGearEqualizerPrompt(sel: EnhanceSelection, backdropAttached: boolean): string {
  const lighting = LIGHTING_PRESETS.find((p) => p.id === sel.lighting) ?? LIGHTING_PRESETS[0];
  const camera = CAMERA_PRESETS.find((p) => p.id === sel.camera) ?? CAMERA_PRESETS[0];

  const parts: string[] = [
    // 1. Preservation lock — leads the prompt, non-negotiable.
    "PROFESSIONAL RETOUCH / RELIGHT of the attached photograph (IMAGE 1) — this is an EDIT " +
      "of that exact photograph, NOT a new image. Preserve pixel-faithfully and without " +
      "exception: the subject's identity, facial structure, skin tone, expression, gaze, " +
      "pose, hands and fingers, body proportions, clothing and its exact folds, hair, any " +
      "other people present, and the exact composition, framing, and crop of IMAGE 1. Do " +
      "not add, remove, move, resize, or re-imagine ANY person or object.",

    // 2. Lighting.
    "LIGHTING UPGRADE — change ONLY the light: " + lighting.directive + " All shadows, " +
      "highlights, reflections, and catchlights must be physically consistent with this " +
      "new lighting across the subject and the environment.",

    // 3. Camera / rendering quality.
    "CAMERA QUALITY UPGRADE — " + camera.directive + " Restore and enhance fine detail the " +
      "original sensor could not capture (skin texture, fabric weave, hair strands, eye " +
      "detail); remove digital noise and compression artifacts; correct white balance and " +
      "exposure. Enhancement must REVEAL what is in the photograph — never alter geometry, " +
      "features, or content.",

    // 4. Background.
    backdropAttached
      ? "BACKGROUND SWAP — replace ONLY the environment/background with the attached backdrop " +
        "reference (IMAGE 2): place the untouched subject into that backdrop with matching " +
        "perspective, camera height, and floor line, lit consistently with the new lighting. " +
        "Edge transitions (hair, fabric edges) must be clean and natural. The subject " +
        "themselves remains exactly as in IMAGE 1."
      : "BACKGROUND — keep the existing background and environment of IMAGE 1 exactly as it " +
        "is (same location, same objects, same framing), re-lit consistently with the new " +
        "lighting described above.",

    // 5. Weak-source restoration.
    "SOURCE RESTORATION — if IMAGE 1 is low-resolution, noisy, soft, or poorly compressed, " +
      "faithfully restore it: reconstruct plausible fine detail true to what is visible, " +
      "without changing any shape, proportion, or feature. The result must look like the " +
      "same photograph captured on far better gear — recognizably identical, dramatically " +
      "better rendered. Realistic skin texture, subtle film grain, physically plausible " +
      "light. No beautification, no face slimming, no body reshaping.",
  ];

  return parts.join(" ");
}

// Reference-map text appended so the model knows what each attached image is.
export function buildGearReferenceMapText(backdropAttached: boolean): string {
  return backdropAttached
    ? " REFERENCE IMAGE MAP — the attached images in order: IMAGE 1: the source photograph " +
      "to retouch/relight (the edit base — its subject and composition are the output). " +
      "IMAGE 2: the backdrop reference — the new environment only."
    : " REFERENCE IMAGE MAP — the attached image: IMAGE 1: the source photograph to " +
      "retouch/relight (the edit base — its subject and composition are the output).";
}
