import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import type { StylingBrief, QualityGateResult } from "./types";
import { r2Upload, r2SignedDownloadUrl } from "./r2";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const BASE_LOCK_TTL = 48 * 60 * 60; // 48h signed URL TTL

// ── Helpers ────────────────────────────────────────────────────────────────

async function toBase64Block(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(buf)
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data: resized.toString("base64") },
  };
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
}

// ── Feature flag helpers ────────────────────────────────────────────────────

// rolloutPct and dbEnabled override env vars when passed (read from app_config by the caller)
export function isLockedBaseEnabled(shootId: string, rolloutPct?: number, dbEnabled?: boolean | null): boolean {
  // DB toggle takes precedence over env var when present
  const enabled = dbEnabled !== null && dbEnabled !== undefined
    ? dbEnabled
    : process.env.LOCKED_BASE_ENABLED === "true";
  if (!enabled) return false;
  const pct = rolloutPct ?? parseInt(process.env.LOCKED_BASE_ROLLOUT_PERCENT ?? "100", 10);
  if (isNaN(pct) || pct >= 100) return true;
  if (pct <= 0) return false;
  // Deterministic per-shoot: hash last 8 hex chars of shoot UUID
  const bucket = parseInt(shootId.replace(/-/g, "").slice(-8), 16) % 100;
  return bucket < pct;
}

// ── Cache key ───────────────────────────────────────────────────────────────

export function computeBaseCacheKey(
  identityPaths: string[],
  outfitPath: string | null,
  hairstylePath: string | null,
  makeupPath: string | null,
  nailPath: string | null,
  accessoryPaths: string[],
  customTagRefs: Record<string, string>
): string {
  const parts = [
    [...identityPaths].sort().join(","),
    outfitPath ?? "",
    hairstylePath ?? "",
    makeupPath ?? "",
    nailPath ?? "",
    [...accessoryPaths].sort().join(","),
    JSON.stringify(Object.fromEntries(Object.entries(customTagRefs).sort())),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

// ── Vision pre-pass (styling extraction) ───────────────────────────────────

export async function runStylingVisionPass(
  refImageUrls: string[]  // outfit ref first, then hairstyle, makeup, nail, accessories
): Promise<StylingBrief> {
  if (refImageUrls.length === 0) {
    return { outfit: "", hair: "", makeup: "", nails: "", accessories: [], outfit_ref_exclusions: [] };
  }

  const imageBlocks = await Promise.all(refImageUrls.slice(0, 4).filter(Boolean).map(toBase64Block));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        {
          type: "text",
          text: `You are a styling extraction system. Analyze the provided reference images and return a JSON description of the styling elements only. Be precise and concrete — use specific fabric names, color codes, and construction details.

Return ONLY valid JSON, no markdown fences, no prose:
{
  "outfit": "detailed clothing description — garment type, fabric, color, cut, fit, notable details",
  "hair": "hair shape, length, color, texture, and styling from the most specific hairstyle reference available",
  "makeup": "makeup look — lip color, eye treatment, skin finish, any notable techniques",
  "nails": "nail length, shape, color, finish, and any patterns or art",
  "accessories": ["item 1 description", "item 2 description"],
  "outfit_ref_exclusions": ["list elements visible in the outfit reference that must NOT be transferred to the character — e.g. the model's own hair if overridden, props, backdrop, other people. IMPORTANT: Do NOT include any mentions of watermarks, photographer credits, or text overlays in these exclusions. Ignore watermarks completely."]
}`,
        },
      ],
    }],
  }, { timeout: 30_000, maxRetries: 0 });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    return JSON.parse(stripFences(raw)) as StylingBrief;
  } catch {
    console.error("[base-lock] styling vision parse failed, using empty brief:", raw.slice(0, 200));
    return { outfit: "", hair: "", makeup: "", nails: "", accessories: [], outfit_ref_exclusions: [] };
  }
}

// ── Base lock prompt builder ─────────────────────────────────────────────────

