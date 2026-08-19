import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { notifyRetouchReady } from "@/lib/retouch-ready-email";

/**
 * Send the "your retouched images are ready" email for a shoot.
 *
 * Split out from the upload script because the email template is TypeScript and
 * the script is a plain .mjs — rather than keep two copies of the same HTML in
 * step, the script calls this. Same `x-internal-secret` convention already used
 * by the gift claim and base-lock approval paths.
 *
 * Also reachable by an admin session, which is what makes a bounced email
 * re-sendable without re-uploading anything.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const secret = process.env.INTERNAL_API_SECRET;
  const presented = request.headers.get("x-internal-secret");
  let authorised = Boolean(secret && presented && presented === secret);

  if (!authorised) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    authorised = isAdminEmail(user?.email);
  }
  if (!authorised) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [order] = await sql<{ image_count: number; price_ngn: number; free: boolean }[]>`
    SELECT image_count, price_ngn, free FROM shoot_retouch WHERE shoot_id = ${id}`;
  if (!order) return NextResponse.json({ error: "No retouch on this shoot" }, { status: 404 });

  const sent = await notifyRetouchReady({
    shootId: id,
    imageCount: order.image_count,
    priceNgn: order.price_ngn,
    free: order.free,
  });

  return NextResponse.json({ sent }, { status: sent ? 200 : 502 });
}
