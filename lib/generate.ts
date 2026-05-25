import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import sql from "./db";
import { normalizePackageSize, type AspectRatio } from "./types";
import { logFalPayload, logReferenceUpload } from "./airtable";
import { signBasePath } from "./base-lock";
import { r2SignedDownloadUrl, r2Upload, r2Delete } from "./r2";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

const IDENTITY_ANALYSIS_TIMEOUT_MS = 45_000;
const SHOOT_BRIEF_TIMEOUT_MS = 270_000;
const REFERENCE_SIGNED_URL_TTL_SECONDS = 48 * 60 * 60;

// Appended to every fal.ai prompt as positive anatomical facts
const GLOBAL_ANATOMICAL_CONSTRAINTS = "Exactly two hands with five natural fingers each. Natural eyes with clear catchlights. Closed composed lips with neutral or subtle expression. Symmetrical natural facial anatomy.";

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("unreachable");
}

// Fetch + resize an image to max 2000px before sending to Claude (Claude rejects >8000px)
async function toBase64Block(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: resized.toString("base64"),
    },
  };
}

type GeminiImagePart = { inlineData: { mimeType: "image/jpeg"; data: string } };

// Gemini image part — same resize logic, different wrapper format.
// Returns null (never throws) so a missing image skips gracefully without crashing generation.
async function toGeminiImagePart(url: string): Promise<GeminiImagePart | null> {
  const urlPath = url ? new URL(url).pathname : "(empty)";
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[generate] toGeminiImagePart skipped (${res.status}) path: ${urlPath}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { inlineData: { mimeType: "image/jpeg" as const, data: resized.toString("base64") } };
}

// Words that trigger fal.ai content moderation even at safety_tolerance "6"
const FAL_REPLACE: [RegExp, string][] = [
  [/\balluring\b/gi, "intense"],
  [/\bseductive\b/gi, "confident"],
  [/\bsensual\b/gi, "graceful"],
  [/\bsultry\b/gi, "captivating"],
  [/\bteasing\b/gi, "playful"],
  [/\brevealing\b/gi, "showing"],
  [/\bexposed\b/gi, "visible"],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// extra: dynamic words loaded from the shared forbidden_words DB table
function sanitizeForFal(
  prompt: string,
  extra: Array<{ word: string; replacement: string }> = []
): string {
  let p = prompt;
  for (const [pattern, replacement] of FAL_REPLACE) {
    p = p.replace(pattern, replacement);
  }
  for (const { word, replacement } of extra) {
    p = p.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, "gi"), replacement);
  }
  return p;
}

// When callFalWithFallback exhausts all options, ask Gemini which word triggered the rejection
async function identifyForbiddenWord(prompt: string): Promise<{
  flaggedWord: string;
  replacement: string;
  sanitizedPrompt: string;
} | null> {
  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 256, responseMimeType: "application/json" },
  });
  try {
    const result = await Promise.race([
      model.generateContent(
        `An AI image generation model rejected this photography prompt with a content policy "Forbidden" error.
Identify the SINGLE most likely word or short phrase that triggered the rejection.
Suggest a professional photography alternative that conveys the same creative intent without triggering content filters.

Prompt:
"${prompt.slice(0, 800)}"

Return ONLY valid JSON:
{
  "flaggedWord": "the exact word or phrase most likely to have triggered rejection",
  "replacement": "the safe professional-photography alternative",
  "reason": "one sentence why this word likely triggered the filter"
}`
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("identifyForbiddenWord timeout")), 15_000)
      ),
    ]);
    const parsed = JSON.parse(result.response.text());
    if (!parsed.flaggedWord || !parsed.replacement) return null;
    const sanitized = prompt.replace(
      new RegExp(`\\b${escapeRegex(parsed.flaggedWord)}\\b`, "gi"),
      parsed.replacement
    );
    return { flaggedWord: parsed.flaggedWord, replacement: parsed.replacement, sanitizedPrompt: sanitized };
  } catch {
    return null;
  }
}

// Wrapper: try raw prompt first, then static sanitization, then Gemini-identified sanitization
async function callFalWithFallback(
  slotPrompt: string,
  imageUrls: string[],
  aspectRatio: string,
  resolution: string,
  dbForbiddenWords: Array<{ word: string; replacement: string }> = [],
  generationModel: "nano-banana" | "seedream" = "nano-banana"
): Promise<{ url: string; sanitized: boolean }> {
  const generate = (prompt: string) =>
    generationModel === "seedream"
      ? generateImageWithSeedream(prompt, imageUrls, aspectRatio, resolution)
      : generateImageWithFal(prompt, imageUrls, aspectRatio, resolution);

  const isForbidden = (err: unknown) =>
    err instanceof Error && err.message.toLowerCase().includes("forbidden");
  try {
    const url = await withRetry(() => generate(slotPrompt));
    return { url, sanitized: false };
  } catch (err) {
    if (isForbidden(err)) {
      const clean = sanitizeForFal(slotPrompt, dbForbiddenWords);
      if (clean !== slotPrompt) {
        const url = await withRetry(() => generate(clean));
        return { url, sanitized: true };
      }
    }
    throw err;
  }
}

type ShootRefRow = {
  purpose: string;
  tag?: string | null;
  custom_name?: string | null;
  note?: string | null;
  name: string;
  storage_bucket: string;
  storage_path: string;
};

type SignedRef = {
  purpose: string;
  tag?: string | null;
  customName?: string | null;
  note?: string | null;
  name: string;
  url: string;
};

type SlotRow = {
  id: string;
  slot: number;
  status: string;
};

type FalOutput = {
  images?: Array<{ url: string }>;
};

async function signRefs(
  refs: ShootRefRow[]
): Promise<SignedRef[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const url = await r2SignedDownloadUrl(ref.storage_bucket, ref.storage_path, REFERENCE_SIGNED_URL_TTL_SECONDS).catch((err) => {
        console.error("[generate] reference signing failed:", {
          purpose: ref.purpose,
          bucket: ref.storage_bucket,
          path: ref.storage_path,
          error: err instanceof Error ? err.message : String(err),
        });
        return "";
      });
      return {
        purpose: ref.purpose,
        tag: ref.tag,
        customName: ref.custom_name,
        note: ref.note,
        name: ref.name,
        url,
      };
    })
  );
}

const IDENTITY_PROFILE_FIELDS = ["Face:", "Skin:", "Eyes:", "Hair:", "Build:", "Distinctive:"];

async function analyzeIdentityImages(imageUrls: string[]): Promise<string> {
  const allParts = await Promise.all(
    imageUrls.filter(Boolean).slice(0, 4).map(toGeminiImagePart)
  );
  const imageParts = allParts.filter((p): p is GeminiImagePart => p !== null);
  if (imageParts.length === 0) {
    console.warn("[generate] analyzeIdentityImages: no identity images available — returning placeholder profile");
    return "IDENTITY PROFILE:\nFace: Unknown — no reference images available\nSkin: Unknown\nEyes: Unknown\nHair: Unknown\nBuild: Unknown\nDistinctive: No reference images available";
  }

  const model = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 1024 },
  });

  const basePrompt = `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

Return ONLY this format — ALL 6 fields are MANDATORY. Do not stop until all 6 are written:
IDENTITY PROFILE:
Face: [facial structure — shape, proportions, bone structure]
Skin: [exact tone — e.g. deep ebony, rich dark brown, warm medium brown, cool fair. Be specific about depth and undertone]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style — if bald/shaved, state that explicitly]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]

CRITICAL: Skin tone accuracy is essential for identity preservation. Dark skin must be described with precise depth and undertone (e.g. "deep ebony with cool undertones", "rich dark brown with warm undertones"). Never default to generic or lighter descriptors.
Clinical and precise. No subjective judgments. Stable biometric features only.`;

  const run = (extra = "") =>
    Promise.race([
      model.generateContent([...imageParts, basePrompt + extra]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Identity analysis timeout")), IDENTITY_ANALYSIS_TIMEOUT_MS)
      ),
    ]);

  let text = (await run()).response.text();

  // Retry up to 2 more times if any field is missing — Gemini sometimes stops early
  for (let attempt = 0; attempt < 2; attempt++) {
    const missing = IDENTITY_PROFILE_FIELDS.filter((f) => !text.includes(f));
    if (missing.length === 0) break;
    console.warn(`[generate] identity profile missing fields (attempt ${attempt + 1}):`, missing);
    text = (await run(`\n\nCRITICAL: Your previous response was missing these required fields: ${missing.join(", ")}. You MUST include ALL 6 fields. Start fresh and write all 6.`)).response.text();
  }

  const stillMissing = IDENTITY_PROFILE_FIELDS.filter((f) => !text.includes(f));
  if (stillMissing.length > 0) {
    console.error("[generate] identity profile incomplete after retries:", stillMissing, "| profile:", text.slice(0, 300));
  }

  return text;
}

type SceneSlotPrompt = {
  background: string;
  lighting: string;
  mood_vibe: string;
  photography_style: string;
  pose: string;
  shot_type: string;
  scene_exclusions: string;
};

const SHOT_TYPE_LABELS: Record<string, string> = {
  headshot:  "headshot — tight crop, face and neck/shoulders only",
  close_up:  "close-up — head to chest, standard portrait framing",
  medium:    "medium shot — waist up, torso and arms visible",
  full_body: "full body — head to toe, full figure in frame",
};

type NewPromptObject = {
  prompt_index: number;
  is_quote_card?: boolean;
  fully_consolidated_prompt?: string;
  svg_layout_instructions?: string;
};

