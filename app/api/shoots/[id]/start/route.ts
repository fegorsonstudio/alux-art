import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { normalizePackageSize } from "@/lib/types";

export const maxDuration = 30;

type ShootReference = {
  purpose: string;
  tag?: string | null;
  custom_name?: string | null;
  note?: string | null;
  name: string;
  storage_bucket: string;
  storage_path: string;
};

async function signReferences(
  service: ReturnType<typeof createServiceClient>,
  references: ShootReference[]
) {
  return Promise.all(references.map(async (ref) => {
    const { data } = await service.storage
      .from(ref.storage_bucket)
      .createSignedUrl(ref.storage_path, 60 * 60);
    return {
      purpose: ref.purpose,
      tag: ref.tag,
      customName: ref.custom_name,
      note: ref.note,
      name: ref.name,
      url: data?.signedUrl,
    };
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal = internalSecret && internalSecret === process.env.INTERNAL_API_SECRET;
  const service = createServiceClient();
  let requesterEmail = "";

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requesterEmail = user.email ?? "";

    const { data: ownerCheck } = await service
      .from("shoots")
      .select("user_id, status")
      .eq("id", id)
      .single();

    const isOwner = ownerCheck?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && ownerCheck?.status === "PENDING_PAYMENT") {
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
    }
  } else {
    const { data: ownerCheck } = await service
      .from("shoots")
      .select("status")
      .eq("id", id)
      .single();
    if (ownerCheck?.status === "PENDING_PAYMENT") {
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
    }
  }

  const { data: shoot, error: shootError } = await service
    .from("shoots")
    .select("*, shoot_images(*), shoot_references(*)")
    .eq("id", id)
    .single();
  if (shootError || !shoot) return NextResponse.json({ error: shootError?.message ?? "Shoot not found" }, { status: 404 });

  if (shoot.status === "PROCESSING") {
    return NextResponse.json({ ok: true, queued: false, status: "PROCESSING" });
  }
  if (shoot.status === "COMPLETE") {
    return NextResponse.json({ ok: true, queued: false, status: "COMPLETE" });
  }

  const n8nUrl = process.env.N8N_WEBHOOK_URL ?? process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
  if (!n8nUrl) return NextResponse.json({ error: "N8N_WEBHOOK_URL is not configured" }, { status: 500 });

  const now = new Date().toISOString();
  const { data: claimedShoot, error: claimError } = await service
    .from("shoots")
    .update({
      status: "PROCESSING",
      progress: 5,
      pipeline_stage: "Sent to n8n workflow",
      updated_at: now,
    })
    .eq("id", id)
    .in("status", ["QUEUED", "FAILED"])
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimedShoot) {
    return NextResponse.json({ ok: true, queued: false, status: shoot.status });
  }

  const references = await signReferences(service, (shoot.shoot_references ?? []) as ShootReference[]);
  const imageCount = normalizePackageSize(shoot.package_size);
  const callbackOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  await service
    .from("shoot_images")
    .update({ status: "QUEUED", stage: "Queued in n8n", updated_at: now })
    .eq("shoot_id", id)
    .in("status", ["PENDING", "FAILED"]);

  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id: id,
    user_id: shoot.user_id,
    type: "stage",
    payload: { stage: "Sent to n8n workflow", progress: 5 },
    created_at: now,
  });

  try {
    const response = await fetch(n8nUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INTERNAL_API_SECRET ? { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` } : {}),
      },
      body: JSON.stringify({
        shoot_id: id,
        shootId: id,
        user_id: shoot.user_id,
        owner_email: shoot.owner_email,
        requested_by: requesterEmail,
        mode: shoot.mode,
        aspect_ratio: shoot.aspect_ratio,
        currency: shoot.currency,
        package_size: imageCount,
        image_count: imageCount,
        quote: shoot.quote,
        callback_url: `${callbackOrigin}/api/webhooks/n8n-images`,
        callback_secret: process.env.INTERNAL_API_SECRET,
        references,
        identity_images: references.filter((ref) => ref.purpose === "identity"),
        inspiration_images: references.filter((ref) => ref.purpose === "inspiration"),
        tagged_references: references.filter((ref) => ref.purpose === "tagged"),
      }),
    });
    if (!response.ok) throw new Error(`n8n webhook failed: ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] n8n trigger failed:", message);

    await service
      .from("shoots")
      .update({
        status: "FAILED",
        pipeline_stage: `n8n trigger failed: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, queued: true, provider: "n8n" });
}
