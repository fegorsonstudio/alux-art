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

**Update (2026-10-06, night): default image model is Nano Banana 2.1** (`google/nano-banana-2.1/edit`,
owner's call). Every nano-banana call (shoots + Gear Equalizer via `lib/generate.ts`, base-lock,
Soul ID sheets, Template Lab) goes through `lib/fal-edit.ts` `nanoBananaEdit()`: safety_tolerance
"6", 4K (an empty resolution now means 4K, never fal's 1K). fal labels 2.1 "for integration
purposes only", so on any NON-content failure the photo is remade on `fal-ai/nano-banana-2/edit`
and `configured_model` records the model that actually ran (a 401/403/404 skips 2.1 for 10 min).
Admin → Image Generation has Nano Banana 2.1 / Nano Banana 2 / SeedDream; `app_config.generation_model`
= `nano-banana-2.1`; `fal_rate_card` has a 2.1 row. **Not yet proven by a real shoot** — the
owner is running the first one; check `configured_model` on it (2 there means 2.1 was refused).
Scripts `render-look-thumbnail.mjs` / `relight-one.mjs` still call nano-banana-2 directly.

**Update (2026-10-06, late): all 33 stories rewritten on a new writing engine.** Research
into how China's hit micro-dramas are written (`tools/carousel/RESEARCH.md`, sourced) became
the engine in `tools/carousel/COPY-FORMULA.md`: hold down then lift (Ep1 public slap, Ep2
villain wins, Ep3 reversal, Ep4 witnessed payoff), a hidden truth planted early with a
visible clue in a story picture, a quotable insult thrown back word for word, typed
cliffhangers (reveal/reversal/deadline/intrusion/document), ≤3 named characters with
labels, one anti-trope beat, word caps per slide. **One file per story** in
`tools/carousel/stories/` named as the calendar names it (`s1-01` … `s2-18`, `dec-1` …
`dec-4`), each with `engine`, `hook`, `secret`, `insult`, `throwback`, `antiTrope`; checked
by `node tools/carousel/stories/check.mjs` (product per slot and holiday episodes are
enforced: Christmas s1-11 Ep3 and dec-4 Ep3, New Year s2-01 Ep3, Valentine s2-07 Ep4,
Mothering Sunday s2-10 Ep4, Easter s2-13 Ep4). `schedule.mjs` builds all 132 posts from
them; Ep 4 ends on the next story's own `hook`. Removed: `plan-microdrama.mjs`,
`plan-season2.mjs`, `gif-scripts.mjs`, `season2/`. Seeded live (132 refreshed, nothing
scheduled). **Open:** Christmas 2027 is a Saturday — when the December specials are dated,
dec-4 Ep 3 needs its own day.

**Update (2026-10-07): two small fixes.** Relights of orange-lit photos came back nearly
unchanged on Nano Banana 2.1 — the identity block in `buildGearEqualizerPrompt` read a
bulb's colour cast as skin tone; one sentence now says a room's cast is NOT skin tone
(`lib/gear-equalizer.ts`, commit `9488090`; **REVERTED 2026-10-12 — see below**). The
accounting warning "payouts exceed gross sales" counted free bookings and the July `cash`
backfill; it now uses the paid-only rule revenue uses (`lib/accounting.ts`, `ce35d8a`).

**Update (2026-10-12): relights of small faces come back as a DIFFERENT PERSON — OPEN, not
fixed.** Two owner relights (look 197, Nano Banana 2.1, wide travel shots, face ~260–300px
tall and soft) came back with a different face, a different necklace, a re-wrapped scarf and
a re-framed, darkened scene (change score 79 and 87 of 255). I first blamed the 7 Oct
"colour cast" sentence and removed it (`lib/gear-equalizer.ts` is byte-identical to its
pre-9488090 text, deployed) — **that diagnosis was wrong**: the owner's re-test without the
sentence (shoot `cb2df310`, same photo) still redrew the scene (change 64) and invented a
third, different face. The sentence made it worse; it was not the cause. Cause as understood
now: the model repaints the whole frame at 4K, and where the real face is small and soft it
makes one up — and the prompt's own IMAGE QUALITY UPGRADE / SOURCE RESTORATION sections ask
for exactly that. **No wording can guarantee the face; do not try another sentence.** Still
true: never loosen the IDENTITY block to get a stronger relight. **Shown to the owner,
awaiting their decision, nothing built in the app:** a "lighting transfer" — keep every pixel
of the customer's photo and take only the light from the AI result (match the two frames,
measure brightness/colour change area by area, tie the map to the original's edges with a
guided filter, multiply the original in linear light, one contrast curve). Proven on both
photos offline with sharp, ~15 s each, no fal call: the person is identical by construction;
the result is tamer than the AI's and the face stays as soft as the phone took it. It would
sit after the fal call for `photo_upgrade` in `lib/generate.ts` (core worker — needs the
owner's OK and one real run to prove).

**Update (2026-10-10): Nursing Induction carries the 197 lighting looks.** Copied from the
Gear Equalizer by `scripts/copy-looks-to-nursing.mjs` (backup first, `sql.json()`, read
back and checked; `--restore <backup>` undoes it; backup at
`/home/aluxart/backups/nursing-induction-option-groups-2026-10-10T18-59-39-428Z.json`).
Three sections (Headshots 56, Medium 104, Full body 37), fresh ids, same thumbnails,
`updated_at` left alone so the dashboard's lighting library still reads from the Gear
Equalizer. Buyers see "Lighting — AI decides" in the checkout; manual lighting is opt-in,
so default shoots are unchanged. **Look numbers and names are sold by the relight product
only:** `sellsLooks` in `lib/whatsapp-triggers.ts` (WhatsApp triggers, Instagram LIGHT bot,
comments, mentions) and an `isPerImage` gate on the WhatsApp stray-number branch — without
them "197" could land on whichever published template the database returned first. **Do not
remove that guard while any non-relight template carries numbered looks.** It is a
snapshot: later edits to a Gear Equalizer look do not reach the nursing copy. **Unproven:**
every look is worded "Relight this image…"; 18 owner test shoots on Private temp / Baby
shoot ran clean on nano-banana-2, but not yet on 2.1 or against nursing's own lighting
rules (the DRAMATIC LIGHT slots). M1 blue's 3 looks were left out (private template).
The Airtable "Fal Payloads" log base is over its record limit (422 on every write).

**Update (2026-10-11): a relight-ad arrival is treated as LIGHT.** Meta tags the first
message of a chat opened from an ad: `message.referral = { source: "ADS", ad_id,
ads_context_data: { ad_title } }`. Of the 8 tagged arrivals in the log, 5 tapped the ad's
own welcome buttons, 2 said "Hi" and 1 typed "Light" — 7 of 8 paid clicks met quiet mode.
`isRelightAd()` in `app/api/webhooks/instagram/route.ts` matches the ad's NAME
(`/relight|\blight\b/i`, e.g. "0826 vertical – relight."), and at the two places the bot
goes silent a tagged arrival now gets what LIGHT gets: a first photo arms look 197 and is
let through; any other unanswered message calls `offerLook(197)`. "help", look numbers and
mid-booking replies still win. **Quiet mode is unchanged for everyone else** — 54 of 56 bare
"hi"s in the log carried no ad tag (friends, clients, other businesses), so there is still no
greeting for untagged DMs; that was the owner's August call and has not been reopened.
**Keep "relight" in the name of any ad that should start this conversation.** Verified live
with made-up sender ids (8 checks, rows removed); the photo-first check used a missing
file on purpose, so storing a real first photo was not exercised. New welcome-message
wording for the ad (buttons "LIGHT - relight my photo", "How does LIGHT work?", "Help")
was handed to the owner to paste into Meta's ad assistant — not yet confirmed applied.
The ad itself is still not delivering (ad set retired by Meta); the Playwright browser
cannot pass Facebook's sign-in, so restarting it is with the owner.

**Update (2026-10-14, evening): nightly database backup LIVE; 48-hour photo deletion BUILT, not
switched on.** `scripts/db-backup.mjs`, cron `30 2 * * *` (UTC): pg_dump custom format to
`/root/db-backups` (newest 14 kept), checked with pg_restore --list, and an AES-256 encrypted copy
(password `/root/.db-backup-pass`; the owner was given a copy on their Desktop to move into a
password manager) sent silently to the owner's Telegram — the R2 key cannot create a bucket, so
Telegram is the off-server copy (50 MB cap; the dump is 7.4 MB). First run restored into a
throwaway database with identical row counts. Restore steps are in the script header.
`scripts/purge-customer-photos.mjs` deletes customers' uploads (identity-images and
inspiration-images ONLY) 48 h after they stop being needed, as the privacy page promises; it keeps
anything a running shoot, an active chat (48 h), a recently used library photo, a template, a
character base / Soul ID sheet, a carousel or a retouched file points at, and deletes the rows that
pointed at deleted files. Dry run 14 Oct: 611 of 624 files (1.8 GB), 108 library rows, 290 shoot
references. **Not scheduled — the owner must OK the first real run** (it empties the website's
saved-photo library and ends free redos after 48 h). Run with `--dry-run` to preview.

