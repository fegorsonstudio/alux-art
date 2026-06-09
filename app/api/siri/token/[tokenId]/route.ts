import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

// DELETE /api/siri/token/[tokenId]
// Revokes a token. The token must belong to the signed-in user.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tokenId } = await params;

  const result = await sql`
    DELETE FROM shortcut_tokens
    WHERE id = ${tokenId} AND user_id = ${user.id}
    RETURNING id
  `;

  if (result.length === 0) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
