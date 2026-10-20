import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, safeNext, sealSigned, siteOrigin } from "@/lib/auth-session";

/**
 * Step 1 of "Sign in with Google" (our own, replacing Supabase Auth): send the
 * browser to Google with a one-time state, a PKCE challenge and a nonce. The
 * secrets for step 2 (/api/auth/callback) ride in a signed 10-minute cookie.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = siteOrigin();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.AUTH_SECRET) {
    console.error("[auth] Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_ID / _SECRET / AUTH_SECRET)");
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const payload = Buffer.from(JSON.stringify({ s: state, v: verifier, n: nonce, next, e: Date.now() + 10 * 60_000 })).toString("base64url");
  const res = NextResponse.redirect(url.toString());
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(OAUTH_COOKIE, sealSigned(payload), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return res;
}
