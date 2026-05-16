import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import { notifyShootComplete } from "@/lib/n8n";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal =
    internalSecret && internalSecret === process.env.INTERNAL_API_SECRET;
  const service = createServiceClient();

  if (!isInternal) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: ownerCheck } = await service
      .from("shoots")
      .select("user_id, status")
      .eq("id", id)
      .single();

    const isOwner = ownerCheck?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
  } else {
    const { data: ownerCheck } = await service
      .from("shoots")
      .select("status")
      .eq("id", id)
      .single();
    if (ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
  }

  const { data: shoot } = await service
    .from("shoots")
    .select("status, user_id")
    .eq("id", id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.status === "COMPLETE")
    return NextResponse.json({ ok: true, queued: false, status: "COMPLETE" });

  const now = new Date().toISOString();

  // Claim the shoot only if it isn't already PROCESSING (continuation skips this)
  if (shoot.status !== "PROCESSING") {
    const { data: claimed, error: claimError } = await service
      .from("shoots")
      .update({
        status: "PROCESSING",
        progress: 5,
        pipeline_stage: "Starting generation",
        updated_at: now,
      })
      .eq("id", id)
      .in("status", ["QUEUED", "FAILED"])
      .select("id")
      .maybeSingle();

    if (claimError)
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    if (!claimed)
      return NextResponse.json({ ok: true, queued: false, status: shoot.status });

    // Mark all pending/failed slots as QUEUED so the worker can pick them up
    await service
      .from("shoot_images")
      .update({ status: "QUEUED", stage: "Queued for generation", updated_at: now })
      .eq("shoot_id", id)
      .in("status", ["PENDING", "FAILED"]);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: id,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Starting generation", progress: 5 },
      created_at: now,
    });
  }

  try {
    const result = await startGenerationWorker(id, { maxSlots: 1 });

    if (!result.done) {
      // Self-continuation: fire next slot in a new invocation (fire-and-forget)
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${id}/start`, {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        },
      }).catch((err) =>
        console.error("[start] self-continuation failed:", err)
      );
    } else {
      // All slots done — notify n8n for email (fire-and-forget)
      notifyShootComplete(id).catch(() => {});
    }

    return NextResponse.json({ ok: true, provider: "vercel-fal", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] generation worker failed:", message);

    await service
      .from("shoots")
      .update({
        status: "FAILED",
        pipeline_stage: `Generation failed: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
