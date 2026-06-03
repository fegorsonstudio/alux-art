import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
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
  const explicit = Array.isArray(body.image_urls)
    ? (body.image_urls as unknown[]).filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  if (explicit.length > 0) return explicit.map((url, index) => ({ slot: index + 1, url }));

  const results = Array.isArray(body.all_results) ? body.all_results as N8nResult[] : [];
  return results
    .map((result, index) => ({ slot: Number(result.prompt_index ?? index + 1), url: getImageUrl(result) }))
    .filter((item) => item.slot >= 1 && item.slot <= 10 && item.url);
}

async function resolveShootId(body: Record<string, unknown>): Promise<string> {
  if (typeof body.shoot_id === "string" && body.shoot_id) return body.shoot_id;
  if (typeof body.shootId === "string" && body.shootId) return body.shootId;

  const reference = typeof body.reference === "string" ? body.reference : "";
  if (!reference) return "";

  const [payment] = await sql`SELECT shoot_id FROM payments WHERE provider_reference = ${reference}`;
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

  const shootId = await resolveShootId(body);
  if (!shootId) return NextResponse.json({ error: "Missing shoot_id or known payment reference" }, { status: 400 });

  const [shoot] = await sql`SELECT id, user_id, package_size FROM shoots WHERE id = ${shootId}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const expectedCount = normalizePackageSize(body.image_count ?? body.package_size ?? shoot.package_size);
  const images = normalizeImageUrls(body).slice(0, expectedCount);
  if (images.length === 0) return NextResponse.json({ error: "No generated image URLs supplied" }, { status: 400 });

  const saved: Array<{ slot: number; storagePath: string }> = [];
  const failed: Array<{ slot: number; error: string }> = [];

  await sql`
    UPDATE shoots SET status = 'PROCESSING', pipeline_stage = 'Saving generated images', updated_at = NOW()
    WHERE id = ${shootId}
  `;

  // Only fetch from known fal.ai image delivery hosts to prevent SSRF.
  const ALLOWED_IMAGE_HOSTS = /^(v[0-9]+[a-z]?\.fal\.media|storage\.googleapis\.com|[a-z0-9-]+\.fal\.run)$/;
  const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

  for (const image of images) {
    try {
      let parsedUrl: URL;
      try { parsedUrl = new URL(image.url); } catch { failed.push({ slot: image.slot, error: "Invalid URL" }); continue; }
      if (!ALLOWED_IMAGE_HOSTS.test(parsedUrl.hostname)) {
        failed.push({ slot: image.slot, error: `Disallowed image host: ${parsedUrl.hostname}` });
        continue;
      }

      const imageRes = await fetch(image.url);
      if (!imageRes.ok) throw new Error(`Fal image fetch failed: ${imageRes.status}`);

      const ct = imageRes.headers.get("content-type") ?? "";
      if (!ct.startsWith("image/")) throw new Error(`Unexpected content-type: ${ct}`);
      const contentType = ct.includes("image/") ? ct : "image/png";

      const arrayBuf = await imageRes.arrayBuffer();
      if (arrayBuf.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 50 MB limit");
      const bytes = Buffer.from(arrayBuf);
      const storagePath = `${shoot.user_id}/${shootId}/slot-${image.slot}.png`;

      await r2Upload("generated-4k", storagePath, bytes, contentType);

      await sql`
        UPDATE shoot_images SET
          status = 'COMPLETE', stage = ${`Completed slot ${image.slot}`},
          provider = 'n8n-fal', configured_model = 'fal-ai/nano-banana-2/edit',
          preview_storage_bucket = 'generated-4k', preview_storage_path = ${storagePath},
          download_storage_bucket = 'generated-4k', download_storage_path = ${storagePath},
          file_size = ${bytes.byteLength}, updated_at = NOW()
        WHERE shoot_id = ${shootId} AND slot = ${image.slot}
      `;

      saved.push({ slot: image.slot, storagePath });
      await sql`
        INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
        VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
                'slot_complete', ${JSON.stringify({ image: { slot: image.slot, status: "COMPLETE" } })}::jsonb, NOW())
      `;
    } catch (error) {
      failed.push({ slot: image.slot, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const [{ count: completeCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM shoot_images WHERE shoot_id = ${shootId} AND status = 'COMPLETE'
  `;
  const completed = (completeCount as number | null) ?? saved.length;
  const isComplete = completed >= expectedCount;

  await sql`
    UPDATE shoots SET
      status = ${isComplete ? "COMPLETE" : "PROCESSING"},
      progress = ${isComplete ? 100 : Math.max(10, Math.round((completed / expectedCount) * 100))},
      pipeline_stage = ${isComplete ? "Complete" : `Completed ${completed}/${expectedCount} shots`},
      completed_at = ${isComplete ? new Date() : null},
      updated_at = NOW()
    WHERE id = ${shootId}
  `;

  if (isComplete) {
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
              'complete', ${JSON.stringify({ progress: 100, stage: "Complete" })}::jsonb, NOW())
    `;
  }

  return NextResponse.json({ ok: failed.length === 0, shootId, saved, failed });
}