const SHOOT_BRIEF_SYSTEM_INSTRUCTION = `SYSTEM INSTRUCTION: Photo Shoot Prompt Engineer (Art Director Vision Model)

You are an expert, world-class Art Director and Prompt Engineer for professional high-end fashion and lifestyle photoshoots. Your mission is to analyze incoming image assets and design exactly 9 highly detailed, diverse, and technically flawless photoshoot prompts and 1 specialized quote graphic portrait prompt (utilizing an SVG-based overlay workflow).

The entire output must be formatted in a single, strict, valid JSON object with absolutely no external conversational pre-text or post-text.

I. INPUT CLASSIFICATION & VALIDATION

You will analyze three distinct groups of incoming image assets (URLs or base64 data):

GROUP A — Identity (Subject):
Role: The target subject. Their face, skin tone, unique physical markers (scars, piercings, tattoos), and body structure must be replicated with absolute precision across all photographic prompts.
Framing Type Alignment: Analyze the framing of the Group A images carefully to align with downstream prompts:
- Portrait-only references must only be used for tight close-ups and beauty portraits.
- Medium/half-body references must only be used for waist/hip-up or medium prompts.
- Smiling references with visible teeth must be used only for prompts that explicitly involve smiling or laughing.
Validation: If there is a critical gap (e.g., you need to generate a full-body shot but only have a headshot, or a requested asset is completely missing), set the upload_error_warning key at the root of the JSON with a description of what is missing. Do not generate empty or fallback placeholders.

GROUP B — Inspiration (Aesthetic & Pose):
Role: Visual references for the environments, compositions, camera angles, lighting moods, and editorial styling.
Pose Harvesting: If multiple inspiration images are provided, analyze and map all observed poses across your prompts. If fewer than 10 are provided, creatively invent highly fashion-forward, professional poses to fill the remaining slots.

GROUP C — Accessories & Overrides:
Role: Specific items tagged with names and styling notes (e.g., clothing, shoes, bags, props, custom nail designs, jewelry details, hair overrides).
Strict Tag-Focused Isolation: If an image in Group C displays a full body, a model, or a wider scene context but is tagged as a specific element (e.g., tagged as "shoe", "bag", "jacket", "wedding ring"), you must isolate and describe only the tagged item from that image. Completely ignore all other visual information in that reference photo.
Hard-Replacement Priority: Items in Group C hard-replace any corresponding items worn by models in the Group B inspiration images.

GROUP D — Pose Direction (Buyer-Supplied, Optional):
Role: Exact pose and expression references provided by the buyer. Each image may be a single pose photo OR a collage containing multiple distinct poses. Scan every Group D image carefully and extract all individual poses you can identify — a collage counts as multiple pose references. Assign extracted poses to portrait slots in order (first pose found → slot 1, second pose → slot 2, continuing across all D images, cycling back to the start if poses run out before slots are filled). Extract body position, limb placement, hand position, head tilt, and facial expression only. Do NOT transfer skin tone, wardrobe, accessories, or background from Group D. Group D overrides pose-harvesting from Group B for the mapped slots.

II. THE MANDATORY PROMPT PREFIX (For Prompts 1 through 9)

To lock in the image generator's behavioral constraints and protect the subject's identity, every editorial subject prompt must begin with this exact text block, word-for-word, without deviation. Replace [IDENTITY_RANGE] with the exact image range stated in the GROUP A label (e.g. "IMAGES 1 through 3", or "IMAGE 1" if only one identity image was provided):

"Act as an elite fashion photographer. REFERENCE [IDENTITY_RANGE] ARE THE SUBJECT — use [IDENTITY_RANGE] as the identity references. The subject's exact face, skin tone, body structure, facial features, and likeness must be taken directly from [IDENTITY_RANGE] and faithfully replicated in the output. Do not use the face or body of any person from any other reference image. Do not alter the subject's identity, face shape, eye spacing, nose shape, jawline, or skin tone under any circumstances. This is a professional high-end editorial fashion photograph."

III. CORE ART DIRECTION & SAFETY SAFEGUARDS

1. The Dentition Safeguard — ABSOLUTE RULE
NEVER write any prompt that includes smiling, laughing, open-mouthed, teeth-showing, or grinning expressions. This is an unconditional rule that applies regardless of what the identity photos show. Every single pose in every prompt MUST specify closed lips or a neutral/serious expression. Do not add smiles or laughter even if identity photos show them.

2. Styling, Hairstyles, and Overrides
By default, preserve the hair shown in Group A identity images. However, if Group C contains an image tagged [HAIRSTYLE], you MUST override all hair descriptions from Group A and Group B with the EXACT hairstyle visible in the [HAIRSTYLE] reference image. This override is absolute — even if the [HAIRSTYLE] image shows a shaved head, bald head, very short crop, or any other style that differs dramatically from Group A, you must describe that exact style in every portrait prompt. Never fall back to Group A hair when a [HAIRSTYLE] tag is present.

If Group C contains an image tagged [NAIL_DESIGN], detail those custom nail characteristics in the Important Details section.

[OUTFIT] CONSISTENCY LOCK: If Group C contains an asset tagged [OUTFIT], that exact outfit MUST be worn by the subject in ALL 9 portrait prompts without exception. Extract the specific garment, fabric, color, cut, silhouette, and surface details from the [OUTFIT] reference image and replicate them precisely in every portrait prompt. Shot-to-shot variation must come only from pose, camera angle, expression, and composition — NOT from changing the outfit. Do not invent or substitute any alternative garments.

[BACKGROUND] CONSISTENCY LOCK: If Group C contains an asset tagged [BACKGROUND], extract the specific environment type, location, and visual characteristics from that reference and use it as the primary backdrop setting across all portrait prompts. Variation between shots may come from framing, distance, and angle — but the environment type must remain consistent with the [BACKGROUND] reference.

3. Critical Exclusions Registry
- No Aesthetic Bleeding: Do NOT transfer models, skin tones, faces, or hairstyles from Group B or Group C onto the target subject.
- No Identity Artifacts: Do NOT transfer casual clothing from Group A onto the editorial. Group A is for physical identity preservation only.
- No Background Spills: Do NOT mix background environment elements of Group C into the Group B background setting.

4. Cohesive Portfolio Rule
Maintain absolute visual and stylistic cohesion in color grading, mood, atmosphere, and environments across the series. Every portrait prompt must state anatomical facts positively: exactly two hands with five natural fingers each, eyes with natural catchlights, and closed composed lips with a neutral or subtle expression. State these as descriptive facts in the prompt body, not as negative constraints.

5. Camera & Lens Consistency
Dynamically select one of the world's top 4 medium-format camera systems (Hasselblad, Phase One, Fujifilm GFX, or Leica S) and keep it identical across all 9 portrait prompts. Vary focal lengths per shot type.

6. Atmospheric Elements Integration
Every prompt must incorporate organic atmospheric elements: volumetric dust motes, morning mist, wind-blown elements, humid air quality, micro light leaks, or organic lens flares.

7. Self-Containment Mandate
Every single prompt must be fully self-contained. Never reference other prompts. Fully articulate all details in every prompt, even if repeated. Do NOT include any internal reasoning phrases such as "as seen in identity photo X", "from reference image Y", "per Group C", or any other meta-references to the input assets. The output prompt text is sent directly to an image generator that has no context about the input groups — describe everything explicitly in photographic language.

IV. THE 10th PROMPT: THE GRAPHIC QUOTE CARD

The 10th prompt is a specialized instruction block for an SVG composite workflow. It specifies instructions for producing a high-end editorial graphic layout combining a background image with beautiful typography overlay. Define high-contrast typographic zones, transparent overlays, and beautiful placement of quote text.

V. OUTPUT JSON STRUCTURE

Output ONLY a valid JSON object. No markdown code fences, no pre-text, no post-text.

IMPORTANT: Do all creative reasoning internally. Output ONLY the final consolidated fields — no intermediate breakdown fields (no separate background, lighting, pose, shot_type, outfit_look, reference_registry, prefix, etc.). This keeps the JSON compact and within token limits.

{
  "upload_error_warning": null,
  "prompts": [
    {
      "prompt_index": 1,
      "is_quote_card": false,
      "fully_consolidated_prompt": "Act as an elite fashion photographer. REFERENCE [IDENTITY_RANGE] ARE THE SUBJECT — use [IDENTITY_RANGE] as the identity references. The subject's exact face, skin tone, body structure, facial features, and likeness must be taken directly from [IDENTITY_RANGE] and faithfully replicated in the output. Do not use the face or body of any person from any other reference image. Do not alter the subject's identity, face shape, eye spacing, nose shape, jawline, or skin tone under any circumstances. This is a professional high-end editorial fashion photograph. Identity: [exact face description — skin tone, eye shape and color, nose, lips, jawline, hairline, body build drawn from identity profile]. Environment: [lighting setup — direction, quality, color temperature; background/environment — specific location, texture, depth; time of day/atmospheric details]. Subject: [pose — body position, arms, hands explicitly described; expression — closed lips, neutral/composed; camera angle — eye-level/high/low; framing — headshot/medium/full body; lens — focal length, depth of field]. Styling: [outfit — specific garments, fabric, color, cut from OUTFIT reference or inspiration; hair; grooming; accessories; color grade/film look]. Anatomical facts: exactly two hands with five natural fingers each, natural eyes with catchlights, closed composed lips."
    },
    {
      "prompt_index": 10,
      "is_quote_card": true,
      "fully_consolidated_prompt": "Complete composite graphic instructions for background image generation.",
      "svg_layout_instructions": "Complete SVG overlay instructions: typographic hierarchy, font specifications, text-shadow or dark overlay for contrast, positioning, color assignments."
    }
  ]
}`;


