// Enables Google OAuth provider in Supabase Auth settings via Management API
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "owdfoxglbxrqhgqbvkon";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://virtual-photo-studio-rho.vercel.app";
const siteOrigin = SITE_URL.replace(/\/$/, "");
const REDIRECT_URLS = Array.from(new Set([
  "http://localhost:3000/api/auth/callback",
  "https://virtual-photo-studio-rho.vercel.app/api/auth/callback",
  "https://aluxartandframes.shop/api/auth/callback",
  `${siteOrigin}/api/auth/callback`,
]));

if (!PAT) {
  console.error("SUPABASE_ACCESS_TOKEN is required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/setup-auth.mjs`.");
  process.exit(1);
}

// First, fetch current auth config to preserve existing settings
const getRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${PAT}` },
});
const current = await getRes.json();

if (!getRes.ok) {
  console.error("Failed to fetch auth config:", current);
  process.exit(1);
}

// Patch: enable Google provider + set site URL
const patchRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${PAT}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    external_google_enabled: true,
    site_url: siteOrigin,
    additional_redirect_urls: REDIRECT_URLS,
  }),
});

const result = await patchRes.json();
if (!patchRes.ok) {
  console.error("Failed to update auth config:", result);
  process.exit(1);
}

console.log("✓ Google OAuth enabled");
console.log("✓ Site URL set to https://aluxartandframes.shop");
console.log("✓ Redirect URLs configured");
console.log(`
⚠  IMPORTANT: Google OAuth still needs a Client ID + Secret.
   1. Go to: https://console.cloud.google.com/apis/credentials
   2. Create an OAuth 2.0 Client ID (Web application)
   3. Add authorized redirect URI:
      https://owdfoxglbxrqhgqbvkon.supabase.co/auth/v1/callback
   4. Paste Client ID + Secret at:
      https://supabase.com/dashboard/project/owdfoxglbxrqhgqbvkon/auth/providers
`);
