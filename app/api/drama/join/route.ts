import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { DramaError, startCastPayment } from "@/lib/drama/payments";

/** POST { slug, role, displayName, photos: [{ kind: face|angle|body, path }] } → { done: true, castId } or { url } (Paystack checkout). Signed-in only. */
export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 3).map((p) => ({
    kind: String((p as Record<string, unknown>)?.kind ?? ""), path: String((p as Record<string, unknown>)?.path ?? ""),
  }));
  try {
    const out = await startCastPayment({
      slug: String(b.slug ?? ""), roleKey: String(b.role ?? ""), displayName: String(b.displayName ?? ""),
      photos, who: { id: user.id, email: user.email, admin: isAdminEmail(user.email) },
    });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DramaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[drama join]", (e as Error).message);
    return NextResponse.json({ error: "Could not start the payment. Try again in a minute." }, { status: 500 });
  }
}
