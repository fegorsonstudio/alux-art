import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { compositeQuoteCard } from "@/lib/generate";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id, quote, package_size, aspect_ratio, shoot_brief, status")
    .eq("id", id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!shoot.quote?.text) {
    return NextResponse.json({ error: "Shoot has no quote" }, { status: 400 });
  }

  const quoteSlot = shoot.package_size as number;
  const { data: slotRow } = await service
    .from("shoot_images")
    .select("id, status, preview_storage_path, preview_storage_bucket")
    .eq("shoot_id", id)
    .eq("slot", quoteSlot)
    .maybeSingle();

  if (!slotRow?.preview_storage_path) {
    return NextResponse.json({ error: "Quote slot not found or no image stored" }, { status: 404 });
  }

  let svgLayoutInstructions: string | undefined;
  try {
    const brief = typeof shoot.shoot_brief === "string"
      ? JSON.parse(shoot.shoot_brief)
      : shoot.shoot_brief;
    const prompts = brief?.prompts;
    if (Array.isArray(prompts)) {
      const quotePromptObj = prompts.find((p: { prompt_index: number }) => p.prompt_index === quoteSlot);
      svgLayoutInstructions = quotePromptObj?.svg_layout_instructions ?? undefined;
    }
  } catch { /* non-fatal */ }

  // Use the base storage path (strip any previous -c suffix so we always start from the fal.ai image)
  const basePath = (slotRow.preview_storage_path as string).replace(/-c\.png$/i, ".png");
  const bucket = (slotRow.preview_storage_bucket as string) ?? "generated-4k";

  let compositePath: string | null = null;
  try {
    compositePath = await compositeQuoteCard(
      service,
      {
        id: shoot.id,
        user_id: shoot.user_id,
        quote: shoot.quote as { text: string; attribution?: string },
        package_size: shoot.package_size,
        aspect_ratio: shoot.aspect_ratio,
      },
      basePath,
      bucket,
      svgLayoutInstructions
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Composite failed: ${msg}` }, { status: 500 });
  }

  if (!compositePath) {
    return NextResponse.json({ error: "Composite returned no path (no portrait available?)" }, { status: 500 });
  }

  // Update shoot_images to point to the new composite path
  await service
    .from("shoot_images")
    .update({
      preview_storage_path: compositePath,
      preview_storage_bucket: bucket,
      download_storage_path: compositePath,
      download_storage_bucket: bucket,
      updated_at: new Date().toISOString(),
    })
    .eq("id", slotRow.id);

  return NextResponse.json({ ok: true, slot: quoteSlot, compositePath });
}
