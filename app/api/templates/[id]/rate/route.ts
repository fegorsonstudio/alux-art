import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as { rating?: number };
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }

  try {
    await sql`
      INSERT INTO template_ratings (template_id, user_id, rating, updated_at)
      VALUES (${templateId}, ${user.id}, ${rating}, NOW())
      ON CONFLICT (template_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
    `;
  } catch (err) {
    return NextResponse.json({ error: "Could not save rating" }, { status: 500 });
  }

  const [t] = await sql`SELECT avg_rating, rating_count FROM templates WHERE id = ${templateId}`;
  return NextResponse.json({ ok: true, avgRating: t?.avg_rating, ratingCount: t?.rating_count });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const [t] = await sql`SELECT avg_rating, rating_count FROM templates WHERE id = ${templateId}`;

  let userRating: number | null = null;
  if (user) {
    const [r] = await sql`
      SELECT rating FROM template_ratings WHERE template_id = ${templateId} AND user_id = ${user.id}
    `;
    userRating = r?.rating ?? null;
  }

  return NextResponse.json({
    avgRating: t?.avg_rating ?? null,
    ratingCount: t?.rating_count ?? 0,
    userRating,
  });
}
