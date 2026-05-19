import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ isCreator: false });

  const service = createServiceClient();
  const { data } = await service
    .from("creators")
    .select("id")
    .eq("user_id", session.user.id)
    .limit(1)
    .single();

  return NextResponse.json({ isCreator: Boolean(data) });
}
