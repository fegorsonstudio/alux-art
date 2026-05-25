import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Explicitly clear all Supabase auth cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const res = NextResponse.json({ ok: true });
  allCookies.forEach(({ name }) => {
    if (name.startsWith("sb-")) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  });

  return res;
}
