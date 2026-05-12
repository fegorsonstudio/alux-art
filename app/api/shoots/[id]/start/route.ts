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

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceClient();
    const { data: shoot } = await service
      .from("shoots")
      .select("user_id")
      .eq("id", id)
      .single();

    const isOwner = shoot?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let result;
  try {
    result = await startGenerationWorker(id, { maxSlots: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] generation worker failed:", message);

    const service = createServiceClient();
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
