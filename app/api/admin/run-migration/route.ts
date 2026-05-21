import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get("x-internal-secret");
  if (internalSecret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseToken = request.headers.get("x-supabase-token");
  if (!supabaseToken) {
    return NextResponse.json({ error: "x-supabase-token header required (Supabase personal access token)" }, { status: 400 });
  }

  const { migrationId } = await request.json().catch(() => ({})) as { migrationId?: string };
  if (!migrationId || !/^\d{3}_[\w]+$/.test(migrationId)) {
    return NextResponse.json({ error: "migrationId required (e.g. 015_template_ratings)" }, { status: 400 });
  }

  let sql: string;
  try {
    sql = readFileSync(join(process.cwd(), "migrations", `${migrationId}.sql`), "utf8");
  } catch {
    return NextResponse.json({ error: `Migration file migrations/${migrationId}.sql not found` }, { status: 404 });
  }

  const PROJECT_REF = "owdfoxglbxrqhgqbvkon";
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${supabaseToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: "Migration failed", details: body }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: body });
}
