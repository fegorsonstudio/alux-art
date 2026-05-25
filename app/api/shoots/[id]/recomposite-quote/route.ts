import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { compositeQuoteCard } from "@/lib/generate";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const [shoot] = await sql`
    SELECT id, user_id, quote, package_size, aspect_ratio, shoot_brief, status
    FROM shoots WHERE id = ${id}
  `;

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(shoot.quote as { text?: string } | null)?.text) {
    return NextResponse.json({ error: "Shoot has no quote" }, { status: 400 });
  }

  const quoteSlot = shoot.package_size as number;
  const [slotRow] = await sql`
    SELECT id, status, preview_storage_path, preview_storage_bucket
    FROM shoot_images WHERE shoot_id = ${id} AND slot = ${quoteSlot}
  `;

  if (!slotRow?.preview_storage_path) {
    return NextResponse.json({ error: "Quote slot not found or no image stored" }, { status: 404 });
  }

  let svgLayoutInstructions: string | undefined;
  try {
    const brief = typeof shoot.shoot_brief === "string"
      ? JSON.parse(shoot.shoot_brief as string)
      : shoot.shoot_brief;
    const prompts = brief?.prompts;
    if (Array.isArray(prompts)) {
      const quotePromptObj = prompts.find((p: { prompt_index: number }) => p.prompt_index === quoteSlot);
      svgLayoutInstructions = quotePromptObj?.svg_layout_instructions ?? undefined;
    }
  } catch { /* non-fatal */ }

  const basePath = (slotRow.preview_storage_path as string).replace(/-c\.png$/i, ".png");
  const bucket = (slotRow.preview_storage_bucket as string) ?? "generated-4k";

  let compositePath: string | null = null;
  try {
    compositePath = await compositeQuoteCard(
      {
        id: shoot.id as string,
        user_id: shoot.user_id as string,
        quote: shoot.quote as { text: string; attribution?: string },
        package_size: shoot.package_size as number,
        aspect_ratio: shoot.aspect_ratio as string,
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

  await sql`
    UPDATE shoot_images SET
      preview_storage_path = ${compositePath}, preview_storage_bucket = ${bucket},
      download_storage_path = ${compositePath}, download_storage_bucket = ${bucket},
      updated_at = NOW()
    WHERE id = ${slotRow.id}
  `;

  return NextResponse.json({ ok: true, slot: quoteSlot, compositePath });
}
