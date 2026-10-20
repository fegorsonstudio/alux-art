import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, endSession } from "@/lib/auth-session";

export async function POST() {
  const cookieStore = await cookies();
  // End the session in the database (so the cookie is dead even if a copy survives).
  await endSession(cookieStore.get(SESSION_COOKIE)?.value).catch((err) => console.error("[auth signout]", err));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  // Also clear any cookies left from the old Supabase sign-in.
  cookieStore.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  });

  return res;
}
