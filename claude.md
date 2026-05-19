# Virtual Photo Studio Factory - Project Source of Truth

## Active AI Handoff Status

**Current state:** Production app is stable after upload persistence, gallery fetch, Claude fallback, and provider-error visibility fixes.

**Current focus:** Improving the Vision and Prompt Orchestration Agent rules for fast and advanced shoot modes.

**Latest major rules update:** Advanced mode now supports layered tagged references. Prompt generation must use explicit reference roles, preserve/change blocks, and a structured Scene / Subject / Important Details / Use Case / Constraints template.

---

## AI Collaboration Protocol

Since multiple AI agents operate on this project:

1. Always read this file first to get the latest architectural and rule context.
2. Update the Active AI Handoff Status before ending a substantial session.
3. Use Git as the bridge. All successful fixes must be committed.
4. Never commit secrets or `.env.local`.

---

## Tech Stack

| Layer      | Technology                         |
|------------|------------------------------------|
| Logic      | n8n cloud                          |
| AI Engine  | fal.ai primary, Gemini fallback    |
| Prompting  | Claude via Anthropic API           |
| Frontend   | Next.js App Router, TypeScript     |
| Storage    | Supabase Storage                   |
| Database   | Supabase Postgres                  |
| Payments   | Paystack                           |
| Deployment | Vercel                             |

---

## Identity Lock Rule

For every generation request:

- Preserve the same individual, not just a similar demographic.
- Maintain face shape, eye spacing, nose shape, lips, jawline, skin tone, hairline, body build, and recognizable likeness.
- Style, wardrobe, lighting, setting, pose, and camera angle may change only according to shoot rules.
- Never alter core facial structure, eye spacing, nose shape, or jawline.

For ComfyUI / fal.ai workflows:

- Must prioritize facial features from the provided identity reference.
- Must include an `IPAdapterFaceID` or `InstantIDModelLoader` node in every workflow JSON payload.
- `studio.py` raises `ValueError` if no matching identity-preservation node is found.

Example injection point:

```json
{
  "class_type": "IPAdapterFaceID",
  "inputs": {
    "image": "<REFERENCE_IMAGE_URL>"
  }
}
```

`studio.py` searches nodes for `class_type` containing `IPAdapter` or `InstantID` and replaces `inputs.image` with the provided reference URL.

---

## Preserve vs Change Rule

Every final image prompt must clearly state both:

- what must be preserved
- what may be changed

Preserve:

- identity from identity references
- locked wardrobe source
- tag-specific advanced overrides
- requested camera/lighting/art direction

Change:

- pose
- camera angle
- expression
- scene composition
- background only when directed by inspiration or `[BACKGROUND]`
- lighting only when directed by inspiration or `[LIGHTING]`

Do not rely on natural language assumptions. The prompt must explicitly separate identity, wardrobe, environment, lighting, pose, and constraints.

---

## Identity Images Are Identity-Only

Identity reference images must be used only for:

- facial identity
- skin tone
- body build
- stable biometric likeness

Identity reference images must not control:

- outfit
- logos
- accessories
- background
- lighting
- pose
- camera angle
- styling

Identity-image clothing is incidental capture context. It must not bleed into generated images.

Wardrobe priority:

1. Advanced `[OUTFIT]` tagged reference, if present.
2. Inspiration outfit, if no `[OUTFIT]` reference exists.
3. Neutral fallback wardrobe only if no usable outfit reference exists.

---

## Fast Mode Rules

Fast mode requires:

- at least 3 identity images
- at least 1 inspiration image

Fast mode behavior:

- identity images control likeness only
- inspiration image controls base outfit, mood, lighting, background, palette, and creative direction
- generated portrait slots must keep the inspiration outfit consistent
- shot-to-shot variation should come from pose, expression, lens feel, camera angle, lighting variation, and composition

---

## Advanced Mode Rules

Advanced mode is Fast Mode plus tagged reference overrides.

Tag categories:

```text
[OUTFIT]       Replace outfit in inspiration with this reference.
[HAIRSTYLE]    Apply this hair reference to the character.
[MAKEUP]       Apply this makeup or beauty look.
[BACKGROUND]   Use this environment or backdrop reference.
[LIGHTING]     Match this lighting setup.
[ACCESSORY]    Add these accessories.
[COLOR_GRADE]  Apply this film/edit style.
```

Layer priority:

1. Safety/policy constraints.
2. Identity lock.
3. Advanced tagged overrides.
4. Base inspiration art direction.
5. Shot-specific pose/composition.
6. Photographic realism/style.
7. Negative constraints.

Tagged references override only their category. If a reference is tagged `[BACKGROUND]`, extract only environment/backdrop information and ignore clothing, face, hairstyle, makeup, accessories, and lighting unless separately tagged.

`[OUTFIT]` replaces the outfit extracted from inspiration. It must be kept consistent across all portrait slots.

The orchestration agent must reconcile all tagged references with the inspiration image and locked identity profile into a final JSON shoot brief before image generation begins.

---

## Structured Final Prompt Template

Final image generation prompts must use this structure:

```text
Scene: [lighting, background, environment, shot setup]
Subject: [identity, body language, pose]
Important Details: [wardrobe source, textures, lens feel, color balance, tag overrides]
Use Case: [editorial photography / fashion portrait / quote background / mood still-life]
Constraints: [preserve rules, negative constraints]
```

