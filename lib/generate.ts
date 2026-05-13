import { createServiceClient } from "@/lib/supabase-server";
import { fal } from "@fal-ai/client";
import { ASPECTS, type AspectRatio } from "@/lib/types";

fal.config({ credentials: process.env.FAL_KEY });

// ---------------------------------------------------------------------------
// SSE emitter — writes events to Supabase generation_events table
// ---------------------------------------------------------------------------
async function emit(shootId: string, userId: string, type: string, payload: Record<string, unknown>) {
  const service = createServiceClient();
  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: userId,
    type,
    payload,
    created_at: new Date().toISOString(),
  });
}

async function updateShoot(shootId: string, data: Record<string, unknown>) {
  const service = createServiceClient();
  await service.from("shoots").update({ ...data, updated_at: new Date().toISOString() }).eq("id", shootId);
}

async function updateImage(imageId: string, data: Record<string, unknown>) {
  const service = createServiceClient();
  await service.from("shoot_images").update({ ...data, updated_at: new Date().toISOString() }).eq("id", imageId);
}

async function claimImageForGeneration(imageId: string, slot: number) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("shoot_images")
    .update({ status: "GENERATING", stage: `Generating slot ${slot}`, updated_at: new Date().toISOString() })
    .eq("id", imageId)
    .in("status", ["PENDING", "QUEUED"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[generate] Slot ${slot} claim failed:`, error.message);
    return false;
  }
  return Boolean(data);
}

async function anthropicImageBlock(url: string, detail: "high" | "low") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download reference image: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: contentType.startsWith("image/") ? contentType : "image/jpeg",
      data,
    },
    cache_control: detail === "high" ? { type: "ephemeral" } : undefined,
  };
}

async function runClaude(content: Record<string, unknown>[], maxTokens: number) {
  if (!process.env.ANTHROPIC_API_KEY) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Claude API error: ${res.status}`);
  return (data.content ?? [])
    .filter((part: Record<string, unknown>) => part.type === "text")
    .map((part: Record<string, unknown>) => part.text)
    .join("\n")
    .trim();
}

