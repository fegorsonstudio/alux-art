import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, message, source, line_number, page_path, http_status, user_agent } = body;
    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await sql`
      INSERT INTO error_logs (type, message, source, line_number, page_path, http_status, user_agent)
      VALUES (
        ${(String(type || "js_error")).slice(0, 50)},
        ${message.slice(0, 500)},
        ${source ? String(source).slice(0, 200) : null},
        ${line_number ? Number(line_number) : null},
        ${page_path ? String(page_path).slice(0, 200) : null},
        ${http_status ? Number(http_status) : null},
        ${user_agent ? String(user_agent).slice(0, 300) : null}
      )
    `;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
