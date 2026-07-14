import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import sql from "./db";
import { normalizePackageSize, type AspectRatio } from "./types";
import { logFalPayload, logReferenceUpload } from "./airtable";
import { signBasePath } from "./base-lock";
import { r2SignedDownloadUrl, r2Upload, r2Delete, r2StreamUpload } from "./r2";
import { getBackgroundForSlot, buildBackgroundBriefSection, type BackgroundPlan } from "./background-plan";
import { buildChoiceBriefSection, type ChoiceSelections } from "./choice-groups";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

const IDENTITY_ANALYSIS_TIMEOUT_MS = 45_000;
const SHOOT_BRIEF_TIMEOUT_MS = 270_000;
const REFERENCE_SIGNED_URL_TTL_SECONDS = 48 * 60 * 60;
// fal-ai/nano-banana-2/edit accepts up to 14 reference images per request.
// Reference-heavy shoots (Call to Bar: identity + wig + gown + collar + outfit +
// hairstyle + nails + shoes + bands + background) can exceed 9, so we send up to 14
// as actual image inputs rather than dropping the extras to text only.
const NANO_BANANA_MAX_IMAGES = 14;
const USE_MOCK_FAL = process.env.MOCK_URL_SKIPPED_FOR_CREDIT_PROTECTION === "1";
const MOCK_FAL_PLACEHOLDER_IMAGE_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

// Appended to every fal.ai prompt as positive anatomical facts
const GLOBAL_ANATOMICAL_CONSTRAINTS = "Exactly two hands with five natural fingers each. Natural eyes with clear catchlights. Natural lips with a subtle micro-expression — fractionally parted or carrying a micro-asymmetric curve; no smile, no visible teeth, no open mouth. Candid facial micro-movements that convey the subject is alive and present in a moment, not posed. Symmetrical natural facial anatomy.";

// Variant for designated smile slots — the smiling identity reference is attached,
// so real teeth are copied instead of invented.
const GLOBAL_ANATOMICAL_CONSTRAINTS_SMILE = "Exactly two hands with five natural fingers each. Natural eyes with clear catchlights. A genuine warm smile with naturally rendered visible teeth taken directly from the smiling identity reference — same tooth shape, spacing, and color; never invented, idealized, or veneer-perfect teeth. Candid facial micro-movements that convey the subject is alive and present in a moment, not posed. Symmetrical natural facial anatomy.";

// Variant for back-view slots — the face is not visible, so eye/lip requirements
// would fight the pose; the back-view identity reference anchors the figure instead.
const GLOBAL_ANATOMICAL_CONSTRAINTS_BACK = "Exactly two hands with five natural fingers each when hands are visible. The subject is photographed from behind — the back of the head, shoulders, waist, hips, and overall figure match the back-view identity reference exactly; never an imagined or idealized body shape. Skin tone and build consistent with the identity references. Natural posture and realistic fabric drape.";

// Per-slot identity routing triggers — detect what a slot's prompt asks for so the
// matching identity references are attached (planner indices take priority; these
// are the fallback when a brief omits identity_image_indices).
// Only the mandated marker phrase counts. Neutral prompts legitimately contain
// negated smile language ("no smile, no teeth") and can echo rule text like
// "genuine smile" from the system instruction, so any broader match wrongly
// flags them. The planner is REQUIRED to write this exact phrase in designated
// smile slots, making it the one reliable signal.
const SMILE_TRIGGERS = /smiling with visible teeth/i;
const BACK_TRIGGERS = /back view|from behind|back turned|turned away|back of the (?:head|body)|facing away|rear view|back-view/i;

// Telephoto enhancement — medium/portrait/fashion framings render flat without
// explicit long-lens language. Appended after the brief's own camera text so the
// later, more specific statement wins. Quote/graphic card slots are excluded.
const TELEPHOTO_TRIGGERS = /medium shot|mid-shot|portrait|waist-up|half-body|fashion/i;
const TELEPHOTO_ENHANCEMENT =
  " Lens rendering: shot on a 200mm telephoto lens, f/2.8 aperture. " +
  "Shallow depth of field, creamy background bokeh, melted background details. " +
  "Intense lens compression, crisp subject separation from the background.";

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

// GET-check URLs in parallel to drop any that fal.ai can't download (e.g. R2 objects that don't exist).
// Uses GET with Range:bytes=0-0 because R2 presigned URLs are signed for GET — sending HEAD
// returns 403 SignatureDoesNotMatch and would incorrectly mark every URL as unreachable.
// Called once per shoot so every slot reuses the validated list.
async function filterReachableUrls(urls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
        return (res.ok || res.status === 206) ? url : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    })
  );
  const reachable = results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((u): u is string => u !== null);
  if (reachable.length < urls.length) {
    console.warn(`[generate] filterReachableUrls: ${urls.length - reachable.length}/${urls.length} URLs unreachable (filtered before fal.ai call)`);
  }
  return reachable;
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
  storagePath: string;
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
        storagePath: ref.storage_path,
      };
    })
  );
}

const IDENTITY_PROFILE_FIELDS = ["Face:", "Skin:", "Eyes:", "Hair:", "Build:", "Distinctive:"];

// Group picture mode: the identity photo(s) contain more than one person. This block is
// injected into the brief-builder input to override the default single-subject mandatory
// prefix so every generated prompt keeps ALL people together with each face preserved.
const GROUP_IDENTITY_DIRECTIVE = (identityRange: string) => `═══════════════════════════════════════════════════════
GROUP IDENTITY MODE — MULTIPLE SUBJECTS (OVERRIDES THE SINGLE-SUBJECT PREFIX)
═══════════════════════════════════════════════════════
This shoot has MORE THAN ONE subject: every person shown in GROUP A (${identityRange}).
For EVERY prompt you generate:
- Open by referencing ${identityRange} as THE SUBJECTS (plural). Do NOT write "the subject" as a single person, and do NOT emit the line "Do not use the face or body of any person from any other reference image" — that restriction is for single-subject shoots only.
- Preserve EACH person's exact face, skin tone, eye spacing, nose, jawline and build from ${identityRange}, following their Person 1 / Person 2 / ... profiles.
- Include ALL of these people TOGETHER in every image, posed naturally as a couple/group. Never drop, isolate, swap, or duplicate anyone, and never invent extra people.
- Vary pose, framing, wardrobe, lighting and setting across images, but the same real people stay together throughout.
═══════════════════════════════════════════════════════`;

