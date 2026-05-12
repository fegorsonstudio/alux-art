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

// ---------------------------------------------------------------------------
// Vision Analysis — GPT-4o analyzes identity + inspiration photos
// ---------------------------------------------------------------------------
async function runVisionAnalysis(identityUrls: string[], inspirationUrls: string[]): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "";
  try {
    const content = [
      {
        type: "text",
        text: "Critical wardrobe requirement: treat the outfit shown in the inspiration images as a locked styling reference. Identify the exact garments, color, silhouette, texture, fit, and accessories. The generated shoot must maintain that same inspiration outfit across every person image; only pose, lighting, camera angle, and setting may change.",
      },
      {
        type: "text",
        text: "You are a professional photography director's assistant. Study these reference photos and write a casting brief for a photo shoot. Describe: (1) the subject's appearance — skin tone, hair color/texture/length, build, approximate age range, personal style from clothing; (2) the mood, lighting style, color palette, and aesthetic from the inspiration images. Be specific and vivid. This brief will be used to generate AI photoshoot images that match this person's look.",
      },
      ...identityUrls.slice(0, 3).map(url => ({ type: "image_url", image_url: { url, detail: "high" } })),
      ...inspirationUrls.slice(0, 2).map(url => ({ type: "image_url", image_url: { url, detail: "low" } })),
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 600 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Shoot Brief — GPT-4o generates 10 shot directives
// ---------------------------------------------------------------------------
async function generateShootBrief(identityProfile: string, mode: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return fallbackShootDirectives();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: `You are a creative photography director. Based on this subject casting brief:\n\n${identityProfile}\n\nGenerate exactly 10 photoshoot shot directives as a JSON object with a "shots" array of strings. Each directive is 1-2 sentences describing: pose, lighting style, wardrobe, background/setting. Make each shot distinct and cinematic.\n\n- Shots 1-3: close-up or half-body portraits, varied lighting (studio, golden hour, dramatic side-light)\n- Shots 4-6: full-body or environmental portraits, varied settings (urban, studio, natural)\n- Shots 7-8: editorial/fashion style, bold or conceptual\n- Shot 9: luxury mood still-life flat lay (no person, products/props that match the aesthetic)\n- Shot 10: clean minimalist background with soft texture (for a quote overlay, no person)\n\nMode: ${mode}. Make the prompts rich and specific to the subject's look described above.`,
        }],
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    return enforceOutfitContinuity(parsed.shots ?? fallbackShootDirectives());
  } catch { return fallbackShootDirectives(); }
}

function fallbackShootDirectives() {
  return Array(10).fill("professional photoshoot portrait with the locked inspiration outfit maintained");
}

function enforceOutfitContinuity(shots: string[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const directive = shots[index] ?? "professional photoshoot portrait";
    if (index <= 7) {
      return `${directive} Wardrobe continuity: keep the exact same inspiration outfit throughout the shoot - same garments, colors, silhouette, fit, fabric texture, styling, and accessories. Do not change or replace the outfit.`;
    }
    if (index === 8) {
      return `${directive} Match the still-life props, materials, and color palette to the locked inspiration outfit.`;
    }
    return `${directive} Match the minimalist background and quote-overlay palette to the locked inspiration outfit.`;
  });
}

// openai/gpt-image-2/edit uses OpenAI size strings, not fal aspect ratios
const GPT_SIZE: Record<AspectRatio, string> = {
  "3:4":  "1024x1536",
  "4:5":  "1024x1536",
  "1:1":  "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "2:3":  "1024x1536",
};

// ---------------------------------------------------------------------------
// Image generation — fal.ai → OpenAI → Gemini fallback
// ---------------------------------------------------------------------------
async function generateImage(
  prompt: string,
  referenceUrls: string[],
  aspectRatio: AspectRatio,
  slot: number
): Promise<string> {
  const size = GPT_SIZE[aspectRatio] ?? "1024x1536";

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
      console.error(`[generate] fal.ai slot ${slot} failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Fallback: OpenAI gpt-image-2 direct API
  if (process.env.OPENAI_API_KEY) {
    try {
      if (referenceUrls.length > 0) {
        const form = new FormData();
        form.append("model", "gpt-image-2");
        form.append("prompt", prompt);
        form.append("n", "1");
        form.append("size", size);
        form.append("quality", "medium");
        // Attach primary identity image
        const imgRes = await fetch(referenceUrls[0]);
        if (!imgRes.ok) throw new Error(`Failed to download reference image: ${imgRes.status}`);
        const imgBlob = await imgRes.blob();
        form.append("image", imgBlob, "identity.jpg");
        const res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form,
        });
        const data = await res.json();
        if (data.error) throw new Error(`OpenAI API error: ${data.error.message}`);
        const b64 = data.data?.[0]?.b64_json;
        if (b64) {
          const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          const blob = new Blob([bytes], { type: "image/png" });
          return await fal.storage.upload(blob);
        }
      } else {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-image-2", prompt, n: 1, size, quality: "medium" }),
        });
        const data = await res.json();
        if (data.error) throw new Error(`OpenAI API error: ${data.error.message}`);
        const b64 = data.data?.[0]?.b64_json;
        if (b64) {
          const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          const blob = new Blob([bytes], { type: "image/png" });
          return await fal.storage.upload(blob);
        }
      }
    } catch (e) {
      console.error(`[generate] OpenAI slot ${slot} failed:`, e);
    }
  }

  // Last resort: Gemini
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
      console.error(`[generate] Gemini slot ${slot} failed:`, e);
    }
  }

  throw new Error(`All providers failed for slot ${slot}`);
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
  const outfitRefs = [
    ...inspirationRefs,
    ...taggedRefs.filter((r) => r.tag === "OUTFIT" || r.custom_name === "OUTFIT"),
  ];

  const identityUrls = await getSignedUrls(identityRefs);
  const inspirationUrls = await getSignedUrls(inspirationRefs);
  const outfitUrls = await getSignedUrls(outfitRefs);
  const generationRefUrls = [...identityUrls.slice(0, 3), ...outfitUrls.slice(0, 1)];

  // Vision analysis
  let identityProfile = asStoredText(shoot.identity_profile);
  if (!identityProfile) {
    await updateShoot(shootId, { status: "PROCESSING", pipeline_stage: "Analyzing identity" });
    await emit(shootId, userId, "stage", { stage: "Analyzing identity", progress: 5 });
    try {
      identityProfile = await runVisionAnalysis(identityUrls, inspirationUrls);
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
      await updateShoot(shootId, { shoot_brief: JSON.stringify(directives) });
    } catch (e) {
      console.error("[generate] Shoot brief failed:", e);
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
    const directive = directives[slot - 1] ?? "professional photoshoot portrait";
    const outfitLock = "Maintain the inspiration outfit consistently across this image: same garment pieces, colors, silhouette, fabric texture, fit, styling, and accessories as the outfit reference. Do not change wardrobe.";
    const fullPrompt = `${directive}. ${identityProfile ? `Subject: ${identityProfile.slice(0, 200)}.` : ""} ${slot <= 8 ? outfitLock : "Use the locked outfit reference as the visual palette anchor."} Identity-locked, photorealistic, high quality.`;

    await updateImage(img.id as string, { status: "GENERATING", stage: `Generating slot ${slot}` });
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
      await emit(shootId, userId, "slot_update", { image: { id: img.id, slot, status: "FAILED" }, error: errMsg });
    }
  }

  return summarizeShootProgress(shootId, userId, total);
}
