-- Our own sign-in, replacing Supabase Auth (owner: "remove it from Supabase").
-- auth_users keeps the SAME ids Supabase gave every account, so profiles,
-- shoots, wallets and purchases need no change. Sessions are random ids held in
-- a signed cookie; only their SHA-256 is stored here.
-- Apply on the VPS with:  psql "$DATABASE_URL" -f migrations/080_own_auth.sql
CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  google_sub text UNIQUE,
  full_name text,
  avatar_url text,
  source text NOT NULL DEFAULT 'google',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_idx ON auth_users (lower(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
