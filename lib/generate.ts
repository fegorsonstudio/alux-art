import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { createServiceClient } from "./supabase-server";
import { normalizePackageSize, type AspectRatio } from "./types";
import { logFalPayload, logReferenceUpload } from "./airtable";
import { signBasePath } from "./base-lock";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

const IDENTITY_ANALYSIS_TIMEOUT_MS = 45_000;
const SHOOT_BRIEF_TIMEOUT_MS = 90_000;
const REFERENCE_SIGNED_URL_TTL_SECONDS = 48 * 60 * 60;

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
  service: ReturnType<typeof createServiceClient>,
  refs: ShootRefRow[]
): Promise<SignedRef[]> {
  return Promise.all(
    refs.map(async (ref) => {
      const { data, error } = await service.storage
        .from(ref.storage_bucket)
        .createSignedUrl(ref.storage_path, REFERENCE_SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        console.error("[generate] reference signing failed:", {
          purpose: ref.purpose,
          bucket: ref.storage_bucket,
          path: ref.storage_path,
          error: error?.message ?? "No signed URL returned",
        });
      }
      return {
        purpose: ref.purpose,
        tag: ref.tag,
        customName: ref.custom_name,
        note: ref.note,
        name: ref.name,
        url: data?.signedUrl ?? "",
      };
    })
  );
}