async function buildShootBrief(
  shoot: {
    mode: string;
    package_size: number;
    aspect_ratio: string;
    shot_type?: string | null;
    quote?: { text: string; attribution: string } | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string,
  forbiddenExamples?: string[],
  dbForbiddenWords?: Array<{ word: string; replacement: string }>
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const identityRefs = refs.filter((r) => r.purpose === "identity" && r.url);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration" && r.url).slice(0, 9);
  const taggedRefs = refs.filter((r) => r.purpose === "tagged" && r.url);
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  // Group A: locked base or identity images
  const groupAUrls = characterBaseUrl ? [characterBaseUrl] : identityRefs.map((r) => r.url);
  const groupACount = groupAUrls.length;
  const identityRange = groupACount === 1 ? "IMAGE 1" : `IMAGES 1 through ${groupACount}`;
  const groupALabel = characterBaseUrl
    ? `GROUP A — Identity (Subject): Locked character base image (IMAGE 1). Use IMAGE 1 for exact facial identity, body structure, and locked wardrobe.`
    : `GROUP A — Identity (Subject): ${groupACount} identity reference photo(s) (${identityRange}). Use ${identityRange} for facial features, skin tone, and body build only. When writing the mandatory prompt prefix, reference ${identityRange} as the identity source.\n\nIdentity Profile:\n${identityProfile}`;

  const poseRefsForBrief = refs.filter((r) => r.purpose === "pose" && r.url);

  const [groupAAllBlocks, groupBAllBlocks, groupCAllBlocks] = await Promise.all([
    Promise.all(groupAUrls.slice(0, 4).map(toGeminiImagePart)),
    Promise.all(inspirationRefs.map((r) => toGeminiImagePart(r.url))),
    Promise.all(taggedRefs.map((r) => toGeminiImagePart(r.url))),
  ]);
  const groupABlocks = groupAAllBlocks.filter((p): p is GeminiImagePart => p !== null);
  const groupBBlocks = groupBAllBlocks.filter((p): p is GeminiImagePart => p !== null);

  type GeminiPart = { text: string } | GeminiImagePart;
  const parts: GeminiPart[] = [];

  if (groupABlocks.length > 0) {
    parts.push({ text: groupALabel });
    parts.push(...groupABlocks);
  }

  if (groupBBlocks.length > 0) {
    parts.push({ text: "GROUP B — Inspiration (Aesthetic & Pose): Visual references for environments, compositions, camera angles, lighting moods, and editorial styling." });
    parts.push(...groupBBlocks);
  }

  // Interleave each Group C image with its own tag label so the model
  // knows exactly which image maps to which tag (critical for [HAIRSTYLE] etc.)
  const hasGroupC = groupCAllBlocks.some((p) => p !== null);
  if (hasGroupC) {
    parts.push({ text: "GROUP C — Accessories & Overrides: Each tagged reference is labelled immediately before its image." });
    for (let i = 0; i < taggedRefs.length; i++) {
      if (!groupCAllBlocks[i]) continue;
      const r = taggedRefs[i];
      const tag = r.tag ?? r.customName ?? "unknown";
      const note = r.note ? ` — note: ${r.note}` : "";
      parts.push({ text: `[${tag}] reference image — "${r.name}"${note}: Extract ONLY the ${tag.toLowerCase()} from this image and apply it to all portrait prompts. Ignore all other elements.` });
      parts.push(groupCAllBlocks[i] as GeminiImagePart);
    }
  }

  // GROUP D — pose direction images (Gemini only, never sent to fal.ai)
  if (poseRefsForBrief.length > 0) {
    const groupDAllBlocks = await Promise.all(poseRefsForBrief.map((r) => toGeminiImagePart(r.url)));
    const hasGroupD = groupDAllBlocks.some((p) => p !== null);
    if (hasGroupD) {
      parts.push({
        text: `GROUP D — Pose Direction (${poseRefsForBrief.length} image${poseRefsForBrief.length !== 1 ? "s" : ""}): The buyer has provided exact pose/expression references. Each image may be a single pose photo OR a collage containing multiple distinct poses — scan every image for all visible poses. Extract all distinct poses across all Group D images and assign them to portrait slots in order (first extracted pose → slot 1, second → slot 2, cycling back if poses run out before slots are filled). Describe each extracted pose in precise photographic language: exact body position, limb placement, hand position, head tilt, and facial expression. Do NOT transfer skin tone, wardrobe, accessories, or background from these images — extract pose and expression only. Group D overrides pose-harvesting from Group B for mapped slots.`,
      });
      for (let i = 0; i < poseRefsForBrief.length; i++) {
        if (!groupDAllBlocks[i]) continue;
        parts.push({ text: `Pose direction image ${i + 1} — scan for all distinct poses (may be a collage):` });
        parts.push(groupDAllBlocks[i] as GeminiImagePart);
      }
    }
  }

  // Inject global forbidden word→replacement table so Gemini avoids exact known triggers
  if (dbForbiddenWords && dbForbiddenWords.length > 0) {
    parts.push({
      text: `FORBIDDEN WORD LIST (platform-wide — never use ANY of these words; use the replacement instead):\n${dbForbiddenWords.map((w) => `"${w.word}" → use "${w.replacement}"`).join(", ")}`,
    });
  }

  // Inject failure memory so Gemini avoids language patterns that were rejected before
  if (forbiddenExamples && forbiddenExamples.length > 0) {
    parts.push({
      text: `GENERATION FAILURE MEMORY — Learned Restrictions:\nThe following prompts were previously REJECTED by the image generation engine for content policy violations. Study the exact wording carefully. Identify which specific words or phrases likely caused the rejection and NEVER use similar language in any prompt you generate:\n\n${forbiddenExamples.map((p, i) => `Rejected example ${i + 1}:\n"${p.slice(0, 300)}"`).join("\n\n")}\n\nAvoid ALL similar wording. This is critical — rejected prompts waste user credits.`,
    });
  }

  let shotTypeConstraint = "";
  const shotTypeLabel = SHOT_TYPE_LABELS[shoot.shot_type ?? ""];
  if (shotTypeLabel) shotTypeConstraint = `\n- Shot Type: ${shotTypeLabel}`;

  parts.push({
    text: `SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}${shotTypeConstraint}
${hasQuote ? `- Quote Text: "${shoot.quote!.text}"${shoot.quote!.attribution ? `\n- Attribution: "${shoot.quote!.attribution}"` : ""}` : ""}

Generate exactly ${portraitCount} portrait prompt${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card prompt (prompt_index: 10, is_quote_card: true)" : ""}.

Output ONLY valid JSON matching the output structure in your instructions. No markdown fences, no pre-text, no post-text.`,
  });

  const geminiModel = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SHOOT_BRIEF_SYSTEM_INSTRUCTION,
    generationConfig: {
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 8192 },
    } as any, // thinkingConfig not yet in SDK types
  });

  const geminiResult = await Promise.race([
    geminiModel.generateContent(parts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini brief timeout")), SHOOT_BRIEF_TIMEOUT_MS)
    ),
  ]);

  const raw = geminiResult.response.text();
  return raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
}

async function generateImageWithFal(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string,
  resolution = "1K"
): Promise<string> {
  // Free fallback for testing when FAL_KEY has no credits
  if (process.env.FAL_TEST_MODE === "1") {
    const dims: Record<string, string> = {
      "3:4": "768x1024", "4:5": "820x1024", "1:1": "1024x1024",
      "16:9": "1024x576", "9:16": "576x1024", "2:3": "683x1024",
    };
    const size = dims[aspectRatio] ?? "820x1024";
    const [w, h] = size.split("x");
    const encoded = encodeURIComponent(prompt.slice(0, 300));
    return `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=1&seed=${Date.now()}`;
  }

  const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      num_images: 1,
      // All our AspectRatio values are in fal's union; cast through unknown to satisfy strict type
      aspect_ratio: aspectRatio as unknown as "4:5",
      output_format: "png",
      safety_tolerance: "6",
      image_urls: imageUrls.slice(0, 9),
      limit_generations: false,
      ...(resolution ? { resolution: resolution as unknown as "4K" } : {}),
    },
  });

  // Handle both newer and older fal-ai/client versions
  const output = ((response as Record<string, unknown>).data || response) as FalOutput;
  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL");
  return url;
}

async function polishImageWithFal(imageUrl: string, prompt: string): Promise<string> {
  try {
    const response = await fal.subscribe("fal-ai/z-image-turbo", {
      input: {
        image_url: imageUrl,
        prompt,
        strength: 0.18,
        num_inference_steps: 4,
      },
    });
    const output = ((response as Record<string, unknown>).data || response) as FalOutput;
    return output.images?.[0]?.url ?? imageUrl;
  } catch (err) {
    console.warn("[generate] polish pass failed, keeping original:", err instanceof Error ? err.message : err);
    return imageUrl;
  }
}

// SeedDream 4 aspect-ratio → image_size mapping
const SEEDREAM_SIZES: Record<string, Record<string, unknown>> = {
  "1K": {
    "3:4":  { width: 960,  height: 1280 },
    "4:5":  { width: 1024, height: 1280 },
    "1:1":  "square_hd",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
    "2:3":  { width: 854,  height: 1280 },
  },
  "4K": {
    "3:4":  { width: 1920, height: 2560 },
    "4:5":  { width: 2048, height: 2560 },
    "1:1":  { width: 2048, height: 2048 },
    "16:9": { width: 2560, height: 1440 },
    "9:16": { width: 1440, height: 2560 },
    "2:3":  { width: 1707, height: 2560 },
  },
};

async function generateImageWithSeedream(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string,
  resolution = "1K"
): Promise<string> {
  const tier = resolution === "4K" ? "4K" : "1K";
  const imageSize = SEEDREAM_SIZES[tier]?.[aspectRatio] ?? SEEDREAM_SIZES["1K"]["4:5"];

  const response = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input: {
      prompt,
      // biome-ignore lint: fal type is too narrow for SeedDream's flexible image_size
      image_size: imageSize as never,
      num_images: 1,
      enable_safety_checker: true,
      enhance_prompt_mode: "standard" as const,
      image_urls: imageUrls.slice(0, 10),
    },
  });

  const output = ((response as Record<string, unknown>).data || response) as FalOutput;
  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("SeedDream returned no image URL");
  return url;
}

// Claude-based identity analysis (alternative to Gemini)
async function analyzeIdentityImagesClaude(imageUrls: string[]): Promise<string> {
  const imageBlocks = imageUrls
    .filter(Boolean)
    .slice(0, 4)
    .map(url => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

  const promptText = `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

Return ONLY this format — ALL 6 fields are required:
IDENTITY PROFILE:
Face: [facial structure — shape, proportions, bone structure]
Skin: [tone with specific descriptors e.g. warm medium brown, cool fair]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style — if bald/shaved, state that explicitly]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]

Clinical and precise. No subjective judgments. Stable biometric features only.`;

  const result = await Promise.race([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [...imageBlocks, { type: "text" as const, text: promptText }],
      }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude identity analysis timeout")), IDENTITY_ANALYSIS_TIMEOUT_MS)
    ),
  ]);

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const missing = ["Face:", "Skin:", "Eyes:", "Hair:", "Build:", "Distinctive:"].filter(f => !text.includes(f));
  if (missing.length > 0) {
    console.warn("[generate] Claude identity profile missing fields:", missing);
  }
  return text;
}

