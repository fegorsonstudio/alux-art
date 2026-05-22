import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  const checks = await Promise.all([
    service.from("template_images").select("custom_name").limit(0).then(r => !r.error),
    service.from("creators").select("theme").limit(0).then(r => !r.error),
    service.from("creators").select("font_family").limit(0).then(r => !r.error),
  ]);

  const results = [
    { id: "016", name: "template_images.custom_name", applied: checks[0] },
    { id: "017a", name: "creators.theme", applied: checks[1] },
    { id: "017b", name: "creators.font_family", applied: checks[2] },
  ];

  return NextResponse.json({
    allApplied: results.every(r => r.applied),
    results,
  });
}