async function analyzeIdentityImages(imageUrls: string[]): Promise<string> {
  const imageBlocks = await Promise.all(
    imageUrls.filter(Boolean).slice(0, 4).map(toBase64Block)
  );

  const response = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Analyze these identity reference photos and extract a precise identity profile for AI image generation.

Return ONLY this format:
IDENTITY PROFILE:
Face: [facial structure — shape, proportions, bone structure]
Skin: [tone with specific descriptors e.g. warm medium brown, cool fair]
Eyes: [color, shape, spacing]
Hair: [color, texture, length, style]
Build: [body type, height impression, proportions]
Distinctive: [any notable stable features]

Clinical and precise. No subjective judgments. Stable biometric features only.`,
            },
          ],
        },
      ],
    },
    { timeout: IDENTITY_ANALYSIS_TIMEOUT_MS, maxRetries: 0 }
  );

  return response.content[0].type === "text" ? response.content[0].text : "";
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

async function buildShootBrief(
  shoot: {
    mode: string;
    package_size: number;
    aspect_ratio: string;
    quote?: { text: string; attribution: string } | null;
  },
  identityProfile: string,
  refs: SignedRef[],
  characterBaseUrl?: string
): Promise<string> {
  const packageSize = normalizePackageSize(shoot.package_size);
  const inspirationRefs = refs.filter((r) => r.purpose === "inspiration");
  const taggedRefs = refs.filter((r) => r.purpose === "tagged");
  const isAdvanced = shoot.mode === "advanced";
  const hasQuote = !!shoot.quote?.text && packageSize === 10;
  const portraitCount = hasQuote ? packageSize - 1 : packageSize;

  // ── Locked-base path: scene-only JSON per slot ──────────────────────────
  if (characterBaseUrl) {
    const sceneRefs = [
      ...inspirationRefs.slice(0, 1),
      ...taggedRefs.filter((r) => ["BACKGROUND", "LIGHTING", "COLOR_GRADE"].includes(r.tag ?? "")),
    ].filter((r) => r.url);

    const imageBlocks = await Promise.all(sceneRefs.map((r) => toBase64Block(r.url)));

    const taggedDescriptions = [
      ...inspirationRefs.map((r) => `- Inspiration (scene direction): ${r.name}`),
      ...taggedRefs
        .filter((r) => ["BACKGROUND", "LIGHTING", "COLOR_GRADE"].includes(r.tag ?? ""))
        .map((r) => `- [${r.tag}]: ${r.name}${r.note ? ` (${r.note})` : ""}`),
    ].join("\n");

    const slotKeys = Array.from({ length: portraitCount }, (_, i) =>
      `"${i + 1}": { "background": "...", "lighting": "...", "mood_vibe": "...", "photography_style": "...", "pose": "...", "shot_type": "...", "scene_exclusions": "..." }`
    )
      .concat(hasQuote ? [`"${packageSize}": { "background": "...", "lighting": "...", "mood_vibe": "...", "photography_style": "...", "pose": "no subject", "shot_type": "quote background", "scene_exclusions": "no face, no person" }`] : [])
      .join(",\n    ");

    const response = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              {
                type: "text",
                text: `You are a professional photography prompt engineer.

The subject identity and wardrobe are already locked in a canonical base reference image. Your only task is to design the SCENE LAYER for each slot — environment, lighting, pose, and shot framing. Do NOT re-describe the subject's face, skin, hair, outfit, or accessories.

SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote background" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}

SCENE REFERENCES:
${taggedDescriptions || "Inspiration image only — extract environment, lighting, mood."}

RULES:
- Each slot must have a UNIQUE pose, shot type, and scene composition.
- "scene_exclusions" must always include: "do not transfer white studio backdrop or neutral pose from base reference". Do NOT mention watermarks or text overlays.
- Keep lighting consistent with the shoot mood unless a [LIGHTING] reference overrides it.
- [BACKGROUND] reference controls environment only — ignore any clothing or people in it.
- [COLOR_GRADE] reference controls film style and color palette only.
${hasQuote ? `- Slot ${packageSize}: mood background for overlaying quote "${shoot.quote!.text}" — no face, abstract or environmental scene.` : ""}

Return ONLY valid JSON (no markdown, no code fences):
{
  "prompts": {
    ${slotKeys}
  }
}`,
              },
            ],
          },
        ],
      },
      { timeout: SHOOT_BRIEF_TIMEOUT_MS, maxRetries: 0 }
    );

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    return raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
  }

  // ── Standard path: full free-form prompt per slot ───────────────────────
  const refDescriptions = [
    ...inspirationRefs.map((r) => `- Inspiration: ${r.name}`),
    ...taggedRefs.map(
      (r) =>
        `- Tagged [${r.tag ?? "unknown"}]: ${r.name}${r.note ? ` (${r.note})` : ""}`
    ),
  ].join("\n");

  const imageBlocks = await Promise.all(
    [...inspirationRefs.slice(0, 2), ...taggedRefs.slice(0, 2)]
      .filter((r) => r.url)
      .map((r) => toBase64Block(r.url))
  );

  const wardrobeSource =
    isAdvanced && taggedRefs.some((r) => r.tag === "OUTFIT")
      ? "[OUTFIT] tagged reference"
      : "inspiration image";

  const slotKeys = Array.from({ length: portraitCount }, (_, i) => `"${i + 1}": "Scene: ..."`)
    .concat(hasQuote ? [`"${packageSize}": "Scene: ..."`] : [])
    .join(",\n    ");

  const response = await anthropic.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `You are a professional photography prompt engineer.

IDENTITY PROFILE:
${identityProfile}

SHOOT PARAMETERS:
- Mode: ${shoot.mode}
- Package: ${packageSize} images total (${portraitCount} portrait${portraitCount !== 1 ? "s" : ""}${hasQuote ? " + 1 quote background" : ""})
- Aspect Ratio: ${shoot.aspect_ratio}

REFERENCES PROVIDED:
${refDescriptions || "Identity images only — no inspiration or tagged references."}

${
  isAdvanced
    ? `TAGGED REFERENCE RULES:
- [OUTFIT] replaces outfit from inspiration across all portrait slots
- [BACKGROUND] replaces environment only — ignore clothing/face in that reference
- [LIGHTING] matches lighting setup only
- [HAIRSTYLE] applies hair change only
- [MAKEUP] applies beauty look only
- Layer priority: identity lock > tagged overrides > inspiration art direction > pose/composition`
    : ""
}

Create a JSON shoot brief. Each portrait slot must have a UNIQUE combination of pose, expression, camera angle, and composition. Keep identity, wardrobe, and lighting consistent unless overridden by a tagged reference.

Use this exact structure for each prompt:
Scene: [lighting, background, environment, shot setup]
Subject: [identity reference details, body language, pose, expression]
Important Details: [wardrobe from ${wardrobeSource}, textures, lens feel, color grade]
Use Case: editorial photography / fashion portrait / mood portrait
Constraints: Preserve exact identity from profile. No alterations to facial structure, eye spacing, skin tone, jawline. [specific negative constraints]

${hasQuote ? `Slot ${packageSize}: Create a mood background suitable for overlaying the quote "${shoot.quote!.text}" — no face, abstract or environmental scene matching the shoot aesthetic.` : ""}

Return ONLY valid JSON (no markdown, no code fences):
{
  "prompts": {
    ${slotKeys}
  }
}`,
            },
          ],
        },
      ],
    },
    { timeout: SHOOT_BRIEF_TIMEOUT_MS, maxRetries: 0 }
  );

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  // Strip markdown code fences Claude sometimes adds despite instructions
  return raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/m, "").trim();
}

async function generateImageWithFal(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string
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

  const output = (await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      num_images: 1,
      // All our AspectRatio values are in fal's union; cast through unknown to satisfy strict type
      aspect_ratio: aspectRatio as unknown as "4:5",
      output_format: "png",
      safety_tolerance: "6",
      image_urls: imageUrls.slice(0, 4),
      resolution: "4K",
      limit_generations: false,
    },
  })) as FalOutput;

  const url = output.images?.[0]?.url ?? "";
  if (!url) throw new Error("fal.ai returned no image URL");
  return url;
}

async function saveSlotImage(
  service: ReturnType<typeof createServiceClient>,
  shootId: string,
  userId: string,
  slot: number,
  imageUrl: string
): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);

  const contentType =
    imageRes.headers.get("content-type")?.startsWith("image/")
      ? imageRes.headers.get("content-type")!
      : "image/png";
  const bytes = Buffer.from(await imageRes.arrayBuffer());
  const storagePath = `${userId}/${shootId}/slot-${slot}.png`;

  const { error } = await service.storage
    .from("generated-4k")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  return storagePath;
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
  opts: { maxSlots?: number } = {}
): Promise<WorkerResult> {
  const maxSlots = opts.maxSlots ?? 1;
  const service = createServiceClient();
  const ts = () => new Date().toISOString();

  const { data: shoot, error: shootErr } = await service
    .from("shoots")
    .select("*, shoot_references(*), shoot_images(*)")
    .eq("id", shootId)
    .single();

  if (shootErr || !shoot) throw new Error(shootErr?.message ?? "Shoot not found");

  const total = normalizePackageSize(shoot.package_size);
  // Supabase returns JSONB defaults as {} (object), not "" — normalize to string first.
  const rawIdentity = shoot.identity_profile;
  let identityProfile: string =
    typeof rawIdentity === "string" ? rawIdentity : "";
  const rawBrief = shoot.shoot_brief;
  let shootBrief: string =
    typeof rawBrief === "string" ? rawBrief : "";

  const rawRefs = (shoot.shoot_references ?? []) as ShootRefRow[];
  const refs = await signRefs(service, rawRefs);

  // ── Character base resolution ──────────────────────────────────────────
  let characterBaseUrl: string | undefined;
  const hasBase = typeof shoot.character_base_id === "string" && !!shoot.character_base_id;

  if (hasBase) {
    const { data: base } = await service
      .from("character_bases")
      .select("id, base_4k_storage_path, base_storage_path, identity_profile")
      .eq("id", shoot.character_base_id)
      .single();

    if (base) {
      const storagePath = base.base_4k_storage_path ?? base.base_storage_path;
      if (storagePath) {
        characterBaseUrl = await signBasePath(service, storagePath, REFERENCE_SIGNED_URL_TTL_SECONDS).catch(() => undefined);
      }
      // If the shoot doesn't have an identity profile yet, pull it from the base
      if (!identityProfile && typeof base.identity_profile === "string") {
        identityProfile = base.identity_profile;
        await service.from("shoots").update({ identity_profile: identityProfile, updated_at: ts() }).eq("id", shootId);
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

  // --- Step 1: Identity analysis (skip if base provides it) ---
  if (!identityProfile && !hasBase) {
    await service
      .from("shoots")
      .update({ pipeline_stage: "Analyzing identity", progress: 10, updated_at: ts() })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Analyzing identity", progress: 10 },
      created_at: ts(),
    });

    const identityUrls = refs
      .filter((r) => r.purpose === "identity")
      .map((r) => r.url)
      .filter(Boolean);
    if (identityUrls.length === 0) throw new Error("No identity images found");

    identityProfile = await withRetry(() => analyzeIdentityImages(identityUrls), 2);

    await service
      .from("shoots")
      .update({ identity_profile: identityProfile, updated_at: ts() })
      .eq("id", shootId);
  }

  // --- Step 2: Shoot brief ---
  if (!shootBrief) {

    await service
      .from("shoots")
      .update({ pipeline_stage: "Building shoot brief", progress: 20, updated_at: ts() })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Building shoot brief", progress: 20 },
      created_at: ts(),
    });

    shootBrief = await withRetry(() => buildShootBrief(shoot, identityProfile, refs, characterBaseUrl), 2);
    // Validate before storing — Claude truncation at max_tokens produces broken JSON
    try {
      JSON.parse(shootBrief);
    } catch {
      throw new Error(`buildShootBrief returned invalid JSON (length ${shootBrief.length}) — likely hit token limit`);
    }

    await service
      .from("shoots")
      .update({ shoot_brief: shootBrief, updated_at: ts() })
      .eq("id", shootId);
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
  try {
    const parsed = JSON.parse(shootBriefClean);
    prompts = (parsed.prompts as Record<string, string | SceneSlotPrompt>) ?? {};
  } catch (e) {
    console.error("[generate] JSON parse failed, falling back to regex", e);
    // Last-resort regex extraction if JSON is still malformed
    const match = shootBriefClean.match(/"1"\s*:\s*"([^"]+)"/);
    if (match) prompts["1"] = match[1];
  }

  // --- Step 3: Process pending slots ---
  const allSlots = (shoot.shoot_images ?? []) as SlotRow[];
  const pendingSlots = allSlots
    .filter((img) => ["QUEUED", "PENDING"].includes(img.status))
    .sort((a, b) => a.slot - b.slot)
    .slice(0, maxSlots);

  const aspectRatio = (shoot.aspect_ratio as AspectRatio) ?? "4:5";

  // Build imageUrls for fal.ai — base-locked shoots use base + scene refs; standard shoots use identity + inspiration
  let imageUrls: string[];
  if (hasBase && characterBaseUrl) {
    const backgroundUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "BACKGROUND")?.url ?? "";
    const lightingUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "LIGHTING")?.url ?? "";
    const colorGradeUrl = refs.find((r) => r.purpose === "tagged" && r.tag === "COLOR_GRADE")?.url ?? "";
    imageUrls = [characterBaseUrl, backgroundUrl, lightingUrl, colorGradeUrl].filter(Boolean).slice(0, 4);
  } else {
    const identityUrls = refs.filter((r) => r.purpose === "identity").map((r) => r.url).filter(Boolean);
    const inspirationUrls = refs.filter((r) => r.purpose === "inspiration").map((r) => r.url).filter(Boolean);
    imageUrls = [...identityUrls, ...inspirationUrls].slice(0, 4);
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
    const { data: claimed } = await service
      .from("shoot_images")
      .update({ status: "GENERATING", stage: `Generating slot ${slot}`, updated_at: ts() })
      .eq("id", slotImg.id)
      .eq("status", slotImg.status) // ensures only one worker picks it
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // another invocation already grabbed it

    await service
      .from("shoots")
      .update({
        pipeline_stage: `Generating slot ${slot}`,
        progress: Math.min(85, 20 + Math.round((slot / total) * 65)),
        updated_at: ts(),
      })
      .eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "slot_update",
      payload: { image: { slot, status: "GENERATING" } },
      created_at: ts(),
    });

    try {
      const rawSlotPrompt = prompts[String(slot)] ?? prompts["1"];

      let slotPrompt: string;
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

      const isTestMode = process.env.FAL_TEST_MODE === "1";

      // Log to Airtable before calling fal.ai so the payload is always visible
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

      const falUrl = await withRetry(() => generateImageWithFal(slotPrompt, imageUrls, aspectRatio));

      // In test mode skip uploading to Supabase storage (avoids Pollinations.ai rate limits)
      const storagePath = isTestMode
        ? `test/${shootId}/slot-${slot}.jpg`
        : await saveSlotImage(service, shootId, shoot.user_id, slot, falUrl);

      await service
        .from("shoot_images")
        .update({
          status: "COMPLETE",
          stage: `Completed slot ${slot}`,
          provider: isTestMode ? "pollinations" : "vercel-fal",
          configured_model: isTestMode ? "pollinations-free" : "fal-ai/nano-banana-2/edit",
          preview_storage_bucket: isTestMode ? "test" : "generated-4k",
          preview_storage_path: isTestMode ? falUrl : storagePath,
          download_storage_bucket: isTestMode ? "test" : "generated-4k",
          download_storage_path: isTestMode ? falUrl : storagePath,
          updated_at: ts(),
        })
        .eq("id", slotImg.id);

      await service.from("generation_events").insert({
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id: shoot.user_id,
        type: "slot_complete",
        payload: { image: { slot, status: "COMPLETE" } },
        created_at: ts(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[generate] slot ${slot} failed:`, message);
      failedCount++;

      await service
        .from("shoot_images")
        .update({
          status: "FAILED",
          stage: `Failed: ${message.slice(0, 200)}`,
          provider_error: message,
          updated_at: ts(),
        })
        .eq("id", slotImg.id);
    }
  }

  // Recount completion — done when no slots remain workable (avoids infinite loop on all-FAILED)
  const { count: completeCount } = await service
    .from("shoot_images")
    .select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId)
    .eq("status", "COMPLETE");

  const { count: workableCount } = await service
    .from("shoot_images")
    .select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId)
    .in("status", ["QUEUED", "PENDING", "GENERATING"]);

  const totalComplete = completeCount ?? 0;
  const remaining = workableCount ?? 0;
  const done = remaining === 0;

  await service
    .from("shoots")
    .update({
      status: done ? "COMPLETE" : "PROCESSING",
      progress: done ? 100 : Math.max(10, Math.round((totalComplete / total) * 100)),
      pipeline_stage: done
        ? "Complete"
        : `Completed ${totalComplete}/${total} shots`,
      completed_at: done ? ts() : null,
      updated_at: ts(),
    })
    .eq("id", shootId);

  if (done) {
    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "complete",
      payload: { progress: 100, stage: "Complete" },
      created_at: ts(),
    });
  }

  return { done, completed: totalComplete, failed: failedCount, remaining, total };
}
