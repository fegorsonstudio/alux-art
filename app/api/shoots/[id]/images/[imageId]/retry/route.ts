import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id, status, expires_at, credits_reserved")
    .eq("id", id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin && shoot.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isAdmin && shoot.status === "PENDING_PAYMENT") return NextResponse.json({ error: "Payment required" }, { status: 402 });
  if (!isAdmin && shoot.expires_at && new Date(shoot.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This shoot has expired. Create a new shoot to generate more images." }, { status: 410 });
  }
  if (!isAdmin && Number(shoot.credits_reserved ?? 0) <= 0) {
    return NextResponse.json({ error: "No reserved credits are available for this shoot." }, { status: 402 });
  }

  const { data: image } = await service
    .from("shoot_images")
    .select("id, status, retry_count")
    .eq("id", imageId)
    .eq("shoot_id", id)
    .single();

  if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  if (image.status !== "FAILED") return NextResponse.json({ error: "Only failed images can be retried." }, { status: 400 });

  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("shoot_images")
    .update({
      status: "PENDING",
      stage: "Retry queued",
      provider_error: null,
      retry_count: Number(image.retry_count ?? 0) + 1,
      last_retry_at: now,
      updated_at: now,
    })
    .eq("id", imageId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await service
    .from("shoots")
    .update({ status: "QUEUED", pipeline_stage: "Retry queued", updated_at: now })
    .eq("id", id);

  const origin = new URL(request.url).origin;
  fetch(`${origin}/api/shoots/${id}/start`, {
    method: "POST",
    headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
    cache: "no-store",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