export function buildBaseLockPrompt(
  identityProfile: string,
  styling: StylingBrief,
  hasOutfitRef: boolean,
  hasHairstyleRef: boolean,
  hasMakeupRef: boolean,
  hasNailRef: boolean,
  hasAccessoryRefs: boolean
): string {
  const exclusionsList = styling.outfit_ref_exclusions.length > 0
    ? styling.outfit_ref_exclusions.join(", ")
    : "none identified";

  return `IDENTITY LOCK — TOP PRIORITY: Reproduce the EXACT person from the identity reference photos. This is a biometric character lock, not a creative portrait. The generated face must be unmistakably the same individual — same face shape, same eye spacing and eye shape, same nose bridge width and tip shape, same lip shape, same jawline, same skin tone, same hairline, same brow shape. A near-lookalike is a failure. The subject must be recognisable as themselves, not as a similar-looking model or stock character.

Generate a hyper-realistic full-body character reference photograph on a pure white seamless studio backdrop.

REFERENCE IMAGES — how to use each:
(1) Identity photo(s) [FACE LOCK — highest priority]: Extract only facial identity, skin tone, and body build. Do NOT transfer hairstyle, outfit, accessories, background, pose, or lighting from these images. Lock the face with extreme fidelity.
${hasOutfitRef ? `(2) Outfit/look reference [STYLING ONLY]: Apply wardrobe, makeup, and styling. Do NOT transfer the model's face, expression, body proportions, or background. Exclusions: ${exclusionsList}.` : (styling.outfit ? "(2) Outfit reference: see styling brief below." : "")}
${hasHairstyleRef ? "(3) Hairstyle reference: override all hair with this exact cut, colour, and texture." : ""}
${hasMakeupRef ? "(4) Makeup reference: override all makeup with this beauty look only." : ""}
${hasNailRef ? "(5) Nail reference: override nails with this exact design." : ""}
${hasAccessoryRefs ? "(6) Accessory reference(s): add exactly these accessories." : ""}

Subject identity context: ${identityProfile || "see identity photos"}

STYLING TO APPLY:
${styling.outfit ? `- Outfit: ${styling.outfit}` : "- Outfit: clean, neutral wardrobe appropriate for a studio reference shoot"}
${styling.hair ? `- Hair: ${styling.hair}` : ""}
${styling.makeup ? `- Makeup: ${styling.makeup}` : ""}
${styling.nails ? `- Nails: ${styling.nails}` : ""}
${styling.accessories.length > 0 ? `- Accessories: ${styling.accessories.join(", ")}` : ""}

Background: smooth gradient from deep charcoal at the base transitioning to warm medium grey toward the top, faint metallic panel texture at very low opacity suggesting a high-end studio wall — brushed-metal striations barely perceptible, a soft atmospheric haze diffused from directly behind the subject, floor-to-wall seam invisible. Palette reads as warm-charcoal, refined studio grey. No white. No blown-out sky. No hard geometric shapes. Subject is the only element in frame.

Lighting: three-point studio beauty — soft key from upper camera-left at 35°, soft fill from camera-right at chest level, gentle hair light from behind, soft underlight bounce lifting eye sockets. Even exposure, natural skin tones, no colour cast.

Pose: full-body standing, feet shoulder-width apart, arms relaxed at sides, body squared to camera, chin level, direct gaze into lens, lips closed. Subject centered with 10% head-room above and below — full head-to-toe, no cropping.

Technical: photoreal — skin pores, subsurface scattering on nose/cheeks/ears, strand-by-strand hair at hairline, fabric weave on garments, Kodak Vision3 grade, medium-format film aesthetic, sharp across subject.

CRITICAL REMINDER: The face of the generated character must be the same real person as in the identity photos. Any deviation in face shape, eye spacing, or jawline is a failure.`;
}

// ── Quality gate (v1 — Claude vision) ──────────────────────────────────────

export async function runQualityGate(
  generatedImageUrl: string,
  identityRefUrls: string[]
): Promise<QualityGateResult> {
  const imageBlocks = await Promise.all(
    [generatedImageUrl, ...identityRefUrls.slice(0, 2)].filter(Boolean).map(toBase64Block)
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        {
          type: "text",
          text: `You are a QA system for an AI photoshoot pipeline. Image 1 is the GENERATED character base. Images 2+ are the IDENTITY REFERENCES. Compare strictly and return JSON only — no markdown, no prose.

{
  "face_detected": true or false,
  "face_count": number of faces in generated image,
  "identity_match_score": 0.0 to 1.0 — how closely the generated face matches the identity references (0=different person, 1=identical),
  "full_body_visible": true if head-to-toe with no cropping,
  "background_is_clean_studio": true if background is a clean studio backdrop with no distracting elements (white, grey, gradient, or charcoal all qualify — fail only if there is clutter, text, or a busy scene behind the subject),
  "no_crops": true if subject has adequate margin from all four frame edges,
  "technical_quality_score": 0.0 to 1.0 — overall sharpness, exposure, and absence of artifacts,
  "notes": "brief explanation of any issues"
}`,
        },
      ],
    }],
  }, { timeout: 30_000, maxRetries: 0 });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    return JSON.parse(stripFences(raw)) as QualityGateResult;
  } catch {
    console.error("[base-lock] quality gate parse failed:", raw.slice(0, 200));
    // Conservative fallback: force borderline so user sees the image
    return {
      face_detected: true,
      face_count: 1,
      identity_match_score: 0.75,
      full_body_visible: true,
      background_is_clean_studio: true,
      no_crops: true,
      technical_quality_score: 0.75,
      notes: "Quality gate parse failed — manual review required",
    };
  }
}

// ── Gate decision ────────────────────────────────────────────────────────────

export type GateDecision = "AUTO_APPROVED" | "PENDING_USER_APPROVAL" | "HARD_FAIL";

export function evaluateGate(result: QualityGateResult): GateDecision {
  // Hard requirements
  if (!result.face_detected || result.face_count !== 1) return "HARD_FAIL";

  // Fail band
  if (result.identity_match_score < 0.70) return "HARD_FAIL";
  if (result.technical_quality_score < 0.60) return "HARD_FAIL";

  // Borderline band
  if (result.identity_match_score < 0.80) return "PENDING_USER_APPROVAL";
  if (result.technical_quality_score < 0.75) return "PENDING_USER_APPROVAL";
  if (!result.full_body_visible) return "PENDING_USER_APPROVAL";
  if (!result.background_is_clean_studio) return "PENDING_USER_APPROVAL";

  // All green
  return "AUTO_APPROVED";
}

// ── fal.ai base generation ───────────────────────────────────────────────────

type FalOutput = { images?: Array<{ url: string }> };

export async function generateBaseWithFal(
  prompt: string,
  refImageUrls: string[],
  seed?: number
): Promise<string> {
  if (process.env.FAL_TEST_MODE === "1") {
    const encoded = encodeURIComponent(prompt.slice(0, 300));
    return `https://image.pollinations.ai/prompt/${encoded}?width=768&height=1024&nologo=1&seed=${seed ?? Date.now()}`;
  }

  // Cast through unknown to satisfy strict fal.ai SDK input type — same pattern used in generate.ts
  const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      num_images: 1,
      aspect_ratio: "3:4" as unknown as "4:5",
      output_format: "png" as const,
      safety_tolerance: "6",
      image_urls: refImageUrls.slice(0, 4),
      resolution: "4K",
      limit_generations: false,
      ...(seed !== undefined ? { seed } : {}),
    },
  });
  
  const output = response.data as FalOutput;
  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL for base lock");
  return url;
}

// ── Save base image to Supabase storage ─────────────────────────────────────

export async function saveBaseImage(
  _service: unknown,
  userId: string,
  baseId: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Base image fetch failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const storagePath = `${userId}/${baseId}/base.png`;

  await r2Upload("character-bases", storagePath, bytes, "image/png");
  return storagePath;
}

// ── Sign base storage path ───────────────────────────────────────────────────

export async function signBasePath(
  _service: unknown,
  storagePath: string,
  ttlSeconds = BASE_LOCK_TTL
): Promise<string> {
  return r2SignedDownloadUrl("character-bases", storagePath, ttlSeconds);
}
