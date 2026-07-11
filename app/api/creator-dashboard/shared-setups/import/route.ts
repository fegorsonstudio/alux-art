import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Copy } from "@/lib/r2";

// POST: import a community setup into the CURRENT creator's own storage
// prefix. Copies the object rather than pointing at the original — see
// lib/shared-setups.ts for why. Returns the new storagePath/storageBucket for
// the client to drop straight into the template draft it's editing, same
// return shape as a normal upload.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const setupId = typeof body.id === "string" ? body.id : "";
  if (!setupId) return NextResponse.json({ error: "Missing setup id" }, { status: 400 });

  const [setup] = await sql`SELECT storage_path, storage_bucket, name FROM shared_setups WHERE id = ${setupId}`;
  if (!setup) return NextResponse.json({ error: "Setup not found" }, { status: 404 });

  const ext = (setup.storage_path as string).split(".").pop()?.slice(0, 8) || "jpg";
  const toPath = `${user.id}/imported/${crypto.randomUUID()}.${ext}`;
  const toBucket = "template-images";

  try {
    await r2Copy(setup.storage_bucket ?? "template-images", setup.storage_path as string, toBucket, toPath);
  } catch (err) {
    console.error("[shared-setups import]", err);
    return NextResponse.json({ error: "Failed to import setup" }, { status: 500 });
  }

  return NextResponse.json({ storagePath: toPath, storageBucket: toBucket, name: setup.name });
}
