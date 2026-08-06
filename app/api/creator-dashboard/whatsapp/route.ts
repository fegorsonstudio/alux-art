import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

/**
 * Connect or disconnect a creator's own WhatsApp Business number.
 *
 * Meta requires Tech Provider status and App Review before one app may manage
 * another business's WhatsApp account, so there is no one-click signup here
 * yet. Instead a creator sets up their own WhatsApp Business Account and pastes
 * the two values it gives them. When Tech Provider is approved this route stays
 * as it is and embedded signup writes the same columns.
 *
 * GET  — connection status. Never returns the token.
 * POST — { phoneNumberId, accessToken } to connect, or { disconnect: true }.
 */

export const dynamic = "force-dynamic";

async function creatorFor(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [creator] = await sql<{ id: string; whatsapp_phone_number_id: string | null }[]>`
    SELECT id, whatsapp_phone_number_id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return { error: NextResponse.json({ error: "Not a creator" }, { status: 403 }) };
  return { creator };
}

export async function GET(req: NextRequest) {
  const { creator, error } = await creatorFor(req);
  if (error) return error;

  const [row] = await sql<{ phone_number_id: string | null; connected: boolean; sessions: number }[]>`
    SELECT c.whatsapp_phone_number_id AS phone_number_id,
           (c.whatsapp_access_token IS NOT NULL) AS connected,
           (SELECT COUNT(*)::int FROM whatsapp_sessions s WHERE s.creator_id = c.id) AS sessions
    FROM creators c WHERE c.id = ${creator!.id}`;

  return NextResponse.json({
    connected: row?.connected ?? false,
    phoneNumberId: row?.phone_number_id ?? null,
    conversations: row?.sessions ?? 0,
    webhookUrl: "https://aluxartandframes.shop/api/webhooks/whatsapp",
  });
}

export async function POST(req: NextRequest) {
  const { creator, error } = await creatorFor(req);
  if (error) return error;

  const body = await req.json().catch(() => ({})) as {
    phoneNumberId?: string; accessToken?: string; disconnect?: boolean;
  };

  if (body.disconnect) {
    await sql`
      UPDATE creators
      SET whatsapp_phone_number_id = NULL, whatsapp_access_token = NULL, updated_at = NOW()
      WHERE id = ${creator!.id}`;
    return NextResponse.json({ ok: true, connected: false });
  }

  const phoneNumberId = (body.phoneNumberId ?? "").trim();
  const accessToken = (body.accessToken ?? "").trim();

  if (!/^\d{10,20}$/.test(phoneNumberId)) {
    return NextResponse.json(
      { error: "The phone number ID should be the numeric ID from Meta, not the phone number itself." },
      { status: 400 }
    );
  }
  if (accessToken.length < 50) {
    return NextResponse.json({ error: "That access token looks too short to be valid." }, { status: 400 });
  }

  // One number can only belong to one creator: the webhook routes by
  // phone_number_id, so a duplicate would silently deliver another creator's
  // customers into this inbox.
  const [taken] = await sql<{ id: string }[]>`
    SELECT id FROM creators WHERE whatsapp_phone_number_id = ${phoneNumberId} AND id <> ${creator!.id}`;
  if (taken) {
    return NextResponse.json({ error: "That WhatsApp number is already connected to another account." }, { status: 409 });
  }

  // Prove the credentials work before storing them, so a typo fails here rather
  // than silently swallowing every customer message later.
  const check = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then((r) => r.json()).catch((e) => ({ error: { message: String(e) } }));

  if (check?.error) {
    return NextResponse.json(
      { error: `Meta rejected those details: ${check.error.error_user_msg || check.error.message}` },
      { status: 400 }
    );
  }

  await sql`
    UPDATE creators
    SET whatsapp_phone_number_id = ${phoneNumberId},
        whatsapp_access_token = ${accessToken},
        updated_at = NOW()
    WHERE id = ${creator!.id}`;

  return NextResponse.json({
    ok: true,
    connected: true,
    number: check.display_phone_number ?? null,
    name: check.verified_name ?? null,
  });
}
