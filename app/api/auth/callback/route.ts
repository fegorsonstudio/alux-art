import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import {
  OAUTH_COOKIE, SESSION_COOKIE, createSession, openSigned, safeNext, sessionCookieOptions, siteOrigin, userForGoogle,
} from "@/lib/auth-session";

/**
 * Step 2 of "Sign in with Google" (our own since 2026-10-20; Supabase Auth was
 * removed). Google sends the browser here with a one-time code; we check the
 * state against the signed cookie from /api/auth/google, swap the code (with
 * the PKCE verifier and our client secret) for Google's ID token, and start a
 * session. Accounts moved from Supabase keep their ids, so every order, wallet
 * and template stays with the person.
 */

export const dynamic = "force-dynamic";

type Claims = { iss?: string; aud?: string; exp?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean | string; name?: string; picture?: string };

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: NextRequest) {
  const origin = siteOrigin();
  const sp = request.nextUrl.searchParams;
  const fail = (why: string) => {
    console.error("[auth callback] sign-in failed:", why);
    const r = NextResponse.redirect(`${origin}/login?error=auth_failed`);
    r.headers.set("Cache-Control", "no-store");
    r.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return r;
  };

  if (sp.get("error")) return fail(`Google said ${sp.get("error")}`);
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return fail("no code/state");

  const sealed = openSigned(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!sealed) return fail("missing or forged state cookie");
  let saved: { s: string; v: string; n: string; next: string; e: number };
  try { saved = JSON.parse(Buffer.from(sealed, "base64url").toString("utf8")); } catch { return fail("unreadable state cookie"); }
  if (!saved?.s || !same(saved.s, state)) return fail("state mismatch");
  if (!(saved.e > Date.now())) return fail("sign-in took longer than 10 minutes");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${origin}/api/auth/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.v,
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!tokenRes) return fail("could not reach Google");
  const tok = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!tokenRes.ok || !tok.id_token) return fail(`token exchange: HTTP ${tokenRes.status} ${tok.error ?? ""}`);

  // The token came straight from Google over TLS with our secret, so its
  // signature need not be re-checked (OpenID Connect Core 3.1.3.7); the claims are.
  let c: Claims;
  try { c = JSON.parse(Buffer.from(tok.id_token.split(".")[1] ?? "", "base64url").toString("utf8")); } catch { return fail("unreadable ID token"); }
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return fail("wrong issuer");
  if (c.aud !== clientId) return fail("token is for another app");
  if (!c.exp || c.exp * 1000 < Date.now()) return fail("token expired");
  if (!c.nonce || !same(c.nonce, saved.n)) return fail("nonce mismatch");
  if (!c.sub || !c.email || !(c.email_verified === true || c.email_verified === "true")) return fail("no verified email");

  let user: { id: string; email: string };
  try {
    user = await userForGoogle({ sub: c.sub, email: c.email, name: c.name ?? null, picture: c.picture ?? null });
  } catch (err) {
    return fail(`account lookup: ${(err as Error).message}`);
  }

  const displayName = c.name || user.email;
  await sql`
    INSERT INTO profiles (id, email, display_name, updated_at)
    VALUES (${user.id}, ${user.email}, ${displayName}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = CASE WHEN profiles.display_name IS NULL OR profiles.display_name = ''
        THEN EXCLUDED.display_name ELSE profiles.display_name END,
      updated_at = NOW()
  `.catch((err) => console.error("[auth callback] profile upsert failed:", err));

  // Build the redirect response up front and write the session cookie directly onto it.
  // Setting cookies via next/headers and returning a separate redirect is unreliable on
  // Safari/iOS (session sometimes doesn't stick → "sign in twice"). Writing it onto the
  // exact response we return guarantees the Set-Cookie rides the redirect.
  const response = NextResponse.redirect(`${origin}${safeNext(saved.next)}`);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(SESSION_COOKIE, await createSession(user.id, request.headers.get("user-agent")), sessionCookieOptions());
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return response;
}