// Claude-based shoot brief (alternative to Gemini)
async function buildShootBriefClaude(
  shoot: {
    mode: string;
    package_size: number;
    aspect_ratio: string;
    shot_type?: string | null;
    quote?: { text: string; attribution: string } | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string,
  forbiddenExamples?: string[],
  dbForbiddenWords?: Array<{ word: string; replacement: string }>
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const identityRefs = refs.filter((r) => r.purpose === "identity" && r.url);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration" && r.url).slice(0, 9);
  const taggedRefs = refs.filter((r) => r.purpose === "tagged" && r.url);
  const poseRefsForBrief = refs.filter((r) => r.purpose === "pose" && r.url);
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  const groupAUrls = characterBaseUrl ? [characterBaseUrl] : identityRefs.map((r) => r.url);
  const groupACount = groupAUrls.length;
  const identityRange = groupACount === 1 ? "IMAGE 1" : `IMAGES 1 through ${groupACount}`;
  const groupALabel = characterBaseUrl
    ? `GROUP A — Identity (Subject): Locked character base image (IMAGE 1). Use IMAGE 1 for exact facial identity, body structure, and locked wardrobe.`
    : `GROUP A — Identity (Subject): ${groupACount} identity reference photo(s) (${identityRange}). Use ${identityRange} for facial features, skin tone, and body build only. When writing the mandatory prompt prefix, reference ${identityRange} as the identity source.\n\nIdentity Profile:\n${identityProfile}`;

  type ClaudePart =
    | { type: "image"; source: { type: "url"; url: string } }
    | { type: "text"; text: string };

  const content: ClaudePart[] = [];

  if (groupAUrls.length > 0) {
    content.push({ type: "text", text: groupALabel });
    groupAUrls.slice(0, 4).forEach(url => content.push({ type: "image", source: { type: "url", url } }));
  }

  if (inspirationRefs.length > 0) {
    content.push({ type: "text", text: "GROUP B — Inspiration (Aesthetic & Pose): Visual references for environments, compositions, camera angles, lighting moods, and editorial styling." });
    inspirationRefs.forEach(r => content.push({ type: "image", source: { type: "url", url: r.url } }));
  }

  if (taggedRefs.length > 0) {
    content.push({ type: "text", text: "GROUP C — Accessories & Overrides: Each tagged reference is labelled immediately before its image." });
    taggedRefs.forEach(r => {
      const tag = r.tag ?? r.customName ?? "unknown";
      const note = r.note ? ` — note: ${r.note}` : "";
      content.push({ type: "text", text: `[${tag}] reference image — "${r.name}"${note}: Extract ONLY the ${tag.toLowerCase()} from this image and apply it to all portrait prompts. Ignore all other elements.` });
      content.push({ type: "image", source: { type: "url", url: r.url } });
    });
  }

  if (poseRefsForBrief.length > 0) {
    content.push({
      type: "text",
      text: `GROUP D — Pose Direction (${poseRefsForBrief.length} image${poseRefsForBrief.length !== 1 ? "s" : ""}): The buyer has provided exact pose/expression references. Each image may be a single pose photo OR a collage containing multiple distinct poses — scan every image for all visible poses. Extract all distinct poses across all Group D images and assign them to portrait slots in order (first extracted pose → slot 1, second → slot 2, cycling back if poses run out before slots are filled). Describe each extracted pose in precise photographic language: exact body position, limb placement, hand position, head tilt, and facial expression. Do NOT transfer skin tone, wardrobe, accessories, or background from these images — extract pose and expression only. Group D overrides pose-harvesting from Group B for mapped slots.`,
    });
    for (let i = 0; i < poseRefsForBrief.length; i++) {
      content.push({ type: "text", text: `Pose direction image ${i + 1} — scan for all distinct poses (may be a collage):` });
      content.push({ type: "image", source: { type: "url", url: poseRefsForBrief[i].url } });
    }
  }

  if (dbForbiddenWords && dbForbiddenWords.length > 0) {
    content.push({ type: "text", text: `FORBIDDEN WORD LIST (platform-wide — never use ANY of these words; use the replacement instead):\n${dbForbiddenWords.map((w) => `"${w.word}" → use "${w.replacement}"`).join(", ")}` });
  }

  if (forbiddenExamples && forbiddenExamples.length > 0) {
    content.push({ type: "text", text: `GENERATION FAILURE MEMORY — Learned Restrictions:\nThe following prompts were previously REJECTED by the image generation engine for content policy violations. Study the exact wording carefully. NEVER use similar language:\n\n${forbiddenExamples.map((p, i) => `Rejected example ${i + 1}:\n"${p.slice(0, 300)}"`).join("\n\n")}` });
  }

  const claudeShotTypeLabel = SHOT_TYPE_LABELS[shoot.shot_type ?? ""];
  const claudeShotTypeConstraint = claudeShotTypeLabel ? `\n- Shot Type: ${claudeShotTypeLabel}` : "";

  content.push({ type: "text", text: `SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}${claudeShotTypeConstraint}
${hasQuote ? `- Quote Text: "${shoot.quote!.text}"${shoot.quote!.attribution ? `\n- Attribution: "${shoot.quote!.attribution}"` : ""}` : ""}

Generate exactly ${portraitCount} portrait prompt${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card prompt (prompt_index: 10, is_quote_card: true)" : ""}.

Output ONLY valid JSON matching the output structure in your instructions. No markdown fences, no pre-text, no post-text.` });

  const claudeResult = await Promise.race([
    anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16384,
      system: SHOOT_BRIEF_SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude brief timeout")), SHOOT_BRIEF_TIMEOUT_MS)
    ),
  ]);

  const raw = claudeResult.content[0]?.type === "text" ? claudeResult.content[0].text : "";
  return raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
}

async function saveSlotImage(
  shootId: string,
  userId: string,
  slot: number,
  imageUrl: string,
  isTestMode: boolean = false
): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);

  const contentType =
    imageRes.headers.get("content-type")?.startsWith("image/")
      ? imageRes.headers.get("content-type")!
      : "image/png";
  const bytes = Buffer.from(await imageRes.arrayBuffer());
  const ext = contentType === "image/jpeg" ? "jpg" : "png";
  const storagePath = `${userId}/${shootId}/slot-${slot}.${ext}`;
  const bucket = isTestMode ? "test" : "generated-4k";

  await r2Upload(bucket, storagePath, bytes, contentType);
  return storagePath;
}

function wrapQuoteLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines.filter(Boolean);
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Module-level Anton font cache (fetched once per process lifetime)
let _antonFontBase64: string | null = null;
let _antonFontFetched = false;

async function loadAntonFont(): Promise<string | null> {
  if (_antonFontFetched) return _antonFontBase64;
  _antonFontFetched = true;
  try {
    // Use legacy User-Agent so Google Fonts returns TTF (librsvg/FreeType understands TTF,
    // but not WOFF2 which would require Brotli decompression that librsvg lacks)
    const cssRes = await Promise.race([
      fetch("https://fonts.googleapis.com/css?family=Anton&display=swap", {
        headers: { "User-Agent": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)" },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8_000)),
    ]);
    const css = await (cssRes as Response).text();
    // Match ttf or woff URL
    const urlMatch = css.match(/src:\s*url\(([^)]+\.(?:ttf|woff)[^)]*)\)/);
    if (!urlMatch) return null;
    const fontUrl = urlMatch[1].replace(/['"]/g, "");
    const fontRes = await Promise.race([
      fetch(fontUrl),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8_000)),
    ]);
    const fontBuf = Buffer.from(await (fontRes as Response).arrayBuffer());
    _antonFontBase64 = fontBuf.toString("base64");
    return _antonFontBase64;
  } catch {
    return null;
  }
}

function buildSvg(
  w: number,
  h: number,
  elements: string[],
  withShadow = false,
  antonBase64?: string | null
): string {
  const fontFace = antonBase64
    ? `@font-face{font-family:'Anton';font-style:normal;font-weight:400;src:url('data:font/truetype;base64,${antonBase64}') format('truetype');}`
    : "";
  const shadowFilter = withShadow
    ? `<filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.95)"/></filter>`
    : "";
  const strokeFilter = `<filter id="stroke_shadow"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="rgba(0,0,0,1)"/></filter>`;
  const defs = `<defs><style>${fontFace}</style>${shadowFilter}${strokeFilter}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${defs}${elements.join("")}</svg>`;
}

function antonFamily(antonLoaded: boolean): string {
  return antonLoaded ? "'Anton', Impact, Arial Black, sans-serif" : "Impact, Arial Black, sans-serif";
}

