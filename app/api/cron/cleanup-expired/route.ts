import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export const maxDuration = 300;

function requireCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? process.env.INTERNAL_API_SECRET;
  if (!expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  const internal = request.headers.get("x-internal-secret") ?? "";
  return auth === `Bearer ${expected}` || internal === expected;
}

async function removeObjects(service: ReturnType<typeof createServiceClient>, bucket: string, paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    if (chunk.length > 0) await service.storage.from(bucket).remove(chunk);
  }
}

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { data: shoots, error } = await service
    .from("shoots")
    .select("id, user_id, zip_storage_bucket, zip_storage_path, shoot_images(*), shoot_references(*)")
    .not("expires_at", "is", null)
    .lte("expires_at", now)
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!shoots?.length) return NextResponse.json({ deletedShoots: 0 });

  for (const shoot of shoots) {
    const generatedPaths = (shoot.shoot_images ?? [])
      .flatMap((img: Record<string, unknown>) => [
        img.preview_storage_path,
        img.download_storage_path,
        img.instagram_storage_path,
      ])
      .filter((path): path is string => typeof path === "string");

    await removeObjects(service, "generated-4k", generatedPaths);

    if (shoot.zip_storage_bucket && shoot.zip_storage_path) {
      await removeObjects(service, shoot.zip_storage_bucket, [shoot.zip_storage_path]);
    }

    const inspirationRefs = (shoot.shoot_references ?? []).filter(
      (ref: Record<string, unknown>) => ref.storage_bucket === "inspiration-images"
    );
    const inspirationPaths = inspirationRefs
      .map((ref: Record<string, unknown>) => ref.storage_path)
      .filter((path): path is string => typeof path === "string");
    await removeObjects(service, "inspiration-images", inspirationPaths);

    if (inspirationPaths.length > 0) {
      await service
        .from("inspiration_images")
        .delete()
        .eq("user_id", shoot.user_id)
        .in("storage_path", inspirationPaths);
    }

    await service.from("shoots").delete().eq("id", shoot.id);
  }

  return NextResponse.json({ deletedShoots: shoots.length });
}
