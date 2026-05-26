import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [shoot] = await sql`
    SELECT identity_profile, shoot_brief, status, owner_email, mode, package_size, created_at
    FROM shoots WHERE id = ${id}
  `;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slots = await sql`
    SELECT slot, kind, status, prompt
    FROM shoot_images
    WHERE shoot_id = ${id}
    ORDER BY slot ASC
  `;

  let shootBrief: unknown = null;
  if (typeof shoot.shoot_brief === "string" && shoot.shoot_brief.trim().startsWith("{")) {
    try { shootBrief = JSON.parse(shoot.shoot_brief); } catch { /* leave null */ }
  } else if (shoot.shoot_brief) {
    shootBrief = shoot.shoot_brief;
  }

  return NextResponse.json({
    shoot_id: id,
    owner_email: shoot.owner_email,
    status: shoot.status,
    mode: shoot.mode,
    package_size: shoot.package_size,
    created_at: shoot.created_at,
    identity_profile: shoot.identity_profile ?? "",
    shoot_brief: shootBrief,
    slots: slots.map((s) => ({
      slot: s.slot,
      kind: s.kind,
      status: s.status,
      prompt: s.prompt ?? null,
    })),
  });
}
