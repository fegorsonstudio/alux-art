import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";
import { isSharedSetupKind, sanitizeSetupName } from "@/lib/shared-setups";

// GET: list every published community setup (any authenticated creator can browse).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const rows = await sql`
    SELECT s.id, s.kind, s.name, s.storage_path, s.storage_bucket, s.created_at,
           s.creator_id, c.display_name AS creator_name
    FROM shared_setups s
    JOIN creators c ON c.id = s.creator_id
    ORDER BY s.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({
    setups: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      imageUrl: r2ProxyUrl(r.storage_bucket ?? "template-images", r.storage_path as string),
      creatorName: r.creator_name,
      isMine: r.creator_id === creator.id,
      createdAt: r.created_at,
    })),
  });
}

// POST: publish a plate the creator already has configured on one of their own
// templates. Ownership is proven the same way every other sanitizer in this
// app proves it — the storage path must live under the creator's own
// ${user.id}/ prefix, which only the owning creator could ever have gotten
// into a template config in the first place.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  if (!isSharedSetupKind(kind)) return NextResponse.json({ error: "Invalid setup kind" }, { status: 400 });

  const name = sanitizeSetupName(body.name);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!storagePath || !storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }
  const storageBucket = typeof body.storageBucket === "string" && body.storageBucket ? body.storageBucket : "template-images";

  const [row] = await sql`
    INSERT INTO shared_setups (creator_id, kind, name, storage_path, storage_bucket)
    VALUES (${creator.id}, ${kind}, ${name}, ${storagePath}, ${storageBucket})
    RETURNING id
  `.catch((err) => { console.error("[shared-setups POST]", err); return [null]; });

  if (!row) return NextResponse.json({ error: "Failed to publish setup" }, { status: 500 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
