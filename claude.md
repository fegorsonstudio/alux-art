# Virtual Photo Studio Factory - Project Source of Truth

## Active AI Handoff Status

**Current state (2026-08-06):** Production stable. Session covered five things:

1. **Retention cleanup built** — `/api/cron/cleanup-expired` never existed; an hourly cron
   had been hitting a 404 for weeks, so nothing was ever deleted. Now 7-day retention,
   daily 03:15 UTC. First run removed 315 objects. **NEVER sweep `shoot_references`** —
   730 of its rows point into `template-images` (creators' published assets) and 201 files
   are shared between shoots. See `migrations/` and the route's header comment.
2. **A shoot where every image failed now reports FAILED**, not COMPLETE at 100%.
   8 historical rows corrected; rollback list at `/home/aluxart/relabel-rollback.json`.
3. **Studio pagination** — buyers could only reach their most recent 20 shoots; the API
   always returned a cursor and the page threw it away.
4. **Instagram comment→DM working.** Two separate faults: the callback URL was blank in
   *API setup with Instagram login → step 3* (NOT the generic Webhooks page), and
   `IG_APP_SECRET` was the wrong secret. Posts now stagger 11:00/15:00/19:00 Lagos, one
   account per slot. Note: a DM containing a link is refused while an account is under a
   link restriction (error 508/2534122) — each keyword has a `replyNoLink` fallback.
5. **WhatsApp booking bot — code complete, not yet live.** See below.

**WhatsApp bot:** every creator connects their own number; one webhook routes by
`phone_number_id`. Conversation is a state machine in `whatsapp_sessions`
(IDLE → CHOOSING_TEMPLATE → COLLECTING_PHOTOS → CONFIRMING → AWAITING_PAYMENT →
GENERATING → DONE). Booking and payment go through the existing marketplace route, which
now accepts an internal server call (`x-internal-secret` + `x-act-as-user`) alongside the
browser session — users resolve from `profiles`, **not `auth.users`, which does not exist
in this database**. Delivery is a poller (`/api/whatsapp/deliver`, cron every 2 min), kept
out of `lib/generate.ts` on purpose.

**Blocked on the owner:** nothing runs until a WhatsApp Business number is connected —
needs a dedicated number, a WhatsApp Business Account and Meta business verification
(CAC certificate for Nigeria, 3–10 days). Per-creator means *each* creator does all of
that; a house number would work with the same code.

**Current focus:** connect a first WhatsApp number and run one booking end to end before
opening it to customers.

**Update (2026-08-20): the WhatsApp bot is LIVE and taking real customers.** Number
+234 907 685 8017, verified "Alux Art", CONNECTED. Since going live:

- **Delivery is gated on `shoots.wa_delivered_at`, never on the session.** A session
  outlives any one booking, and a stale `whatsapp_sessions.delivered_at` made a paying
  customer's *second* shoot permanently invisible to the poller. A new shoot row starts
  NULL, so any path attaching a booking to an existing chat is correct by construction.
  **Do not reintroduce a session-level delivery flag.**
- **`scripts/whatsapp-watchdog.mjs`** (cron `*/10`) alerts on Telegram when a paid
  customer is finished but untold, generation stalls, a paid shoot fails, or the delivery
  cron dies. Alerts fire once per shoot and only for the last 24h.
- **`support` in chat** answers from the database, delivers undelivered photos on the
  spot, records to `whatsapp_support_requests`, and alerts the studio. Replying to that
  Telegram message relays into the customer's WhatsApp (24h window checked first).
- **Retouching round-trip** works through Telegram: buyer replies `retouch`, files reach
  the owner, the edited file comes back, buyer pays via Paystack, then the file is sent.
  Telegram files are **uploaded**, not linked — its URL fetch limit is 20MB and a 4K
  render exceeds it.

**Update (2026-10-05): Carousel Studio + 132 written posts.** `tools/carousel/` is a
laptop app (double-click `start-carousel.cmd`, gitignored — it holds the internal
secret) that renders carousels locally and schedules them to the VPS
(`/api/carousel/schedule` + `/api/cron/publish-carousel`). Posts live in
`plan.mjs` + `plan-newyear.mjs` (main 88, **pinned to start 2026-10-05** — holiday
posts are date-specific) and `plan-microdrama.mjs` (44-episode "Photo Wahala"
experiment, removable whole; its Remove button calls the new
`DELETE /api/carousel/schedule`, deployed and verified live). Copy rules are in
`tools/carousel/COPY-FORMULA.md`. **Every "Comment WORD" must be a keyword in
`lib/instagram-keywords.ts` — there is no SHOOT.** STUDIO now replies with the
Gear Equalizer (₦1,000/image, the owner's call); the full shoot moved to the new
BOOK keyword. Owner reviews posts at
https://claude.ai/artifact/R93UHmFzGM5QBnrF7JwaQW (decisions stored in its
`reviews` collection).

**Update (2026-10-06): story GIFs + publisher fixes; a live refund bug awaits OK.**
Every draft has a story GIF (`tools/carousel/gif-scripts.mjs`, made by
`POST /api/carousel/gif`, table `carousel_gifs`; upload to GIPHY only with the
consent tick, once per post). Publisher fixed: claims only `queued`, sets aside
posts stuck mid-publish, uses the first working Instagram token (renewed
`tokens.json` first); studio sends only `NN.jpg` slides and times as `+01:00`.
**VPS `_migrations` stops at 051 — never run migrate-vps.mjs; `psql -f` new
migrations.** **Fixed 2026-10-06 (owner OK, proven by one real run):** per-image
orders were normalised to 1/5/10 and refunded a phantom "shortfall" — ₦15,700 across
8 fully delivered orders since 23 Aug; `lib/generate.ts` now counts the booked rows
for `photo_upgrade`/`asset_extract`. The DM bot (`lib/instagram.ts`) now uses the
token Instagram last accepted (renewed first). GIPHY Brand channel is connected.
**Story pictures:** each Photo Wahala episode has 2 Flow-made pictures
(`tools/carousel/storyboard.mjs`: cast + 88 prompts); posts need **Approve** before
scheduling. Next on the roadmap: the studio on the website, then the two-tier customer
product — `~/.claude/plans/i-am-building-an-polymorphic-koala.md`.

**Update (2026-10-06, later): the studio is ON THE WEBSITE; the laptop app is retired.**
`/admin/carousel` (admin only) over table `carousel_posts` (migration 070, applied with
psql), loaded from the `tools/carousel` plan files by `scripts/carousel-seed.mjs`
(re-runnable; never overwrites the owner's edits, photos, hand-set dates or approvals).
Routes `/api/admin/carousel/*`; slides drawn by `lib/carousel/render.ts` (text MEASURED
by drawing it, in Outfit). Approval is tied to the previewed content version
(`updated_at` moves only when something on a slide changes); editing a scheduled post
withdraws it; nothing can resend a post Instagram already has. Scheduling writes
`scheduled_carousels` directly; GIFs still go through `/api/carousel/gif`, called on
localhost. Removed: `tools/carousel/server.mjs`, `ui.html`, `slides.mjs`,
`start-carousel.cmd`, and `/api/carousel/schedule` (it re-queued ANY row, published
included). Verified with 36 end-to-end checks on the server (test post dated 2027, no
GIPHY upload) and a browser pass. **Fonts:** Outfit + the emoji no-digits rule live in
`deploy/fonts`; run `deploy/install-fonts.sh` after any rebuild. Outfit has no ₦ — it
falls back to DejaVu. **Payments:** 55 never-paid marketplace bookings closed as
`abandoned` (gateway-checked); `scripts/paystack-reconcile.mjs` now checks marketplace
bookings on Paystack and Flutterwave every 10 minutes; the Flutterwave webhook's
`ON CONFLICT` was failing on every call and is fixed. **Open:** the old
`scripts/instagram-schedule.mjs` cron still runs — retire it once the new publisher has
posted for a week; week-1 dates (5–11 Oct) have passed; the experiment is not loaded;
owner to confirm story-carousel prices (Phase 4) and whether shoot `4e8d1ee0` (₦2,000,
never paid, delivered 19 Aug) was started by hand.

**Design guide (2026-10-06): read `DESIGN.md` before building any page.** It records
the site's four looks — the App look (pastel sky, frosted panels, teal) in light AND
dark, switched by the person and remembered under `localStorage` `studio-theme`; the
home page's dark editorial look; the Instagram slide/GIF deck; and the legacy
black-and-gold admin — with a copy-paste token block for both modes. New pages,
admin tools included, use the App look (the owner asked for this). `/admin/carousel`
is built on the token block.

**Update (2026-10-06, latest): every carousel is a Photo Wahala microdrama episode.**
HVCO is retired (`tools/carousel/COPY-FORMULA.md` is the house style). Season 1
(`plan-microdrama.mjs`, m01–m44) shows from Mon 12 Oct at 1pm; Season 2
(`tools/carousel/season2/`, built by `plan-season2.mjs`, p01–p88) holds the old drafts'
7pm dated slots, holiday episodes on their day. Check stories with
`node tools/carousel/season2/check.mjs`, then reseed with `scripts/carousel-seed.mjs`.

**Update (2026-10-06, final): one calendar.** `tools/carousel/schedule.mjs` orders every
post: Season 1 (`s1-01-1`…`s1-11-4`) Mon 12 Oct–Sun 27 Dec, then Season 2 (`s2-01-1`…
`s2-18-4`) Mon 28 Dec–Sun 2 May, all at 7pm Mon/Wed/Fri/Sun; New Year's Day, Valentine's
Day and Mothering Sunday on their day. The 4 December stories are `dec-1-1`…`dec-4-4`,
hidden and undated, held for December 2027. Titles read "S1 · Story 01 · Ep 1 — Title".
The seed reads schedule.mjs and removes old rows only if untouched.

**Update (2026-10-06, evening): tour, download, old auto-poster OFF.** `/admin/carousel`
has a "How to use" tour (`app/admin/carousel/Tour.tsx`, 11 lit-up steps by `data-tour`
name; runs once per browser, `localStorage` `carousel-tour-seen`) and a **Download slides**
button (`GET /api/admin/carousel/[id]/download` → zip of `slides/NN.jpg` 1080×1350,
`caption.txt`, `story.gif` if made; verified live). **The old `scripts/instagram-schedule.mjs`
cron is RETIRED** — renewing the fegorson token let it post an August-queue carousel
(`w5-d25-fegorson-firstbooking`) at 06:00 UTC today without the owner's OK. Its 3 crontab
lines are removed (backup `/root/crontab.bak-2026-10-06`); do not put them back. Nothing
reaches Instagram now except a post the owner approved AND scheduled in the studio.

**Latest major rules update:** Advanced mode now supports layered tagged references. Prompt generation must use explicit reference roles, preserve/change blocks, and a structured Scene / Subject / Important Details / Use Case / Constraints template.

---

## AI Collaboration Protocol

Since multiple AI agents operate on this project:

1. Always read this file first to get the latest architectural and rule context.
2. Update the Active AI Handoff Status before ending a substantial session.
3. Use Git as the bridge. All successful fixes must be committed.
4. Never commit secrets or `.env.local`.

---

## Anti-Regression Guardrails (apply to EVERY fix, no exceptions)

When the user asks to fix or change something, these rules override the urge to
improve surrounding code. Follow them exactly.

1. Strict file scoping — modify ONLY the specific files and functions the fix
   needs. Do not touch adjacent files, shared UI components, or config files
   unless the user explicitly authorizes it.
2. Preserve existing APIs — do not alter function signatures, exports, types, or
   return shapes that other parts of the app rely on. Additive changes are allowed
   only when the fix genuinely requires them.
3. Zero unrequested refactoring — do not clean up, reformat, rename, or refactor
   working code. Fix the isolated problem and nothing else.
4. Impact assessment before shared changes — if a fix would touch a shared utility,
   type, or component, STOP first, list what depends on it, warn the user of the
   possible breakage, and get an explicit OK before proceeding.
5. Regression check — after the change, run the type check and build (or the
   project's tests) to prove the rest of the app still works, then report exactly
   which files changed and confirm what was left untouched.

### How I will operate on every fix (so this does not repeat)
- Before editing: state the exact file(s) and function(s) I will touch — and touch
  nothing outside that list.
- During: make the smallest change that resolves the issue; no drive-by cleanup.
- If shared/working code is in the path: flag it and wait for approval (rule 4).
- After: run typecheck + build; report the changed files and what stayed the same;
  do not deploy working code differently than before unless asked.

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

## Outfit Fidelity Rule — No Hallucination

Whenever an outfit is supplied as an `[OUTFIT]` tagged reference or an outfit choice
group (both resolve to the `OUTFIT` tag), the generated garment must reproduce the
reference **element for element**. This applies to every template category, not just
fashion brands.

Reproduce exactly, with the same placement, size, orientation, and color:

- prints, patterns, graphics, and logos
- embroidery, beadwork, sequins, appliqué
- seams, pleats, darts, gathers
- hemline, neckline, collar, lapels
- sleeve length and shape, cuffs
- buttons, zippers, buckles, hardware, straps, belts, pockets, and trims

Do not add, remove, resize, restyle, simplify, recolor, or reinterpret any element,
and never substitute an alternative garment. If a detail is partially obscured or
ambiguous in the reference, reproduce the closest faithful match rather than inventing
a substitute. Shot-to-shot variation comes only from pose, camera angle, expression,
and composition — never from changing the outfit or any of its details.

The ghost-mannequin guard still applies: extract only the garment and fit it to the
subject's real body from the identity references, never the mannequin's hollow form.

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

## Lighting Capture Rule — Always Through the Gem

**Hard rule. No exceptions, no judgement calls.**

When the owner supplies photographs and asks for that lighting to be copied into
the lighting styles, the look **must** be produced by the studio's custom Gemini
gem, and the prompt written into `templates.option_groups` is the prompt the gem
returns:

```text
https://gemini.google.com/gem/cad1a9c9275a
```

The gem is the studio's tuned lighting analyser. A recipe written by eye is a
different instrument, and the archive has to stay consistent across 197 looks in
The Gear Equalizer.

**In practice:** an agent cannot open a Gemini gem — it needs the owner's account
and is interactive. So on any "copy this lighting" request, **stop and ask the
owner to run the image through the gem and paste the output back.** Never draft
the lighting recipe yourself, and never paraphrase, trim or "improve" what the
gem returns on its way into the database.

This governs **capturing a new look from a photograph**. Repairing an existing
look that misbehaves in production — a phone flash firing in a mirror selfie,
skin coming back glassy, the background being rebuilt instead of relit — is
ordinary prompt debugging and does not need the gem.

Write those looks back with `sql.json()`. `JSON.stringify(...)::jsonb` stores a
JSON *string* and replaces every look in the template with one quoted blob; it
has already happened once. Back up `option_groups` to a file first, then re-read
after writing and assert the option count.

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