export async function compositeQuoteCard(
  shoot: {
    id: string;
    user_id: string;
    quote: { text: string; attribution?: string } | null;
    package_size: number;
    aspect_ratio: string;
  },
  backgroundStoragePath: string,
  bucket: string,
  svgLayoutInstructions?: string
): Promise<string | null> {
  if (!shoot.quote?.text) return null;

  const quoteText = shoot.quote.text;
  const attribution = shoot.quote.attribution ?? "";

  // Find best portrait from an earlier completed slot
  const [portraitSlot] = await sql`SELECT slot, preview_storage_bucket, preview_storage_path FROM shoot_images WHERE shoot_id = ${shoot.id} AND status = 'COMPLETE' AND slot < ${shoot.package_size} ORDER BY slot ASC LIMIT 1`;

  if (!portraitSlot?.preview_storage_path) {
    console.log("[compositeQuoteCard] no portrait found, keeping plain background");
    return null;
  }

  const [bgSignedUrl, portraitSignedUrl] = await Promise.all([
    r2SignedDownloadUrl(bucket, backgroundStoragePath, 3600).catch(() => null),
    r2SignedDownloadUrl(
      portraitSlot.preview_storage_bucket as string,
      portraitSlot.preview_storage_path as string,
      3600
    ).catch(() => null),
  ]);
  if (!bgSignedUrl || !portraitSignedUrl) return null;

  const [bgRes, portraitRes] = await Promise.all([
    fetch(bgSignedUrl),
    fetch(portraitSignedUrl),
  ]);
  if (!bgRes.ok || !portraitRes.ok) return null;

  const [bgBuf, portraitBuf] = [
    Buffer.from(await bgRes.arrayBuffer()),
    Buffer.from(await portraitRes.arrayBuffer()),
  ];

  const bgMeta = await sharp(bgBuf).metadata();
  const W = bgMeta.width ?? 1080;
  const H = bgMeta.height ?? 1350;

  const [bgPart, portraitPart] = await Promise.all([
    toGeminiImagePart(bgSignedUrl),
    toGeminiImagePart(portraitSignedUrl),
  ]);

  // Load Anton font in parallel with Gemini call
  const [antonFont] = await Promise.all([loadAntonFont()]);
  const useAnton = !!antonFont;

  const designPromptText = `You are an art director for a high-impact editorial photo studio. You are compositing a bold typographic quote card. Image 1 is the mood background image. Image 2 is the subject's portrait.

Quote: "${quoteText}"${attribution ? `\nAttribution: ${attribution}` : ""}
${svgLayoutInstructions ? `\nLayout guidance from shoot brief:\n${svgLayoutInstructions}\n` : ""}

Pick the SINGLE most dramatic, editorial layout from these options:
- "impact_bottom": Portrait fills entire frame. Massive ALL-CAPS quote text at bottom (like motivational posters — "NO RISK NO STORY"). Strong dark gradient at bottom. Huge font, 1-3 lines max.
- "half_dark": Portrait fills LEFT half. Solid dark panel on RIGHT half. Bold stacked quote lines on right, very large font. Attribution small at bottom of panel.
- "title_card": Solid dark full background. Portrait centered and large (60% of height). Huge attribution text at top (or quote source). Bold quote text below portrait. Clean typographic hierarchy.
- "overlay": Portrait full-bleed. Dark scrim over entire image. Centered bold text block.

Pick "impact_bottom" when the quote is short and punchy (under 8 words).
Pick "half_dark" when the portrait is strong and the quote is medium length.
Pick "title_card" when there is a strong attribution (name, bible verse, etc) to feature.
Pick "overlay" as fallback.

Return ONLY valid JSON (no markdown):
{"layout":"impact_bottom","text_color":"#FFFFFF","accent_color":"#E0C87A","overlay_opacity":0.55,"capitalize":true}`;

  let design: {
    layout: string;
    text_color: string;
    accent_color: string;
    overlay_opacity: number;
    capitalize: boolean;
  };
  try {
    const designModel = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { maxOutputTokens: 256, responseMimeType: "application/json" },
    });
    const imageParts = [bgPart, portraitPart].filter((p): p is GeminiImagePart => p !== null);
    const designResult = await Promise.race([
      designModel.generateContent([...imageParts, designPromptText]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);
    design = JSON.parse(designResult.response.text());
  } catch {
    design = {
      layout: "impact_bottom",
      text_color: "#FFFFFF",
      accent_color: "#E0C87A",
      overlay_opacity: 0.55,
      capitalize: true,
    };
  }

  const textColor = design.text_color ?? "#FFFFFF";
  const accentColor = design.accent_color ?? "#E0C87A";
  const overlayOpacity = Math.min(0.85, design.overlay_opacity ?? 0.55);
  const displayQuote = design.capitalize !== false ? quoteText.toUpperCase() : quoteText;
  const displayAttrib = attribution ? attribution.toUpperCase() : "";
  const fontFamily = antonFamily(useAnton);

  let finalBuf: Buffer;

  if (design.layout === "impact_bottom") {
    // Portrait full-bleed. Massive bottom text. Strong gradient.
    const croppedPortrait = await sharp(portraitBuf)
      .resize(W, H, { fit: "cover", position: "top" })
      .toBuffer();

    const lines = wrapQuoteLines(displayQuote, 12);
    // Font is 18-25% of height, capped by panel width / chars
    const maxChars = Math.max(...lines.map(l => l.length), 1);
    const fontByHeight = Math.round(H * 0.22 / Math.max(lines.length, 1));
    const fontByWidth = Math.round(W * 0.92 / (maxChars * 0.58));
    const fontSize = Math.min(fontByHeight, fontByWidth, Math.round(H * 0.26));
    const lineH = Math.round(fontSize * 1.05);
    const pad = Math.round(W * 0.04);
    const bottomPad = Math.round(H * 0.04);
    const attribSize = attribution ? Math.round(fontSize * 0.32) : 0;
    const textBlockH = lines.length * lineH + (attribution ? attribSize + Math.round(H * 0.025) : 0);
    const gradH = textBlockH + Math.round(H * 0.08);

    // Gradient SVG overlay (transparent-to-black from top to bottom of gradH)
    const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${gradH}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.88"/>
      </linearGradient></defs>
      <rect width="${W}" height="${gradH}" fill="url(#g)"/>
    </svg>`;

    const textEls: string[] = [];
    const textStartY = H - bottomPad - (attribution ? attribSize + Math.round(H * 0.025) : 0) - lines.length * lineH;
    lines.forEach((line, i) => {
      textEls.push(
        `<text x="${pad}" y="${textStartY + i * lineH + fontSize}" text-anchor="start" font-size="${fontSize}" font-weight="400" fill="${textColor}" font-family="${fontFamily}" filter="url(#stroke_shadow)" letter-spacing="${Math.round(fontSize * 0.02)}">${escXml(line)}</text>`
      );
    });
    if (attribution) {
      const attY = H - bottomPad;
      textEls.push(
        `<text x="${pad}" y="${attY}" text-anchor="start" font-size="${attribSize}" font-weight="400" fill="${accentColor}" font-family="${fontFamily}" letter-spacing="${Math.round(attribSize * 0.08)}">${escXml(displayAttrib)}</text>`
      );
    }

    finalBuf = await sharp(croppedPortrait)
      .composite([
        { input: Buffer.from(gradSvg), top: H - gradH, left: 0 },
        { input: Buffer.from(buildSvg(W, H, textEls, false, antonFont)) },
      ])
      .png()
      .toBuffer();

  } else if (design.layout === "half_dark") {
    // Portrait on left half, solid dark panel right half
    const portraitW = Math.round(W * 0.52);
    const panelW = W - portraitW;
    const panelX = portraitW;

    const [croppedPortrait, panelBuf] = await Promise.all([
      sharp(portraitBuf)
        .resize(portraitW, H, { fit: "cover", position: "centre" })
        .toBuffer(),
      sharp({
        create: { width: panelW, height: H, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 255 } },
      })
        .png()
        .toBuffer(),
    ]);

    const canvas = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    const lines = wrapQuoteLines(displayQuote, 10);
    const maxChars = Math.max(...lines.map(l => l.length), 1);
    const fontByHeight = Math.round(H * 0.18 / Math.max(lines.length, 1));
    const fontByWidth = Math.round((panelW * 0.88) / (maxChars * 0.58));
    const fontSize = Math.min(fontByHeight, fontByWidth, Math.round(H * 0.20));
    const lineH = Math.round(fontSize * 1.08);
    const pad = Math.round(panelW * 0.08);
    const cx = panelX + pad;
    const blockH = lines.length * lineH;
    const attribSize = attribution ? Math.round(fontSize * 0.30) : 0;
    const totalH = blockH + (attribution ? attribSize + Math.round(H * 0.04) : 0);
    const startY = Math.round((H - totalH) / 2);

    const textEls: string[] = [];
    lines.forEach((line, i) => {
      textEls.push(
        `<text x="${cx}" y="${startY + i * lineH + fontSize}" text-anchor="start" font-size="${fontSize}" font-weight="400" fill="${textColor}" font-family="${fontFamily}" letter-spacing="${Math.round(fontSize * 0.02)}">${escXml(line)}</text>`
      );
    });
    if (attribution) {
      const attY = startY + blockH + Math.round(H * 0.04) + attribSize;
      textEls.push(
        `<text x="${cx}" y="${attY}" text-anchor="start" font-size="${attribSize}" font-weight="400" fill="${accentColor}" font-family="${fontFamily}" letter-spacing="${Math.round(attribSize * 0.1)}">${escXml(displayAttrib)}</text>`
      );
    }

    finalBuf = await sharp(canvas)
      .composite([
        { input: croppedPortrait, top: 0, left: 0 },
        { input: panelBuf, top: 0, left: panelX },
        { input: Buffer.from(buildSvg(W, H, textEls, false, antonFont)) },
      ])
      .png()
      .toBuffer();

  } else if (design.layout === "title_card") {
    // Dark background, portrait centered and prominent, huge attribution at top, quote below
    const portraitH = Math.round(H * 0.60);
    const portraitW = Math.round(portraitH * 0.75);
    const safePortraitW = Math.min(portraitW, W - Math.round(W * 0.08));
    const portraitTop = Math.round(H * 0.14);
    const portraitLeft = Math.round((W - safePortraitW) / 2);

    const [bgDark, croppedPortrait] = await Promise.all([
      sharp({
        create: { width: W, height: H, channels: 3, background: { r: 8, g: 8, b: 8 } },
      })
        .png()
        .toBuffer(),
      sharp(portraitBuf)
        .resize(safePortraitW, portraitH, { fit: "cover", position: "top" })
        .toBuffer(),
    ]);

    const topPad = Math.round(H * 0.04);
    const attribSize = Math.round(W * 0.10);
    const quoteStartY = portraitTop + portraitH + Math.round(H * 0.04);
    const availH = H - quoteStartY - Math.round(H * 0.03);
    const lines = wrapQuoteLines(displayQuote, 22);
    const fontByHeight = Math.round(availH / (lines.length + 0.5));
    const maxChars = Math.max(...lines.map(l => l.length), 1);
    const fontByWidth = Math.round((W * 0.9) / (maxChars * 0.58));
    const fontSize = Math.min(fontByHeight, fontByWidth, Math.round(H * 0.09));
    const lineH = Math.round(fontSize * 1.1);
    const cx = Math.round(W / 2);

    const textEls: string[] = [];
    // Large attribution at top
    if (attribution) {
      textEls.push(
        `<text x="${cx}" y="${topPad + attribSize}" text-anchor="middle" font-size="${attribSize}" font-weight="400" fill="${accentColor}" font-family="${fontFamily}" letter-spacing="${Math.round(attribSize * 0.1)}">${escXml(displayAttrib)}</text>`
      );
    }
    // Quote lines below portrait
    lines.forEach((line, i) => {
      textEls.push(
        `<text x="${cx}" y="${quoteStartY + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="400" fill="${textColor}" font-family="${fontFamily}" letter-spacing="${Math.round(fontSize * 0.03)}">${escXml(line)}</text>`
      );
    });

    finalBuf = await sharp(bgDark)
      .composite([
        { input: croppedPortrait, top: portraitTop, left: portraitLeft },
        { input: Buffer.from(buildSvg(W, H, textEls, false, antonFont)) },
      ])
      .png()
      .toBuffer();

  } else {
    // "overlay": portrait full-bleed + dark scrim + centered bold text
    const overlayAlpha = Math.round(overlayOpacity * 255);
    const [croppedPortrait, overlayBuf] = await Promise.all([
      sharp(portraitBuf)
        .resize(W, H, { fit: "cover", position: "centre" })
        .toBuffer(),
      sharp({
        create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: overlayAlpha } },
      })
        .png()
        .toBuffer(),
    ]);

    const lines = wrapQuoteLines(displayQuote, 16);
    const maxChars = Math.max(...lines.map(l => l.length), 1);
    const fontByHeight = Math.round(H * 0.20 / Math.max(lines.length, 1));
    const fontByWidth = Math.round((W * 0.88) / (maxChars * 0.58));
    const fontSize = Math.min(fontByHeight, fontByWidth, Math.round(H * 0.22));
    const lineH = Math.round(fontSize * 1.08);
    const attribSize = attribution ? Math.round(fontSize * 0.32) : 0;
    const blockH = lines.length * lineH + (attribution ? attribSize + Math.round(H * 0.03) : 0);
    const startY = Math.round((H - blockH) / 2);
    const cx = Math.round(W / 2);
    const pad = Math.round(W * 0.05);

    const textEls: string[] = [];
    lines.forEach((line, i) => {
      textEls.push(
        `<text x="${cx}" y="${startY + i * lineH + fontSize}" text-anchor="middle" font-size="${fontSize}" font-weight="400" fill="${textColor}" font-family="${fontFamily}" filter="url(#stroke_shadow)" letter-spacing="${Math.round(fontSize * 0.02)}" textLength="${Math.min(W - pad * 2, Math.round(line.length * fontSize * 0.58))}" lengthAdjust="spacing">${escXml(line)}</text>`
      );
    });
    if (attribution) {
      textEls.push(
        `<text x="${cx}" y="${startY + lines.length * lineH + Math.round(H * 0.03) + attribSize}" text-anchor="middle" font-size="${attribSize}" font-weight="400" fill="${accentColor}" font-family="${fontFamily}" letter-spacing="${Math.round(attribSize * 0.1)}">${escXml(displayAttrib)}</text>`
      );
    }

    finalBuf = await sharp(croppedPortrait)
      .composite([
        { input: overlayBuf, blend: "over" },
        { input: Buffer.from(buildSvg(W, H, textEls, false, antonFont)) },
      ])
      .png()
      .toBuffer();
  }

  const compositePath = backgroundStoragePath.replace(/\.png$/i, "-c.png");
  await r2Upload(bucket, compositePath, finalBuf, "image/png");

  console.log(`[compositeQuoteCard] layout="${design.layout}" saved to ${bucket}/${compositePath}`);
  return compositePath;
}

