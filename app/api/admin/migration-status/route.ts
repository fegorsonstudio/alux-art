import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks = await Promise.all([
    sql`SELECT note FROM template_images LIMIT 0`.then(() => true).catch(() => false),
    sql`SELECT custom_name FROM template_images LIMIT 0`.then(() => true).catch(() => false),
    sql`SELECT theme FROM creators LIMIT 0`.then(() => true).catch(() => false),
    sql`SELECT font_family FROM creators LIMIT 0`.then(() => true).catch(() => false),
    sql`SELECT note_hidden FROM template_images LIMIT 0`.then(() => true).catch(() => false),
  ]);

  const results = [
    { id: "013", name: "template_images.note", applied: checks[0] },
    { id: "016", name: "template_images.custom_name", applied: checks[1] },
    { id: "017a", name: "creators.theme", applied: checks[2] },
    { id: "017b", name: "creators.font_family", applied: checks[3] },
    { id: "018", name: "template_images.note_hidden", applied: checks[4] },
  ];

  return NextResponse.json({ allApplied: results.every((r) => r.applied), results });
}
