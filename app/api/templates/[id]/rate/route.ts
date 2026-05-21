import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as { rating?: number };
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }

  const service = createServiceClient();

  // Upsert: one rating per user per template
  const { error } = await service
    .from("template_ratings")
    .upsert(
      { template_id: templateId, user_id: session.user.id, rating, updated_at: new Date().toISOString() },
      { onConflict: "template_id,user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return updated avg
  const { data: t } = await service
    .from("templates")
    .select("avg_rating, rating_count")
    .eq("id", templateId)
    .single();

  return NextResponse.json({ ok: true, avgRating: t?.avg_rating, ratingCount: t?.rating_count });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const service = createServiceClient();
  const { data: t } = await service
    .from("templates")
    .select("avg_rating, rating_count")
    .eq("id", templateId)
    .single();

  let userRating: number | null = null;
  if (session?.user) {
    const { data: r } = await service
      .from("template_ratings")
      .select("rating")
      .eq("template_id", templateId)
      .eq("user_id", session.user.id)
      .single();
    userRating = r?.rating ?? null;
  }

  return NextResponse.json({
    avgRating: t?.avg_rating ?? null,
    ratingCount: t?.rating_count ?? 0,
    userRating,
  });
}
