import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import sql from "@/lib/db";
import { handleIncomingMessage } from "@/lib/whatsapp-bot";

interface WaEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { phone_number_id: string };
      messages?: Array<{
        from: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string };
        audio?: { id: string };
        document?: { id: string };
      }>;
    };
    field: string;
  }>;
}

interface WaWebhookBody {
  object: string;
  entry: WaEntry[];
}

// GET — Meta webhook verification
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  const { creatorId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Look up the creator's verify token
  const [creator] = await sql`
    SELECT id, whatsapp_verify_token FROM creators
    WHERE id = ${creatorId} AND whatsapp_verify_token IS NOT NULL
    LIMIT 1
  `;

  if (!creator || creator.whatsapp_verify_token !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

// POST — Receive incoming messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  const { creatorId } = await params;

  const rawBody = await request.text();

  // Verify Meta signature
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(rawBody) as WaWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored" });
  }

  // Load creator with WhatsApp credentials
  const [creator] = await sql`
    SELECT id, whatsapp_phone_number_id, whatsapp_access_token
    FROM creators
    WHERE id = ${creatorId}
      AND whatsapp_phone_number_id IS NOT NULL
      AND whatsapp_access_token IS NOT NULL
    LIMIT 1
  `;

  if (!creator) {
    return NextResponse.json({ error: "Creator not configured" }, { status: 404 });
  }

  // Process each message entry — fire-and-forget to avoid Meta timeout
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      for (const msg of change.value.messages ?? []) {
        handleIncomingMessage(
          creatorId,
          creator as { id: string; whatsapp_phone_number_id: string; whatsapp_access_token: string },
          msg.from,
          msg.type,
          msg.text?.body ?? null,
          msg.image?.id ?? null
        ).catch(err => console.error("[whatsapp webhook] handleIncomingMessage error:", err));
      }
    }
  }

  // Always respond 200 quickly so Meta doesn't retry
  return NextResponse.json({ status: "ok" });
}
