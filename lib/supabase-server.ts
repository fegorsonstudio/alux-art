import { createChatUser, currentUser, type AuthUser } from "@/lib/auth-session";

/*
 * Supabase was removed on 2026-10-20 (owner: it kept charging). This file keeps
 * the two call shapes the app was written against, so its ~110 callers did not
 * change, but nothing here talks to Supabase:
 *   createClient().auth.getUser()                  → our own session (lib/auth-session.ts)
 *   createServiceClient().auth.admin.createUser()  → a row in our auth_users table
 *   createServiceClient().storage.from().download() → "not found" (every file now
 *     lives in R2, which each caller tries first; Supabase Storage is gone)
 */

type AuthError = { message: string };

export async function createClient() {
  return {
    auth: {
      async getUser(): Promise<
        { data: { user: AuthUser }; error: null } | { data: { user: null }; error: AuthError }
      > {
        const user = await currentUser();
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "Auth session missing!" } };
      },
    },
  };
}

export function createServiceClient() {
  return {
    auth: {
      admin: {
        async createUser(input: {
          email: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        }): Promise<{ data: { user: { id: string; email: string } | null }; error: AuthError | null }> {
          try {
            const user = await createChatUser(input.email, input.user_metadata ?? {});
            return { data: { user }, error: null };
          } catch (err) {
            return { data: { user: null }, error: { message: (err as Error).message } };
          }
        },
      },
    },
    storage: {
      from(_bucket: string) {
        return {
          async download(_path: string): Promise<{ data: Blob | null; error: AuthError | null }> {
            return { data: null, error: { message: "Supabase Storage was retired; the file is not in R2" } };
          },
        };
      },
    },
  };
}