interface TaggedReferenceInput {
  tag: string;
  url: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Vision Analysis - Claude analyzes identity + inspiration photos
// ---------------------------------------------------------------------------
async function runVisionAnalysis(
  identityUrls: string[],
  inspirationUrls: string[],
  taggedReferences: TaggedReferenceInput[]
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return "";
  try {
    const taggedBlocks = (await Promise.all(taggedReferences.slice(0, 7).map(async (ref) => [
      {
        type: "text",
        text: `Advanced tagged reference [${ref.tag}]. ${ref.note ? `User note: ${ref.note}. ` : ""}Analyze only the visual attribute controlled by this tag and explain how it should override or layer on top of the inspiration image.`,
      },
      await anthropicImageBlock(ref.url, "low"),
    ]))).flat();

    const content = [
      {
        type: "text",
        text: "Critical wardrobe requirement: identity images are identity-only references. Use them for facial identity, skin tone, build, and stable likeness only. Do not copy clothing, accessories, background, lighting, pose, or styling from identity images. Wardrobe must come only from the [OUTFIT] tagged reference in advanced mode, or from the inspiration image in fast mode. Identify the exact wardrobe source garments, color, silhouette, texture, fit, and accessories. The generated shoot must maintain that locked wardrobe source across every person image; only pose, lighting, camera angle, and setting may change unless a tagged reference controls that category.",
      },
      {
        type: "text",
        text: "You are a professional photography director's assistant. Study these reference photos and write a casting brief for a photo shoot. Describe: (1) the subject's appearance - skin tone, hair color/texture/length, build, approximate age range, and biometric likeness. Do not treat identity-image clothing as personal style or wardrobe direction; (2) the wardrobe source and tagged overrides; (3) the mood, lighting style, color palette, camera/lens feel, and aesthetic from the inspiration images. Use concrete photographic language such as lens feel, lighting direction, realistic skin texture, subtle film grain, depth of field, and color balance. Do not use subjective hype words like stunning, beautiful, masterpiece, epic, insane detail, or ultra-detailed.",
      },
      ...(await Promise.all(identityUrls.slice(0, 3).map(url => anthropicImageBlock(url, "high")))),
      ...(await Promise.all(inspirationUrls.slice(0, 2).map(url => anthropicImageBlock(url, "low")))),
      ...taggedBlocks,
    ];

    return await runClaude(content, 600);
  } catch (e) {
    console.error("[generate] Claude vision analysis failed:", e);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Shoot Brief - Claude generates 10 shot directives
// ---------------------------------------------------------------------------
async function generateShootBrief(identityProfile: string, mode: string): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackShootDirectives();
  try {
    const advancedRules = mode === "advanced"
      ? `\n\nAdvanced mode rules:\n- Use a layered reference system, not a simple inspiration copy.\n- The locked identity profile is non-negotiable: preserve the same person across all portrait shots.\n- Tagged reference overrides have priority over the base inspiration image for their category.\n- [OUTFIT] replaces the outfit extracted from the inspiration image. Keep that replacement outfit consistent across all portrait shots.\n- [HAIRSTYLE] applies the tagged hair reference to the subject while preserving identity.\n- [MAKEUP] applies the tagged makeup or beauty styling.\n- [BACKGROUND] controls environment/backdrop choices.\n- [LIGHTING] controls lighting setup, direction, contrast, and mood.\n- [ACCESSORY] adds the tagged accessories without changing identity or outfit unless explicitly part of the accessory.\n- [COLOR_GRADE] controls film stock, color treatment, contrast, grain, and edit style.\n- If tagged references conflict with the base inspiration, the tagged reference wins only for its category.\n- Reconcile all layers into a coherent final art direction before writing the 10 shot directives.`
      : "";
    const text = await runClaude([{
      type: "text",
      text: `You are a creative photography director. Based on this subject casting brief:\n\n${identityProfile}${advancedRules}\n\nGenerate exactly 10 photoshoot shot directives as a JSON object with a "shots" array of strings. Each directive is 1-2 sentences describing: pose, lighting style, wardrobe, background/setting. Make each shot distinct and cinematic.\n\n- Shots 1-3: close-up or half-body portraits, varied lighting (studio, golden hour, dramatic side-light)\n- Shots 4-6: full-body or environmental portraits, varied settings (urban, studio, natural)\n- Shots 7-8: editorial/fashion style, bold or conceptual\n- Shot 9: luxury mood still-life flat lay (no person, products/props that match the aesthetic)\n- Shot 10: clean minimalist background with soft texture (for a quote overlay, no person)\n\nMode: ${mode}. Make the prompts rich and specific to the subject's look described above. Return only valid JSON with no markdown.`,
    }], 800);
    const parsed = JSON.parse(text || "{}");
    return enforceOutfitContinuity(parsed.shots ?? fallbackShootDirectives());
  } catch (e) {
    console.error("[generate] Claude shoot brief failed:", e);
    return fallbackShootDirectives();
  }
}

function fallbackShootDirectives() {
  return Array(10).fill("professional photoshoot portrait with the locked wardrobe reference maintained");
}

function enforceOutfitContinuity(shots: string[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const directive = shots[index] ?? "professional photoshoot portrait";
    if (index <= 7) {
      return `${directive} Wardrobe continuity: keep the exact same locked wardrobe reference throughout the shoot - same garments, colors, silhouette, fit, fabric texture, styling, and accessories. If advanced mode includes an [OUTFIT] reference, that outfit replaces the base inspiration outfit. Do not change or replace the locked outfit.`;
    }
    if (index === 8) {
      return `${directive} Match the still-life props, materials, and color palette to the locked wardrobe reference.`;
    }
    return `${directive} Match the minimalist background and quote-overlay palette to the locked wardrobe reference.`;
  });
}

function referenceTag(ref: Record<string, unknown>) {
  return String(ref.tag ?? ref.custom_name ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function buildFinalImagePrompt(args: {
  directive: string;
  identityProfile: string;
  mode: string;
  slot: number;
  hasOutfitOverride: boolean;
  hasBackgroundOverride: boolean;
}) {
  const identitySummary = args.identityProfile
    ? args.identityProfile.slice(0, 450)
    : "same person from identity references";
  const wardrobeSource = args.mode === "advanced" && args.hasOutfitOverride
    ? "advanced [OUTFIT] tagged reference"
    : "base inspiration wardrobe";
  const referenceRoles = args.mode === "advanced" && args.hasOutfitOverride
    ? [
      "Reference Image 1 is IDENTITY ONLY: preserve face, skin tone, body build, and likeness.",
      "Reference Image 2 is [OUTFIT] ONLY: apply this clothing exactly; it overrides all clothing visible in identity images and base inspiration.",
      "Reference Image 3, if provided, is BASE INSPIRATION: use it as environment, mood, composition, and color anchor unless a tagged override replaces that category.",
    ].join(" ")
    : [
      "Reference Images 1-3 are IDENTITY ONLY: preserve face, skin tone, body build, and likeness; ignore clothing and backgrounds.",
      "The inspiration/wardrobe reference is the base wardrobe, environment, mood, and color anchor.",
    ].join(" ");
  const environmentRule = args.hasBackgroundOverride
    ? "Use the advanced [BACKGROUND] tagged reference as the environment/backdrop source; ignore non-background elements in that reference."
    : "Unless a specific [BACKGROUND] reference is provided, the base inspiration image is the environmental anchor. Preserve the setting, background composition, and texture from the inspiration image.";
  const preserveBlock = [
    "Preserve facial identity from identity references: face shape, eye spacing, nose shape, lips, jawline, skin tone, hairline, body build, and recognizable likeness.",
    "Do not copy clothing, accessories, background, lighting, pose, or styling from identity images.",
    "Treat identity-image clothing as incidental capture context.",
    "Maintain the Change vs Preserve split: preserve identity and locked wardrobe source; change only pose, camera angle, expression, and category-specific tagged elements.",
  ].join(" ");
  const changeBlock = args.slot <= 8
    ? `Apply wardrobe only from the ${wardrobeSource}. Maintain exact garments, colors, silhouette, fit, fabric texture, folds, styling, and accessories from that wardrobe source.`
    : `Use the ${wardrobeSource} only as the visual palette anchor for props, materials, and color harmony.`;
  const advancedBlock = args.mode === "advanced"
    ? "Advanced tagged references override only their category. Extract only the tagged attribute from each tagged reference; ignore non-tagged elements in that image."
    : "Use the inspiration image as the base art direction and wardrobe source.";

  return [
    `Reference Roles: ${referenceRoles}`,
    `Scene: ${args.directive}`,
    `Subject: ${identitySummary}`,
    `Important Details: ${changeBlock} ${environmentRule} ${advancedBlock} Use concrete photographic realism: natural skin texture, subtle film grain, realistic fabric behavior, physically plausible light direction, natural asymmetry, and editorial lens feel.`,
    "Use Case: Professional editorial virtual photoshoot image.",
    `Constraints: ${preserveBlock} Avoid CGI/plastic skin, waxy smoothing, identity drift, outfit bleed from identity images, random logos, extra text, watermarks, distorted hands, and invented wardrobe changes.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Image generation - fal.ai primary, Gemini fallback
// ---------------------------------------------------------------------------
async function generateImage(
  prompt: string,
  referenceUrls: string[],
  aspectRatio: AspectRatio,
  slot: number
): Promise<string> {
  void aspectRatio;
  const failures: string[] = [];

  // Primary: fal.ai — Nano Banana 2 edit
  // SDK v1 wraps response as { data: { images: [...] }, requestId }
  if (process.env.FAL_KEY && referenceUrls.length > 0) {
    try {
      const raw = await fal.run("fal-ai/nano-banana-2/edit", {
        input: {
          prompt,
          image_urls: referenceUrls.slice(0, 4),
          output_format: "png",
        },
      }) as Record<string, unknown>;
      // Handle both unwrapped { images } and wrapped { data: { images } }
      const images = (raw?.images ?? (raw?.data as Record<string, unknown>)?.images) as Array<{ url: string }> | undefined;
      const url = images?.[0]?.url;
      console.log(`[generate] fal.ai slot ${slot} raw keys:`, Object.keys(raw ?? {}), "url:", url);
      if (url) return url;
    } catch (e) {
      const message = providerFailureMessage("fal.ai", e);
      failures.push(message);
      console.error(`[generate] fal.ai slot ${slot} failed:`, message);
    }
  }

  // Fallback: Gemini image generation
  if (process.env.GEMINI_API_KEY) {
    try {
      const parts: Record<string, unknown>[] = [{ text: prompt }];
      for (const url of referenceUrls.slice(0, 2)) {
        const imgRes = await fetch(url);
        const buf = await imgRes.arrayBuffer();
        parts.push({ inlineData: { mimeType: "image/jpeg", data: Buffer.from(buf).toString("base64") } });
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseModalities: ["Image"] },
          }),
        }
      );
      const data = await res.json();
      const imgData = data.candidates?.[0]?.content?.parts?.find((p: Record<string, unknown>) => p.inlineData)?.inlineData;
      if (imgData) {
        const bytes = Uint8Array.from(Buffer.from(imgData.data, "base64"));
        const blob = new Blob([bytes], { type: imgData.mimeType });
        return await fal.storage.upload(blob);
      }
    } catch (e) {
      const message = providerFailureMessage("Gemini", e);
      failures.push(message);
      console.error(`[generate] Gemini slot ${slot} failed:`, message);
    }
  }

  throw new Error(`All providers failed for slot ${slot}: ${failures.join(" | ") || "no provider attempted"}`);
}

// ---------------------------------------------------------------------------
// Upscale with fal-ai/aura-sr
// ---------------------------------------------------------------------------
async function upscaleImage(imageUrl: string): Promise<string> {
  try {
    const raw = await fal.run("fal-ai/aura-sr", {
      input: { image_url: imageUrl, upscale_factor: 4 },
    }) as Record<string, unknown>;
    const img = (raw?.image ?? (raw?.data as Record<string, unknown>)?.image) as { url?: string } | undefined;
    return img?.url ?? imageUrl;
  } catch {
    return imageUrl;
  }
}

// ---------------------------------------------------------------------------
// Quote composite — SVG text overlay on slot 10 background
// ---------------------------------------------------------------------------
async function compositeQuote(
  backgroundUrl: string,
  quote: { text: string; attribution: string }
): Promise<string> {
  try {
    const sharp = (await import("sharp")).default;
    const imgRes = await fetch(backgroundUrl);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const img = sharp(buf);
    const { width = 1080, height = 1080 } = await img.metadata();

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)"/>
      <text x="50%" y="44%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(width * 0.045)}" fill="white" font-style="italic">"${quote.text}"</text>
      <text x="50%" y="54%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(width * 0.028)}" fill="#cccccc">— ${quote.attribution}</text>
    </svg>`;

    const composite = await img
      .resize(1080, 1080, { fit: "cover" })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();

    const blob = new Blob([new Uint8Array(composite)], { type: "image/png" });
    return await fal.storage.upload(blob);
  } catch {
    return backgroundUrl;
  }
}

interface GenerationWorkerResult {
  done: boolean;
  completed: number;
  failed: number;
  remaining: number;
  total: number;
}

function hasStoredCompleteImage(img: Record<string, unknown>) {
  return img.status === "COMPLETE" && Boolean(img.download_storage_path ?? img.preview_storage_path);
}

function parseStoredDirectives(value: unknown): string[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asStoredText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function providerFailureMessage(provider: string, error: unknown) {
  if (error instanceof Error) {
    const extra = error.cause ? ` (${JSON.stringify(error.cause)})` : "";
    return `${provider}: ${error.message}${extra}`;
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return `${provider}: ${String(record.message ?? record.error ?? JSON.stringify(record))}`;
  }
  return `${provider}: ${String(error)}`;
}

async function summarizeShootProgress(shootId: string, userId: string, total: number): Promise<GenerationWorkerResult> {
  const service = createServiceClient();
  const { data: latestImages } = await service
    .from("shoot_images")
    .select("status, preview_storage_path, download_storage_path")
    .eq("shoot_id", shootId);

  const images = (latestImages ?? []) as Record<string, unknown>[];
  const completed = images.filter(hasStoredCompleteImage).length;
  const failed = images.filter((img) => img.status === "FAILED").length;
  const remaining = Math.max(total - completed - failed, 0);

  if (remaining === 0) {
    const status = failed > 0 ? "FAILED" : "COMPLETE";
    const stage = failed > 0 ? `Completed ${completed}/${total}, ${failed} failed` : "Complete";
    await updateShoot(shootId, {
      status,
      progress: 100,
      pipeline_stage: stage,
      completed_at: new Date().toISOString(),
    });
    await emit(shootId, userId, status === "COMPLETE" ? "complete" : "error", { progress: 100, stage });
    return { done: true, completed, failed, remaining, total };
  }

  const progress = Math.round((completed / total) * 85) + 10;
  await updateShoot(shootId, {
    status: "PROCESSING",
    progress,
    pipeline_stage: `Completed ${completed}/${total} shots`,
  });
  return { done: false, completed, failed, remaining, total };
}

// ---------------------------------------------------------------------------
// Main worker
// ---------------------------------------------------------------------------
export async function startGenerationWorker(
  shootId: string,
  options: { maxSlots?: number } = {}
): Promise<GenerationWorkerResult> {
  const service = createServiceClient();
  const maxSlots = Math.max(1, options.maxSlots ?? 1);

  const { data: shoot } = await service
    .from("shoots")
    .select("*, shoot_images(*), shoot_references(*)")
    .eq("id", shootId)
    .single();

  if (!shoot) throw new Error(`Shoot ${shootId} not found`);

  const userId = shoot.user_id;
  const images: Record<string, unknown>[] = [...(shoot.shoot_images ?? [])]
    .sort((a, b) => Number(a.slot ?? 0) - Number(b.slot ?? 0));
  const total = images.length || 10;

  if (images.every(hasStoredCompleteImage)) {
    return summarizeShootProgress(shootId, userId, total);
  }

  // Resolve reference signed URLs
  const getSignedUrls = async (refs: Record<string, unknown>[]) => {
    const urls = await Promise.all(refs.map(async (r: Record<string, unknown>) => {
      const { data } = await service.storage
        .from(r.storage_bucket as string)
        .createSignedUrl(r.storage_path as string, 7200);
      return data?.signedUrl ?? "";
    }));
    return urls.filter((url) => /^https?:\/\//i.test(url));
  };

  const referenceRows = (shoot.shoot_references ?? []) as Record<string, unknown>[];
  const identityRefs = referenceRows.filter((r) => r.purpose === "identity");
  const inspirationRefs = referenceRows.filter((r) => r.purpose === "inspiration");
  const taggedRefs = referenceRows.filter((r) => r.purpose === "tagged");
  const taggedOutfitRefs = taggedRefs.filter((r) => referenceTag(r) === "OUTFIT");
  const taggedBackgroundRefs = taggedRefs.filter((r) => referenceTag(r) === "BACKGROUND");
  const outfitRefs = taggedOutfitRefs.length > 0 ? taggedOutfitRefs : inspirationRefs;

  const identityUrls = await getSignedUrls(identityRefs);
  const inspirationUrls = await getSignedUrls(inspirationRefs);
  const outfitUrls = await getSignedUrls(outfitRefs);
  const backgroundUrls = await getSignedUrls(taggedBackgroundRefs);
  const taggedReferenceInputs = shoot.mode === "advanced"
    ? (await Promise.all(taggedRefs.map(async (ref): Promise<TaggedReferenceInput | null> => {
      const [url] = await getSignedUrls([ref]);
      if (!url) return null;
      return {
        tag: referenceTag(ref) || "CUSTOM",
        url,
        note: typeof ref.note === "string" ? ref.note : undefined,
      };
    }))).filter((ref): ref is TaggedReferenceInput => Boolean(ref))
    : [];
  const generationRefUrls = shoot.mode === "advanced" && taggedOutfitRefs.length > 0
    ? [
      ...identityUrls.slice(0, 1),
      ...outfitUrls.slice(0, 1),
      ...(backgroundUrls.length > 0 ? backgroundUrls.slice(0, 1) : inspirationUrls.slice(0, 1)),
    ]
    : [...identityUrls.slice(0, 3), ...outfitUrls.slice(0, 1)];
  const hasValidIdentityReference = identityUrls.length > 0;

  // Vision analysis
  let identityProfile = asStoredText(shoot.identity_profile);
  if (!identityProfile) {
    await updateShoot(shootId, { status: "PROCESSING", pipeline_stage: "Analyzing identity" });
    await emit(shootId, userId, "stage", { stage: "Analyzing identity", progress: 5 });
    try {
      identityProfile = await runVisionAnalysis(identityUrls, inspirationUrls, taggedReferenceInputs);
      await updateShoot(shootId, { identity_profile: identityProfile, pipeline_stage: "Generating shoot brief" });
      await emit(shootId, userId, "stage", { stage: "Generating shoot brief", progress: 10 });
    } catch (e) {
      console.error("[generate] Vision analysis failed:", e);
    }
  }

  // Shoot brief
  let directives: string[] = enforceOutfitContinuity(
    parseStoredDirectives(shoot.shoot_brief) ?? fallbackShootDirectives()
  );
  if (!shoot.shoot_brief) {
    try {
      directives = await generateShootBrief(identityProfile, shoot.mode);
      await updateShoot(shootId, {
        shoot_brief: JSON.stringify(directives),
        pipeline_stage: "Generating images",
      });
      await emit(shootId, userId, "stage", { stage: "Generating images", progress: 12 });
    } catch (e) {
      console.error("[generate] Shoot brief failed:", e);
      await updateShoot(shootId, { pipeline_stage: "Generating images" });
      await emit(shootId, userId, "stage", { stage: "Generating images", progress: 12 });
    }
  }

  let processed = 0;

  for (const img of images) {
    if (hasStoredCompleteImage(img) || img.status === "FAILED") continue;
    const updatedAt = Date.parse(String(img.updated_at ?? ""));
    const isFreshInFlight = (img.status === "GENERATING" || img.status === "UPSCALING") &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt < 10 * 60 * 1000;
    if (isFreshInFlight) continue;
    if (processed >= maxSlots) break;
    processed++;

    const slot = img.slot as number;
    if (slot <= 8 && !hasValidIdentityReference) {
      const errMsg = "No valid identity reference image is available for portrait generation. Refresh and select identity images that still show previews.";
      await updateImage(img.id as string, { status: "FAILED", provider_error: errMsg });
      await emit(shootId, userId, "slot_update", { image: { id: img.id, slot, status: "FAILED", provider_error: errMsg }, error: errMsg });
      continue;
    }

    const directive = directives[slot - 1] ?? "professional photoshoot portrait";
    const fullPrompt = buildFinalImagePrompt({
      directive,
      identityProfile,
      mode: shoot.mode,
      slot,
      hasOutfitOverride: taggedOutfitRefs.length > 0,
      hasBackgroundOverride: taggedBackgroundRefs.length > 0,
    });

    const claimed = await claimImageForGeneration(img.id as string, slot);
    if (!claimed) continue;
    await emit(shootId, userId, "slot_update", { image: { id: img.id, slot, status: "GENERATING" } });

    try {
      let imageUrl = await generateImage(fullPrompt, generationRefUrls, shoot.aspect_ratio as AspectRatio, slot);

      // Upscale portraits (slots 1-9)
      if (slot <= 9) {
        await updateImage(img.id as string, { status: "UPSCALING" });
        imageUrl = await upscaleImage(imageUrl);
      }

      // Quote composite for slot 10
      if (slot === 10 && shoot.quote?.text) {
        imageUrl = await compositeQuote(imageUrl, shoot.quote);
      }

      // Save result to Supabase storage
      const imgRes = await fetch(imageUrl);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      const storagePath = `${userId}/${shootId}/slot-${slot}.png`;
      await service.storage.from("generated-4k").upload(storagePath, imgBuf, { contentType: "image/png", upsert: true });

      const { data: previewSigned } = await service.storage
        .from("generated-4k")
        .createSignedUrl(storagePath, 3600);

      await updateImage(img.id as string, {
        status: "COMPLETE",
        stage: `Completed slot ${slot}`,
        provider_error: null,
        preview_storage_bucket: "generated-4k",
        preview_storage_path: storagePath,
        download_storage_bucket: "generated-4k",
        download_storage_path: storagePath,
      });

      const completed = images.filter(hasStoredCompleteImage).length + 1;
      const progress = Math.round((completed / total) * 85) + 10;
      await updateShoot(shootId, { progress, pipeline_stage: `Completed ${completed}/${total} shots` });
      await emit(shootId, userId, "slot_complete", {
        image: { id: img.id, slot, status: "COMPLETE", previewUrl: previewSigned?.signedUrl },
        progress,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[generate] Slot ${slot} failed:`, errMsg);
      await updateImage(img.id as string, { status: "FAILED", provider_error: errMsg });
      await emit(shootId, userId, "slot_update", { image: { id: img.id, slot, status: "FAILED", provider_error: errMsg }, error: errMsg });
    }
  }

  return summarizeShootProgress(shootId, userId, total);
}
