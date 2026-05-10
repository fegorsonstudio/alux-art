import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createHmac } from "crypto";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";

  // HMAC-SHA512 verification
  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  const { metadata, reference, amount, currency } = event.data;
  const { shoot_id, user_id } = metadata ?? {};
  if (!shoot_id) return NextResponse.json({ ok: true });

  const service = createServiceClient();

  // Update payment record
  await service.from("payments").update({
    status: "success",
    paid_at: new Date().toISOString(),
    metadata: event.data,
  }).eq("provider_reference", reference);

  // Queue the shoot
  await service.from("shoots").update({
    status: "QUEUED",
    updated_at: new Date().toISOString(),
  }).eq("id", shoot_id);

  // Log revenue
  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id,
    user_id,
    type: "payment_confirmed",
    payload: { reference, amount, currency },
    created_at: new Date().toISOString(),
  });

  // Fire-and-forget to start endpoint — runs in its own 300s Vercel function context
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "";
  fetch(`${proto}://${host}/api/shoots/${shoot_id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
