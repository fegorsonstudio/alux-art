import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import type { StylingBrief, QualityGateResult } from "./types";
import type { createServiceClient } from "./supabase-server";

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

export function isLockedBaseEnabled(shootId: string): boolean {
  if (process.env.LOCKED_BASE_ENABLED !== "true") return false;
  const pct = parseInt(process.env.LOCKED_BASE_ROLLOUT_PERCENT ?? "100", 10);
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
  "outfit_ref_exclusions": ["list elements visible in the outfit reference that must NOT be transferred to the character — e.g. the model's own hair if overridden, props, backdrop, other people"]
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

  return `Generate a hyper-realistic full-body character reference photograph on a pure white seamless studio backdrop. This is a canonical character lock reference — not a creative shot. Match the technical brief exactly.

Reference images attached:
(1) Identity face photo(s) — lock facial features, skin tone, eye shape, brow shape, natural dentition and any visible piercings. Do NOT transfer hairstyle, clothing, pose, or background from these references.
${hasOutfitRef ? `(2) Outfit/look reference — wardrobe, makeup, and styling register only. Do NOT transfer the face, body type, pose, or backdrop. Specific exclusions: ${exclusionsList}.` : ""}
${hasHairstyleRef ? "(3) Hairstyle reference — override hair from outfit ref with this hair shape, length, colour, and texture only." : ""}
${hasMakeupRef ? "(4) Makeup reference — override makeup from outfit ref with this beauty look only." : ""}
${hasNailRef ? "(5) Nail reference — override nails from outfit ref with this nail design only." : ""}
${hasAccessoryRefs ? "(6) Accessory reference(s) — add the accessories shown." : ""}

Subject identity: ${identityProfile}

${styling.outfit ? `Outfit: ${styling.outfit}` : ""}
${styling.hair ? `Hair: ${styling.hair}` : ""}
${styling.makeup ? `Makeup: ${styling.makeup}` : ""}
${styling.nails ? `Nails: ${styling.nails}` : ""}
${styling.accessories.length > 0 ? `Accessories: ${styling.accessories.join(", ")}` : ""}

Background: pure white seamless studio backdrop — completely uniform, no gradient, no texture, no visible floor seam, no cast shadows on the backdrop. The subject is the only element in the frame.

Lighting: clean three-point studio beauty lighting — soft key from upper camera-left at 35 degrees, soft fill from camera-right at chest level, gentle hair light from behind defining the crown, soft underlight bounce lifting the eye sockets. Even exposure. Natural skin tones. No colour cast.

Pose: full-body standing, feet shoulder-width apart, weight evenly distributed, arms relaxed at sides, body squared to camera, chin level, direct gaze into lens, lips closed in a relaxed neutral set. Subject centered in frame with 10% padding above head and below feet — full head-to-toe visibility, no cropping.

Technical: photoreal stack — visible skin pores, subsurface scattering on nose bridge/cheeks/ears, strand-by-strand hair detail at hairline with baby hairs, fabric weave visible on garments, Kodak Vision3 colour grade, medium-format film aesthetic, sharp focus across subject, minimal background separation.`;
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
  "background_is_white_seamless": true if background is clean white studio backdrop,
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
      background_is_white_seamless: true,
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
  if (result.identity_match_score < 0.85) return "PENDING_USER_APPROVAL";
  if (result.technical_quality_score < 0.75) return "PENDING_USER_APPROVAL";
  if (!result.full_body_visible) return "PENDING_USER_APPROVAL";
  if (!result.background_is_white_seamless) return "PENDING_USER_APPROVAL";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any = {
    prompt,
    num_images: 1,
    aspect_ratio: "3:4",
    output_format: "png",
    safety_tolerance: "4",
    image_urls: refImageUrls.slice(0, 4),
    resolution: "4K",
    limit_generations: false,
  };
  if (seed !== undefined) input.seed = seed;

  const output = (await fal.subscribe("fal-ai/nano-banana-2/edit", { input })) as FalOutput;
  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL for base lock");
  return url;
}

// ── Save base image to Supabase storage ─────────────────────────────────────

export async function saveBaseImage(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  baseId: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Base image fetch failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const storagePath = `${userId}/${baseId}/base.png`;

  const { error } = await service.storage
    .from("character-bases")
    .upload(storagePath, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Base image storage failed: ${error.message}`);

  return storagePath;
}

// ── Sign base storage path ───────────────────────────────────────────────────

export async function signBasePath(
  service: ReturnType<typeof createServiceClient>,
  storagePath: string,
  ttlSeconds = BASE_LOCK_TTL
): Promise<string> {
  const { data, error } = await service.storage
    .from("character-bases")
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`Base sign failed: ${error?.message}`);
  return data.signedUrl;
}