async function analyzeIdentityImages(imageUrls: string[], groupMode = false): Promise<string> {
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

  const basePrompt = groupMode
    ? `These reference photos show MORE THAN ONE person (e.g. a couple or group). For EACH person visible, extract a precise identity profile for AI image generation.

Describe the people left-to-right as they appear. Return ONLY this format, repeating the block for every person (Person 1, Person 2, ...). ALL 6 fields are MANDATORY for EVERY person:
IDENTITY PROFILE:
Person 1:
Face: [facial structure — shape, proportions, bone structure]
Skin: [exact tone — depth and undertone, e.g. deep ebony with cool undertones, rich dark brown with warm undertones]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style — if bald/shaved, state that explicitly]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]
Person 2:
Face: [...]
Skin: [...]
Eyes: [...]
Hair: [...]
Build: [...]
Distinctive: [...]

Include EVERY person shown — do not merge, blend, or skip anyone. Keep each person's features distinct.
CRITICAL: Skin tone accuracy is essential for identity preservation. Dark skin must be described with precise depth and undertone. Never default to generic or lighter descriptors.
Clinical and precise. No subjective judgments. Stable biometric features only.`
    : `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

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

// ── Identity attribute classification ────────────────────────────────────────
// Each identity image is classified by framing / view / expression so the planner
// can select WHICH identity photos support each prompt (smiling slots get real-teeth
// references, back-pose slots get the back-view reference, close-ups get portraits).
export type IdentityAttrs = {
  framing: "full-body" | "medium" | "close-up";
  view: "front" | "back";
  expression: "smiling-teeth" | "neutral";
};

const DEFAULT_IDENTITY_ATTRS: IdentityAttrs = { framing: "medium", view: "front", expression: "neutral" };

const VALID_FRAMINGS = new Set(["full-body", "medium", "close-up"]);

async function classifyIdentityAttributes(
  identityRefs: Array<{ url: string; storagePath: string }>
): Promise<Record<string, IdentityAttrs>> {
  const usable = identityRefs.filter((r) => r.url && r.storagePath);
  if (usable.length === 0) return {};
  // Failure mode = everything neutral/front/medium, which reproduces today's
  // behavior exactly — classification can never make output worse.
  const fallback: Record<string, IdentityAttrs> = Object.fromEntries(
    usable.map((r) => [r.storagePath, { ...DEFAULT_IDENTITY_ATTRS }])
  );
  try {
    const allParts = await Promise.all(usable.map((r) => toGeminiImagePart(r.url)));
    const imageParts = allParts.filter((p): p is GeminiImagePart => p !== null);
    // If any image failed to load, index alignment between the model's answer and
    // our list would break — bail to the safe default instead of mis-labeling.
    if (imageParts.length !== usable.length) return fallback;

    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { maxOutputTokens: 512 },
    });
    const prompt = `Classify each attached photo of a person. For EVERY image, in order, return exactly one line:
IMAGE <n>: framing=<full-body|medium|close-up>, view=<front|back>, expression=<smiling-teeth|neutral>

Definitions:
- framing: full-body = head to toe visible; medium = roughly waist-up; close-up = head and shoulders only.
- view: back = the person is photographed from behind (back of head/body toward the camera); otherwise front.
- expression: smiling-teeth = genuine smile with teeth clearly visible; otherwise neutral.

Return ONLY the lines, one per image, nothing else.`;

    const result = await Promise.race([
      model.generateContent([...imageParts, prompt]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Identity attribute classification timeout")), IDENTITY_ANALYSIS_TIMEOUT_MS)
      ),
    ]);
    const text = result.response.text();
    const out: Record<string, IdentityAttrs> = { ...fallback };
    for (const m of text.matchAll(/IMAGE\s+(\d+)\s*:\s*framing=([\w-]+)\s*,\s*view=(\w+)\s*,\s*expression=([\w-]+)/gi)) {
      const ref = usable[Number(m[1]) - 1];
      if (!ref) continue;
      const framing = m[2].toLowerCase();
      out[ref.storagePath] = {
        framing: (VALID_FRAMINGS.has(framing) ? framing : "medium") as IdentityAttrs["framing"],
        view: m[3].toLowerCase() === "back" ? "back" : "front",
        expression: m[4].toLowerCase() === "smiling-teeth" ? "smiling-teeth" : "neutral",
      };
    }
    return out;
  } catch (err) {
    console.warn("[generate] identity attribute classification failed — defaulting all to neutral/front/medium:", err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

// Catalog handed to the brief planner: one line per GROUP A image plus the
// 1-based indices of smiling and back-view references.
export type IdentityCatalog = {
  lines: string[];
  smilingIndices: number[];
  backIndices: number[];
};

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
  identity_image_indices?: number[];
};

// Final user-content reminder for identity routing. The system instruction is
// long, and Gemini in particular skips the identity_image_indices / smile
// allocation requirements when they only appear there — a closing user-content
// directive is weighted much more heavily and makes compliance reliable.
function buildIdentityRoutingReminder(catalog: IdentityCatalog, packageSize: number): string {
  const smileCount = packageSize >= 10 ? "exactly 2 or 3" : packageSize >= 5 ? "exactly 1" : "0 (single-image shoots stay neutral)";
  const smileBlock = catalog.smilingIndices.length > 0
    ? `\n2. SMILE ALLOCATION (do not skip): identity ${catalog.smilingIndices.length === 1 ? `IMAGE ${catalog.smilingIndices[0]} shows` : `IMAGES ${catalog.smilingIndices.join(", ")} show`} a genuine smile with visible teeth. Designate ${smileCount} normal portrait slot(s) as genuine-smile slots: their prompt text MUST contain the exact phrase "smiling with visible teeth" and their identity_image_indices MUST list ONLY the smiling image number(s). Never a custom slot (flag/mugshot/bowl/viral/quote card). Every other slot: no smile, and identity_image_indices lists ONLY neutral image numbers.`
    : "";
  return `═══════════════════════════════════════════════════════
FINAL COMPLIANCE CHECK — IDENTITY IMAGE ROUTING (MANDATORY)
═══════════════════════════════════════════════════════
1. EVERY portrait prompt object in the output JSON MUST include "identity_image_indices": an array of the GROUP A image numbers best matching that prompt's framing and expression, per the Identity Image Catalog:
${catalog.lines.join("\n")}${smileBlock}
Before returning the JSON, verify every portrait prompt object has identity_image_indices. Output that misses this field is invalid.`;
}

// The system instruction is a function because two blocks are conditional on the
// identity image catalog: the smile rule (a hard ban unless a genuine smiling-teeth
// reference exists) and the back-pose gate (back poses only with a back-view ref).
function buildShootBriefSystemInstruction(catalog?: IdentityCatalog | null): string {
  const hasCatalog = !!catalog && catalog.lines.length > 0;
  const hasSmiling = !!catalog && catalog.smilingIndices.length > 0;
  const hasBack = !!catalog && catalog.backIndices.length > 0;

  const catalogBlock = hasCatalog
    ? `\nIdentity Image Catalog — the framing, view, and expression of each GROUP A image (use this to select identity_image_indices per prompt):\n${catalog.lines.join("\n")}\n`
    : "";

  const identitySelectionRule = hasCatalog
    ? `\nPER-PROMPT IDENTITY SELECTION — MANDATORY: every portrait prompt object in the output JSON must include an "identity_image_indices" array listing the GROUP A image numbers (from the Identity Image Catalog) that best support THAT prompt. Selection rules:
- Close-up/beauty prompts → prefer close-up and medium references.
- Waist-up/medium prompts → prefer medium and full-body references.
- Full-body prompts → MUST include the full-body reference if one exists.
- Back-view/turned-away prompts → MUST include the back-view reference plus exactly one front full-body reference (for build and skin-tone consistency).
- Smiling prompts → ONLY the smiling-teeth references (never a neutral reference).
- All non-smiling prompts → ONLY neutral references (never a smiling-teeth reference).
Select 2-4 indices per prompt when enough references exist. Never select an empty list.\n`
    : "";

  const dentitionRule = hasSmiling
    ? `1. Smile Allocation Rule — ABSOLUTE RULE
The subject's GENUINE smile is available: identity ${catalog!.smilingIndices.length === 1 ? `IMAGE ${catalog!.smilingIndices[0]} shows` : `IMAGES ${catalog!.smilingIndices.join(", ")} show`} the subject genuinely smiling with visible teeth. You MUST designate 2-3 portrait slots (in a 10-image shoot; exactly 1 slot in shoots of 5 or fewer images) as genuine-smile slots: their prompts MUST contain the exact phrase "smiling with visible teeth", describe a warm genuine smile, and their identity_image_indices MUST list ONLY the smiling-teeth reference(s). Custom slots (flag shot, mugshot, bowl, viral pose, quote card) are NEVER smile slots — choose normal portrait slots.
ALL OTHER SLOTS: no smiling, no laughing, no visible teeth, no open mouth. Their identity_image_indices must list ONLY neutral references. For these slots the target is ALIVE lips: lips fractionally parted (natural breathing stance), subtle asymmetric lip curve, soft tension in the lower lip, relaxed jawline — natural, unlocked, human lip micro-states are mandatory.`
    : `1. The Dentition Safeguard — ABSOLUTE RULE
NEVER write any prompt that includes smiling, laughing, open-mouthed, teeth-showing, or grinning expressions. These are unconditionally prohibited regardless of what the identity photos show. Do not add smiles or laughter even if identity photos show them.

HOWEVER — "closed lips" is no longer the target. The target is ALIVE lips. The following subtle mouth states are not only permitted but required: lips fractionally parted (natural breathing stance), subtle asymmetric lip curve, soft tension in the lower lip, relaxed jawline. The distinction is: NO SMILING / NO TEETH / NO OPEN MOUTH — but natural, unlocked, human lip micro-states are mandatory.`;

  const backPoseGate = hasBack
    ? `1b. Back-View Poses — AVAILABLE: identity ${catalog!.backIndices.length === 1 ? `IMAGE ${catalog!.backIndices[0]} shows` : `IMAGES ${catalog!.backIndices.join(", ")} show`} the subject from behind. Back-view or turned-away poses are permitted; when you write one, its identity_image_indices MUST include the back-view reference plus one front full-body reference, and the prompt must describe the back/figure exactly as shown in the back-view reference — never an imagined or idealized body shape.`
    : `1b. Back-View Poses — FORBIDDEN: no identity reference shows the subject from behind, so NEVER write a pose where the subject's back is the primary view (fully turned away from camera). The generator must never guess how the subject looks from behind. Over-the-shoulder glances where the face and figure remain front-referenced are fine.`;

  // Instructive wording only — the planner copies anatomical-facts text into
  // prompts verbatim, so this must never combine both slot types in one clause
  // (a combined clause bled smile language into every neutral prompt).
  const cohesiveAnatomicalClause = hasSmiling
    ? `(fractionally parted or micro-asymmetric curve — no smile, no teeth, no open mouth). EXCEPTION — in the designated smile slots ONLY, write instead: a genuine warm smile, smiling with visible teeth, faithfully copied from the smiling identity reference. Never put the no-smile clause and the smile clause in the same prompt`
    : `(fractionally parted or micro-asymmetric curve — no smile, no teeth, no open mouth)`;

  return `SYSTEM INSTRUCTION: Photo Shoot Prompt Engineer (Art Director Vision Model)

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
${catalogBlock}${identitySelectionRule}
Validation: If there is a critical gap (e.g., you need to generate a full-body shot but only have a headshot, or a requested asset is completely missing), set the upload_error_warning key at the root of the JSON with a description of what is missing. Do not generate empty or fallback placeholders.

GROUP B — Inspiration (Aesthetic & Pose):
Role: Visual references for the environments, compositions, camera angles, lighting moods, and editorial styling.
Pose Harvesting: If multiple inspiration images are provided, analyze and map all observed poses across your prompts. If fewer than 10 are provided, creatively invent highly fashion-forward, professional poses to fill the remaining slots.

GROUP C — Accessories & Overrides:
Role: Specific items tagged with names and styling notes (e.g., clothing, shoes, bags, props, custom nail designs, jewelry details, hair overrides).
Strict Tag-Focused Isolation: If an image in Group C displays a full body, a model, or a wider scene context but is tagged as a specific element (e.g., tagged as "shoe", "bag", "jacket", "wedding ring"), you must isolate and describe only the tagged item from that image. Completely ignore all other visual information in that reference photo.
Hard-Replacement Priority: Items in Group C hard-replace any corresponding items worn by models in the Group B inspiration images.

GROUP D — POSE CONSISTENCY LOCK (Buyer/Creator-Supplied, ABSOLUTE RULE when present):
Role: Exact pose and expression references. Each image may be a single pose photo OR a collage containing multiple distinct poses. Scan every Group D image carefully and extract all individual poses you can identify — a collage counts as multiple pose references. Assign extracted poses to portrait slots in order (first pose found → slot 1, second pose → slot 2, continuing across all D images, cycling back to the start if poses run out before slots are filled). Extract body position, limb placement, hand position, head tilt, and facial expression only. Do NOT transfer skin tone, wardrobe, accessories, or background from Group D.
MANDATORY COMPLIANCE: for every slot with a mapped Group D pose, the Subject section's body position, limb placement, and hand position MUST match that extracted pose exactly. You are FORBIDDEN from substituting a different pose, blending it with a Group B/inspiration pose, or generalizing it into a generic editorial stance — this is non-negotiable, the same standing as the identity lock. Only camera framing, angle, and micro-expression may vary within the locked pose. Group D overrides pose-harvesting from Group B for the mapped slots, with no exceptions.

II. THE MANDATORY PROMPT PREFIX (For Prompts 1 through 9)

To lock in the image generator's behavioral constraints and protect the subject's identity, every editorial subject prompt must begin with this exact text block, word-for-word, without deviation. Replace [IDENTITY_RANGE] with the exact image range stated in the GROUP A label (e.g. "IMAGES 1 through 3", or "IMAGE 1" if only one identity image was provided):

"Act as an elite fashion photographer. REFERENCE [IDENTITY_RANGE] ARE THE SUBJECT — use [IDENTITY_RANGE] as the identity references. The subject's exact face, skin tone, body structure, facial features, and likeness must be taken directly from [IDENTITY_RANGE] and faithfully replicated in the output. Do not use the face or body of any person from any other reference image. Do not alter the subject's identity, face shape, eye spacing, nose shape, jawline, or skin tone under any circumstances. This is a professional high-end editorial fashion photograph."

III. CORE ART DIRECTION & SAFETY SAFEGUARDS

${dentitionRule}

${backPoseGate}

2. Styling, Hairstyles, and Overrides
By default, preserve the hair shown in Group A identity images. However, if Group C contains an image tagged [HAIRSTYLE], you MUST override all hair descriptions from Group A and Group B with the EXACT hairstyle visible in the [HAIRSTYLE] reference image. This override is absolute — even if the [HAIRSTYLE] image shows a shaved head, bald head, very short crop, or any other style that differs dramatically from Group A, you must describe that exact style in every portrait prompt. Never fall back to Group A hair when a [HAIRSTYLE] tag is present.

If Group C contains an image tagged [NAIL_DESIGN], detail those custom nail characteristics in the Important Details section.

[OUTFIT] CONSISTENCY LOCK: If Group C contains an asset tagged [OUTFIT], that exact outfit MUST be worn by the subject in ALL 9 portrait prompts without exception. Extract the specific garment, fabric, color, cut, silhouette, and surface details from the [OUTFIT] reference image and replicate them precisely in every portrait prompt. Shot-to-shot variation must come only from pose, camera angle, expression, and composition — NOT from changing the outfit. Do not invent or substitute any alternative garments.

[BACKGROUND] CONSISTENCY LOCK — ABSOLUTE RULE: If Group C contains an asset tagged [BACKGROUND], that reference IS the environment for ALL portrait prompts without exception. Extract its concrete visual characteristics (surface material, color palette, floor, texture, depth) and write that exact environment into the Environment section of EVERY portrait prompt. You are FORBIDDEN from inventing any alternative setting — no libraries, courtrooms, offices, chambers, gradient studio walls, or any other location — regardless of what the shoot category, composition principles, or atmospheric mandates suggest. The composition aesthetic principles and atmospheric elements must be expressed WITHIN the locked environment (through framing, camera distance, light direction, and light quality), never by changing the environment itself. Variation between shots comes only from framing, distance, and angle. EXCEPTION: If the user content contains a "PER-SLOT BACKGROUND ALLOCATION" section, that section supersedes this rule — apply the lock per slot group exactly as instructed there, never globally.

PERSPECTIVE MATCH: Analyze the [BACKGROUND] reference's camera geometry — camera height, tilt, horizon/floor line, and apparent focal length — and write every prompt's camera setup to be geometrically consistent with it. The subject must appear genuinely photographed standing INSIDE that space: feet grounded on the reference's floor plane, vanishing lines agreeing, lighting direction plausible for the space, and no camera angle that the reference's perspective could not produce. A subject that looks pasted onto the backdrop is a failure.

3. Critical Exclusions Registry
- No Aesthetic Bleeding: Do NOT transfer models, skin tones, faces, or hairstyles from Group B or Group C onto the target subject.
- No Identity Artifacts: Do NOT transfer casual clothing from Group A onto the editorial. Group A is for physical identity preservation only.
- No Background Spills: Do NOT mix background environment elements of Group C into the Group B background setting.

4. Cohesive Portfolio Rule
Maintain absolute visual and stylistic cohesion in color grading, mood, atmosphere, and environments across the series. Every portrait prompt must state anatomical facts positively: exactly two hands with five natural fingers each, natural eyes with catchlights, and natural lips with a subtle micro-expression ${cohesiveAnatomicalClause}. State these as descriptive facts in the prompt body, not as negative constraints.

5. Camera & Lens Consistency
Dynamically select one of the world's top 4 medium-format camera systems (Hasselblad, Phase One, Fujifilm GFX, or Leica S) and keep it identical across all 9 portrait prompts. Vary focal lengths per shot type.

6. Atmospheric Elements Integration
Every prompt must incorporate organic atmospheric elements: volumetric dust motes, morning mist, wind-blown elements, humid air quality, micro light leaks, or organic lens flares.

In shoots of 5+ images, AT LEAST ONE portrait slot (two in a 10-image shoot) must feature a PRONOUNCED editorial smoke/haze atmosphere — not a subtle afterthought but the defining mood of the frame: visible studio haze drifting through the scene, light beams cutting through smoke behind or beside the subject, dramatic rim light glowing through the haze. Write it prominently in the Environment section ("thick cinematic studio haze fills the space, a hard beam of light slicing through it from camera-left...") while keeping the slot's assigned backdrop recognizable. Choose the moodiest slots for this treatment. Custom slots (flag, mugshot, bowl, viral pose) are excluded — apply it to normal portrait slots only.

6b. FACE VISIBILITY RULE — ABSOLUTE, EVERY PORTRAIT PROMPT
The subject's face must be FULLY VISIBLE and UNOBSTRUCTED in every image. NEVER write a pose where a hand, arm, fingers, prop, or fabric crosses, touches, or partially covers ANY part of the face: no hands on cheeks, no fingers near the mouth or eyes, no chin resting on knuckles that overlap the jawline, no arms crossed in front of the face, no props held between the face and the camera. Hands belong at the sides, in pockets, on hips, adjusting a cuff or lapel, or holding props at chest height or LOWER — always below the chin line. The subject's likeness is the entire product; any occlusion of the face breaks it. When describing hands in the Subject section, explicitly place them away from the face.

7. Self-Containment Mandate
Every single prompt must be fully self-contained. Never reference other prompts. Fully articulate all details in every prompt, even if repeated. Do NOT include any internal reasoning phrases such as "as seen in identity photo X", "from reference image Y", "per Group C", or any other meta-references to the input assets. The output prompt text is sent directly to an image generator that has no context about the input groups — describe everything explicitly in photographic language.

8. COMPOSITION AESTHETIC MANDATE — ONE PRINCIPLE PER SLOT

Each of the 9 portrait slots must be assigned exactly one composition aesthetic principle from the pool below. Distribute all 9 across the list — maximize variety, ensure no two consecutive slots share the same principle, and collectively cover as wide an emotional and compositional range as possible.

For each slot, inject the assigned principle's descriptive language into the Environment and Subject sections. Use the specific phrasing from the principle definition — do not paraphrase it into generic composition advice.

COMPOSITION AESTHETIC POOL:

[THE_ACCENT] — One dominant focal element commands the entire frame. Everything else recedes. Isolate one high-contrast detail (a jewelry piece, a fabric drape, a hand gesture, a shaft of light) and build the entire composition around drawing the eye to it. Describe as: "the composition is built around a single commanding accent — [specific element]. All surrounding elements recede to serve it."

[ISOLATION] — The subject exists alone in a stripped-back environment. Minimal background, maximum subject clarity, wide breathing room on all sides. Describe as: "the subject stands in complete visual isolation — stripped-back environment, expansive breathing room, nothing competes with their presence."

[GROUPING] — Visual elements are intentionally clustered to create density and internal relationship. Group hands with accessories, layer fabric textures, stack visual planes so the eye moves between connected zones. Describe as: "visual elements are deliberately grouped — [describe the clusters]. The eye moves between related zones rather than across empty space."

[FRAMING] — A natural or architectural element creates a frame-within-the-frame around the subject. Use doorways, windows, arms, fabric edges, shadow bands, or light boundaries to surround and contain the subject. Describe as: "the subject is contained within a natural inner frame — [describe the framing element] — which focuses all attention inward and adds a sense of cinematic depth."

[NEGATIVE_SPACE] — Deliberate empty areas amplify the subject's visual weight. Subject occupies 30–40% of frame; the remaining space is intentional, textured emptiness. Describe as: "expansive negative space fills [direction] of frame. The subject's presence is amplified by the surrounding stillness — the empty space is as considered as the subject within it."

[GOLDEN_RATIO] — Subject placed at the Phi intersection. Visual weight follows the natural spiral. Position the subject's face or key focal point at approximately the 62% intersection of the frame. Describe as: "the subject is anchored at the golden ratio intersection — the composition breathes and resolves naturally outward from that point, creating effortless visual balance."

[MOVEMENT] — Motion, flow, or kinetic energy is the central compositional force. Fabric caught mid-movement, wind-blown hair, trailing motion, mid-gesture freeze, or environmental blur against a sharp subject. Describe as: "the composition is defined by movement — [describe the specific kinetic element]. Energy flows through the frame; the still subject is the eye of a visual storm."

[DIPTYCH] — The frame is split into two distinct visual zones that exist in dialogue. Hard left/right split, shadow/light contrast, foreground/background tonal shift. The subject bridges or occupies one zone. Describe as: "the frame divides into two worlds — [describe the left or shadow zone] and [describe the right or light zone]. The subject exists at their boundary, belonging to both."

[TENSION] — Visual discomfort, dynamic contrast, or opposing forces create psychological charge. Diagonal lines in conflict, size mismatch between subject and environment, compressed framing, subject looking counter to the directional weight. Describe as: "the composition holds deliberate tension — [describe the specific source of visual conflict]. The eye is never fully at rest; the frame refuses to settle."

[SYMMETRY] — Centered, mirrored, or deliberately balanced composition. Dead-center subject framing against a symmetrical environment, bilateral balance of visual weight. Formal, confrontational, portrait-gallery stillness. Describe as: "perfect bilateral symmetry — subject centered, environment mirrored. The composition is formally still and quietly confrontational, like a painting that looks back."

9. Micro-Expression Mandate — REQUIRED IN EVERY PORTRAIT PROMPT
Every portrait prompt MUST include exactly one phrase from each of the three pools below. Choose phrases that match the slot's mood, pose, and shot type. Vary your choices across all slots — no two slots should carry the same combination.

CRITICAL CONSTRAINT: These phrases describe impression, gaze quality, and lip state ONLY. They must never alter face shape, eye spacing, nose shape, jawline, or skin tone. They describe how the subject LOOKS in a captured moment — not structural modification.

EYE & BROW POOL (choose 1 per slot):
- "subtle crow's feet at the outer corners of the eyes — natural warmth"
- "slightly parted upper eyelids — focused and fully present"
- "micro-lift of the inner brow — a trace of soft curiosity"
- "a fractional squint — natural reaction to studio light, eyes alive and intense"
- "sharp glint of focus in the pupils — deliberate connection with the lens"

MOUTH & JAW POOL (choose 1 per slot):
- "lips fractionally parted — natural relaxed breathing stance"
- "subtle asymmetric lip curve — an unspoken thought at the surface"
- "soft tension in the lower lip — quiet determination"
- "relaxed jawline with lips barely parted — unheld, genuinely human"
- "slight upturn of one mouth corner — micro-confidence, not a smile"

GLOBAL IMPRESSION POOL (choose 1 per slot):
- "mid-thought expression — a candid, unrepeatable moment"
- "fleeting look of serene contemplation"
- "micro-expression of warmth — neutral pose with underlying emotion"
- "an understated knowing glance — the subject is actively engaging the viewer"
- "subtle breath-in expression — the micro-second before speaking"
- "candid unposed facial micro-movements — the opposite of synthetic perfection"

Place these three chosen phrases inside the Subject section of the prompt, grouped after the pose description. Write them as positive descriptive facts, not as instructions to the generator.

CATCHLIGHT RULE — REQUIRED when the shot type is headshot, close-up, or medium (i.e. any shot where the eyes are a prominent feature). Skip for full-body shots where the face is small in frame.

For every applicable slot, add one phrase from this pool that describes the shape, position, and light source of the catchlight in the subject's eyes. This is what separates a live eye from a painted surface:

CATCHLIGHT POOL (choose 1 per applicable slot — vary across slots):
- "a sharp circular catchlight from a direct softbox at 10 o'clock, reflected in the iris"
- "dual rectangular window catchlights — natural light quality with real depth in the iris"
- "a ring light catchlight as a fine white halo in the iris, adding magnetic pull"
- "single butterfly catchlight high and centered — classic studio beauty, eyes like glass"
- "diffused octagonal catchlight with warm color temperature in the reflection"
- "small key-light catchlight at 2 o'clock — precise, intentional, alive"
- "a soft crescent catchlight from a large fill panel — gentle and editorial"

Place the catchlight phrase immediately after the eye/brow micro-expression phrase in the Subject section.

IV. THE 10th PROMPT: THE GRAPHIC QUOTE CARD

The 10th prompt is a specialized instruction block for an SVG composite workflow. It specifies instructions for producing a high-end editorial graphic layout combining a background image with beautiful typography overlay. Define high-contrast typographic zones, transparent overlays, and beautiful placement of quote text.

V. OUTPUT JSON STRUCTURE

Output ONLY a valid JSON object. No markdown code fences, no pre-text, no post-text.

IMPORTANT: Do all creative reasoning internally. Output ONLY the final consolidated fields — no intermediate breakdown fields (no separate background, lighting, pose, shot_type, outfit_look, reference_registry, prefix, etc.). This keeps the JSON compact and within token limits.

${hasCatalog ? `Every portrait prompt object MUST include "identity_image_indices" (the GROUP A image numbers selected per the PER-PROMPT IDENTITY SELECTION rule). The quote card prompt may omit it.\n\n` : ""}{
  "upload_error_warning": null,
  "prompts": [
    {
      "prompt_index": 1,
      "is_quote_card": false,${hasCatalog ? `\n      "identity_image_indices": [1, 2],` : ""}
      "fully_consolidated_prompt": "Act as an elite fashion photographer. REFERENCE [IDENTITY_RANGE] ARE THE SUBJECT — use [IDENTITY_RANGE] as the identity references. The subject's exact face, skin tone, body structure, facial features, and likeness must be taken directly from [IDENTITY_RANGE] and faithfully replicated in the output. Do not use the face or body of any person from any other reference image. Do not alter the subject's identity, face shape, eye spacing, nose shape, jawline, or skin tone under any circumstances. This is a professional high-end editorial fashion photograph. Identity: [exact face description — skin tone, eye shape and color, nose, lips, jawline, hairline, body build drawn from identity profile]. Environment: [lighting setup — direction, quality, color temperature; background/environment — specific location, texture, depth; time of day/atmospheric details]. Subject: [pose — body position, arms, hands explicitly described; expression — micro-expression from the three pools: one eye/brow phrase, one mouth/jaw phrase, one global impression phrase; catchlight phrase if eyes are visible; camera angle — eye-level/high/low; framing — headshot/medium/full body; lens — focal length, depth of field]. Styling: [outfit — specific garments, fabric, color, cut from OUTFIT reference or inspiration; hair; grooming; accessories; color grade/film look]. Anatomical facts: exactly two hands with five natural fingers each, natural eyes with catchlights, natural lips with subtle micro-expression (fractionally parted or micro-asymmetric curve — no smile, no teeth, no open mouth)."
    },
    {
      "prompt_index": 10,
      "is_quote_card": true,
      "fully_consolidated_prompt": "Complete composite graphic instructions for background image generation.",
      "svg_layout_instructions": "Complete SVG overlay instructions: typographic hierarchy, font specifications, text-shadow or dark overlay for contrast, positioning, color assignments."
    }
  ]
}`;
}


