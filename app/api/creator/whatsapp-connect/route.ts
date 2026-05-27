import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

// POST — save WhatsApp credentials
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id} LIMIT 1`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as { phoneNumberId?: string; accessToken?: string };
  const { phoneNumberId, accessToken } = body;

  if (typeof phoneNumberId !== "string" || !phoneNumberId.trim()) {
    return NextResponse.json({ error: "phoneNumberId is required" }, { status: 400 });
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  // Generate a verify token if one doesn't exist yet
  const [existing] = await sql`
    SELECT whatsapp_verify_token FROM creators WHERE id = ${creator.id}
  `;
  const verifyToken = existing?.whatsapp_verify_token ?? crypto.randomBytes(24).toString("hex");

  await sql`
    UPDATE creators SET
      whatsapp_phone_number_id = ${phoneNumberId.trim()},
      whatsapp_access_token = ${accessToken.trim()},
      whatsapp_verify_token = ${verifyToken},
      updated_at = NOW()
    WHERE id = ${creator.id}
  `;

  return NextResponse.json({
    connected: true,
    verifyToken,
    webhookUrl: `https://aluxartandframes.shop/api/webhooks/whatsapp/${creator.id}`,
  });
}

// DELETE — disconnect WhatsApp
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id} LIMIT 1`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  await sql`
    UPDATE creators SET
      whatsapp_phone_number_id = NULL,
      whatsapp_access_token = NULL,
      updated_at = NOW()
    WHERE id = ${creator.id}
  `;

  // Clean up any pending sessions
  await sql`
    DELETE FROM whatsapp_sessions
    WHERE creator_id = ${creator.id} AND state NOT IN ('COMPLETE')
  `;

  return NextResponse.json({ connected: false });
}

// GET — fetch current connection status
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`
    SELECT id, whatsapp_phone_number_id, whatsapp_verify_token
    FROM creators WHERE user_id = ${user.id} LIMIT 1
  `;
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const connected = Boolean(creator.whatsapp_phone_number_id);
  return NextResponse.json({
    connected,
    verifyToken: creator.whatsapp_verify_token ?? null,
    webhookUrl: `https://aluxartandframes.shop/api/webhooks/whatsapp/${creator.id}`,
    creatorId: creator.id,
  });
}
