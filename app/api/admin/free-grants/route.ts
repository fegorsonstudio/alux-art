import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

// Admin comps: credit an email address N free images. Keyed by EMAIL rather than
// user id so a grant can be issued to someone who has not signed up yet — they
// pick it up automatically the first time they book with that address.

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grants = await sql`
    SELECT g.*,
           (g.images_granted - g.images_used) AS images_remaining,
           (SELECT COUNT(*)::int FROM free_bookings b WHERE b.grant_id = g.id) AS bookings_count
    FROM free_grants g
    ORDER BY g.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ grants });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;
  const { email, images, note, expiresAt } = body;

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!Number.isInteger(images) || (images as number) < 1 || (images as number) > 100) {
    return NextResponse.json({ error: "Images must be a whole number between 1 and 100" }, { status: 400 });
  }

  // The admin picks a DATE ("2026-07-28"), which Postgres reads as midnight at the
  // START of that day — so choosing today produced a grant that had already expired
  // hours before it was created, and the buyer was still asked to pay. An expiry
  // date means "usable through the end of that day", so push it to 23:59:59.999Z.
  let expiry: string | null = null;
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const raw = expiresAt.trim();
    expiry = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw;
    const parsed = new Date(expiry);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Expiry date is not a valid date" }, { status: 400 });
    }
    if (parsed <= new Date()) {
      return NextResponse.json(
        { error: "That expiry date has already passed, so the credit would be unusable. Pick a later date or leave it blank for no expiry." },
        { status: 400 }
      );
    }
  }

  try {
    const [grant] = await sql`
      INSERT INTO free_grants (email, images_granted, note, granted_by, expires_at)
      VALUES (
        ${email.trim().toLowerCase()},
        ${images as number},
        ${typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null},
        ${admin.email ?? null},
        ${expiry}
      ) RETURNING *, (images_granted - images_used) AS images_remaining
    `;
    return NextResponse.json({ grant }, { status: 201 });
  } catch (err) {
    console.error("[admin/free-grants] create failed:", err);
    return NextResponse.json({ error: "Failed to create grant" }, { status: 500 });
  }
}
