/**
 * gear-equalizer.ts — "The Gear Equalizer" photo-upgrade rules (photo_upgrade category).
 *
 * A photographer uploads photos they already shot (any camera, any lighting) and
 * taps a lighting rig + a camera look (+ optional backdrop swap). Every prompt is
 * DETERMINISTIC — built here from the clicked presets, no AI planner involved.
 * The uploaded photo itself is the edit base sent to fal; the directives below
 * relight and upgrade it while preserving the subject pixel-faithfully.
 */

/**
 * Reserved backdrop id meaning "the buyer uploaded their own plate".
 *
 * Deliberately not a UUID: it must never collide with a creator's option id,
 * and it has to be recognisable in a shoot_references `note` column when
 * someone is reading rows by hand months from now.
 */
export const CUSTOM_BACKDROP_ID = "custom";

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
// A snapshotted creator lighting look assigned to one source photo (manual
// per-photo lighting). directive = the hidden recipe, snapshotted server-side.
export interface EnhanceLightingPick {
  optionId: string;
  name: string;
  directive: string;
}

export interface EnhanceSelection {
  lighting?: string;             // LIGHTING_PRESETS id (legacy single-rig path)
  // CAMERA_PRESETS id. Optional: the camera picker is hidden for now and the
  // template offers lighting only. Bookings made while it was visible still
  // carry one, and still apply it.
  camera?: string;
  // background_options option id, null = keep own background, or the reserved
  // id CUSTOM_BACKDROP_ID when the buyer uploaded their own plate.
  backdropOptionId: string | null;
  /**
   * A backdrop the BUYER uploaded, rather than one the creator published.
   *
   * A photographer who shot a set against their own wall, or who owns a plate,
   * could previously only pick from the creator's list. This carries theirs.
   * One plate per shoot — it applies to every photo in the booking, which is
   * how the creator-supplied swap has always worked.
   *
   * Nothing downstream treats it specially: the book route writes it as an
   * ordinary background_option reference and generation attaches it as IMAGE 2,
   * where the existing scale rule governs how it is rendered per crop.
   */
  customBackdrop?: { storagePath: string; storageBucket: string };
  // Manual per-photo lighting: source photo storagePath → creator lighting look.
  // When present, overrides the single rig per photo in generation.
  lightingByPath?: Record<string, EnhanceLightingPick>;
  /**
   * Deliver the finished files with their metadata containers removed — EXIF,
   * XMP, IPTC, and the C2PA box that says the image was AI-generated.
   *
   * Read the header of lib/strip-metadata.ts before describing this to a buyer.
   * It removes what a file SAYS. It cannot remove SynthID, which Google writes
   * into the pixels themselves, so it does not make an image undetectable.
   */
  stripMetadata?: boolean;
}

export function sanitizeEnhanceSelection(
  raw: unknown,
  validBackdropIds: Set<string>,
  // Creator lighting looks (optionId → snapshot source), from the template's
  // "lighting" choice group. Empty when the template has no manual lighting.
  lightingLooks: Map<string, { name: string; directive: string }> = new Map()
): EnhanceSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // No longer required — a missing camera means "lighting only", not an invalid
  // booking. Rejecting here made every new booking fail the moment the picker
  // came off the page.
  const camera = typeof o.camera === "string" && CAMERA_PRESET_IDS.has(o.camera) ? o.camera : null;

  // Manual per-photo lighting: client sends { storagePath: optionId }; snapshot
  // the hidden recipe server-side (never trusted from the client).
  let lightingByPath: Record<string, EnhanceLightingPick> | undefined;
  if (o.lightingByPath && typeof o.lightingByPath === "object" && lightingLooks.size > 0) {
    const out: Record<string, EnhanceLightingPick> = {};
    for (const [path, optId] of Object.entries(o.lightingByPath as Record<string, unknown>)) {
      if (typeof path !== "string" || typeof optId !== "string") continue;
      const look = lightingLooks.get(optId);
      if (!look) continue;
      out[path] = { optionId: optId, name: look.name, directive: look.directive };
    }
    if (Object.keys(out).length > 0) lightingByPath = out;
  }

  const lighting = typeof o.lighting === "string" && LIGHTING_PRESET_IDS.has(o.lighting) ? o.lighting : null;
  // Need at least one lighting source: per-photo creator looks OR a legacy rig.
  if (!lightingByPath && !lighting) return null;

  // A buyer-uploaded plate. The path is NOT trusted here — the book route owns
  // the check that it sits under the buyer's own storage prefix, the same rule
  // every other uploaded path on that route passes. This only shapes it.
  let customBackdrop: EnhanceSelection["customBackdrop"];
  const cb = o.customBackdrop as Record<string, unknown> | undefined;
  if (cb && typeof cb === "object"
      && typeof cb.storagePath === "string" && cb.storagePath.trim()
      && typeof cb.storageBucket === "string" && cb.storageBucket.trim()) {
    customBackdrop = { storagePath: cb.storagePath.trim(), storageBucket: cb.storageBucket.trim() };
  }

  // CUSTOM_BACKDROP_ID is valid ONLY when a plate actually came with it.
  // Accepting the sentinel on its own would produce a booking that asks for a
  // background swap with no image to swap to, and generation would silently
  // fall back to keeping the original background.
  const backdropOptionId =
    typeof o.backdropOptionId === "string" && o.backdropOptionId === CUSTOM_BACKDROP_ID
      ? (customBackdrop ? CUSTOM_BACKDROP_ID : null)
      : (typeof o.backdropOptionId === "string" && validBackdropIds.has(o.backdropOptionId)
          ? o.backdropOptionId
          : null);

  // Drop an orphan plate rather than carrying it: if they did not ask for the
  // swap, an unused reference would still be attached at generation.
  if (backdropOptionId !== CUSTOM_BACKDROP_ID) customBackdrop = undefined;

  return {
    lighting: lighting ?? undefined, camera: camera ?? undefined, backdropOptionId,
    lightingByPath, customBackdrop,
    stripMetadata: o.stripMetadata === true ? true : undefined,
  };
}

