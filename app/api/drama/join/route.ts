import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { DramaError, startCastPayment } from "@/lib/drama/payments";

/** POST { slug, role, displayName, photoPath } → { done: true } or { url } (Paystack checkout). Signed-in only. */
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const out = await startCastPayment({
      slug: String(b.slug ?? ""), roleKey: String(b.role ?? ""), displayName: String(b.displayName ?? ""),
      photoPath: String(b.photoPath ?? ""), who: { id: user.id, email: user.email, admin: isAdminEmail(user.email) },
    });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DramaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[drama join]", (e as Error).message);
    return NextResponse.json({ error: "Could not start the payment. Try again in a minute." }, { status: 500 });
  }
}
