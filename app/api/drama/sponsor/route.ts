import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { DramaError, startSponsorPayment } from "@/lib/drama/payments";

/** POST { slug, format, brandName, contactName, phone, note } → { done, sponsorshipId } or { url }. Signed-in only. */
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const out = await startSponsorPayment({
      slug: String(b.slug ?? ""), format: String(b.format ?? "carousel"),
      brandName: String(b.brandName ?? ""), contactName: String(b.contactName ?? ""), phone: String(b.phone ?? ""), note: String(b.note ?? ""),
      who: { id: user.id, email: user.email, admin: isAdminEmail(user.email) },
    });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DramaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[drama sponsor]", (e as Error).message);
    return NextResponse.json({ error: "Could not start the payment. Try again in a minute." }, { status: 500 });
  }
}