Avoid conversational filler. Use concrete photographic terms.

Preferred realism language:

- realistic skin texture
- subtle film grain
- physically plausible light direction
- natural asymmetry
- realistic fabric folds
- editorial lens feel
- shallow depth of field when appropriate
- documentary or studio photograph

Avoid hype words:

- stunning
- beautiful
- masterpiece
- epic
- insane detail
- ultra-detailed
- award-winning

---

## Security Rules

- All API keys live only in `.env.local` or deployment provider env vars.
- Never hardcode or commit secrets.
- Server-side keys must never reach the browser.
- Public keys may use `NEXT_PUBLIC_` only when intended for client-side use.
- `lib/paystack.ts` is server-side only.

---

## File Structure

```text
claude apps/
├── claude.md
├── .env.local
├── app/
├── lib/
│   ├── generate.ts
│   ├── n8n.ts
│   ├── paystack.ts
│   ├── supabase.ts
│   └── supabase-server.ts
├── agents/
│   └── prompt_rules_agent/
├── public/
├── studio.py
└── package.json
```
You are working on the Alux Art / Virtual Photo Studio Next.js app.

Repo:
C:\Users\FUJITSU\Documents\claude apps

Live app:
https://virtual-photo-studio-rho.vercel.app

Current branch:
codex/complete-photo-studio-fixes

Latest important commits:
- ca5027d Add package credits and retryable shoot retention
- 9b10fa1 Bypass middleware for API routes

Context:
The app uses Next.js App Router, Supabase, Paystack, Fal.ai, and Vercel. The app serverless worker is now the primary image-generation engine. n8n is only fallback/secondary.

Recently implemented:
- 5-image and 10-image package selection.
- Package pricing updates by currency.
- Payment-confirmed shoot queuing through Paystack webhook.
- Credit reservation tables for paid shoot retries.
- One serverless request per image slot through `/api/shoots/[id]/start`.
- Failed image retry endpoint: `/api/shoots/[id]/images/[imageId]/retry`.
- 48-hour retention cleanup route: `/api/cron/cleanup-expired`.
- Partial ZIP downloads for completed images.
- Middleware bypass for `/api/*` to fix Vercel `MIDDLEWARE_INVOCATION_TIMEOUT`.

Supabase migration has already been applied to project:
owdfoxglbxrqhgqbvkon

Production deploy has already been done:
https://virtual-photo-studio-rho.vercel.app

Main issue from previous testing:
Tester originally hit `504 GATEWAY_TIMEOUT` with `MIDDLEWARE_INVOCATION_TIMEOUT` on `/api/shoots`. This was fixed in `middleware.ts` by excluding `/api/*` from middleware.

Your job:
Do a senior code review and live workflow test. Focus on bugs, race conditions, broken auth/payment assumptions, image-generation reliability, and production readiness.

Review these files closely:
- middleware.ts
- app/api/shoots/route.ts
- app/api/shoots/[id]/start/route.ts
- app/api/shoots/[id]/pay/route.ts
- app/api/webhooks/paystack/route.ts
- app/api/shoots/[id]/images/[imageId]/retry/route.ts
- app/api/shoots/[id]/download-zip/route.ts
- app/api/cron/cleanup-expired/route.ts
- lib/generate.ts
- scripts/migrate.mjs
- app/page.tsx

Code review checklist:
1. Confirm `/api/*` really bypasses middleware.
2. Confirm unpaid shoots cannot start generation.
3. Confirm Paystack webhook is idempotent and cannot double-credit/double-queue.
4. Confirm package size controls slot count correctly: 5 package = 5 slots, 10 package = 10 slots.
5. Confirm admin bypass does not require payment but still creates the selected slot count.
6. Confirm failed image retry only works for the owner/admin, only on failed slots, and only before expiry.
7. Confirm generation worker processes one slot per request and does not restart many slots in one request.
8. Confirm partial ZIP downloads work when only some images are complete.
9. Confirm expired shoots no longer expose signed download URLs.
10. Confirm cleanup route deletes generated images, ZIPs, and inspiration references after 48 hours.
11. Confirm no fal.ai/fal.media URLs leak to the frontend after generation.
12. Confirm no secrets are committed or exposed in logs.
13. Confirm Supabase RLS and service-role use are acceptable.
14. Confirm the UI handles failed generations clearly and lets the user retry per failed image.
15. Confirm image prompts strongly preserve identity from uploaded identity references.

Live test checklist:
1. Log in as admin.
2. Confirm package selector shows 5 and 10 images.
3. Confirm NGN/USD price changes correctly.
4. Create an admin free 5-image shoot.
5. Confirm exactly 5 slots are created.
6. Watch generation and confirm only one slot is active at a time.
7. Refresh during generation and confirm no 504 timeout.
8. If a slot fails, click retry and confirm only that slot restarts.
9. Download completed individual images.
10. Try ZIP download once at least one image completes.
11. Check browser network tab for fal.ai/fal.media leaks.
12. Record console and network errors.

Return your report in this format:

Findings:
- [Severity] File/route:
  Problem:
  Why it matters:
  Suggested fix:

Live Test Results:
- Login:
- Package pricing:
- Shoot creation:
- Slot count:
- Generation:
- Refresh stability:
- Retry:
- Downloads:
- Fal URL leakage:
- Console/network errors:

Final recommendation:
- Ship / do not ship:
- Required fixes before next test:
