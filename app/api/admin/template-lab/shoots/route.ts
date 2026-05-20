import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();

  // Fetch shoots that have at least one prompt-only slot
  const { data: slots } = await service
    .from("shoot_images")
    .select("shoot_id")
    .eq("provider", "prompt-only")
    .eq("status", "COMPLETE");

  const shootIds = [...new Set((slots ?? []).map((s: { shoot_id: string }) => s.shoot_id))];
  if (shootIds.length === 0) return NextResponse.json({ shoots: [] });

  const { data: shoots } = await service
    .from("shoots")
    .select("id, created_at, mode, aspect_ratio, package_size, shoot_images(id, slot, prompt, provider, status)")
    .in("id", shootIds)
    .order("created_at", { ascending: false });

  // Sign reference images for each shoot
  const result = await Promise.all((shoots ?? []).map(async (shoot: Record<string, unknown>) => {
    const { data: refs } = await service
      .from("shoot_references")
      .select("id, purpose, tag, storage_bucket, storage_path")
      .eq("shoot_id", shoot.id as string)
      .neq("purpose", "identity");

    const signedRefs = await Promise.all((refs ?? []).map(async (ref: Record<string, unknown>) => {
      const { data } = await service.storage
        .from(ref.storage_bucket as string)
        .createSignedUrl(ref.storage_path as string, 3600);
      return { id: ref.id, purpose: ref.purpose, tag: ref.tag, signedUrl: data?.signedUrl ?? null };
    }));

    return { ...shoot, refs: signedRefs };
  }));

  return NextResponse.json({ shoots: result });
}
