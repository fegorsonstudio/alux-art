/*
 * Browser side of sign-in. Supabase was removed on 2026-10-20; this keeps the
 * calls the login and studio pages make, routed to our own sign-in:
 *   auth.signInWithOAuth() → /api/auth/google (Google, then /api/auth/callback)
 *   auth.signOut()         → POST /api/auth/signout
 *   auth.setSession()      → old Supabase magic links no longer work
 */

type AuthError = { message: string };

export function createClient() {
  return {
    auth: {
      async signInWithOAuth(args: { provider: "google"; options?: { redirectTo?: string } }): Promise<{ error: AuthError | null }> {
        let next = "/studio";
        try {
          const back = new URL(args.options?.redirectTo ?? "", location.origin);
          next = back.searchParams.get("next") ?? next;
        } catch { /* keep the studio */ }
        location.assign(`/api/auth/google?next=${encodeURIComponent(next)}`);
        return { error: null };
      },
      async signOut(): Promise<{ error: AuthError | null }> {
        try {
          await fetch("/api/auth/signout", { method: "POST" });
          return { error: null };
        } catch (err) {
          return { error: { message: (err as Error).message } };
        }
      },
      async setSession(_tokens: { access_token: string; refresh_token: string }): Promise<{ error: AuthError }> {
        return { error: { message: "this sign-in link has expired. Please sign in with Google." } };
      },
    },
  };
}