async function buildShootBrief(
  shoot: {
    mode: string;
    package_size: number;
    aspect_ratio: string;
    shot_type?: string | null;
    quote?: { text: string; attribution: string } | null;
    storyContext?: string;
    storyImageUrls?: Array<{ url: string; label: string }>;
    category?: string;
    flag_shot?: { enabled: boolean; text: string } | null;
    group_identity?: boolean;
    trend_slots?: import("./trend-slots").TrendSlotsSelection | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string,
  forbiddenExamples?: string[],
  dbForbiddenWords?: Array<{ word: string; replacement: string }>,
  identityCatalog?: IdentityCatalog | null
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const identityRefs = refs.filter((r) => r.purpose === "identity" && r.url);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration" && r.url).slice(0, 9);
  const taggedRefs = refs.filter((r) => r.purpose === "tagged" && r.url);
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  // Group A: locked base or identity images
  const groupMode = shoot.group_identity === true && !characterBaseUrl;
  const groupAUrls = characterBaseUrl ? [characterBaseUrl] : identityRefs.map((r) => r.url);
  const groupACount = groupAUrls.length;
  const identityRange = groupACount === 1 ? "IMAGE 1" : `IMAGES 1 through ${groupACount}`;
  const groupALabel = characterBaseUrl
    ? `GROUP A — Identity (Subject): Locked character base image (IMAGE 1). Use IMAGE 1 for exact facial identity, body structure, and locked wardrobe.`
    : groupMode
    ? `GROUP A — Identity (Subjects): ${identityRange} show MORE THAN ONE person (e.g. a couple/group). Preserve EACH person's exact face, skin tone, and body build from ${identityRange}. Every generated image MUST include ALL of these people together, arranged naturally in the scene — never drop, isolate, or replace anyone, and never invent additional people.\n\nIdentity Profiles (one per person):\n${identityProfile}`
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
        text: `GROUP D — POSE CONSISTENCY LOCK (ABSOLUTE RULE, ${poseRefsForBrief.length} image${poseRefsForBrief.length !== 1 ? "s" : ""}): Exact pose/expression references — MANDATORY, not inspirational. Each image may be a single pose photo OR a collage containing multiple distinct poses — scan every image for all visible poses. Extract all distinct poses across all Group D images and assign them to portrait slots in order (first extracted pose → slot 1, second → slot 2, cycling back if poses run out before slots are filled). For every mapped slot, the Subject section's body position, limb placement, hand position, and head tilt MUST match the assigned Group D pose exactly — you are FORBIDDEN from substituting a different pose, blending it with a Group B/inspiration pose, or softening it into a generic editorial stance. Only camera framing, angle, and micro-expression may vary within the locked pose. Do NOT transfer skin tone, wardrobe, accessories, or background from these images — extract pose and expression only. Group D overrides pose-harvesting from Group B for mapped slots, with no exceptions.`,
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

  // Inject Story context and story image assets (co-star, group photo, brand)
  if (shoot.storyContext) {
    parts.push({ text: shoot.storyContext });
  }
  if (shoot.storyImageUrls && shoot.storyImageUrls.length > 0) {
    for (const asset of shoot.storyImageUrls) {
      if (!asset.url) continue;
      parts.push({ text: asset.label });
      const imgPart = await toGeminiImagePart(asset.url);
      if (imgPart) parts.push(imgPart);
    }
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
${!hasQuote ? "\nThis shoot has NO quote card. Section IV's \"10th prompt is a graphic quote card\" example does not apply here — ignore it entirely. Every prompt_index from 1 through " + packageSize + ", including the last one, is a normal photographic portrait prompt (is_quote_card: false), honoring any SLOT N OVERRIDE given above for that index. Never emit svg_layout_instructions or a graphic/typography composite for this shoot." : ""}

Output ONLY valid JSON matching the output structure in your instructions. No markdown fences, no pre-text, no post-text.`,
  });

  if (groupMode) {
    parts.push({ text: GROUP_IDENTITY_DIRECTIVE(identityRange) });
  }

  const nonCallToBarFlagActive = shoot.category !== "call_to_bar" && !!(shoot.flag_shot?.enabled && shoot.flag_shot.text);
  if (shoot.trend_slots && (shoot.trend_slots.mugshot?.enabled || shoot.trend_slots.bowl?.enabled)) {
    const { buildTrendSlotsBriefSection } = await import("@/lib/trend-slots");
    parts.push({ text: buildTrendSlotsBriefSection(packageSize, shoot.trend_slots, nonCallToBarFlagActive) });
  }

  if (shoot.category === "call_to_bar") {
    const { buildCallToBarBriefSection } = await import("@/lib/call-to-bar");
    const isFemale = refs.some((r) => r.tag === "COLLAR_FEMALE");
    const hasOutfitRef = refs.some((r) => r.tag === "OUTFIT");
    const flagShot = shoot.flag_shot?.enabled && shoot.flag_shot.text ? { text: shoot.flag_shot.text } : null;
    parts.push({ text: buildCallToBarBriefSection(packageSize, isFemale, hasOutfitRef, flagShot) });
  } else if (nonCallToBarFlagActive && shoot.flag_shot) {
    // Non-Call-to-Bar categories don't run the wardrobe matrix — inject the flag
    // slot standalone, generic outfit (no barrister regalia). Shares the same
    // slot-placement countdown as trend slots so a Trending template with BOTH
    // a flag and a bowl/mugshot slot gets distinct slot numbers, not a collision.
    const { getTrendSlotNumbers } = await import("@/lib/trend-slots");
    const { buildFlagShotDirective } = await import("@/lib/flag-shot");
    const { flagSlot } = getTrendSlotNumbers(packageSize, {
      mugshotOn: !!shoot.trend_slots?.mugshot?.enabled,
      bowlOn: !!shoot.trend_slots?.bowl?.enabled,
      viralOn: !!shoot.trend_slots?.viral?.enabled,
      flagOn: true,
    });
    if (flagSlot) {
      parts.push({
        text: `SLOT ${flagSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${flagSlot}:\n` +
          buildFlagShotDirective(shoot.flag_shot.text, false),
      });
    }
  }

  if (identityCatalog && identityCatalog.lines.length > 0) {
    parts.push({ text: buildIdentityRoutingReminder(identityCatalog, packageSize) });
  }

  const geminiModel = genai.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildShootBriefSystemInstruction(identityCatalog),
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
  if (USE_MOCK_FAL) {
    return MOCK_FAL_PLACEHOLDER_IMAGE_URL;
  }

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
      image_urls: imageUrls.slice(0, NANO_BANANA_MAX_IMAGES),
      limit_generations: false,
      ...(resolution ? { resolution: resolution as unknown as "4K" } : {}),
    },
  });

  // Handle both newer and older fal-ai/client versions
  const output = ((response as Record<string, unknown>).data || response) as FalOutput;
  // nano-banana-2 returns 2 images: a draft at images[0] and the full 4K at images[last].
  const images = output.images ?? [];
  const url = images[images.length - 1]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL");
  return url;
}

async function polishImageWithFal(imageUrl: string, prompt: string): Promise<string> {
  if (USE_MOCK_FAL) {
    return imageUrl;
  }

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
  if (USE_MOCK_FAL) {
    return MOCK_FAL_PLACEHOLDER_IMAGE_URL;
  }

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
async function analyzeIdentityImagesClaude(imageUrls: string[], groupMode = false): Promise<string> {
  const imageBlocks = imageUrls
    .filter(Boolean)
    .slice(0, 4)
    .map(url => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

  const promptText = groupMode
    ? `These reference photos show MORE THAN ONE person (e.g. a couple or group). For EACH person visible, extract a precise identity profile for AI image generation.

Describe the people left-to-right. Return ONLY this format, repeating the block for every person (Person 1, Person 2, ...). ALL 6 fields are required for EVERY person:
IDENTITY PROFILE:
Person 1:
Face: [facial structure — shape, proportions, bone structure]
Skin: [tone with specific depth and undertone]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style — if bald/shaved, state that explicitly]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]
Person 2:
Face: [...]
Skin: [...]
Eyes: [...]
Hair: [...]
Build: [...]
Distinctive: [...]

Include EVERY person shown — do not merge, blend, or skip anyone. Keep each person distinct.
Clinical and precise. No subjective judgments. Stable biometric features only.`
    : `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

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
    storyContext?: string;
    storyImageUrls?: Array<{ url: string; label: string }>;
    category?: string;
    flag_shot?: { enabled: boolean; text: string } | null;
    group_identity?: boolean;
    trend_slots?: import("./trend-slots").TrendSlotsSelection | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string,
  forbiddenExamples?: string[],
  dbForbiddenWords?: Array<{ word: string; replacement: string }>,
  identityCatalog?: IdentityCatalog | null
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const identityRefs = refs.filter((r) => r.purpose === "identity" && r.url);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration" && r.url).slice(0, 9);
  const taggedRefs = refs.filter((r) => r.purpose === "tagged" && r.url);
  const poseRefsForBrief = refs.filter((r) => r.purpose === "pose" && r.url);
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  const groupMode = shoot.group_identity === true && !characterBaseUrl;
  const groupAUrls = characterBaseUrl ? [characterBaseUrl] : identityRefs.map((r) => r.url);
  const groupACount = groupAUrls.length;
  const identityRange = groupACount === 1 ? "IMAGE 1" : `IMAGES 1 through ${groupACount}`;
  const groupALabel = characterBaseUrl
    ? `GROUP A — Identity (Subject): Locked character base image (IMAGE 1). Use IMAGE 1 for exact facial identity, body structure, and locked wardrobe.`
    : groupMode
    ? `GROUP A — Identity (Subjects): ${identityRange} show MORE THAN ONE person (e.g. a couple/group). Preserve EACH person's exact face, skin tone, and body build from ${identityRange}. Every generated image MUST include ALL of these people together, arranged naturally in the scene — never drop, isolate, or replace anyone, and never invent additional people.\n\nIdentity Profiles (one per person):\n${identityProfile}`
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
      text: `GROUP D — POSE CONSISTENCY LOCK (ABSOLUTE RULE, ${poseRefsForBrief.length} image${poseRefsForBrief.length !== 1 ? "s" : ""}): Exact pose/expression references — MANDATORY, not inspirational. Each image may be a single pose photo OR a collage containing multiple distinct poses — scan every image for all visible poses. Extract all distinct poses across all Group D images and assign them to portrait slots in order (first extracted pose → slot 1, second → slot 2, cycling back if poses run out before slots are filled). For every mapped slot, the Subject section's body position, limb placement, hand position, and head tilt MUST match the assigned Group D pose exactly — you are FORBIDDEN from substituting a different pose, blending it with a Group B/inspiration pose, or softening it into a generic editorial stance. Only camera framing, angle, and micro-expression may vary within the locked pose. Do NOT transfer skin tone, wardrobe, accessories, or background from these images — extract pose and expression only. Group D overrides pose-harvesting from Group B for mapped slots, with no exceptions.`,
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

  // Inject Story context and story image assets (co-star, group photo, brand)
  if (shoot.storyContext) {
    content.push({ type: "text", text: shoot.storyContext });
  }
  if (shoot.storyImageUrls && shoot.storyImageUrls.length > 0) {
    for (const asset of shoot.storyImageUrls) {
      if (!asset.url) continue;
      content.push({ type: "text", text: asset.label });
      content.push({ type: "image", source: { type: "url", url: asset.url } });
    }
  }

  const claudeShotTypeLabel = SHOT_TYPE_LABELS[shoot.shot_type ?? ""];
  const claudeShotTypeConstraint = claudeShotTypeLabel ? `\n- Shot Type: ${claudeShotTypeLabel}` : "";

  content.push({ type: "text", text: `SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}${claudeShotTypeConstraint}
${hasQuote ? `- Quote Text: "${shoot.quote!.text}"${shoot.quote!.attribution ? `\n- Attribution: "${shoot.quote!.attribution}"` : ""}` : ""}

Generate exactly ${portraitCount} portrait prompt${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote card prompt (prompt_index: 10, is_quote_card: true)" : ""}.
${!hasQuote ? "\nThis shoot has NO quote card. Section IV's \"10th prompt is a graphic quote card\" example does not apply here — ignore it entirely. Every prompt_index from 1 through " + packageSize + ", including the last one, is a normal photographic portrait prompt (is_quote_card: false), honoring any SLOT N OVERRIDE given above for that index. Never emit svg_layout_instructions or a graphic/typography composite for this shoot." : ""}

Output ONLY valid JSON matching the output structure in your instructions. No markdown fences, no pre-text, no post-text.` });

  if (groupMode) {
    content.push({ type: "text", text: GROUP_IDENTITY_DIRECTIVE(identityRange) });
  }

  const nonCallToBarFlagActiveC = shoot.category !== "call_to_bar" && !!(shoot.flag_shot?.enabled && shoot.flag_shot.text);
  if (shoot.trend_slots && (shoot.trend_slots.mugshot?.enabled || shoot.trend_slots.bowl?.enabled)) {
    const { buildTrendSlotsBriefSection } = await import("@/lib/trend-slots");
    content.push({ type: "text", text: buildTrendSlotsBriefSection(packageSize, shoot.trend_slots, nonCallToBarFlagActiveC) });
  }

  if (shoot.category === "call_to_bar") {
    const { buildCallToBarBriefSection } = await import("@/lib/call-to-bar");
    const isFemale = refs.some((r) => r.tag === "COLLAR_FEMALE");
    const hasOutfitRef = refs.some((r) => r.tag === "OUTFIT");
    const flagShot = shoot.flag_shot?.enabled && shoot.flag_shot.text ? { text: shoot.flag_shot.text } : null;
    content.push({ type: "text", text: buildCallToBarBriefSection(packageSize, isFemale, hasOutfitRef, flagShot) });
  } else if (nonCallToBarFlagActiveC && shoot.flag_shot) {
    const { getTrendSlotNumbers } = await import("@/lib/trend-slots");
    const { buildFlagShotDirective } = await import("@/lib/flag-shot");
    const { flagSlot } = getTrendSlotNumbers(packageSize, {
      mugshotOn: !!shoot.trend_slots?.mugshot?.enabled,
      bowlOn: !!shoot.trend_slots?.bowl?.enabled,
      viralOn: !!shoot.trend_slots?.viral?.enabled,
      flagOn: true,
    });
    if (flagSlot) {
      content.push({
        type: "text",
        text: `SLOT ${flagSlot} OVERRIDE — the following replaces the normal portrait directive for slot ${flagSlot}:\n` +
          buildFlagShotDirective(shoot.flag_shot.text, false),
      });
    }
  }

  if (identityCatalog && identityCatalog.lines.length > 0) {
    content.push({ type: "text", text: buildIdentityRoutingReminder(identityCatalog, packageSize) });
  }

  const claudeResult = await Promise.race([
    anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16384,
      system: buildShootBriefSystemInstruction(identityCatalog),
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
  if (!imageRes.body) throw new Error(`Image fetch returned no body`);

  const contentType =
    imageRes.headers.get("content-type")?.startsWith("image/")
      ? imageRes.headers.get("content-type")!
      : "image/png";
  const ext = contentType === "image/jpeg" ? "jpg" : "png";
  const storagePath = `${userId}/${shootId}/slot-${slot}.${ext}`;
  const bucket = isTestMode ? "test" : "generated-4k";

  // Stream directly from fal.ai CDN → R2 without buffering the full image in memory.
  // A 4K PNG can be 20-50MB; the old arraybuffer approach loaded everything into heap
  // and took 60-120s, frequently hitting Vercel's 300s timeout and orphaning slots.
  const contentLength = imageRes.headers.get("content-length");
  await r2StreamUpload(
    bucket,
    storagePath,
    imageRes.body,
    contentType,
    contentLength ? Number(contentLength) : undefined
  );
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
  const resolution = opts.resolution ?? "4K";
  const ts = () => new Date().toISOString();

  const [shoot] = await sql`SELECT s.id, s.user_id, s.owner_email, s.mode, s.aspect_ratio, s.package_size, s.quote, s.identity_profile, s.identity_attributes, s.shoot_brief, s.character_base_id, s.role_prompt, s.template_id, s.template_showcase_id, s.background_plan, s.choice_selections, s.flag_shot, s.group_identity, s.trend_slots, t.is_story, t.story_type, t.scenes, t.category FROM shoots s LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id) WHERE s.id = ${shootId}`;
  if (!shoot) throw new Error("Shoot not found");
  const rawRefs = await sql`SELECT purpose, tag, custom_name, note, name, storage_bucket, storage_path FROM shoot_references WHERE shoot_id = ${shootId}` as unknown as ShootRefRow[];
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

  // Buyer background allocation (call_to_bar marketplace bookings)
  const backgroundPlan: BackgroundPlan | null =
    shoot.background_plan &&
    Array.isArray((shoot.background_plan as BackgroundPlan).allocations) &&
    (shoot.background_plan as BackgroundPlan).allocations.length > 0
      ? (shoot.background_plan as BackgroundPlan)
      : null;

  // Buyer choice-group selections (pick-one styling options)
  const choiceSelections: ChoiceSelections | null =
    shoot.choice_selections &&
    Array.isArray((shoot.choice_selections as ChoiceSelections).selections) &&
    (shoot.choice_selections as ChoiceSelections).selections.length > 0
      ? (shoot.choice_selections as ChoiceSelections)
      : null;

  // Story fields — derive from shoot_references (no story_assets column)
  const rolePrompt: string | null = typeof shoot.role_prompt === "string" ? shoot.role_prompt.trim() : null;
  const isStoryShoot = shoot.is_story === true;
  const templateScenes: Array<{ slot: number; title: string; description: string; environment: string; wardrobe: string; coCharacter?: string }> =
    Array.isArray(shoot.scenes) ? shoot.scenes : [];
  const costarRefRows = rawRefs.filter(r => r.purpose === "costar");
  const groupPhotoRefRow = rawRefs.find(r => r.purpose === "group_photo");
  const brandRefRows = rawRefs.filter(r => r.purpose === "brand");
  const storyAssets = (isStoryShoot || costarRefRows.length > 0 || groupPhotoRefRow || brandRefRows.length > 0) ? {
    costarRefs: costarRefRows.map(r => ({ storagePath: r.storage_path, storageBucket: r.storage_bucket, name: r.name })),
    groupPhotoRef: groupPhotoRefRow ? { storagePath: groupPhotoRefRow.storage_path, storageBucket: groupPhotoRefRow.storage_bucket } : undefined,
    brandRefs: brandRefRows.map(r => ({
      storagePath: r.storage_path,
      storageBucket: r.storage_bucket,
      placement: (r.note ?? "everywhere") as "everywhere" | "background" | "subtle",
      name: r.name ?? undefined,
    })),
  } : null;


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
  let adminPromptOnlyMode = false;
  let polishPassEnabled = false;
  try {
    const cfgData = await sql`SELECT key, value FROM app_config`;
    const cfgMap = Object.fromEntries(cfgData.map(r => [r.key, r.value]));
    if (cfgMap.vision_model === "claude") visionModel = "claude";
    if (cfgMap.generation_model === "seedream") generationModel = "seedream";
    promptOnlyMode = cfgMap.prompt_only_mode === "true" || cfgMap.prompt_only_mode === true;
    adminPromptOnlyMode = cfgMap.admin_prompt_only_mode === "true" || cfgMap.admin_prompt_only_mode === true;
    polishPassEnabled = cfgMap.polish_pass_enabled === "true" || cfgMap.polish_pass_enabled === true;
    console.log("[generate] active models:", { visionModel, generationModel, promptOnlyMode, adminPromptOnlyMode, polishPassEnabled });
  } catch { /* non-fatal — defaults apply */ }

  // Resolve whether this shoot's owner is an admin (for admin-only prompt-only mode)
  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const shootOwnerIsAdmin = adminEmails.includes(((shoot.owner_email ?? "") as string).toLowerCase());

  // Fire-and-forget wrapper — generation_events is non-critical UI telemetry.
  // A missing table or constraint error must never crash image generation.
  const logEvent = (type: string, payload: Record<string, unknown>) =>
    sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id as string}, ${type}, ${JSON.stringify(payload)}::jsonb, ${ts()})`.catch(() => {});

  // --- Step 1: Identity analysis (skip if base provides it) ---
  if (!identityProfile && !hasBase) {
    await sql`UPDATE shoots SET pipeline_stage = 'Analyzing identity', progress = 10, updated_at = ${ts()} WHERE id = ${shootId}`;

    logEvent('stage', { stage: "Analyzing identity", progress: 10 });

    const identityUrls = refs
      .filter((r) => r.purpose === "identity")
      .map((r) => r.url)
      .filter(Boolean);
    if (identityUrls.length === 0) throw new Error("No identity images found");

    // Group picture: the identity photo(s) contain more than one person — analyze each.
    const groupMode = shoot.group_identity === true;

    // Claude-first with silent Gemini fallback: a dead Anthropic key (no credits,
    // rate limit, outage) must never fail or delay the shoot. Claude gets 1 retry
    // so failover is fast; Gemini keeps its usual 2.
    if (visionModel === "claude") {
      try {
        identityProfile = await withRetry(() => analyzeIdentityImagesClaude(identityUrls, groupMode), 1);
      } catch (err) {
        console.warn("[generate] Claude identity analysis failed — falling back to Gemini:", err instanceof Error ? err.message : String(err));
        identityProfile = await withRetry(() => analyzeIdentityImages(identityUrls, groupMode), 2);
      }
    } else {
      identityProfile = await withRetry(() => analyzeIdentityImages(identityUrls, groupMode), 2);
    }

    await sql`UPDATE shoots SET identity_profile = ${identityProfile}, updated_at = ${ts()} WHERE id = ${shootId}`;
  }

  // --- Step 1b: Identity attribute classification (framing / view / expression) ---
  // Powers per-slot identity routing: smiling slots get only real-teeth references,
  // back-pose slots get the back-view reference, close-ups get portrait references.
  // Cached on the shoot row so retries skip the vision call. Skipped for group
  // shoots and locked-base shoots (single anchor image, no routing to do).
  let identityAttributes: Record<string, IdentityAttrs> = {};
  const identityRefsOrdered = refs.filter((r) => r.purpose === "identity" && r.url);
  if (!hasBase && shoot.group_identity !== true && identityRefsOrdered.length > 0) {
    const cached = shoot.identity_attributes;
    if (cached && typeof cached === "object" && !Array.isArray(cached) && Object.keys(cached).length > 0) {
      identityAttributes = cached as Record<string, IdentityAttrs>;
    } else {
      identityAttributes = await classifyIdentityAttributes(
        identityRefsOrdered.map((r) => ({ url: r.url, storagePath: r.storagePath }))
      );
      if (Object.keys(identityAttributes).length > 0) {
        await sql`UPDATE shoots SET identity_attributes = ${JSON.stringify(identityAttributes)}::jsonb, updated_at = ${ts()} WHERE id = ${shootId}`;
        console.log("[generate] identity attributes classified:", identityAttributes);
      }
    }
  }

  // Catalog handed to the brief planner — same GROUP A order the planner sees.
  const identityCatalog: IdentityCatalog | null = (() => {
    if (Object.keys(identityAttributes).length === 0) return null;
    const lines: string[] = [];
    const smilingIndices: number[] = [];
    const backIndices: number[] = [];
    identityRefsOrdered.forEach((r, i) => {
      const a = identityAttributes[r.storagePath] ?? DEFAULT_IDENTITY_ATTRS;
      lines.push(`IMAGE ${i + 1}: framing=${a.framing}, view=${a.view}, expression=${a.expression}`);
      if (a.expression === "smiling-teeth") smilingIndices.push(i + 1);
      if (a.view === "back") backIndices.push(i + 1);
    });
    return { lines, smilingIndices, backIndices };
  })();

  // --- Step 2: Shoot brief ---
  if (!shootBrief) {

    await sql`UPDATE shoots SET pipeline_stage = 'Building shoot brief', progress = 20, updated_at = ${ts()} WHERE id = ${shootId}`;

    logEvent('stage', { stage: "Building shoot brief", progress: 20 });

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

    // Build Story context block (role prompt + co-star / group / brand signed URLs)
    let storyContextParts: string[] = [];
    let storyImageUrls: Array<{ url: string; label: string }> = [];

    // Inject story scene structure from template so each slot gets its own environment
    if (isStoryShoot && templateScenes.length > 0) {
      const packageSize = normalizePackageSize(shoot.package_size);
      const scenesForPackage = templateScenes.slice(0, packageSize);
      const sceneList = scenesForPackage.map(s =>
        `  Scene ${s.slot}: "${s.title}" — ${s.description}` +
        (s.environment ? `\n    Environment: ${s.environment}` : "") +
        (s.wardrobe ? `\n    Wardrobe: ${s.wardrobe}` : "") +
        (s.coCharacter ? `\n    Co-character: ${s.coCharacter}` : "")
      ).join("\n\n");
      storyContextParts.push(
        `STORY SCENE STRUCTURE (${scenesForPackage.length} scene${scenesForPackage.length !== 1 ? "s" : ""} for this package):\n` +
        `Each prompt_index maps to one scene. Scene 1 → prompt_index 1, Scene 2 → prompt_index 2, etc.\n` +
        `Generate one prompt per scene. Do NOT reuse scenes. Use the scene's exact Environment and Wardrobe as the foundation for that slot's Scene and Important Details sections.\n\n` +
        sceneList
      );
    }

    if (rolePrompt) {
      storyContextParts.push(`ROLE OVERRIDE: The user has specified their angle in this story. In every prompt, the subject is described as: "${rolePrompt}". Weave this role naturally into the Subject, Environment, and Styling sections. Do NOT change the story's scene or background — only the subject's perspective and positioning within it.`);
    }

    if (storyAssets) {
      // Sign co-star refs
      if (storyAssets.costarRefs && storyAssets.costarRefs.length > 0) {
        const signed = await Promise.all(
          storyAssets.costarRefs.map(async (r, i) => {
            const url = await r2SignedDownloadUrl(r.storageBucket, r.storagePath, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => "");
            return { url, label: `Co-star reference ${i + 1} (${r.name ?? "unnamed"})` };
          })
        );
        const valid = signed.filter(s => s.url);
        storyImageUrls.push(...valid);
        if (valid.length > 0) {
          storyContextParts.push(`GROUP E — Co-star References: ${valid.length} photo(s) of the person who should appear alongside the subject in duo or group scenes. Preserve their likeness and include them naturally in the scene alongside the main subject.`);
        }
      }

      // Sign group photo ref
      if (storyAssets.groupPhotoRef?.storagePath) {
        const gUrl = await r2SignedDownloadUrl(storyAssets.groupPhotoRef.storageBucket, storyAssets.groupPhotoRef.storagePath, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => "");
        if (gUrl) {
          storyImageUrls.push({ url: gUrl, label: "Group photo reference" });
          storyContextParts.push(`GROUP F — Group Photo: A photo of the entire group to appear together in this story. Preserve all individuals' likenesses and arrange them naturally in the scene.`);
        }
      }

      // Sign brand asset refs
      if (storyAssets.brandRefs && storyAssets.brandRefs.length > 0) {
        const signed = await Promise.all(
          storyAssets.brandRefs.map(async (r, i) => {
            const url = await r2SignedDownloadUrl(r.storageBucket, r.storagePath, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => "");
            return { url, label: `Brand asset ${i + 1} (${r.name ?? "unnamed"}, placement: ${r.placement ?? "everywhere"})`, placement: r.placement ?? "everywhere" };
          })
        );
        const valid = signed.filter(s => s.url);
        storyImageUrls.push(...valid);
        if (valid.length > 0) {
          const placements = [...new Set(valid.map(v => (v as typeof valid[0]).placement))].join(", ");
          storyContextParts.push(`GROUP G — Brand Assets: ${valid.length} brand/logo/product image(s). Integrate these brand elements into the scenes — placement preference: ${placements}. The brand should appear naturally within the environment, on screens, banners, clothing, or as subtle environmental elements.`);
        }
      }
    }

    // Buyer style selections (choice groups) — locked for all images
    if (choiceSelections) {
      storyContextParts.push(buildChoiceBriefSection(choiceSelections));
    }

    // Buyer background allocation — per-slot environment lock + photo refs for the brief model
    if (backgroundPlan) {
      storyContextParts.push(buildBackgroundBriefSection(backgroundPlan, normalizePackageSize(shoot.package_size)));
      const bgOptionRefRows = rawRefs.filter((r) => r.purpose === "background_option");
      for (const alloc of backgroundPlan.allocations) {
        if (alloc.kind !== "photo") continue;
        const row = bgOptionRefRows.find((r) => r.note === alloc.id)
          ?? bgOptionRefRows.find((r) => r.storage_path === alloc.imagePath);
        if (!row) continue;
        const url = await r2SignedDownloadUrl(row.storage_bucket, row.storage_path, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => "");
        if (url) {
          storyImageUrls.push({
            url,
            label: `BACKGROUND "${alloc.name}" — environment reference for its assigned slots (see PER-SLOT BACKGROUND ALLOCATION)`,
          });
        }
      }
    }

    const storyContext = storyContextParts.length > 0
      ? `\n\nSTORY CONTEXT:\n${storyContextParts.join("\n\n")}`
      : "";

    // Claude-first with silent Gemini fallback (we run on the VPS under PM2 — no
    // serverless time limit, so a fallback after a Claude timeout is safe).
    // Any Claude failure — API error, no credits, timeout, or invalid JSON — quietly
    // reroutes the brief to Gemini so the shoot proceeds without interruption.
    const shootForBrief = { ...shoot, storyContext, storyImageUrls } as never;
    const buildGeminiBrief = () =>
      buildShootBrief(shootForBrief, identityProfile, refs, characterBaseUrl, forbiddenExamples, dbForbiddenWordsForBrief, identityCatalog);
    let briefServedBy: "claude" | "gemini" | "gemini-fallback" = "gemini";
    if (visionModel === "claude") {
      try {
        shootBrief = await buildShootBriefClaude(shootForBrief, identityProfile, refs, characterBaseUrl, forbiddenExamples, dbForbiddenWordsForBrief, identityCatalog);
        JSON.parse(shootBrief); // invalid/truncated JSON counts as failure → fall back
        briefServedBy = "claude";
      } catch (err) {
        console.warn("[generate] Claude brief failed — falling back to Gemini:", err instanceof Error ? err.message : String(err));
        shootBrief = await buildGeminiBrief();
        briefServedBy = "gemini-fallback";
      }
    } else {
      shootBrief = await buildGeminiBrief();
    }
    console.log(`[generate] brief served by: ${briefServedBy}`);

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
  // Planner-selected identity image numbers (1-based GROUP A indices) per slot.
  const slotIdentityIndices: Record<string, number[]> = {};
  try {
    const parsed = JSON.parse(shootBriefClean);
    const rawPrompts = parsed.prompts;
    if (Array.isArray(rawPrompts)) {
      // New array format from SHOOT_BRIEF_SYSTEM_INSTRUCTION
      for (const p of rawPrompts as NewPromptObject[]) {
        const key = String(p.prompt_index);
        if (p.fully_consolidated_prompt) prompts[key] = p.fully_consolidated_prompt;
        if (p.svg_layout_instructions) svgLayoutMap[key] = p.svg_layout_instructions;
        if (Array.isArray(p.identity_image_indices)) {
          const valid = p.identity_image_indices.filter((n) => Number.isInteger(n) && n >= 1);
          if (valid.length > 0) slotIdentityIndices[key] = valid;
        }
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

  // All identity refs with their classified attributes — per-slot routing selects
  // from this pool, so uploads beyond the shared-list cap still reach the slots
  // that need them (e.g. the back-view photo for a back-pose slot).
  const identityLabelFor = (a: IdentityAttrs): string =>
    a.view === "back"
      ? "SUBJECT IDENTITY (BACK VIEW) — the subject photographed from behind; replicate this exact back of head, figure, and body shape"
      : a.expression === "smiling-teeth"
        ? "SUBJECT IDENTITY (GENUINE SMILE) — the exact person to depict; copy the real smile and exact teeth from this photo"
        : "SUBJECT IDENTITY — the exact person to depict";
  const allIdentityEntries = identityRefsOrdered.map((r, i) => {
    const attrs = identityAttributes[r.storagePath] ?? DEFAULT_IDENTITY_ATTRS;
    return { url: r.url, index: i + 1, attrs, label: identityLabelFor(attrs) };
  });
  const identityRoutingActive =
    !hasBase && shoot.group_identity !== true &&
    Object.keys(identityAttributes).length > 0 && allIdentityEntries.length > 0;

  // Build imageUrls for fal.ai — base-locked shoots use base + scene refs; standard shoots use identity + inspiration
  // Each entry carries a role label so we can append an authoritative reference map to
  // every slot prompt — without it the model has no idea what images 4+ are for.
  let imageEntries: Array<{ url: string; label: string }>;
  if (hasBase && characterBaseUrl) {
    const backgroundUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "BACKGROUND")?.url ?? "";
    const lightingUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "LIGHTING")?.url ?? "";
    const colorGradeUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "COLOR_GRADE")?.url ?? "";
    imageEntries = [
      { url: characterBaseUrl, label: "LOCKED CHARACTER BASE — exact identity and wardrobe anchor" },
      { url: backgroundUrl, label: "BACKGROUND reference — the environment must replicate this backdrop exactly; match its perspective, camera height, and floor line" },
      { url: lightingUrl, label: "LIGHTING reference — match this lighting setup" },
      { url: colorGradeUrl, label: "COLOR GRADE reference — match this film/edit style" },
    ].filter((e) => e.url).slice(0, 4);
  } else {
    // Identity images come first so the model treats them as the primary subject reference.
    // Include all tagged refs so the model sees those images directly, not just as text
    // descriptions. Limit inspiration to 1 to avoid diluting the identity signal.
    const SLOT_ONLY_TAGS = new Set(["FLAG_SCENE", "MUGSHOT_BOARD", "BOWL_PROP", "BOWL_CONTENT", "VIRAL_LOOK"]);
    const taggedRefEntries = refs
      // Slot plates are attached to THEIR slot only (below), never the shared per-slot list.
      .filter((r) => r.purpose === "tagged" && r.url && !SLOT_ONLY_TAGS.has(r.tag ?? ""))
      .map((r) => {
        const name = r.customName || r.tag || "REFERENCE";
        const directive =
          r.tag === "BACKGROUND"
            ? "BACKGROUND reference — the environment/backdrop in the output MUST replicate this image exactly (surface, color, floor, texture); match its perspective, camera height, and floor line exactly so the subject appears photographed within this space. Override any conflicting environment description"
            : r.tag === "LIGHTING"
              ? "LIGHTING reference — match this lighting setup"
              : r.tag === "COLOR_GRADE"
                ? "COLOR GRADE reference — match this film/edit style"
                : `${name} reference — whenever the prompt describes this item, replicate its exact design, fabric, color, and construction from this image`;
        return { url: r.url, label: directive };
      });
    const inspirationUrls = refs.filter((r) => r.purpose === "inspiration").map((r) => r.url).filter(Boolean);
    // With a background plan, cap identity at 4 so the per-slot background image
    // survives nano-banana's 9-image cap alongside the wardrobe refs.
    imageEntries = [
      ...allIdentityEntries.slice(0, backgroundPlan ? 4 : 6).map(({ url, label }) => ({ url, label })),
      ...taggedRefEntries,
      ...inspirationUrls.slice(0, 1).map((u) => ({ url: u, label: "INSPIRATION — mood and style context only; do not copy the person, outfit, or background from it unless no dedicated reference exists" })),
    ];
  }
  let imageUrls: string[] = imageEntries.map((e) => e.url);
  // Per-slot routing may select identity images beyond the shared-list cap —
  // include them in the reachability check so buildReferenceMap keeps them.
  if (identityRoutingActive) {
    const known = new Set(imageUrls);
    for (const e of allIdentityEntries) {
      if (!known.has(e.url)) { imageUrls.push(e.url); known.add(e.url); }
    }
  }

  // ── Viral flag shot ─────────────────────────────────────────────────────────
  // When active, a reserved end-of-package slot is the rooftop flag shot: it gets
  // the FLAG_SCENE plate (never the studio background) and its own directive from
  // the brief. The plate is kept out of every other slot's reference list. Slot
  // number is resolved below, jointly with mugshot/bowl/viral, so a Trending
  // template with the flag AND a trend slot enabled doesn't collide on "last slot".
  const flagShotState = shoot.flag_shot as { enabled?: boolean; text?: string } | null;
  const flagSceneRef = refs.find((r) => r.purpose === "tagged" && r.tag === "FLAG_SCENE" && r.url);
  const flagShotActive = !!(flagShotState?.enabled && flagShotState.text && flagSceneRef);
  const flagSceneEntry = flagSceneRef
    ? { url: flagSceneRef.url, label: "FLAG SCENE — the rooftop antenna mast, black flag and skyline plate; replicate this environment exactly and place the subject into it (do not use a studio backdrop for this image)" }
    : null;
  if (flagShotActive && flagSceneEntry) imageUrls = [...imageUrls, flagSceneEntry.url];

  // ── Trend slots (mugshot + bowl) ────────────────────────────────────────────
  // Mugshot slot: the MUGSHOT_BOARD plate REPLACES the studio background.
  // Bowl slot: BOWL_PROP + the buyer's BOWL_CONTENT ride ON TOP of its backdrop.
  const trendSel = shoot.trend_slots as import("./trend-slots").TrendSlotsSelection | null;
  const mugshotBoardRef = refs.find((r) => r.purpose === "tagged" && r.tag === "MUGSHOT_BOARD" && r.url);
  const bowlPropRef = refs.find((r) => r.purpose === "tagged" && r.tag === "BOWL_PROP" && r.url);
  const bowlContentRef = refs.find((r) => r.purpose === "tagged" && r.tag === "BOWL_CONTENT" && r.url);
  const viralLookRef = refs.find((r) => r.purpose === "tagged" && r.tag === "VIRAL_LOOK" && r.url);
  const mugshotActive = !!(trendSel?.mugshot?.enabled && mugshotBoardRef);
  const bowlActive = !!(trendSel?.bowl?.enabled && bowlPropRef && bowlContentRef);
  const viralActive = !!(trendSel?.viral?.enabled && viralLookRef);
  const { mugshotSlot: mugshotSlotNumber, bowlSlot: bowlSlotNumber, viralSlot: viralSlotNumber, flagSlot: flagSlotNumber } = (() => {
    if (!mugshotActive && !bowlActive && !viralActive && !flagShotActive) return { mugshotSlot: -1, bowlSlot: -1, viralSlot: -1, flagSlot: -1 };
    let next = total;
    let bowlSlot = -1, mugshotSlot = -1, viralSlot = -1, flagSlot = -1;
    if (bowlActive) { bowlSlot = next; next -= 1; }
    if (mugshotActive) { mugshotSlot = next; next -= 1; }
    if (flagShotActive) { flagSlot = next; next -= 1; }
    if (viralActive) { viralSlot = next; }
    return { mugshotSlot, bowlSlot, viralSlot, flagSlot };
  })();
  const mugshotEntry = mugshotBoardRef
    ? { url: mugshotBoardRef.url, label: "MUGSHOT BOARD plate — the forensics board and height-measurement chart; replicate the board design and chart exactly, subject holds the board in front of the chart (no studio backdrop for this image)" }
    : null;
  const bowlPropEntry = bowlPropRef
    ? { url: bowlPropRef.url, label: "BOWL PROP — the white enamel bowl with fabric head-roll; the subject carries exactly this bowl on their head" }
    : null;
  const bowlContentEntry = bowlContentRef
    ? { url: bowlContentRef.url, label: trendSel?.bowl?.mode === "logo"
        ? "BOWL CONTENT (logo) — brand the bowl's outer side with exactly this logo"
        : "BOWL CONTENT (product) — fill the bowl with exactly this product, comically oversized" }
    : null;
  const viralEntry = viralLookRef
    ? { url: viralLookRef.url, label: "VIRAL LOOK — the original viral post; recreate this EXACT pose, seated composition, outfit style, coat drape, and backdrop mood with the subject from the identity references" }
    : null;
  if (mugshotActive && mugshotEntry) imageUrls = [...imageUrls, mugshotEntry.url];
  if (bowlActive && bowlPropEntry && bowlContentEntry) imageUrls = [...imageUrls, bowlPropEntry.url, bowlContentEntry.url];
  if (viralActive && viralEntry) imageUrls = [...imageUrls, viralEntry.url];

  // Per-option background images (purpose 'background_option', matched by optionId in note).
  // These are appended per slot — each slot only sees ITS background, never the others.
  // Note: base-locked shoots keep single-background behavior; the plan applies to the standard branch only.
  const bgEntryByOptionId = new Map<string, { url: string; label: string }>();
  if (backgroundPlan && !(hasBase && characterBaseUrl)) {
    for (const alloc of backgroundPlan.allocations) {
      if (alloc.kind !== "photo") continue;
      const signed = refs.find((r) => r.purpose === "background_option" && (r.note === alloc.id || r.customName === alloc.name));
      if (signed?.url) {
        bgEntryByOptionId.set(alloc.id, {
          url: signed.url,
          label: `BACKGROUND "${alloc.name}" — THE environment for THIS image; replicate it exactly (surface, color, floor, texture, depth) and match its perspective, camera height, and floor line so the subject appears genuinely photographed within this space`,
        });
      }
    }
  }
  const bgUrls = Array.from(bgEntryByOptionId.values()).map((e) => e.url);
  imageUrls = [...imageUrls, ...bgUrls];

  const identityUrls = refs
    .filter((r) => r.purpose === "identity")
    .map((r) => r.url)
    .filter(Boolean);
  const inspirationUrls = refs
    .filter((r) => r.purpose === "inspiration")
    .map((r) => r.url)
    .filter(Boolean);

  // Filter imageUrls to only reachable objects — fal.ai returns 422 if any URL it tries
  // to download returns 404 (e.g. identity images uploaded before R2 migration).
  const reachableImageUrls = await filterReachableUrls(imageUrls);
  console.log(`[generate] imageUrls reachability: ${reachableImageUrls.length}/${imageUrls.length} reachable`);
  if (reachableImageUrls.length === 0 && imageUrls.length > 0) {
    throw new Error("Identity images are not accessible in storage. Please re-upload your identity photos and start a new shoot.");
  }
  if (reachableImageUrls.length < imageUrls.length) {
    const reachableSet = new Set(reachableImageUrls);
    const dropped = imageEntries.filter((e) => !reachableSet.has(e.url)).map((e) => e.label.split(" — ")[0]);
    console.warn(`[generate] DROPPED unreachable references: ${dropped.join(", ")}`);
  }

  // Authoritative reference map appended to every slot prompt — tells the image model
  // exactly what each attached image is for, in the order fal.ai receives them.
  // Without this, images beyond the identity range are anonymous and the model guesses.
  const reachableSet = new Set(reachableImageUrls);
  const buildReferenceMap = (entries: Array<{ url: string; label: string }>) => {
    const mapped = entries.filter((e) => reachableSet.has(e.url)).slice(0, NANO_BANANA_MAX_IMAGES);
    return {
      urls: mapped.map((e) => e.url),
      text: mapped.length > 0
        ? " REFERENCE IMAGE MAP — the attached images in order: " +
          mapped.map((e, i) => `IMAGE ${i + 1}: ${e.label}.`).join(" ")
        : "",
    };
  };
  // Shared list for shoots without a background plan (identical for every slot)
  const sharedReferenceMap = buildReferenceMap(imageEntries);
  const identityEntryCount = imageEntries.filter((e) => e.label.startsWith("SUBJECT IDENTITY") || e.label.startsWith("LOCKED CHARACTER BASE")).length;

  let failedCount = 0;

  for (const slotImg of pendingSlots) {
    const slot = slotImg.slot;

    // Optimistic-lock: claim this slot atomically
    const claimed = await sql`UPDATE shoot_images SET status = 'GENERATING', stage = ${`Generating slot ${slot}`}, updated_at = ${ts()} WHERE id = ${slotImg.id} AND status = ${slotImg.status} RETURNING id`;

    if (!claimed.length) continue; // another invocation already grabbed it

    await sql`UPDATE shoots SET pipeline_stage = ${`Generating slot ${slot}`}, progress = ${Math.min(85, 20 + Math.round((slot / total) * 65))}, updated_at = ${ts()} WHERE id = ${shootId}`;

    logEvent('slot_update', { image: { slot, status: "GENERATING" } });

    let slotPrompt = ""; // hoisted so catch block can log it for learning
    try {
      // Prompt text first — per-slot identity routing reads it to detect what the
      // slot asks for (smile / back view) before the reference list is assembled.
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

      const isQuoteSlot = hasQuote && slot === total;
      const isCustomSlot =
        (flagShotActive && slot === flagSlotNumber) ||
        (viralActive && slot === viralSlotNumber) ||
        (mugshotActive && slot === mugshotSlotNumber) ||
        (bowlActive && slot === bowlSlotNumber);

      // ── Per-slot identity selection ─────────────────────────────────────────
      // Smiling slots get only real-teeth references, back-pose slots get the
      // back-view reference, everything else gets neutral front references.
      // Planner-selected identity_image_indices take priority; prompt-text
      // heuristics are the fallback; the full pool is the final safety net.
      const wantsSmile = identityRoutingActive && !isCustomSlot && !isQuoteSlot && SMILE_TRIGGERS.test(slotPrompt);
      // A slot only counts as a back-view slot when a back-view reference exists —
      // pose language like "back turn" or "glance back" appears in templates whose
      // buyers uploaded no back photo, and without a reference the pose stays
      // front-anchored (the planner's back-pose gate forbids true back views).
      const hasBackRef = allIdentityEntries.some((e) => e.attrs.view === "back");
      const wantsBack = identityRoutingActive && hasBackRef && !isCustomSlot && !isQuoteSlot && BACK_TRIGGERS.test(slotPrompt);
      const identityOnlyEntries = imageEntries.slice(0, identityEntryCount);
      let slotIdentityEntries = identityOnlyEntries;
      if (identityRoutingActive) {
        const pool = allIdentityEntries;
        let chosen: typeof pool = [];
        if (isCustomSlot || isQuoteSlot) {
          // Custom slots are directive-locked (deadpan mugshot, flag composite,
          // etc.) — always neutral front references.
          chosen = pool.filter((e) => e.attrs.expression === "neutral" && e.attrs.view === "front");
        } else {
          const planned = slotIdentityIndices[String(slot)];
          if (planned?.length) chosen = planned.map((n) => pool[n - 1]).filter(Boolean);
          if (chosen.length === 0 && wantsBack) {
            const backs = pool.filter((e) => e.attrs.view === "back");
            const frontFull = pool.filter((e) => e.attrs.view === "front" && e.attrs.framing === "full-body");
            chosen = [...backs, ...frontFull.slice(0, 1)];
          }
          if (chosen.length === 0) {
            chosen = pool.filter((e) => e.attrs.view === "front" &&
              (wantsSmile ? e.attrs.expression === "smiling-teeth" : e.attrs.expression === "neutral"));
          }
        }
        if (chosen.length === 0) chosen = pool; // never send zero identity images
        chosen = chosen.slice(0, 4);
        console.log(`[generate] slot ${slot} identity routing: images [${chosen.map((e) => e.index).join(", ")}]${wantsSmile ? " (smile)" : ""}${wantsBack ? " (back)" : ""}${slotIdentityIndices[String(slot)]?.length ? " (planner)" : ""}`);
        slotIdentityEntries = chosen.map(({ url, label }) => ({ url, label }));
      }

      // Per-slot image list: with a background plan, insert THIS slot's background
      // image right after the identity block; other slots' backgrounds are excluded.
      let slotReferenceMap = identityRoutingActive
        ? buildReferenceMap([...slotIdentityEntries, ...imageEntries.slice(identityEntryCount)])
        : sharedReferenceMap;
      let slotBgAlloc: ReturnType<typeof getBackgroundForSlot> = null;
      if (flagShotActive && flagSceneEntry && slot === flagSlotNumber) {
        // Flag slot: swap the studio background for the FLAG_SCENE plate. Keeps the full
        // wardrobe refs (regalia) — this composite is proven to work with them.
        slotReferenceMap = buildReferenceMap([
          ...slotIdentityEntries,
          flagSceneEntry,
          ...imageEntries.slice(identityEntryCount),
        ]);
      } else if (viralActive && viralEntry && slot === viralSlotNumber) {
        // Viral chair-pose slot: identity + the viral reference ONLY. Pose and outfit come
        // from the reference; the buyer's own styling refs would fight it.
        slotReferenceMap = buildReferenceMap([...slotIdentityEntries, viralEntry]);
      } else if (mugshotActive && mugshotEntry && slot === mugshotSlotNumber) {
        // Mugshot slot: identity + board plate ONLY. A minimal list keeps the model's
        // attention on the board text and chart; wardrobe is described in the prompt.
        slotReferenceMap = buildReferenceMap([...slotIdentityEntries, mugshotEntry]);
      } else if (bowlActive && bowlPropEntry && bowlContentEntry && slot === bowlSlotNumber) {
        // Bowl slot: identity + ITS backdrop + bowl + content ONLY. With the full shared
        // list (14 images) the buyer's logo was ignored — a focused list keeps it seen.
        if (backgroundPlan) slotBgAlloc = getBackgroundForSlot(backgroundPlan, slot - 1);
        const bgEntry = slotBgAlloc ? bgEntryByOptionId.get(slotBgAlloc.id) : undefined;
        slotReferenceMap = buildReferenceMap([
          ...slotIdentityEntries,
          ...(bgEntry ? [bgEntry] : []),
          bowlPropEntry,
          bowlContentEntry,
        ]);
      } else if (backgroundPlan && bgEntryByOptionId.size > 0) {
        slotBgAlloc = getBackgroundForSlot(backgroundPlan, slot - 1);
        const bgEntry = slotBgAlloc ? bgEntryByOptionId.get(slotBgAlloc.id) : undefined;
        if (bgEntry) {
          slotReferenceMap = buildReferenceMap([
            ...slotIdentityEntries,
            bgEntry,
            ...imageEntries.slice(identityEntryCount),
          ]);
        }
      } else if (backgroundPlan) {
        slotBgAlloc = getBackgroundForSlot(backgroundPlan, slot - 1);
      }

      // The brief's mandatory prefix states the identity range for ALL identity
      // images ("IMAGES 1 through N"); with routing, this slot may attach fewer —
      // rewrite the range so the prompt matches the attached reference count.
      if (identityRoutingActive && !isQuoteSlot) {
        const k = slotIdentityEntries.length;
        if (k > 0) {
          const newRange = k === 1 ? "IMAGE 1" : `IMAGES 1 through ${k}`;
          slotPrompt = slotPrompt.replace(/IMAGES 1 through \d+/g, newRange);
        }
      }

      // Text-kind background: belt-and-braces environment lock appended to the prompt
      // (the brief model already received the per-slot matrix; this guards against drift)
      const textBgLock = slotBgAlloc && slotBgAlloc.kind === "text" && slotBgAlloc.description
        ? ` ENVIRONMENT LOCK FOR THIS IMAGE: ${slotBgAlloc.description}.`
        : "";

      // Telephoto injection for portrait-type slots (never the quote/graphic card).
      // The /200mm/ guard keeps this idempotent across slot retries.
      const telephotoText =
        !isQuoteSlot && TELEPHOTO_TRIGGERS.test(slotPrompt) && !/200mm/i.test(slotPrompt)
          ? TELEPHOTO_ENHANCEMENT
          : "";

      // Append the reference image map + positive anatomical constraints to every fal call.
      // Smile slots get the real-teeth variant; back-view slots drop face requirements.
      const slotAnatomicalConstraints = wantsBack
        ? GLOBAL_ANATOMICAL_CONSTRAINTS_BACK
        : wantsSmile
          ? GLOBAL_ANATOMICAL_CONSTRAINTS_SMILE
          : GLOBAL_ANATOMICAL_CONSTRAINTS;
      slotPrompt = `${slotPrompt}${telephotoText}${textBgLock}${slotReferenceMap.text} ${slotAnatomicalConstraints}`.trim();

      const isTestMode = process.env.FAL_TEST_MODE === "1";

      // Persist prompt before fal call so it's visible even if generation fails
      await sql`UPDATE shoot_images SET prompt = ${slotPrompt}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;

      // Prompt-only mode: skip fal.ai entirely — mark slot complete with prompt saved
      const effectivePromptOnly = promptOnlyMode || (adminPromptOnlyMode && shootOwnerIsAdmin);
      if (effectivePromptOnly) {
        const reason = adminPromptOnlyMode && shootOwnerIsAdmin ? "admin prompt-only mode" : "prompt-only mode";
        await sql`UPDATE shoot_images SET status = 'COMPLETE', provider = 'prompt-only', stage = ${`Prompt saved (${reason})`}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;
        console.log(`[generate] slot ${slot}: ${reason} — skipping fal.ai`);
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
        imageUrls: slotReferenceMap.urls.length,
        background: slotBgAlloc ? `${slotBgAlloc.name} (${slotBgAlloc.kind})` : "none",
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
          imageUrls: slotReferenceMap.urls,
          identityProfile: typeof identityProfile === "string" ? identityProfile : "",
          shootBrief: typeof shootBrief === "string" ? shootBrief : "",
          quoteText: shoot.quote?.text,
          status: isTestMode ? "dry_run" : "sent_to_fal",
        });
      } catch (err) {
        console.error("[airtable] logFalPayload failed:", err);
      }

      const { url: rawFalUrl, sanitized: promptWasSanitized } = await callFalWithFallback(slotPrompt, slotReferenceMap.urls, aspectRatio, resolution, dbForbiddenWords, generationModel);
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

      logEvent('slot_complete', { image: { slot, status: "COMPLETE" } });
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
            logEvent('forbidden_detected', { slot, flaggedWord: analysis.flaggedWord, replacement: analysis.replacement });
          } catch { /* non-fatal */ }

          // d) Store structured error — used for page-reload recovery in the frontend
          await sql`UPDATE shoot_images SET status = 'FAILED', stage = ${`Failed: content filter — "${analysis.flaggedWord}" flagged`}, provider_error = ${JSON.stringify({ forbidden: true, flaggedWord: analysis.flaggedWord, replacement: analysis.replacement })}, updated_at = ${ts()} WHERE id = ${slotImg.id}`;

        } else {
          // Gemini couldn't identify a specific word — log raw prompt for passive learning
          try {
            logEvent('forbidden_prompt', { slot, prompt: slotPrompt.slice(0, 2000) });
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
  // A finished shoot that didn't produce every image gets a one-time free
  // regeneration instead of a refund (see /api/shoots/[id]/regenerate).
  const hasFailures = done && totalComplete < total;

  await sql`UPDATE shoots SET
    status = ${done ? "COMPLETE" : "PROCESSING"},
    progress = ${done ? 100 : Math.max(10, Math.round((totalComplete / total) * 100))},
    pipeline_stage = ${done ? "Complete" : `Completed ${totalComplete}/${total} shots`},
    completed_at = ${done ? ts() : null},
    updated_at = ${ts()}
    WHERE id = ${shootId}`;

  // Grant the complimentary regeneration only when currently 'none' — so a
  // previously-consumed regeneration is never re-granted (prevents infinite free retries).
  if (hasFailures) {
    await sql`UPDATE shoots SET regeneration_status = 'eligible', updated_at = ${ts()}
      WHERE id = ${shootId} AND regeneration_status = 'none'`;
    logEvent('regeneration_offered', { completed: totalComplete, total });
  }

  if (done) {
    logEvent('complete', { progress: 100, stage: "Complete" });
  }

  // Only clean up reference files on a FULLY successful shoot. If any slot failed,
  // the buyer may use their free regeneration, which re-runs generation and needs
  // these exact references — deleting them would break the retry.
  if (done && !hasFailures) {
    // Delete inspiration + tagged reference files from storage on completion.
    // Identity images are intentionally kept — they power the identity library for future shoots.
    // CRITICAL: template-owned assets live in the `template-images` bucket — template tagged
    // refs, background options AND choice-group options (outfit/hairstyle/shoes/etc.). NEVER
    // delete anything from that bucket: marketplace bookings copy those paths into
    // shoot_references, and deleting them destroys the option for all future buyers (this is
    // exactly how an outfit image went missing before). The template_images NOT IN clause is
    // kept as a second guard for legacy paths.
    try {
      const cleanupRefs = await sql`
        SELECT storage_bucket, storage_path FROM shoot_references
        WHERE shoot_id = ${shootId} AND purpose = ANY(${['inspiration', 'tagged']})
          AND storage_bucket != 'template-images'
          AND storage_path NOT IN (SELECT storage_path FROM template_images WHERE storage_path IS NOT NULL)
      `;

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
