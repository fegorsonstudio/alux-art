import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import sql from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-edge";

/**
 * Our own sign-in (replaces Supabase Auth, 2026-10-20). Who is an admin stays in lib/auth.ts. Google OAuth runs in
 * /api/auth/google → /api/auth/callback; the result is a session:
 *
 *   cookie  aa_session = <random id>.<HMAC of it with AUTH_SECRET>
 *   table   auth_sessions keyed by SHA-256(random id), so a database copy holds no usable session
 *
 * The middleware checks only the signature (lib/auth-edge.ts, no database);
 * every server check (`currentUser`) also checks the row, so signing out ends
 * the session everywhere. Sessions last 180 days from last use.
 */

export { SESSION_COOKIE };
export const OAUTH_COOKIE = "aa_oauth";
const SESSION_DAYS = 180;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 3600;

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { full_name?: string; avatar_url?: string; [key: string]: unknown };
};

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short");
  return s;
}

/** Signature used by both this file and the middleware (lib/auth-edge.ts): HMAC-SHA256 over "v1:" + value. */
export function signValue(value: string): string {
  return createHmac("sha256", secret()).update(`v1:${value}`).digest("base64url");
}

/** "<value>.<sig>" → value when the signature is right, else null. */
export function openSigned(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(signValue(value));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return value;
}

export const sealSigned = (value: string) => `${value}.${signValue(value)}`;

/** The public address Google sends people back to (must match the OAuth client exactly). */
export const siteOrigin = () =>
  (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://aluxartandframes.shop").replace(/\/$/, "");

/** Only a path on this site, never another site ("//evil") — anything else goes to the studio. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/studio";
  return next.slice(0, 500);
}

const hashOf = (sid: string) => createHash("sha256").update(sid).digest("hex");

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/** Starts a session for a user; returns the cookie value to set. */
export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const sid = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO auth_sessions (id_hash, user_id, expires_at, user_agent)
    VALUES (${hashOf(sid)}, ${userId}, NOW() + make_interval(days => ${SESSION_DAYS}), ${userAgent?.slice(0, 300) ?? null})`;
  return sealSigned(sid);
}

/** Ends the session named by a cookie value (sign-out). */
export async function endSession(raw: string | undefined | null): Promise<void> {
  const sid = openSigned(raw);
  if (!sid) return;
  await sql`UPDATE auth_sessions SET revoked_at = NOW() WHERE id_hash = ${hashOf(sid)} AND revoked_at IS NULL`;
}

/**
 * The signed-in person for this request, or null. Same shape the app read from
 * Supabase (`id`, `email`, `user_metadata.full_name`), so its ~110 callers did
 * not change. Renews the session at most once a day.
 */
export async function currentUser(): Promise<AuthUser | null> {
  let store: Awaited<ReturnType<typeof cookies>>;
  try { store = await cookies(); } catch { return null; }
  const raw = store.get(SESSION_COOKIE)?.value;
  const sid = openSigned(raw);
  if (!sid) return null;
  const [row] = await sql<{
    id: string; email: string; full_name: string | null; avatar_url: string | null;
    meta: Record<string, unknown> | null; stale: boolean;
  }[]>`
    SELECT u.id, u.email, u.full_name, u.avatar_url, u.meta,
           s.last_seen_at < NOW() - interval '1 day' AS stale
    FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
    WHERE s.id_hash = ${hashOf(sid)} AND s.revoked_at IS NULL AND s.expires_at > NOW()`;
  if (!row) {
    // Signed but ended or expired: drop the cookie so the login page is reachable again.
    try { store.delete(SESSION_COOKIE); } catch { /* read-only here (server component) */ }
    return null;
  }
  if (row.stale) {
    await sql`
      UPDATE auth_sessions SET last_seen_at = NOW(), expires_at = NOW() + make_interval(days => ${SESSION_DAYS})
      WHERE id_hash = ${hashOf(sid)}`.catch(() => {});
    try { store.set(SESSION_COOKIE, raw as string, sessionCookieOptions()); } catch { /* read-only here */ }
  }
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  return {
    id: row.id,
    email: row.email,
    user_metadata: {
      ...meta,
      ...(row.full_name ? { full_name: row.full_name } : {}),
      ...(row.avatar_url ? { avatar_url: row.avatar_url } : {}),
    },
  };
}

/**
 * Finds the account for a Google sign-in: by Google's account id, then by
 * email (every account moved from Supabase keeps its id), else a new one.
 */
export async function userForGoogle(g: { sub: string; email: string; name: string | null; picture: string | null }): Promise<{ id: string; email: string }> {
  const email = g.email.trim();
  for (let attempt = 0; attempt < 2; attempt++) {
    const [bySub] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM auth_users WHERE google_sub = ${g.sub}`;
    const [byEmail] = bySub ? [] : await sql<{ id: string; email: string }[]>`
      SELECT id, email FROM auth_users WHERE lower(email) = lower(${email})`;
    const found = bySub ?? byEmail;
    if (found) {
      await sql`
        UPDATE auth_users SET
          google_sub = COALESCE(google_sub, ${g.sub}),
          full_name = COALESCE(${g.name}, full_name),
          avatar_url = COALESCE(${g.picture}, avatar_url),
          last_sign_in_at = NOW()
        WHERE id = ${found.id}`;
      return found;
    }
    // A profile with no account row (not expected after the move): keep its id.
    const [profile] = await sql<{ id: string }[]>`SELECT id FROM profiles WHERE lower(email) = lower(${email}) LIMIT 1`;
    const [made] = await sql<{ id: string; email: string }[]>`
      INSERT INTO auth_users (id, email, google_sub, full_name, avatar_url, source, last_sign_in_at)
      VALUES (${profile?.id ?? randomUUID()}, ${email}, ${g.sub}, ${g.name}, ${g.picture}, 'google', NOW())
      ON CONFLICT DO NOTHING RETURNING id, email`;
    if (made) return made;
    // Lost a race with a second tab signing in at the same moment: read it again.
  }
  throw new Error("could not find or create the account");
}

/** An account for a chat customer (WhatsApp / Instagram); same id if the email already has one. */
export async function createChatUser(email: string, meta: Record<string, unknown>): Promise<{ id: string; email: string }> {
  const source = typeof meta.source === "string" ? meta.source : "chat";
  const [made] = await sql<{ id: string; email: string }[]>`
    INSERT INTO auth_users (email, source, meta)
    VALUES (${email}, ${source}, ${sql.json(meta as never)})
    ON CONFLICT DO NOTHING RETURNING id, email`;
  if (made) return made;
  const [existing] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM auth_users WHERE lower(email) = lower(${email})`;
  if (!existing) throw new Error("account insert conflicted but no row was found");
  return existing;
}
