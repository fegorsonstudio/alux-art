import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createHmac } from "crypto";
import { normalizePackageSize } from "@/lib/types";

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
  const now = new Date().toISOString();

  const { data: existingPayment } = await service
    .from("payments")
    .select("id, status, user_id, shoot_id")
    .eq("provider_reference", reference)
    .single();

  if (existingPayment?.status === "success") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id, package_size, credits_required, expires_at")
    .eq("id", shoot_id)
    .single();

  const ownerId = shoot?.user_id ?? user_id;
  const credits = Number(metadata?.credits ?? shoot?.credits_required ?? normalizePackageSize(metadata?.package_size ?? shoot?.package_size));

  // Update payment record
  await service.from("payments").update({
    status: "success",
    paid_at: now,
    metadata: event.data,
  }).eq("provider_reference", reference);

  if (ownerId && credits > 0) {
    const { data: balance } = await service
      .from("credit_balances")
      .select("credits_balance")
      .eq("user_id", ownerId)
      .single();
    const currentBalance = Number(balance?.credits_balance ?? 0);

    await service.from("credit_balances").upsert({
      user_id: ownerId,
      credits_balance: currentBalance + credits,
      updated_at: now,
    });

    await service.from("credit_transactions").insert([
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        shoot_id,
        amount: credits,
        reason: "purchase",
        provider: "paystack",
        provider_reference: reference,
        metadata: { currency, amount, package_size: metadata?.package_size ?? shoot?.package_size ?? credits },
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        user_id: ownerId,
        shoot_id,
        amount: -credits,
        reason: "shoot_reserve",
        provider: "paystack",
        provider_reference: reference,
        metadata: { reserved_for_retry: true },
        created_at: now,
      },
    ]);
  }

  // Queue the shoot
  await service.from("shoots").update({
    status: "QUEUED",
    credits_reserved: credits,
    expires_at: shoot?.expires_at ?? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }).eq("id", shoot_id);

  // Log revenue
  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id,
    user_id: ownerId,
    type: "payment_confirmed",
    payload: { reference, amount, currency },
    created_at: now,
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
