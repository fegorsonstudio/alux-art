import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Accept internal calls (from webhook) or authenticated owner/admin calls
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal = internalSecret && internalSecret === process.env.INTERNAL_API_SECRET;
  const service = createServiceClient();

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: shoot } = await service
      .from("shoots")
      .select("user_id, status, expires_at, credits_reserved")
      .eq("id", id)
      .single();

    const isOwner = shoot?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && shoot?.status === "PENDING_PAYMENT") return NextResponse.json({ error: "Payment required" }, { status: 402 });
    if (!isAdmin && shoot?.expires_at && new Date(shoot.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This shoot has expired. Create a new shoot to generate more images." }, { status: 410 });
    }
  } else {
    const { data: shoot } = await service
      .from("shoots")
      .select("status, expires_at")
      .eq("id", id)
      .single();
    if (shoot?.status === "PENDING_PAYMENT") return NextResponse.json({ error: "Payment required" }, { status: 402 });
    if (shoot?.expires_at && new Date(shoot.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This shoot has expired." }, { status: 410 });
    }
  }

  let result;
  try {
    result = await startGenerationWorker(id, { maxSlots: 1 });
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

  if (!result.done && process.env.INTERNAL_API_SECRET) {
    const origin = new URL(req.url).origin;
    fetch(`${origin}/api/shoots/${id}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
      cache: "no-store",
    }).catch((error) => console.error("[start] continuation failed:", error));
  }

  return NextResponse.json({ ok: true, ...result });
}
