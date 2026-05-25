import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    "https://api.paystack.co/bank?country=nigeria&use_cursor=false&perPage=100",
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      next: { revalidate: 3600 },
    }
  );

  const data = await res.json();
  if (!data.status) return NextResponse.json({ error: "Failed to fetch banks" }, { status: 502 });

  const banks = (data.data as { name: string; code: string }[]).map((b) => ({
    name: b.name,
    code: b.code,
  }));

  return NextResponse.json({ banks });
}
