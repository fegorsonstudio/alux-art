import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = "owdfoxglbxrqhgqbvkon.supabase.co";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse(null, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new NextResponse(null, { status: res.status });
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
