import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { DramaError, startPlacementPayment } from "@/lib/drama/payments";

/** POST { slug, episode, slot, brandName, contactName, phone, productPath, note } → { done } or { url }. Signed-in only. */
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const out = await startPlacementPayment({
      slug: String(b.slug ?? ""), episodeN: Number(b.episode), slotKey: String(b.slot ?? ""),
      brandName: String(b.brandName ?? ""), contactName: String(b.contactName ?? ""), phone: String(b.phone ?? ""),
      productPath: String(b.productPath ?? ""), note: String(b.note ?? ""),
      who: { id: user.id, email: user.email, admin: isAdminEmail(user.email) },
    });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DramaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[drama reserve]", (e as Error).message);
    return NextResponse.json({ error: "Could not start the payment. Try again in a minute." }, { status: 500 });
  }
}
