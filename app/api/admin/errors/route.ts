import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter = req.nextUrl.searchParams.get("filter") ?? "unresolved";

  let errors;
  if (filter === "resolved") {
    errors = await sql`
      SELECT
        type, message, source,
        COUNT(*)::int AS count,
        MAX(created_at) AS last_seen,
        MIN(created_at) AS first_seen,
        true AS resolved,
        array_agg(DISTINCT page_path) FILTER (WHERE page_path IS NOT NULL) AS pages
      FROM error_logs
      WHERE resolved = true
      GROUP BY type, message, source
      ORDER BY count DESC, last_seen DESC
      LIMIT 100
    `;
  } else if (filter === "all") {
    errors = await sql`
      SELECT
        type, message, source,
        COUNT(*)::int AS count,
        MAX(created_at) AS last_seen,
        MIN(created_at) AS first_seen,
        bool_and(resolved) AS resolved,
        array_agg(DISTINCT page_path) FILTER (WHERE page_path IS NOT NULL) AS pages
      FROM error_logs
      GROUP BY type, message, source
      ORDER BY count DESC, last_seen DESC
      LIMIT 100
    `;
  } else {
    errors = await sql`
      SELECT
        type, message, source,
        COUNT(*)::int AS count,
        MAX(created_at) AS last_seen,
        MIN(created_at) AS first_seen,
        false AS resolved,
        array_agg(DISTINCT page_path) FILTER (WHERE page_path IS NOT NULL) AS pages
      FROM error_logs
      WHERE resolved = false
      GROUP BY type, message, source
      ORDER BY count DESC, last_seen DESC
      LIMIT 100
    `;
  }

  const [{ n: total_unresolved }] = await sql`
    SELECT COUNT(*)::int AS n FROM error_logs WHERE resolved = false
  `;

  return NextResponse.json({ errors, total_unresolved });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, message, source } = await req.json();
  if (!message || !type) {
    return NextResponse.json({ error: "type and message required" }, { status: 400 });
  }

  if (source) {
    await sql`
      UPDATE error_logs SET resolved = true
      WHERE type = ${type} AND message = ${message} AND source = ${source}
    `;
  } else {
    await sql`
      UPDATE error_logs SET resolved = true
      WHERE type = ${type} AND message = ${message} AND source IS NULL
    `;
  }

  return NextResponse.json({ ok: true });
}
