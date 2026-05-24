import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { normalizePackageSize } from "@/lib/types";
import { r2Upload } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300;

type N8nResult = {
  prompt_index?: number;
  final_image_url?: string;
  upscaled_image_url?: string;
  refined_image_url?: string;
  generated_image_url?: string;
};

function getImageUrl(result: N8nResult) {
  return result.final_image_url || result.upscaled_image_url || result.refined_image_url || result.generated_image_url || "";
}

function normalizeImageUrls(body: Record<string, unknown>) {
  const explicit = Array.isArray(body.image_urls) ? body.image_urls.filter((url): url is string => typeof url === "string" && url.length > 0) : [];
  if (explicit.length > 0) return explicit.map((url, index) => ({ slot: index + 1, url }));

  const results = Array.isArray(body.all_results) ? body.all_results as N8nResult[] : [];
  return results
    .map((result, index) => ({ slot: Number(result.prompt_index ?? index + 1), url: getImageUrl(result) }))
    .filter((item) => item.slot >= 1 && item.slot <= 10 && item.url);
}

async function resolveShootId(service: ReturnType<typeof createServiceClient>, body: Record<string, unknown>) {
  if (typeof body.shoot_id === "string" && body.shoot_id) return body.shoot_id;
  if (typeof body.shootId === "string" && body.shootId) return body.shootId;

  const reference = typeof body.reference === "string" ? body.reference : "";
  if (!reference) return "";

  const { data: payment } = await service
    .from("payments")
    .select("shoot_id")
    .eq("provider_reference", reference)
    .maybeSingle();

  return typeof payment?.shoot_id === "string" ? payment.shoot_id : "";
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const internal = request.headers.get("x-internal-secret") ?? "";
  const expected = process.env.INTERNAL_API_SECRET ?? "";

  if (!expected || (bearer !== expected && internal !== expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const service = createServiceClient();
  const shootId = await resolveShootId(service, body);
  if (!shootId) return NextResponse.json({ error: "Missing shoot_id or known payment reference" }, { status: 400 });

  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id, package_size")
    .eq("id", shootId)
    .maybeSingle();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const expectedCount = normalizePackageSize(body.image_count ?? body.package_size ?? shoot.package_size);
  const images = normalizeImageUrls(body).slice(0, expectedCount);
  if (images.length === 0) return NextResponse.json({ error: "No generated image URLs supplied" }, { status: 400 });

  const saved: Array<{ slot: number; storagePath: string }> = [];
  const failed: Array<{ slot: number; error: string }> = [];

  await service.from("shoots").update({
    status: "PROCESSING",
    pipeline_stage: "Saving generated images",
    updated_at: new Date().toISOString(),
  }).eq("id", shootId);

  for (const image of images) {
    try {
      const imageRes = await fetch(image.url);
      if (!imageRes.ok) throw new Error(`Fal image fetch failed: ${imageRes.status}`);

      const contentType = imageRes.headers.get("content-type")?.includes("image/") ? imageRes.headers.get("content-type")! : "image/png";
      const bytes = Buffer.from(await imageRes.arrayBuffer());
      const storagePath = `${shoot.user_id}/${shootId}/slot-${image.slot}.png`;

      await r2Upload("generated-4k", storagePath, bytes, contentType);

      const { error: updateError } = await service
        .from("shoot_images")
        .update({
          status: "COMPLETE",
          stage: `Completed slot ${image.slot}`,
          provider: "n8n-fal",
          configured_model: "fal-ai/nano-banana-2/edit",
          preview_storage_bucket: "generated-4k",
          preview_storage_path: storagePath,
          download_storage_bucket: "generated-4k",
          download_storage_path: storagePath,
          file_size: bytes.byteLength,
          updated_at: new Date().toISOString(),
        })
        .eq("shoot_id", shootId)
        .eq("slot", image.slot);
      if (updateError) throw new Error(updateError.message);

      saved.push({ slot: image.slot, storagePath });
      await service.from("generation_events").insert({
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id: shoot.user_id,
        type: "slot_complete",
        payload: { image: { slot: image.slot, status: "COMPLETE" } },
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      failed.push({ slot: image.slot, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const { count: completeCount } = await service
    .from("shoot_images")
    .select("id", { count: "exact", head: true })
    .eq("shoot_id", shootId)
    .eq("status", "COMPLETE");

  const completed = completeCount ?? saved.length;
  const isComplete = completed >= expectedCount;
  await service.from("shoots").update({
    status: isComplete ? "COMPLETE" : "PROCESSING",
    progress: isComplete ? 100 : Math.max(10, Math.round((completed / expectedCount) * 100)),
    pipeline_stage: isComplete ? "Complete" : `Completed ${completed}/${expectedCount} shots`,
    completed_at: isComplete ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", shootId);

  if (isComplete) {
    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "complete",
      payload: { progress: 100, stage: "Complete" },
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: failed.length === 0, shootId, saved, failed });
}