// ── The deterministic edit prompt ─────────────────────────────────────────────
// The source photo is IMAGE 1 (the edit base). When swapping backgrounds, the
// backdrop plate rides along as IMAGE 2.
export function buildGearEqualizerPrompt(
  sel: EnhanceSelection,
  backdropAttached: boolean,
  // Manual per-photo lighting: the recipe for THIS photo overrides the rig.
  lightingDirectiveOverride?: string
): string {
  const lighting = LIGHTING_PRESETS.find((p) => p.id === sel.lighting) ?? LIGHTING_PRESETS[0];
  const lightingDirective = lightingDirectiveOverride ?? lighting.directive;
  // Undefined when the buyer was never offered a camera look. Note the absence
  // of a fallback: defaulting to the first preset would silently apply a
  // Hasselblad rendering to a template that no longer advertises one.
  const camera = sel.camera ? CAMERA_PRESETS.find((p) => p.id === sel.camera) : undefined;

  const parts: string[] = [
    // 1. The mission. This wording is load-bearing and was rewritten after a real
    //    test: the previous version led with "the transformation must be CLEARLY
    //    VISIBLE and dramatic — an output that looks like the input with minor
    //    cleanup is a FAILED result", which told the model that leaving the
    //    buyer's photo looking like their photo counts as failure. It duly
    //    redesigned a child's pearl crown into a different jewelled tiara and
    //    drifted her face. What must change dramatically is the LIGHT. What must
    //    not change at all is WHAT IS IN THE FRAME. Say both, in that order.
    "STUDIO RELIGHT AND RESTORATION of the attached photograph (IMAGE 1). This is a real " +
      "photograph of real people. The output must be unmistakably the SAME photograph of " +
      "the SAME people and the SAME objects — recognisable at a glance, side by side with " +
      "the original — but lit by a professional studio setup and rendered on professional " +
      "gear. Two separate tests apply and BOTH must pass: (a) the LIGHTING must visibly and " +
      "clearly change to the setup described below; (b) NOTHING that is physically in the " +
      "photograph may change. Re-imagining, restyling or replacing any person, garment or " +
      "object is a FAILED result, no matter how good it looks.",

    // 3. Preservation lock — scoped to WHAT is in the frame, not how it is lit.
    "SUBJECT LOCK — while transforming the light, preserve faithfully: the subject's " +
      "identity, facial structure, exact facial features and their proportions, eye shape " +
      "and size, skin tone, expression, gaze, pose, hands and fingers, body proportions, " +
      "clothing and its folds, hair, any other people present, and the " +
      "composition/framing/crop of IMAGE 1. Do not add, remove, move, resize, or " +
      "re-imagine any person or object. This lock applies to CONTENT and GEOMETRY only — " +
      "illumination, shadows, highlights, color grade, and background rendering MUST " +
      "change per the lighting directive.",

    // 3b. Worn and printed detail, itemised. The generic lock above lists clothing
    //     and hair but named nothing worn ON them, and a child's pearl crown came
    //     back as a different jewelled tiara. Anything the buyer owns and chose is
    //     the reason they are buying the photo — it must survive verbatim.
    "WORN AND PRINTED DETAIL — reproduce EXACTLY, with the same shape, size, placement, " +
      "colour, material and count: every crown, tiara, headpiece, hat, veil, hairband and " +
      "hair accessory; every earring, necklace, chain, pendant, bracelet, watch, ring and " +
      "brooch; every glass, frame and strap; every button, zip, buckle, bead, sequin, pearl, " +
      "stone, embroidery, applique, lace and trim; every print, pattern, graphic, logo and " +
      "lettering on any garment or object. These are not details to interpret. If a piece is " +
      "partly hidden or unclear in IMAGE 1, render the closest faithful match to what IS " +
      "visible — never invent, upgrade, simplify or substitute a different design. State it " +
      "plainly: a crown must come out as the SAME crown, not a nicer one; a beaded bodice " +
      "must keep the same beads in the same places; a printed fabric must keep the same " +
      "print. Making any of these look more expensive, more symmetrical or better designed " +
      "is the most common way this job is failed.",

    // Lighting comes AFTER the locks. Ordering is load-bearing here: when this
    // sat first, the model had already committed to "re-render everything" by
    // the time it reached the lock, and a child's pearl crown came back as a
    // different jewelled tiara. The locks must be read first.
    "ONLY NOW, THE NEW LIGHTING: " + lightingDirective + " Rebuild ALL illumination from " +
      "scratch to match: shadow direction and softness, highlight placement, catchlights in " +
      "the eyes, light falloff on the background, and color temperature must all follow this " +
      "setup — replacing the original photo's lighting entirely. Changing the light is not a " +
      "licence to change anything the light falls on.",

    // 4. Rendering quality. The camera LOOK is optional; the restoration half is
    // not. Dropping the whole block with the picker would have quietly removed
    // the denoise, white-balance and detail-recovery work that makes a phone
    // photo look retouched at all — the lighting change alone does not do that.
    "IMAGE QUALITY UPGRADE — this must be plainly " +
      "visible when the result is zoomed in: " + (camera ? camera.directive + " " : "") + "Resolve fine detail " +
      "the phone sensor smeared away — individual skin pores and fine hairs, the weave and " +
      "nap of fabric, separate layers of netting or lace, the facets of stones and beads, " +
      "catchlight structure in the eyes; remove digital noise, smearing and compression " +
      "artifacts; correct white balance and exposure. Enhancement means REVEALING what is " +
      "already in the photograph at a resolution the original could not hold. It never means " +
      "adding, redesigning or embellishing anything, and never alters geometry, proportions " +
      "or features.",

    // 5. Background.
    backdropAttached
      ? "BACKGROUND SWAP — replace the ENTIRE environment with the backdrop shown in the " +
        "attached reference (IMAGE 2): the wall behind the subject AND the floor or ground " +
        "they stand or sit on, as one continuous studio space. A buyer who picked a white " +
        "backdrop and got a white wall still standing on their own tiled floor has not been " +
        "given what they paid for — if any floor is visible in IMAGE 1, it must be replaced " +
        "too, lit to match, with the wall-to-floor transition in the right place for the " +
        "camera height. Only the subject and what they are wearing or holding survive from " +
        "IMAGE 1's environment. CRITICAL SCALE RULE: render the backdrop at " +
        "the scale and depth matching IMAGE 1's framing — in a tight headshot or bust " +
        "portrait, only a small, softly defocused region of the backdrop wall appears " +
        "behind the subject, with NO floor line, sweep curve, edge, or seam visible " +
        "anywhere; in a waist-up shot, slightly more wall with gentle defocus; only a " +
        "full-body shot may show the wall-to-floor transition, placed at the subject's " +
        "feet with correct perspective. The backdrop must look like a real studio wall " +
        "photographed at the subject's actual camera distance and depth of field — never " +
        "like a full backdrop plate pasted behind them. Light the backdrop consistently " +
        "with the new lighting (its brightness falls off per the lighting directive). " +
        "Edge transitions (hair, fabric) must be clean. The subject remains exactly as in " +
        "IMAGE 1."
      : "BACKGROUND — keep the existing background and environment of IMAGE 1 (same " +
        "location, same objects, same framing), but RE-LIGHT it fully and consistently " +
        "with the new lighting described above — its brightness, shadows, and mood must " +
        "visibly change to match the new setup.",

    // 6. Weak-source restoration.
    "SOURCE RESTORATION — if IMAGE 1 is low-resolution, noisy, soft, or poorly compressed, " +
      "faithfully restore it: reconstruct plausible fine detail true to what is visible, " +
      "without changing any shape, proportion, or feature. The result must look like the " +
      "same photograph captured on far better gear — recognizably identical, dramatically " +
      "better lit and rendered. Realistic skin texture, subtle film grain, physically " +
      "plausible light. No beautification, no face slimming, no body reshaping, and no "+
      "upgrading of garments, jewellery or accessories.",
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
