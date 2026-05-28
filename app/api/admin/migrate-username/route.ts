import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("x-internal-secret");
  if (auth !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sql`ALTER TABLE creators ADD COLUMN IF NOT EXISTS username TEXT`;
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'creators_username_idx'
        ) THEN
          CREATE UNIQUE INDEX creators_username_idx ON creators (LOWER(username))
          WHERE username IS NOT NULL;
        END IF;
      END $$
    `;
    return NextResponse.json({ ok: true, message: "Migration complete" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