**Update (2026-10-14, later): the licence shop is LIVE (owner approved, ₦20,000 lifetime).**
`lib/fegorson-licence.ts` (commit `1d62105`), table `licence_orders` (migration 071, applied
with psql). The app's message ("…Fegorson Studio licence code.") on the Alux Art number →
ask name → confirm (buttons `fgs_yes`/`fgs_change`) → Paystack link (`metadata.type =
fegorson_licence`, callback back to wa.me) → code made ONLY in `fulfilLicencePayment()`,
called by `/api/webhooks/paystack` after its signature check, or by Paystack's verify API
when the buyer replies PAID; NGN and amount ≥ the order's price, once per reference
(`WHERE code IS NULL`); wrong amount → `PAYMENT_MISMATCH` + Telegram, no code. Lost code:
any licence message from a number with a code resends it; NEW buys another. Each sale goes
to the owner's Telegram with today/all-time totals; if the chat send fails (24-hour window)
the alert carries the code. Runs before the photo bot's greeting rule, returns false for
everything else, and any error falls back to the photo bot. **Off unless
`FEGORSON_SHOP_CREATOR_ID` (in `.env.local`) names the number.** Verified live with
made-up numbers, 13/13 checks, rows removed (one unpaid Paystack checkout T867655185391021
was left by the test). Also today: the Flutterwave webhook hash was replaced (8 characters
of the old one were exposed by me in a check); `.env.local` backups are in `/root`.

**Update (2026-10-14): Fegorson Studio licence shop — Phase 1 done, Phase 2 NOT approved.**
The owner sells licence codes for their offline Windows app (brief on their laptop:
`Desktop\Avoto\Prompt for the VPS agent.md`). A new Ed25519 shop key pair lives at
`/etc/fegorson-shop/` on the VPS (dir 700, private key 600 root, outside every web folder
and git). **Never regenerate it** (its public key goes into the app) and **never print,
log or send the private key**. One encrypted backup is on the owner's laptop
(`Desktop\Avoto\shop-key-backup\`), its password in a separate file there. A "Test Buyer"
code was made with the owner's reference signer and verified. Build no sales flow until the
owner approves the plan. Known for Phase 2: the trigger message begins "Hello", which the
WhatsApp bot today answers with the photo menu, so the licence branch must come before the
greeting check; Paystack has one webhook URL, so licence payments arrive in the live
`/api/webhooks/paystack` route; a payment later than WhatsApp's 24-hour window needs an
approved template to deliver the code.

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
