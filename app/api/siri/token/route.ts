import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { generateToken, hashToken } from "@/lib/shortcut-token";

const MAX_TOKENS_PER_USER = 5;

// POST /api/siri/token
// Generates a new shortcut token for the signed-in user.
// The raw token is returned ONCE and never stored — only the SHA-256 hash is kept.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { label?: unknown };
  const label =
    typeof body.label === "string"
      ? body.label.trim().slice(0, 60) || "My Shortcut"
      : "My Shortcut";

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS n FROM shortcut_tokens WHERE user_id = ${user.id}
  `;
  if ((countRow.n as number) >= MAX_TOKENS_PER_USER) {
    return NextResponse.json(
      { error: `Maximum ${MAX_TOKENS_PER_USER} tokens allowed. Revoke an existing one first.` },
      { status: 422 }
    );
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  await sql`
    INSERT INTO shortcut_tokens (user_id, token_hash, label, created_at)
    VALUES (${user.id}, ${tokenHash}, ${label}, ${now})
  `;

  return NextResponse.json({ token: rawToken, label });
}

// GET /api/siri/token
// Lists tokens for the signed-in user. Raw token values are never returned.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokens = await sql`
    SELECT id, label, last_used_at, expires_at, created_at
    FROM shortcut_tokens
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ tokens });
}
