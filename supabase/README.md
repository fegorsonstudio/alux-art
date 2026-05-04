# Alux Art Supabase Setup

This folder contains the production backend setup for Alux Art.

## 1. Create The Project

Create a Supabase project, then open the SQL editor and run:

```sql
-- paste the full contents of supabase/schema.sql
```

The migration creates:

- Postgres tables for profiles, identity images, shoots, references, generated images, payments, downloads, pricing, model slots, generation events, and admin audit logs.
- Row Level Security on every public table.
- Private Storage buckets for identity images, inspiration images, custom references, previews, 4K images, ZIP files, and Instagram quote images.
- Storage policies that keep files inside each user's own folder.

## 2. Enable Google Auth

In Supabase:

1. Go to `Authentication > Providers`.
2. Enable `Google`.
3. Add your Google OAuth client ID and secret.
4. Disable email/password signups if you only want Google login.
5. Add redirect URLs for local and production:

```text
http://localhost:3000/
https://your-production-domain.com/
```

## 3. Environment Variables

Set these on your host and in local `.env`:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-key
PAYSTACK_SECRET_KEY=your-paystack-secret
PAYSTACK_PUBLIC_KEY=your-paystack-public
ADMIN_EMAIL=fegorsonphotography@gmail.com
```

Only `SUPABASE_URL` and the anon key may be used in browser-facing flows. The service role key must stay server-only.

## 4. Production Notes

- Keep all buckets private.
- Use signed URLs for downloads and previews.
- Keep image generation and ZIP creation in a worker host such as Railway or Fly.io.
- The web app should trigger jobs and display progress; it should not keep a long generation request open on Vercel or Netlify.
- Do not send uploaded identity/reference images to OpenAI until the consent checkbox is enabled in the app.

## 5. Docs

- Storage RLS/access control: https://supabase.com/docs/guides/storage/security/access-control
- API/RLS security: https://supabase.com/docs/guides/api/securing-your-api
- Auth and RLS model: https://supabase.com/docs/guides/auth