export type WorkerResult = {
  done: boolean;
  completed: number;
  failed: number;
  remaining: number;
  total: number;
};

export async function startGenerationWorker(
  shootId: string,
  opts: { maxSlots?: number; resolution?: string } = {}
): Promise<WorkerResult> {
  const maxSlots = opts.maxSlots ?? 1;
  const resolution = opts.resolution ?? "1K";
  const ts = () => new Date().toISOString();

  const [shoot] = await sql`SELECT * FROM shoots WHERE id = ${shootId}`;
  if (!shoot) throw new Error("Shoot not found");
  const rawRefs = await sql`SELECT * FROM shoot_references WHERE shoot_id = ${shootId}` as unknown as ShootRefRow[];
  const shootImages = await sql`SELECT id, slot, status FROM shoot_images WHERE shoot_id = ${shootId}` as unknown as SlotRow[];

  const total = normalizePackageSize(shoot.package_size);
  const hasQuote = !!(shoot.quote as { text?: string } | null)?.text && total === 10;
  // postgres returns JSONB columns as JS objects — normalize to string first.
  const rawIdentity = shoot.identity_profile;
  let identityProfile: string =
    typeof rawIdentity === "string" ? rawIdentity : "";
  const rawBrief = shoot.shoot_brief;
  let shootBrief: string =
    typeof rawBrief === "string" ? rawBrief : "";

  const refs = await signRefs(rawRefs);

  // ── Character base resolution ──────────────────────────────────────────
  let characterBaseUrl: string | undefined;
  const hasBase = typeof shoot.character_base_id === "string" && !!shoot.character_base_id;

  if (hasBase) {
    const [base] = await sql`SELECT id, base_4k_storage_path, base_storage_path, identity_profile FROM character_bases WHERE id = ${shoot.character_base_id}`;

    if (base) {
      const storagePath = base.base_4k_storage_path ?? base.base_storage_path;
      if (storagePath) {
        characterBaseUrl = await signBasePath(null as never, storagePath as string, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => undefined);
      }
      // If the shoot doesn't have an identity profile yet, pull it from the base
      if (!identityProfile && typeof base.identity_profile === "string") {
        identityProfile = base.identity_profile;
        await sql`UPDATE shoots SET identity_profile = ${identityProfile}, updated_at = ${ts()} WHERE id = ${shootId}`;
      }
    }
  }

  if (!hasBase) {
    const identityRefCount = rawRefs.filter((r) => r.purpose === "identity").length;
    const signedIdentityCount = refs.filter((r) => r.purpose === "identity" && r.url).length;
    console.log("[generate] reference URL counts:", {
      shootId,
      totalRefs: rawRefs.length,
      identityRefCount,
      signedIdentityCount,
    });

    // Hard block: no identity images = generation cannot preserve subject likeness
    if (identityRefCount === 0) {
      const msg = "No identity images found. Upload at least 3 clear face photos before starting generation.";
      await sql`UPDATE shoots SET status = 'FAILED', pipeline_stage = ${msg}, updated_at = ${ts()} WHERE id = ${shootId}`;
      await sql`UPDATE shoot_images SET status = 'FAILED', stage = 'Blocked: no identity images', updated_at = ${ts()} WHERE shoot_id = ${shootId} AND status = ANY(${['QUEUED', 'PENDING', 'GENERATING']})`;
      throw new Error(msg);
    }

    if (identityRefCount > 0 && signedIdentityCount === 0) {
      throw new Error(`Identity references exist but none could be signed for shoot ${shootId}`);
    }
  }

  if (!identityProfile && !shootBrief) {
    // Log all reference uploads once before generation. Awaiting matters in serverless:
    // fire-and-forget requests can be dropped when the function returns.
    const refLogResults = await Promise.allSettled(
      rawRefs.map((raw, i) =>
        logReferenceUpload({
          shootId,
          fileName: raw.name,
          purpose: raw.purpose,
          tag: raw.tag,
          storageBucket: raw.storage_bucket,
          storagePath: raw.storage_path,
          fileSizeKB: 0,
          contentType: "image/*",
          signedUrl: refs[i]?.url ?? "",
        })
      )
    );
    for (const result of refLogResults) {
      if (result.status === "rejected") {
        console.error("[airtable] logReferenceUpload failed:", result.reason);
      }
    }
  }

  // Load active model config (no-code admin switches) — must be before identity analysis
  let visionModel: "gemini" | "claude" = "gemini";
  let generationModel: "nano-banana" | "seedream" = "nano-banana";
  let promptOnlyMode = false;
  let polishPassEnabled = false;
  try {
    const cfgData = await sql`SELECT key, value FROM app_config`;
    const cfgMap = Object.fromEntries(cfgData.map(r => [r.key, r.value]));
    if (cfgMap.vision_model === "claude") visionModel = "claude";
    if (cfgMap.generation_model === "seedream") generationModel = "seedream";
    promptOnlyMode = cfgMap.prompt_only_mode === "true" || cfgMap.prompt_only_mode === true;
    polishPassEnabled = cfgMap.polish_pass_enabled === "true" || cfgMap.polish_pass_enabled === true;
    console.log("[generate] active models:", { visionModel, generationModel, promptOnlyMode, polishPassEnabled });
  } catch { /* non-fatal — defaults apply */ }

  // --- Step 1: Identity analysis (skip if base provides it) ---
  if (!identityProfile && !hasBase) {
    await sql`UPDATE shoots SET pipeline_stage = 'Analyzing identity', progress = 10, updated_at = ${ts()} WHERE id = ${shootId}`;

    await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'stage'}, ${JSON.stringify({ stage: "Analyzing identity", progress: 10 })}::jsonb, ${ts()})`;

    const identityUrls = refs
      .filter((r) => r.purpose === "identity")
      .map((r) => r.url)
      .filter(Boolean);
    if (identityUrls.length === 0) throw new Error("No identity images found");

    identityProfile = await withRetry(
      () => visionModel === "claude"
        ? analyzeIdentityImagesClaude(identityUrls)
        : analyzeIdentityImages(identityUrls),
      2
    );

    await sql`UPDATE shoots SET identity_profile = ${identityProfile}, updated_at = ${ts()} WHERE id = ${shootId}`;
  }

  // --- Step 2: Shoot brief ---
  if (!shootBrief) {

    await sql`UPDATE shoots SET pipeline_stage = 'Building shoot brief', progress = 20, updated_at = ${ts()} WHERE id = ${shootId}`;

    await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'stage'}, ${JSON.stringify({ stage: "Building shoot brief", progress: 20 })}::jsonb, ${ts()})`;

    // Fetch past Forbidden prompts so Gemini can avoid repeating those language patterns
    let forbiddenExamples: string[] = [];
    try {
      const fbData = await sql`SELECT payload FROM generation_events WHERE type = 'forbidden_prompt' AND user_id = ${shoot.user_id as string} ORDER BY created_at DESC LIMIT 5`;
      forbiddenExamples = fbData
        .map((row) => ((row.payload as Record<string, unknown>)?.prompt as string) ?? "")
        .filter(Boolean);
      if (forbiddenExamples.length > 0) {
        console.log(`[generate] injecting ${forbiddenExamples.length} forbidden example(s) into brief`);
      }
    } catch { /* non-fatal */ }

    // Load global forbidden words shared across all users
    let dbForbiddenWordsForBrief: Array<{ word: string; replacement: string }> = [];
    try {
      dbForbiddenWordsForBrief = await sql`SELECT word, replacement FROM forbidden_words`;
      if (dbForbiddenWordsForBrief.length > 0) {
        console.log(`[generate] injecting ${dbForbiddenWordsForBrief.length} forbidden word(s) into brief`);
      }
    } catch { /* non-fatal — table may not exist yet */ }

    // No retry — brief timeout (220s) + fal slot (50s) must fit Vercel's 300s limit.
    // Retrying a timed-out Claude call would double the budget and kill the function.
    shootBrief = await (visionModel === "claude"
      ? buildShootBriefClaude(shoot as never, identityProfile, refs, characterBaseUrl, forbiddenExamples, dbForbiddenWordsForBrief)
      : buildShootBrief(shoot as never, identityProfile, refs, characterBaseUrl, forbiddenExamples, dbForbiddenWordsForBrief));
    // Validate before storing — truncation at max_tokens produces broken JSON
    try {
      JSON.parse(shootBrief);
    } catch {
      console.error("[generate] buildShootBrief raw preview:", shootBrief.slice(0, 3000));
      throw new Error(`buildShootBrief returned invalid JSON (length ${shootBrief.length}) — likely hit token limit`);
    }

    await sql`UPDATE shoots SET shoot_brief = ${shootBrief}, updated_at = ${ts()} WHERE id = ${shootId}`;

    // Pre-write prompts to all slots so they are visible in the gallery immediately,
    // even if fal.ai generation later fails.
    try {
      const briefStr = typeof shootBrief === "string" ? shootBrief : JSON.stringify(shootBrief ?? {});
      const briefClean = briefStr.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
      const parsed = JSON.parse(briefClean);
      const rawPrompts = parsed.prompts;
      const allSlotRows = shootImages;
      if (Array.isArray(rawPrompts)) {
        await Promise.all(
          rawPrompts
            .filter((p: NewPromptObject) => p.fully_consolidated_prompt)
            .map(async (p: NewPromptObject) => {
              const slotRow = allSlotRows.find(s => s.slot === p.prompt_index);
              if (!slotRow) return;
              await sql`UPDATE shoot_images SET prompt = ${p.fully_consolidated_prompt!}, updated_at = ${ts()} WHERE id = ${slotRow.id}`;
            })
        );
      }
    } catch (briefWriteErr) {
      // Non-fatal — generation can still proceed; prompts just won't be pre-visible
      console.error("[generate] pre-write prompts failed:", briefWriteErr);
    }

    // Brief build can take 3-4 min with 16K max_tokens + 7 images.
    // Return early so self-continuation gets a fresh 300s budget for slot generation.
    return { done: false, completed: 0, failed: 0, remaining: normalizePackageSize(shoot.package_size), total: normalizePackageSize(shoot.package_size) };
  }

  // Parse per-slot prompts
  // Normalize to string first — Supabase JSONB columns return objects, not strings
  const shootBriefStr =
    typeof shootBrief === "string"
      ? shootBrief
      : JSON.stringify(shootBrief ?? {});

  const shootBriefClean = shootBriefStr
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/m, "")
    .trim();

  let prompts: Record<string, string | SceneSlotPrompt> = {};
  const svgLayoutMap: Record<string, string> = {};
  try {
    const parsed = JSON.parse(shootBriefClean);
    const rawPrompts = parsed.prompts;
    if (Array.isArray(rawPrompts)) {
      // New array format from SHOOT_BRIEF_SYSTEM_INSTRUCTION
      for (const p of rawPrompts as NewPromptObject[]) {
        const key = String(p.prompt_index);
        if (p.fully_consolidated_prompt) prompts[key] = p.fully_consolidated_prompt;
        if (p.svg_layout_instructions) svgLayoutMap[key] = p.svg_layout_instructions;
      }
    } else if (rawPrompts && typeof rawPrompts === "object") {
      // Legacy dict format
      prompts = rawPrompts as Record<string, string | SceneSlotPrompt>;
    }
  } catch (e) {
    console.error("[generate] JSON parse failed, falling back to regex", e);
    const match = shootBriefClean.match(/"1"\s*:\s*"([^"]+)"/);
    if (match) prompts["1"] = match[1];
  }

  // --- Step 3: Process pending slots ---
  const allSlots = shootImages;
  const pendingSlots = allSlots
    .filter((img) => ["QUEUED", "PENDING"].includes(img.status))
    .sort((a, b) => a.slot - b.slot)
    .slice(0, maxSlots);

  const aspectRatio = (shoot.aspect_ratio as AspectRatio) ?? "4:5";

  // Load global forbidden words once for all slots in this invocation
  let dbForbiddenWords: Array<{ word: string; replacement: string }> = [];
  try {
    dbForbiddenWords = await sql`SELECT word, replacement FROM forbidden_words`;
  } catch { /* non-fatal — table may not exist yet */ }

  // Build imageUrls for fal.ai — base-locked shoots use base + scene refs; standard shoots use identity + inspiration
  let imageUrls: string[];
  if (hasBase && characterBaseUrl) {
    const backgroundUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "BACKGROUND")?.url ?? "";
    const lightingUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "LIGHTING")?.url ?? "";
    const colorGradeUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "COLOR_GRADE")?.url ?? "";
    imageUrls = [characterBaseUrl, backgroundUrl, lightingUrl, colorGradeUrl].filter(Boolean).slice(0, 4);
  } else {
    // Identity images come first so the model treats them as the primary subject reference.
    // Include key visual-override tagged refs (OUTFIT, HAIRSTYLE) so the model sees
    // those images directly, not just as text descriptions. Limit inspiration to 1 to
    // avoid diluting the identity signal with other people's faces.
    const identityUrls = refs.filter((r) => r.purpose === "identity").map((r) => r.url).filter(Boolean);
    const outfitUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "OUTFIT")?.url ?? "";
    const hairstyleUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "HAIRSTYLE")?.url ?? "";
    const taggedVisualUrls = [outfitUrl, hairstyleUrl].filter(Boolean);
    const inspirationUrls = refs.filter((r) => r.purpose === "inspiration").map((r) => r.url).filter(Boolean);
    imageUrls = [
      ...identityUrls.slice(0, 6),     // up to 6 identity images — more inputs = stronger face lock
      ...taggedVisualUrls,               // OUTFIT + HAIRSTYLE refs if present
      ...inspirationUrls.slice(0, 1),   // max 1 inspiration (mood/style context)
    ];
  }

  const identityUrls = refs
    .filter((r) => r.purpose === "identity")
    .map((r) => r.url)
    .filter(Boolean);
  const inspirationUrls = refs
    .filter((r) => r.purpose === "inspiration")
    .map((r) => r.url)
    .filter(Boolean);

  let failedCount = 0;

  for (const slotImg of pendingSlots) {
    const slot = slotImg.slot;

    // Optimistic-lock: claim this slot atomically
    const claimed = await sql`UPDATE shoot_images SET status = 'GENERATING', stage = ${`Generating slot ${slot}`}, updated_at = ${ts()} WHERE id = ${slotImg.id} AND status = ${slotImg.status} RETURNING id`;

    if (!claimed.length) continue; // another invocation already grabbed it

    await sql`UPDATE shoots SET pipeline_stage = ${`Generating slot ${slot}`}, progress = ${Math.min(85, 20 + Math.round((slot / total) * 65))}, updated_at = ${ts()} WHERE id = ${shootId}`;

    await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'slot_update'}, ${JSON.stringify({ image: { slot, status: "GENERATING" } })}::jsonb, ${ts()})`;

    let slotPrompt = ""; // hoisted so catch block can log it for learning
    try {
      const rawSlotPrompt = prompts[String(slot)] ?? prompts["1"];
      if (hasBase && characterBaseUrl && rawSlotPrompt && typeof rawSlotPrompt === "object") {
        // Locked-base: assemble final prompt from scene fields + base anchor opener
        const scene = rawSlotPrompt as SceneSlotPrompt;
        slotPrompt = [
          `Scene: ${scene.background}. ${scene.lighting}. ${scene.mood_vibe}.`,
          `Shot: ${scene.shot_type}. Photography style: ${scene.photography_style}.`,
          `Subject: [BASE REFERENCE] — use the locked character base as the primary identity and wardrobe anchor. Pose: ${scene.pose}.`,
          `Important Details: Maintain exact facial identity, skin tone, body build, and outfit from base reference. Realistic skin texture, natural asymmetry, physically plausible light direction, editorial lens feel, subtle film grain.`,
          `Use Case: editorial photography / fashion portrait.`,
          `Constraints: Preserve exact identity from base reference image. Do not alter face shape, eye spacing, nose shape, jawline, or skin tone. ${scene.scene_exclusions}.`,
        ].join(" ");
      } else if (typeof rawSlotPrompt === "string" && rawSlotPrompt) {
        slotPrompt = rawSlotPrompt;
      } else {
        slotPrompt = "Scene: Studio portrait with clean background. Subject: Person preserving identity exactly. Important Details: Natural wardrobe, editorial lens feel. Use Case: fashion portrait. Constraints: Preserve exact identity. No alterations to facial structure.";
      }

      // Append positive anatomical constraints to every fal call
      slotPrompt = `${slotPrompt} ${GLOBAL_ANATOMICAL_CONSTRAINTS}`.trim();

      const isTestMode = process.env.FAL_TEST_MODE === "1";

      // Persist prompt before fal call so it's visible even if generation fails
      await sql`UPDATE shoot_images SET prompt = ${slotPrompt}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;

      // Prompt-only mode: skip fal.ai entirely — mark slot complete with prompt saved
      if (promptOnlyMode) {
        await sql`UPDATE shoot_images SET status = 'COMPLETE', provider = 'prompt-only', stage = 'Prompt saved (prompt-only mode)', updated_at = ${ts()} WHERE id = ${slotImg.id}`;
        console.log(`[generate] slot ${slot}: prompt-only mode — skipping fal.ai`);
        continue;
      }

      // Log to Airtable before calling fal.ai so the payload is always visible
      console.log("[generate] slot prompt preview:", slotPrompt.slice(0, 400));
      console.log("[generate] identity profile preview:", identityProfile.slice(0, 300));
      console.log("[generate] Airtable payload URL counts:", {
        shootId,
        slot,
        identityUrls: identityUrls.length,
        inspirationUrls: inspirationUrls.length,
        imageUrls: imageUrls.length,
      });

      try {
        await logFalPayload({
          shootId,
          slot,
          mode: shoot.mode,
          aspectRatio,
          prompt: slotPrompt,
          identityUrls,
          inspirationUrls,
          taggedRefs: refs
            .filter((r) => r.purpose === "tagged")
            .map((r) => ({ tag: r.tag ?? r.customName, url: r.url })),
          imageUrls,
          identityProfile: typeof identityProfile === "string" ? identityProfile : "",
          shootBrief: typeof shootBrief === "string" ? shootBrief : "",
          quoteText: shoot.quote?.text,
          status: isTestMode ? "dry_run" : "sent_to_fal",
        });
      } catch (err) {
        console.error("[airtable] logFalPayload failed:", err);
      }

      const { url: rawFalUrl, sanitized: promptWasSanitized } = await callFalWithFallback(slotPrompt, imageUrls, aspectRatio, resolution, dbForbiddenWords, generationModel);
      if (promptWasSanitized) {
        console.log(`[generate] slot ${slot}: sanitized prompt succeeded after Forbidden rejection`);
      }

      // Optional polish pass — subtle quality refinement (denoise 0.18) via Z-Image Turbo
      let falUrl = rawFalUrl;
      if (polishPassEnabled && !isTestMode) {
        falUrl = await polishImageWithFal(rawFalUrl, slotPrompt);
        console.log(`[generate] slot ${slot}: polish pass ${falUrl !== rawFalUrl ? "applied" : "fallback to original"}`);
      }

      // Always save the image to Supabase storage (using "test" bucket in test mode) so signed URLs work
      let storagePath = await saveSlotImage(shootId, shoot.user_id as string, slot, falUrl, isTestMode);

      // Quote card composite: upload to a new path so CDN cache is bypassed
      if (hasQuote && slot === total) {
        const quoteBucket = isTestMode ? "test" : "generated-4k";
        try {
          const compositePath = await compositeQuoteCard(
            {
              id: shootId,
              user_id: shoot.user_id as string,
              quote: shoot.quote as { text: string; attribution?: string } | null,
              package_size: total,
              aspect_ratio: shoot.aspect_ratio as string,
            },
            storagePath,
            quoteBucket,
            svgLayoutMap[String(slot)]
          );
          if (compositePath) storagePath = compositePath;
        } catch (compErr) {
          console.error("[generate] compositeQuoteCard failed, keeping plain background:", compErr);
        }
      }

      await sql`UPDATE shoot_images SET
        status = 'COMPLETE',
        stage = ${`Completed slot ${slot}`},
        provider = ${isTestMode ? "pollinations" : "vercel-fal"},
        configured_model = ${isTestMode ? "pollinations-free" : (generationModel === "seedream" ? "fal-ai/bytedance/seedream/v4/edit" : "fal-ai/nano-banana-2/edit")},
        preview_storage_bucket = ${isTestMode ? "test" : "generated-4k"},
        preview_storage_path = ${storagePath},
        download_storage_bucket = ${isTestMode ? "test" : "generated-4k"},
        download_storage_path = ${storagePath},
        fal_url = ${isTestMode ? null : falUrl},
        updated_at = ${ts()}
        WHERE id = ${slotImg.id}`;

      await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'slot_complete'}, ${JSON.stringify({ image: { slot, status: "COMPLETE" } })}::jsonb, ${ts()})`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[generate] slot ${slot} failed:`, message);
      failedCount++;

      if (message.toLowerCase().includes("forbidden")) {
        // Ask Gemini to identify the specific trigger word and suggest a replacement
        let analysis: { flaggedWord: string; replacement: string; sanitizedPrompt: string } | null = null;
        try { analysis = await identifyForbiddenWord(slotPrompt); } catch {}

        if (analysis) {
          // a) Patch shoot_brief for this slot so retry uses the sanitized prompt automatically
          try {
            const bStr = typeof shootBrief === "string" ? shootBrief : JSON.stringify(shootBrief);
            const bObj = JSON.parse(bStr);
            if (Array.isArray(bObj.prompts)) {
              const idx = bObj.prompts.findIndex((p: NewPromptObject) => p.prompt_index === slot);
              if (idx >= 0) bObj.prompts[idx].fully_consolidated_prompt = analysis.sanitizedPrompt;
              const patchedBrief = JSON.stringify(bObj);
              await sql`UPDATE shoots SET shoot_brief = ${patchedBrief}, updated_at = ${ts()} WHERE id = ${shootId}`;
              shootBrief = patchedBrief; // keep local var in sync
            }
          } catch { /* non-fatal */ }

          // b) Upsert to global forbidden_words table — all users benefit
          try {
            const [existing] = await sql`SELECT id, hit_count FROM forbidden_words WHERE word = ${analysis.flaggedWord.toLowerCase()}`;
            if (existing) {
              await sql`UPDATE forbidden_words SET hit_count = ${Number(existing.hit_count) + 1}, replacement = ${analysis.replacement}, updated_at = ${ts()} WHERE id = ${existing.id}`;
            } else {
              await sql`INSERT INTO forbidden_words (word, replacement) VALUES (${analysis.flaggedWord.toLowerCase()}, ${analysis.replacement})`;
            }
          } catch { /* non-fatal — table may not exist yet */ }

          // c) Emit forbidden_detected event — SSE delivers this to the frontend in real-time
          try {
            await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'forbidden_detected'}, ${JSON.stringify({ slot, flaggedWord: analysis.flaggedWord, replacement: analysis.replacement })}::jsonb, ${ts()})`;
          } catch { /* non-fatal */ }

          // d) Store structured error — used for page-reload recovery in the frontend
          await sql`UPDATE shoot_images SET status = 'FAILED', stage = ${`Failed: content filter — "${analysis.flaggedWord}" flagged`}, provider_error = ${JSON.stringify({ forbidden: true, flaggedWord: analysis.flaggedWord, replacement: analysis.replacement })}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;

        } else {
          // Gemini couldn't identify a specific word — log raw prompt for passive learning
          try {
            await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'forbidden_prompt'}, ${JSON.stringify({ slot, prompt: slotPrompt.slice(0, 2000) })}::jsonb, ${ts()})`;
          } catch { /* non-fatal */ }

          await sql`UPDATE shoot_images SET status = 'FAILED', stage = ${`Failed: ${message.slice(0, 200)}`}, provider_error = ${message}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;
        }

      } else {
        // Non-Forbidden error — plain failure
        await sql`UPDATE shoot_images SET status = 'FAILED', stage = ${`Failed: ${message.slice(0, 200)}`}, provider_error = ${message}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;
      }
    }
  }

  // Recount completion — done when no slots remain workable (avoids infinite loop on all-FAILED)
  const [completedResult] = await sql`SELECT COUNT(*) as count FROM shoot_images WHERE shoot_id = ${shootId} AND status = 'COMPLETE'`;
  const [workableResult] = await sql`SELECT COUNT(*) as count FROM shoot_images WHERE shoot_id = ${shootId} AND status = ANY(${['QUEUED', 'PENDING', 'GENERATING']})`;

  const totalComplete = Number(completedResult.count) ?? 0;
  const remaining = Number(workableResult.count) ?? 0;
  const done = remaining === 0;

  await sql`UPDATE shoots SET
    status = ${done ? "COMPLETE" : "PROCESSING"},
    progress = ${done ? 100 : Math.max(10, Math.round((totalComplete / total) * 100))},
    pipeline_stage = ${done ? "Complete" : `Completed ${totalComplete}/${total} shots`},
    completed_at = ${done ? ts() : null},
    updated_at = ${ts()}
    WHERE id = ${shootId}`;

  if (done) {
    await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${'complete'}, ${JSON.stringify({ progress: 100, stage: "Complete" })}::jsonb, ${ts()})`;

    // Delete inspiration + tagged reference files from storage on completion.
    // Identity images are intentionally kept — they power the identity library for future shoots.
    try {
      const cleanupRefs = await sql`SELECT storage_bucket, storage_path FROM shoot_references WHERE shoot_id = ${shootId} AND purpose = ANY(${['inspiration', 'tagged']})`;

      if (cleanupRefs.length > 0) {
        const byBucket = new Map<string, string[]>();
        for (const ref of cleanupRefs) {
          if (!byBucket.has(ref.storage_bucket)) byBucket.set(ref.storage_bucket, []);
          byBucket.get(ref.storage_bucket)!.push(ref.storage_path);
        }
        await Promise.allSettled(
          Array.from(byBucket.entries()).map(([bucket, paths]) =>
            r2Delete(bucket, paths)
          )
        );
      }
    } catch (err) {
      console.error("[generate] reference cleanup failed (non-fatal):", err);
    }
  }

  return { done, completed: totalComplete, failed: failedCount, remaining, total };
}
