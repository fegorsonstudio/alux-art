import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { castAction, castView, replacePhotos, type PhotoKind } from "@/lib/drama/character";

/**
 * A cast member's own character: GET → the view; POST { action: "accept" | "redo" }
 * or { action: "photos", photos: [{ kind, path }] } for the ones that failed the check.
 * Signed-in, and only the member themselves (or an admin).
 */
export const dynamic = "force-dynamic";

async function viewer() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user ? { id: user.id, admin: isAdminEmail(user.email) } : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await viewer();
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const view = await castView((await params).id, who);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await viewer();
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = (await params).id;
  const view = await castView(id, who);
  if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let result = "unchanged";
  if (b.action === "accept" || b.action === "redo") result = await castAction(id, b.action);
  else if (b.action === "photos" && Array.isArray(b.photos)) {
    const photos = b.photos.slice(0, 3).map((p) => ({
      kind: String((p as Record<string, unknown>)?.kind ?? "") as PhotoKind, path: String((p as Record<string, unknown>)?.path ?? ""),
    }));
    result = await replacePhotos(id, who.id, photos);
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (result === "unchanged") return NextResponse.json({ error: "That has already moved on — refresh the page." }, { status: 409 });
  return NextResponse.json({ ok: true, status: result });
}
