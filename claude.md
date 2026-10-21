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

**Update (2026-10-15, evening): Glow Retouch PAUSED; Fegorson Studio is the quality bar.**
The owner's first real test (3 Wadi Rum photos via @nvidia_studio) was rejected: chat photos
arrive Instagram-shrunk (1180x1572, faces 63-104 px), the engine changed ~1% of each photo and
handed a clear face to a person. Their own Fegorson Studio edit (laptop app, `Desktop\Avoto\studio`,
"Hanna" preset: contrast 17, temp 21, vignette 10, blemish 56, dodge&burn 65, body tools) is far
better. Done: template `83275b9f` set to **draft** (one switch back to `published`); Glow Retouch
now takes **originals only** via the upload button (chat photos not stored; `1aaab1d`); "edit"
short forms trigger like "retouch" (`ae50e32`). Owner chose: run Fegorson Studio's OWN engine on
the server. Its hands-off probe mode (`--selftest` with a probe spec, used by `tools/selftest.mjs`)
renders a photo with a recipe at full size: 29-50 s per photo on the laptop through the installed
exe (clear `ELECTRON_RUN_AS_NODE` first — VS Code sets it). **Never run `tools/selftest.mjs`: it
wipes the app's `test-output`, which its own agent is using.** On the VPS (`/root/fegorson-engine`,
app source by `git archive`, xvfb + SwiftShader WebGL2, apt libs installed) the engine starts and
analyses, then was **OOM-killed at 1.6 GB** inside the 1700M fence (site untouched) — it needs
more memory than this server can spare. Decision with the owner: bigger/second server, the
laptop as the worker, or smaller renders. **Cloud-mask Phase 1** (Fegorson brief
`Desktop\Avoto\Prompt for the VPS agent - cloud masking.md`): 13 owner photos, BiRefNet v2
Matting/Portrait + SAM 3 (12 prompts, face parts on a full-res face crop), data URIs + sync_mode +
`X-Fal-Store-IO: 0`, est. $0.77 of $2 (our fal key cannot read billing: 403); zip on R2
`generated-4k/admin/…`, deleted by transient timer `cloudmask-zip-delete` on 17 Oct 13:20 UTC;
server copies already deleted. Phase 2 not approved.
**Then (owner chose "both"): Glow Retouch runs on the owner's LAPTOP for testing** (`034a78e`).
`/api/retouch-worker/next|result|fail` (`lib/retouch-worker.ts`, bearer `RETOUCH_WORKER_TOKEN` in
.env.local; backup `/root/env.local.bak-2026-10-15-retouch-worker`) hand photos to
`Desktop\Glow Retouch worker` (copy in `tools/glow-retouch-worker`, its `config.json` holds the key
and is not in git), which renders each with the installed Fegorson Studio + the owner's current
"Hanna" preset (`app_config.retouch_preset`) and posts the JPEG; un-answered photos requeue after
15 min, then go to a person. `app_config.retouch_engine = 'laptop'` stands `workers/retouch` aside
(cron still runs and exits). `app_config.glow_retouch_testers = 'nvidia_studio'` — only listed IG
usernames can order (`*` = everyone); template published again. Verified end to end with a made-up
tester (45 s, 3888x5184). Orders wait while the laptop is off (watchdog alerts after an hour).
**Next:** owner rents an 8-core/16 GB Hetzner server for an afternoon so speed on server hardware
can be measured, then deletes it.
**Then: the RETOUCH DIRECTOR is built and ON for testers** (`363f007`; owner: complete brief per
photo, send automatically, only failures to the studio, body shaping AI-decided within limits).
`workers/retouch/director.py`: FIND (free detectors + a ~$0.002 BiRefNet matte of the head) →
DECIDE (Gemini 3.1 Pro ~$0.07: reasoned keep/fix verdict per numbered candidate from a close-up
gallery, a lettered face grid for missed pimples, the 12-area brief, sliders) → laptop renders →
CHECK (~$0.05). **Never use the AI's own coordinates** (wrong on the owner's photo); detectors find,
the AI only approves. Recipe merge on the laptop: `max` raises the preset (never lowers), `set`
replaces, `caps` = house limits (armpit ≤ 40, waist/hips ≤ 20, none on slim figures). Rows in
`retouch_briefs` (migration 073, psql): ready → rendering → rendered → passed | redo (pass 2) |
failed (→ Telegram with original + last result). `app_config.retouch_director='on'`. Also today:
download page saves to the gallery (`b634215`: escapes Instagram's browser via x-safari-https /
intent://, iPhone share sheet from `/d/<token>/blob`). **State:** plumbing proven end to end; quality
NOT yet passing the check on hard photos (stray hairs vs backdrop, small body marks, lace line needs a
blend not a line stroke, no background-person removal — add Fegorson `bgFill`/`bgClean`). The check
can raise false alarms (it once claimed a waist change). Director testing spend ≈ $0.75 Gemini.
The owner's laptop worker window must be restarted after worker.mjs changes (old code stays in memory).

**Update (2026-10-16): "are these all the pictures?" has answer buttons; check crashes capped.**
The owner's own test: their "yes" was taken by an old open post-consent ask (fixed `405d5eb`: while
photos are held, consent words are ignored except *stop*), and they had not seen that "yes" was
expected. Every place the question is asked (`offerRetouch`, `offerLook`, `acceptInstagramPhoto`,
`confirmBatch`'s "send the rest", the webhook's "I'm holding N photos") now goes through
`sendTextWithReplies` (`lib/instagram.ts`, Instagram quick replies) with **Yes, that's all** /
**No, I have more** under a bold 👉 question. A tap arrives as a text message whose text is the
title, so the existing batch matchers read it; **keep the titles matching those regexes** (start
with yes / no). Quick replies show in the phone app only, so the text still says "or type *yes*".
Refused buttons resend the plain text. The owner's order `c89feca2` then failed the check twice
(stray hairs against the backdrop, eyes not visibly brighter at eyeBright/eyeWhiten 35, top
creases) and went to Telegram as designed. The check had also crashed 4× with `'list' object has
no attribute 'get'` — Gemini sometimes wraps its JSON in a list — each crash after a paid call
(~$0.05) and with no limit: `gemini()` now unwraps a list, `check()` guards problems/adjust, and
three crashed checks hand the photo to a person (count kept in `retouch_briefs.qa.errors`).

**Update (2026-10-15, later): Glow Retouch is LIVE on Instagram (owner: build it, ₦1,000 a
photo, trigger RETOUCH; commit `5fe4a57`).** Reply *retouch* in the DM → photos in chat or via the
upload link → one payment link → retouched photo back in the chat + full-size download page.
Within 24 h of a delivered (non-retouch) order the word still means the old HAND-retouch offer for
that order (`justDelivered` in the IG webhook). Private template "Glow Retouch" `83275b9f`,
category `photo_retouch`, per-image like the relight, no trigger words (invisible to chat
triggers). `/api/shoots/[id]/start` and the slot retry hand photo_retouch to the worker — the
relight model never sees them. **Worker:** `workers/retouch/worker.py` (orders) → `engine.py`
(one photo per process) → `fal.mjs` (paid cut-out/eraser, $5/UTC-day cap, ledger
`/root/retouch-worker/fal-ledger.jsonl`). Root cron every minute, `flock` + `systemd-run
MemoryMax=1700M` (crontab backup `/root/crontab.bak-2026-10-15-glow`), log
`/root/retouch-worker/worker.log`, venv `/root/retouch-proof/venv` (+psycopg, boto3). Photo N →
slot N; output `generated-4k/{user}/{shoot}/retouch-N.jpg` at the customer's own size, ICC kept,
EXIF dropped. **Never sent half-done:** no face / features don't line up / same-person score
< 0.75 / two crashes → slot FAILED, Telegram "needs your hands" with a 3-day link to the
original; the customer is told a person will finish it. Paid step failing 3× → finishes without
it and alerts. Owner's colour style is NOT applied to customers. **Healing was buggy in the
proof** (one texture source for all marks; healed inside eyeshadow → eyeshadow fleck and a
nose-edge slash pasted onto skin, visible only at 100%): now per mark, plain skin only, smoothest
source, reverted if it darkens skin. **Check retouch output at 100% zoom, never on contact
sheets.** Verified: 10 owner samples (7 retouched, same-person 0.95–0.97, peak 1.39 GB; IMG_0190,
0191, 7381 → a person) and two made-up IG customers end to end on live (rows + files removed);
paid steps used a free stand-in (`RETOUCH_FAKE_FAL=1`, tests only). **Not yet proven: a real paid
run** — the owner's own test. Also fixed: an IG shoot that FAILED before any delivery poll saw it
was never told (affects relights too); free bookings now say "No charge". **@nvidia_studio is the
owner's Instagram test account:** free grant of 100 images on
`ig-1448007867158554@instagram.aluxartandframes.shop` (`free_grants` 4319b24d) — covers relights
too; top it up there. **Links are buttons (owner asked, same day):** URLs in a plain IG DM showed
as untappable text on the owner's phone. `sendTextWithButtons` / `linksAsButtons` /
`buttonMessage` in `lib/instagram.ts` turn a message's 1–3 links into Instagram button-template
buttons named by destination (Upload full quality, Pay now, Download full size, Open WhatsApp,
Open my shoots, Open on the website, Open website); `sendWithLinkFallback` and the hand-retouch
pay message use it, so every bot link is covered. Text over 640 chars or >3 links stays plain;
any refusal other than a link restriction/closed window resends the plain text. Comment private
replies try buttons first, then the old text — **whether Instagram allows a button template as a
private reply is unproven** (check the log for "button reply refused"). Button text drops `*`.

**Update (2026-10-15): retouch-by-DM proof engine — `tools/retouch-proof/` (README there).** Not
wired into the site. Face skin, eyes, teeth, body skin, studio backdrop and the owner's colour style
(a 3D LUT learned from 4 of their hand edits) are free; hair-accurate cut-out (fal BiRefNet v2) and
erasing tourists/stray hairs (fal Bria Eraser, masked paste-back only) are paid. Owner approved $1;
13 calls, about $0.28. Same-person score 0.87–0.94. **On the VPS it must run inside
`systemd-run --scope -p MemoryMax=1700M`** — an unfenced run hit 2.8 GB and was OOM-killed three
times (the site survived). Installed on the VPS for it: python3.12-venv, libegl1, libgles2;
`/root/retouch-proof` holds the venv and models, no customer photos.

**Update (2026-10-14, night): 48-hour photo deletion LIVE; full-quality upload link and
all-photos download page LIVE; privacy page corrected.** Owner approved each. Purge first run:
611 files (1.8 GB) + 386 stale reference rows + 16 empty library rows, templates untouched; cron
`25 * * * *`; deletion records in `/root/purge-logs`. Consequences the owner accepted: the
website's saved-photo library lasts 48 h after a shoot, free redos fail after 48 h, an unpaid
order paid after 48 h fails and refunds to the wallet. Privacy page: only the two untrue lines
changed (Cloudflare R2, not Supabase; fal.ai/Google process photos). **Upload link**
(`/d/up/<token>`, table `chat_upload_links` migration 072, `lib/chat-upload-links.ts`): both
bots offer it when asking for photos — Instagram in `offerLook` and on the first chat photo,
WhatsApp in the per-photo prompts. The page (App look, light/dark, 7 dictionaries under
`chatUpload`, chat language for WhatsApp) sends originals to `/api/up/<token>` one at a time
(30 MB, HEIC→JPEG q95, else byte for byte; 48 h; 30 files per link). Instagram: `handlePhoto` is
now download + `acceptInstagramPhoto` (shared by chat and upload). WhatsApp: `lib/whatsapp-upload.ts`
mirrors collectPhoto's after-download steps, only for per-photo products in COLLECTING_PHOTOS (the
route file cannot be imported). **Kept under `/d/` because middleware.ts skips `/d/` — do not move
it.** Downloads: `lib/download-link.ts` tokens every finished photo; `/d/<token>` lists the whole
order; WhatsApp delivery sends the link too. Verified live with made-up customers, 13/13.

**Update (2026-10-14, evening): nightly database backup LIVE; 48-hour photo deletion BUILT, not
switched on (switched on later the same night — see above).** `scripts/db-backup.mjs`, cron `30 2 * * *` (UTC): pg_dump custom format to
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

**Update (2026-10-20, night): the race game (Bounty Run) and the AR Balloon Campaigns are REMOVED (owner:
"delete everything about the game … I have another idea for a game").** Commit `4e9259f`; both were built 17–18 Oct
(commits `c2127f7`…`99d2410`) and never sold. Gone: 79 files (app/d/{ar,race,road}, app/api/{ar,race,road}, the
admin AR page, lib/{ar,race,road}, components/race, ArQr, ArLocationPicker, their scripts and Playwright tests,
migrations 074–078). Files only the game had touched were restored to their pre-AR versions (`c2127f7^`): booking
route, template allow-lists, CheckoutPanel, checkout-resume, types, the 7 dictionaries; targeted removals in start,
regenerate, generate.ts (the AR fork), studio, admin and next.config.ts (camera/location rule, race-page CSP).
Data: migration 081 (psql) dropped ar_campaigns, ar_campaign_events, race_prizes, races, race_groups, road_tracks,
road_tiles and `app_config.ar_campaign_days`; the AR template `43df341b` and the owner's one free test booking are
deleted; R2 `template-images/ar/` (1 logo) deleted; the road-transcode cron is removed (backup
`/root/crontab.bak-2026-10-20-games`); the Maps key "Alux Art website (balloon race)" is deleted in Google Cloud
`fegorson-studio` (Maps JS / Street View APIs left enabled — the Firebase browser key may use them; the "$20 alert"
budget is left) and `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is out of `.env.local` (backup `/root/env.local.bak-2026-10-20-games`).
Everything removed is in `/root/games-removal-backup-2026-10-20/` (table dump, row CSVs, code tar, logo, old
.next/types) and in git history. `three` and `leaflet` stay installed but unused (the VPS package-lock differs from
the laptop's). **Deploy note that still holds:** the VPS git history has diverged from the laptop's — deploy by copying
committed files after checking the server copies match `git show HEAD:<file>`.

**Update (2026-10-18): default image model is Nano Banana Pro** (`fal-ai/nano-banana-pro/edit`, owner's call;
safety_tolerance "6" = the least strict of 1–6; resolution 4K unless a caller asks for less). `lib/fal-edit.ts`
`nanoBananaEdit()` runs Pro (or 2.1) and, on any NON-content refusal of the request (401/403/404 → that model is
skipped for 10 min), remakes the photo on `fal-ai/nano-banana-2/edit`; `configured_model` records what ran.
Admin → Image Generation now offers **Nano Banana Pro / Nano Banana 2.1 / Nano Banana 2 / SeedDream**
(`app/api/admin/config` allow-list `nano-banana-pro|nano-banana-2.1|nano-banana|seedream`);
`app_config.generation_model = nano-banana-pro`; `fal_rate_card` has a Pro row at $0.30 (4K — fal lists 1K/2K at
about $0.15; confirm on fal's model page). fal's schema for Pro checked: resolution 1K/2K/4K, safety "1"–"6",
`limit_generations` default true (we send false), so the input we already send fits. **Not yet proven by a real
shoot** — generate.ts can only be proven by one (see memory); the owner runs it and checks `configured_model`.
Base-lock, Soul ID sheets and Template Lab follow the same switch. Scripts `render-look-thumbnail.mjs` /
`relight-one.mjs` still call nano-banana-2 directly.

**Update (2026-10-18): Fegorson Studio download page for friends — `/d/fegorson`.** The owner shares
https://aluxartandframes.shop/d/fegorson; its button goes to `/d/fegorson/download` (`app/d/fegorson/download/route.ts`),
which 302s to a one-hour R2 link for `template-images/fegorson/Fegorson-Studio-Setup-<version>.exe` (never purged;
version constant `FEGORSON_VERSION`, 0.32.0, 369 MB, SHA-256 on the page). Upload a new build with
`node --env-file=.env.local scripts/upload-fegorson-installer.mjs "<Setup.exe>" <version>` (multipart, from the
laptop; the exe lives in Desktop/Avoto/studio/dist/), then bump the version in the route and `page.tsx`. The
app itself enforces the 7-day trial (`licence.js` in the app: trial start sealed in two places, then a code) and
its Buy button opens WhatsApp +234 907 685 8017 with "Hello, I would like to buy a Fegorson Studio licence code."
— the live licence shop (₦20,000, codes only after Paystack confirms). The installer is unsigned: Windows
SmartScreen shows "Windows protected your PC" → More info → Run anyway (explained on the page). Page is in the
App look (reuses `app/d/up/[token]/upload.module.css`), light/dark by `studio-theme`. `public/fegorson-icon.png`
is force-added (public/*.png is git-ignored).

**Update (2026-10-18): the download link went out to the people who asked @fegorson_studio.** Only the last
inbound message per chat is stored (`instagram_sessions.last_inbound`, `whatsapp_sessions.last_inbound`) — there is
no full DM log — so "who asked" = sessions whose last message mentions Evoto / the link / the app within 7 days:
13 Instagram people (12 asked on 14–15 Oct after the owner's comment on "Kagan's" post about Evoto for Windows
without subscription; none on WhatsApp). `scripts/send-fegorson-link.mjs` (dry run / `--send`, sent log
`instagram-data/fegorson-link-sent.jsonl`) sent a button message to @ojays.art (within 24 h). **The other 12 were
refused:** Instagram allows a reply only within 24 h of the person's last message (error 10 / 2534022, confirmed
with a plain text too), and the HUMAN_AGENT tag (7 days) needs Meta app review ("Human Agent" feature) which this
app does not have. The owner answers those 12 by hand in the Instagram app (list in the chat of 2026-10-18).
Not built: an auto-reply for @fegorson_studio when a DM mentions evoto/link/software — would catch future asks
inside the 24 h window; offered to the owner.

**Update (2026-10-18): the Instagram bot now hands out the Fegorson Studio link itself.** In
`app/api/webhooks/instagram/route.ts` (`asksForFegorson` / `offerFegorsonLink`, placed before the retouch
words so "your retouching software" is an app request, not a Glow Retouch order): on **@fegorson_studio** any
DM mentioning evoto/envato/fegorson/link/download/install/software/app/subscription/free version/windows,
and on the other accounts only an explicit evoto/envato/fegorson mention, gets the download page as a
button message ("Download for Windows", `buttonTitle` in `lib/instagram.ts`) — only while the conversation
is at rest (state IDLE/DONE). The full pitch goes once (`instagram_sessions.fegorson_link_sent_at`, migration
079 by psql; @ojays.art pre-marked), a later ask gets "Here it is again: <link>"; each first send is
reported on Telegram. Verified live with a signed made-up webhook message: the branch ran and Instagram
answered "user not found" for the fake id (row removed). Quiet mode for everything else is unchanged.

**Update (2026-10-20): senior review + fixes of the order and payment pipeline (owner: "fix all the problems").**
A read-only review (15-point checklist in this file's tail) found three High and ten Medium problems; all fixed,
proven on a THROWAWAY restore of the nightly backup with mock images and every paid key blanked (34 checks:
relight end to end, refunds, lock, webhook amounts, retry/regenerate/delete/list/expiry), then deployed (commits
`46cfba8` orders, `f57dde5` payments, `d742471` housekeeping, plus a CSP follow-up). Files backed up first in
`/root/fix-deploy-backup-2026-10-20/`. What changed:
- **One remedy per missing photo** (`lib/shortfall.ts` `settleShortfall`): a paid short shoot is refunded to the
  wallet; only a FREE short shoot gets the one-time free regeneration. Per-image retry and regenerate refuse once
  a shortfall refund exists (admins exempt). Before, a buyer could be refunded AND retry the photos into existence.
- **Retry** (`slots/[slot]/retry`): refused after expiry, capped at 3 per photo (`generation_events` type
  `retry_requested`), a GENERATING slot only when quiet for 10 min, and it now continues the chain (a second queued
  photo used to wait forever). **Regenerate** keeps COMPLETE photos and refuses once the identity refs were purged.
- **/start**: per-shoot advisory lock (`lib/worker-lock.ts`, reserved connection, released on crash) so the
  webhook, verify button, studio page and retry can never run two workers; `safeResolution` whitelist
  (`lib/internal-auth.ts`); a buyer cannot restart a FAILED order; a worker that THROWS (identity analysis, brief,
  missing refs) now fails the remaining slots, settles the refund and alerts on Telegram (it used to leave the
  slots queued, no refund, no message). Internal secret compared in constant time.
- **Self-calls go to `INTERNAL_BASE_URL`** (`lib/site-url.ts`, default `http://127.0.0.1:$PORT`): webhook → /start,
  continuations, regenerate, reconciler — the secret no longer crosses Cloudflare, no 100 s cut-off.
- **`scripts/resume-stalled-shoots.mjs`** (root cron `*/5`, flock, log `/home/aluxart/resume-stalled.log`, state
  `/home/aluxart/resume-stalled-state.json`, crontab backup `/root/crontab.bak-2026-10-20-resume`): orders in
  PROCESSING/QUEUED untouched for 10 min (last 24 h only, not photo_retouch) get /start; Telegram on the first
  restart; after 3 restarts without progress it stops and alerts. Three orders frozen since May/July are outside
  the window and were left alone.
- **Payments**: `lib/payment-checks.ts` `paidEnough` — every path that releases an order (Paystack AND Flutterwave
  webhooks, verify button, reconciler) requires amount ≥ price in the order's currency; mismatch → nothing
  released, `payments.status='mismatch'` where a row exists, Telegram. Checked against all 39 past webhook
  payments: all pass. `lib/template-purchase.ts` `fulfilTemplatePurchase` is the ONE marketplace fulfilment (sale
  count, coupon use, creator email once, whichever of webhook/verify arrives first). Webhook failures delete their
  duplicate-gate row so the gateway's retry runs. A worker starts only if the call moved the shoot out of
  PENDING_PAYMENT. Showcase price rule = ₦1,000 × package size (as in generate-showcase).
- **JSON stored as strings** (postgres.js stringifies jsonb params; `JSON.stringify()` double-encoded): all writers of
  `generation_events.payload`, `shoots.identity_attributes`, `shoots.quote` now use `sql.json()`; 465 quotes, 74
  identity profiles, 3,591 events repaired in one transaction (backup CSVs in
  `/home/aluxart/backups/json-repair-live-2026-10-20T07-10-20Z/`). The 10-image quote card and live progress work
  again; the identity cache now hits. The events route also parses any string payload.
- **generate.ts** no longer deletes inspiration/tagged files on completion (the 48 h purge does, with guards).
- **Housekeeping**: order list strips `fal_url`, survives junk `limit`/`cursor`; delete refused while running,
  all-or-nothing (a paid order is kept whole — FK on template_purchases), output files removed; ZIP refused after
  expiry, STORE not DEFLATE, reused when newer than the last photo (`zip_ready_at`), one build at a time; photo
  download refused after expiry; retention counts from `completed_at`, BASE_REJECTED included; studio matches slot
  events by id or slot; media proxy + upload refs reject `..`/`//`; `scripts/migrate.mjs` RETIRED (exits);
  `body { margin: 0 }` (every page was 8 px too wide; checkout panel was cut off); CSP connect-src allows
  www.google.com + www.googletagmanager.com (GA4 hits were blocked).
- **Not code:** 27 finished orders 21 Aug–6 Oct have no payment/free/wallet record (3 completed while their Paystack
  row said pending) — none since 6 Oct; owner to check against Paystack. The live model switch reads
  `nano-banana` (Nano Banana 2) since 2026-10-18 08:32 UTC — set in admin after the Pro switch; left as is.
- **Supabase**: only Google sign-in (91 users, 6 active/month), chat-customer accounts and the race lobby's Realtime
  use it; the database is our own PostgreSQL on the VPS; Supabase storage holds 67 MB. The free plan covers this —
  the owner pays $25/month and was told to downgrade in the Supabase dashboard (no code change). PolarDB-X is
  MySQL-compatible (a rewrite) and Alibaba's Supabase-compatible service is paid after a one-month trial, so the
  Alibaba switch was not made.

**Update (2026-10-20, later): Supabase is NO LONGER USED by the live site (owner: it kept charging after the
downgrade — "remove it").** Commit `99d2410`, deployed and proven live. What replaced it:
- **Sign-in is ours.** `/api/auth/google` (state + PKCE + nonce in a signed 10-min `aa_oauth` cookie on /api/auth)
  → Google → `/api/auth/callback` (code swapped with our client secret, ID-token iss/aud/exp/nonce/email_verified
  checked) → session. `lib/auth-session.ts`: cookie `aa_session` = random id + HMAC(`AUTH_SECRET`); table
  `auth_sessions` stores only SHA-256 of the id; 180 days from last use (renewed at most daily); sign-out revokes the
  row. **Changing `AUTH_SECRET` signs everyone out.** `lib/auth.ts` is still ONLY `isAdminEmail` (45 importers).
- **Google client:** project **`alux-art`** (NOT fegorson-studio), client "Alux Art website (own sign-in)", redirect
  `https://aluxartandframes.shop/api/auth/callback`; its branding "Alux Art" was already Google-verified, so the
  sign-in screen says "to continue to Alux Art". `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` + `AUTH_SECRET` in the VPS
  `.env.local` (backups `/root/env.local.bak-2026-10-20-own-auth`, `…-google-oauth`). "Web client 2" in the same
  project is Supabase's; left untouched.
- **Accounts:** `auth_users` (migration 080, psql) — the 91 Supabase accounts copied with the SAME ids
  (`scripts/supabase-final-export.mjs`, re-runnable; export incl. 7 unreferenced custom-references files in
  `/root/supabase-export-2026-10-20/`, root-only). Google sign-in matches by Google id, then email, so the owner landed
  in their existing account (356 orders, admin). Chat customers get rows via the same `createUser` call.
- **`lib/supabase-server.ts` / `lib/supabase.ts` are shims** keeping the old call shapes (getUser, admin.createUser,
  storage download → "not found", signInWithOAuth, signOut) with nothing Supabase behind them — ~110 callers unchanged.
  Do not reintroduce @supabase imports.
- **Middleware** checks only the cookie signature (`lib/auth-edge.ts`). **Edge-sandbox hazard:** Node's crypto rejects
  an ArrayBuffer built inside Next's middleware sandbox, so `subtle.verify` on a decoded cookie failed EVERY session —
  it now signs and compares as text. The Supabase "stray OAuth code rescue" was removed.
- The race lobby that ran on our own server-sent events was removed with the game the same night.
- CSP no longer lists supabase.co. Proof: throwaway DB copy (38 route checks + 5 chat-account checks), then live.
- **Everyone signs in once more** (old Supabase cookies mean nothing now). Rollback: `.next-old` on the VPS.
- **Supabase project DELETED and the org moved to FREE (same day, owner asked, done through the driver Chrome).**
  The org "fegorsonphotography@gmail.com's Org" (`xkyyjcklveqysuewphva`) had still been on **Pro $25/month** — the
  owner's earlier downgrade never completed (the plan change has a SECOND step: a survey with a "Downgrade Now" button).
  Before deleting: Supabase's own database copy saved via its REST API (20 tables, 1,461 rows, 7.6 MB) to
  `/root/supabase-export-2026-10-20/db/` (root-only, next to users.json and the storage files). Project "Aluxart"
  `owdfoxglbxrqhgqbvkon` deleted ("Successfully deleted Aluxart"); org shows FREE with no upcoming invoice. The 11 Oct
  invoice was cut from $25.00 to **$7.26 and is still OUTSTANDING — owner's call whether to pay; we never pay.**
  The daily `/home/aluxart/supabase-keepalive.sh` cron is removed (backup `/root/crontab.bak-2026-10-20-supabase`).
  The `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` lines in `.env.local` are now dead (nothing reads them);
  left in place. The port-3001 test app (`/var/www/aluxart-story-test`) has no working sign-in any more.
- **Fixed same day (`d468e80`):** `app/api/admin/creators/route.ts` joined `auth.users` (never in this database) — the
  admin Creators list errored and approving a creator errored before its welcome email. Both read `profiles` now;
  verified live as admin (11 creators, all with email). The admin page's "Supabase SQL" link is dead.

**Update (2026-10-20, night): Alux Micro Drama — stage 1 LIVE at /d/drama (commit `e2f3d6d`).** Owner's brief:
interactive PICTURE dramas on Instagram (no video, no Reels, nothing paid without per-run OK), classy and short, all
genres, all of Nigeria, hot cliffhangers, viewers vote by comment (2 votes decide to start, raise later), fans join the
cast with one photo (character sheet keeps the face consistent), brands buy a place in a scene from the game page,
Alux's OWN products in every story; kept separate from Photo Wahala; first test on **@aolivetv**. Built:
- **Engine** `tools/drama/ENGINE.md` (picture first, ≤12 words a slide, ≤70 an episode, 8-slide rhythm cover→time→4
  beats→cliff→choice, six cliff shapes, two-rights choices with one-word comment keywords, 5–6 roles on twelve archetypes
  in our own words — the owner's Pip Decks Archetypes PDF is ideas only, never its text — tiers lead/main/cameo, a role
  open only until its first appearance, genre looks, brand slots each with an Alux `house` product + one Alux moment per
  story). `node tools/drama/check.mjs` enforces it.
- **Stories** `tools/drama/stories/*.mjs`: 8 (The Silent Partner, Third Mainland — Lagos; Garden City — Port Harcourt;
  The Fourth Floor — Abuja; Coal City, 1962 — Enugu; What the River Keeps — Asaba; Aso Ebi — Ibadan; Harmattan Letters
  — Kano), episode 1 + both branch outlines each. Loaded by `scripts/drama-seed.mjs` (never rewrites a started story).
- **Data** migration 082 (psql): drama_stories (content jsonb via sql.json), drama_episodes, drama_votes (unique per
  voter per episode), drama_cast (one person per role), drama_placements (one brand per slot); prices in app_config
  `drama_price_lead/main/cameo/slot` = 10000/5000/2000/10000 (owner may change).
- **Covers** `lib/drama/cover.ts` + `GET /api/drama/cover/<slug>?w=`: typographic 2:3 posters per genre (text measured
  by drawing); fonts Bodoni Moda, Cormorant Garamond, Pinyon Script, Oswald (SIL OFL) in `deploy/fonts/drama`,
  installed by `deploy/install-fonts.sh`. Cover art, once made, goes in `drama_stories.cover_bucket/path`.
- **Pages** `/d/drama` (shelf) and `/d/drama/<slug>` (story), `app/d/drama/drama.module.css`: Netflix shelves in a
  Tesla-calm cabin, brand teal/mint/cream, light + dark (studio-theme, dark by default here), floating dock. The page sits
  at z-index 95 to cover the root LanguageSelector/InstallAppButton (English-only game) without touching them.
  **Interim:** "Play <name>" and brand "Reserve" open the @aolivetv DM (owner handles by hand).
- **Not built yet (stage 2, needs owner OK):** comment votes on drama posts + DM reply (shared IG webhook), photo
  upload + Paystack for roles and brand slots (shared Paystack webhook), character sheets and episode pictures (paid fal,
  or Unreal once cloud credits exist — applications to Microsoft for Startups / AWS Activate not yet submitted), an
  admin page to produce/approve/post, the first AOLiveTV test. Also from the same session: the laptop cannot run Unreal
  (UHD 620, 8 GB, 7 GB free); UE 5.8's official Unreal MCP is loopback-only — reach a cloud VM through an SSH tunnel.

**Update (2026-10-20, late): Alux Micro Drama stage 2 LIVE (commit `d6df2d0`; owner OK'd the shared-file changes).**
- **Designed episodes** `lib/drama/slides.ts`: 8 slides 4:5 in the cover look, each slide 2–7 with a `scene` line (≤8 words, checked).
  The first test episode uses no generated pictures (owner: "without generating pictures, use carousel and design style").
- **Posting** `lib/drama/episodes.ts`: /admin/drama → Preview → Approve (freezes the episode + caption in drama_episodes) →
  Schedule (Lagos time) → slides in R2 `generated-4k/carousels/<date>/drama-<episode id>/NN.jpg` + a scheduled_carousels row
  (local_id `drama-<id>`) — the existing publisher posts it; nothing else changed there. `syncPosted()` copies the media id back.
- **Votes** `lib/drama/votes.ts`, one block in `app/api/webhooks/instagram/route.ts` right after the own-comment guard: first
  word of a comment on a drama episode = vote; one per voter per episode (unique index); first word to `min_votes` (2) closes it
  under a row lock; one private reply per voter (button → story page); Telegram on the decision. Non-votes fall through.
  @aolivetv is subscribed to comments only (not messages) — enough for votes.
- **Payments** `lib/drama/payments.ts` + a branch in `app/api/webhooks/paystack/route.ts` (metadata.type drama_cast /
  drama_placement, beside the licence shop): amount/currency checked, once per reference, photo/product copied to
  `generated-4k/drama/{cast,brands}/<id>/` (out of the 48 h bucket); return page verifies via Paystack; admin joins free.
  Pages `/d/drama/<slug>/join/<role>`, `/d/drama/<slug>/brand/<ep>-<slot>` (Google sign-in, upload, consent).
- Proven on a throwaway DB (30 checks), then live. **Not built yet:** the character sheet for a paid cast member (owner
  approves the photo in /admin/drama today; making the sheet is paid fal — needs a button + OK), episode 2 writing from the
  winning branch, a public comment reply on decision. **Next:** the owner approves + schedules Ep 1 on @aolivetv and two OTHER
  accounts comment.

**Update (2026-10-20, night): Episode 1 POSTED on @aolivetv + the Unreal path built (commit `4c4c299`).**
- *The Silent Partner* Ep 1 (designed slides) posted 22:10 Lagos by the normal publisher: https://www.instagram.com/p/DeuxFr6lTyn/
  (media 18422890021159284, drama_episodes posted). Owner tests votes from two other accounts; no votes yet at commit time.
- **Picture slides:** `lib/drama/slides.ts` draws a slide over its picture (white words, fade top or bottom); `drama_art` (migration
  083) holds one picture per slide; /admin/drama → Pictures uploads/moves/removes (`/api/admin/drama/art`); Approve freezes them.
- **Unreal studio** `tools/unreal/`: README (rent a GPU machine, setup, Epic Unreal MCP via `tunnel.sh` SSH tunnel — add the .mcp.json
  entry ONLY once the machine exists), `vm-bootstrap.ps1`, `python/alux_drama.py` (4:5 CineCamera, lens by framing,
  take_high_res_screenshot at 2160x2700 — UNTESTED until the machine exists), `CREDITS.md` (apply: Microsoft for Startups → AWS
  Activate Founders → Google Start; owner signs in; company legal name per CAC still to fill). Brief per episode:
  `node tools/drama/shotlist.mjs <story> <n>`; renders in with `scripts/drama-attach-art.mjs <story> <n> <folder>`.

**Update (2026-10-20, night, later): votes from our other accounts count; PLAY sends the game link (commit `2330cfa`).**
- The owner's "Speak" from @fegorson_studio got no answer: that handle is in IG_ACCOUNTS, so the own-comment guard dropped it
  before the vote check. The drama block now runs BEFORE that guard; only the post's own account (`handleForAccount`) never
  votes. The owner's comment was re-delivered to the webhook from the log: SPEAK 1 of 2, private reply accepted.
- **A caption link is never tappable on Instagram** (and captions cannot be edited by the API). Captions now say "link in bio,
  or comment PLAY"; PLAY / GAME / LINK as a comment's first word on an episode gets the story page as a DM button
  (`LINK_WORDS` in `lib/drama/votes.ts`). Episode 1's caption still has the old line — the owner edits it in the app, and sets
  @aolivetv's bio link to https://aluxartandframes.shop/d/drama (no API for the bio either).
- Company legal name (CAC): **Aluxartandframes Enterprises**, trades as Alux Art (in `tools/unreal/CREDITS.md`).
- Verified live with signed made-up comments (PLAY answered; a @fegorson_studio vote counted; test row removed).

**Update (2026-10-21): drama episodes post AUTOMATICALLY after each vote (owner: "I don't want … to approve everything.
It should just be automatic"; commit `333980a`).**
- Story files carry `drafts`: one episode per road of the votes, `after` = the winning words so far (`SPEAK.STAY`) or a
  `*.`-ending that fits any earlier road (`*.STAY`); `tools/drama/check.mjs` checks them like posted episodes (road length,
  the parent offers the word, written once). `scripts/drama-seed.mjs` loads drafts into a LIVE story (jsonb_set on
  `content.drafts` only — posted episodes untouched), read back and checked.
- `lib/drama/advance.ts`: vote closes → the draft for that road is copied into `content.episodes`, frozen with
  `approveEpisode`, `from_word` set, queued with `scheduleEpisode` for the next 7 p.m. Lagos at least 3 h away; Telegram says
  what posts and when (nothing to approve). Per-story advisory lock; a failed queue deletes the freeze so the sweep retries; an
  episode the owner takes back with Unschedule stays frozen and is left alone. No draft for the road → one Telegram
  "not written yet"; it posts as soon as the draft is written and seeded.
- Sweep: `/api/cron/drama-advance` (internal secret), root cron `*/10` → `/home/aluxart/drama-advance.sh`, log
  `/home/aluxart/drama-advance.log` (crontab backup `/root/crontab.bak-2026-10-21-drama-advance`).
- The story page lists only episodes already on Instagram once a story is live (no spoiler for the queued one).
- **The Silent Partner:** SPEAK won Ep 1 (2 votes: @fegorson_studio and @nvidia_studio — both the owner's accounts; a DM
  "Speak" from @queenbstudios to @fegorson_studio does not count). Ep 2 "The Empty Safe" queued 2026-10-21 18:00 UTC (slides
  checked in R2). Ep 3 written for SPEAK.STAY and SPEAK.CHASE. **Ep 4 onward is NOT written** — write drafts ahead of each vote.
- Exception to "nothing posts without approval": drama episodes only. Carousels still need Approve + Schedule.

**Update (2026-10-21, later): joining the cast runs by itself; guest roles; partnership requests; new prices (commit `b63cfde`).**
Owner: prices up, "episode pictures: not yet", build the rest. Prices (migration 084, `app_config`): cameo ₦10,000, main
₦30,000, lead ₦90,000, product slot ₦30,000, episode sponsor ₦100,000 (each tier has a fixed picture count — `TIER_PACKAGE`
in `lib/drama/data.ts` — so model cost stays under the price).
- **Join:** three photos (face, face turned, whole body) via the normal upload route, originals ≤30 MB kept; `photos` jsonb on
  `drama_cast`, copied to `generated-4k/drama/cast/<id>/` once paid.
- **`lib/drama/character.ts`** (no owner step): free photo check `tools/drama/photo_check.py` (OpenCV YuNet, venv
  `/home/aluxart/drama-venv`, model `/home/aluxart/models/yunet.onnx`, run with `ulimit -v`) → `photos_needed` (plain reasons on
  the member page + email) or `making` → character sheet (4 views in costume, 16:9) + portrait (4:5), 2K, through
  `nanoBananaEdit` (follows the admin model switch) → `sheet_ready` → member says "this is me" (`accepted`) or asks ONCE to
  make it again. Paid runs counted in `drama_cast.renders`, capped at 6; a sheet without a portrait is reused; a content refusal
  or the cap → `failed` + Telegram. Started by payment (`runCastSoon`), swept by `/api/cron/drama-advance` (3 per run; the
  cron script's curl timeout is now 280 s). **`DRAMA_FAKE_RENDER=1` = stand-in images, tests only.** HEIC can't be decoded here
  → "send it as a JPEG".
- **Member page** `/d/drama/cast/<id>` (signed in as that member, or admin) + `GET/POST /api/drama/cast/[id]`; the Paystack
  return notice links to it; emails via Resend (`lib/drama/notify.ts`).
- **Credits:** `captionFor` adds "Cast: <Role> — played by <name>" for members whose character is on a slide (`who`).
- **Guest roles:** cast entries `guest: true, enters: n` (cameo) are open in a LIVE story until episode `n` is made
  (`roleIsOpen`); check.mjs makes them appear on every road of episode `n` and nowhere before; the seed adds new guests to a
  started story without touching existing roles. The Silent Partner: **Mrs Funke Adebayo** (enters Episode 4, ₦10,000) and
  **Episode 4 written for all four roads** (SPEAK.STAY.TRUST/HOLD, SPEAK.CHASE.ASK/WATCH). Episode 5+ NOT written.
- **Partnerships:** `/d/drama/partner` (+ link on every story's brand section) → `drama_partner_requests` + Telegram; owner
  replies with a price. Episode-sponsor rendering ("Presented by" on the cover) is NOT built — quote and place by hand for now.
- **Admin desk:** cast cards show the portrait and a plain step; "Finished by hand" (failed only) and "Reject".
- An **admin "Add it free" test join makes a REAL paid render** (~₦500); my tests used DRAMA_FAKE_RENDER.
- Verified live: 18 pipeline checks (fake render, made-up member, cleaned up), 10 member-page checks (temporary session,
  deleted), partner-form checks (one real request sent to the owner's Telegram marked TEST, row deleted), phone screenshots
  light/dark. **Not yet:** a real paying fan; brand slots for not-yet-made episodes can't be bought in a live story (drafts
  differ per road).

**Update (2026-10-21, night): The Silent Partner is written to the end of season one, for every vote road (commit `f5f0ef8`).**
Owner: "I want all the stories to be ready, regardless of their votes." Splitting every episode in two doubles each time
(Episode 6 alone would be 16 versions), so the roads split and **meet again** ("branch and bottleneck"): Episode 5 exists for
all 8 roads, each opening on its own night and ending in the same boardroom with the same EXPOSE / SPARE vote (shared slides
`EP5_ENDING` in the story file), so the finale needs 2 versions (`*.EXPOSE`, `*.SPARE`) ending on one season-two hook
(OPEN / LEAVE, the key's "Box 2"). Checked by walking all **32 roads** from Episode 1 to the finale through `draftFor`: none
missing, none unused. `finale: true` on an episode → its last slide/caption say the vote "decides how season two begins"
(`voteLine`), and when that vote closes `advance.ts` sets the story `finished` and tells the owner (no Episode 7 lookup).
Mrs Funke Adebayo appears on slides only in Episode 4 (her cameo package); later episodes mention her without a `who`.
**Other 7 stories: only Episode 1 written** — write each season the same way (about 10 episodes) before the story starts.

**Update (2026-10-21, later still): votes are counted until 4 p.m. the next day — the MOST votes wins (commit `346e26c`).**
Owner: "what if more than two people vote … before the time for the post, it has to change". Before, the first word to 2
votes closed the vote at once. Now `lib/drama/vote-rules.ts`: voting closes at 4 p.m. Lagos on the first day ≥12 h after the
episode posts (4 p.m. the day after a 7 p.m. post); most votes wins; a tie goes to the word that reached that number first;
fewer than `min_votes` in total → stays open until there are enough (one Telegram). `votes.ts` only counts and replies with the
score and the deadline (a comment after the deadline is told it is closed); `advance.ts` `closeDueVotes()` runs first in the
ten-minute sweep (after `syncPosted()`), closes under a row lock, then the winning road is queued; `nextSlot` now needs 2 h so
a 4 p.m. close still makes 7 p.m. Slides/captions say "Most votes by 4 p.m. tomorrow writes Episode N". **Episode 1 keeps
SPEAK** (decided under the old rule, voters were told; the WAIT road was never written). Episode 2 (queued for 7 p.m. 21 Oct)
was redrawn with the new wording, same time and row; its vote closes 4 p.m. Thu 22 Oct.

**Update (2026-10-21, evening): our products and brands inside the stories, posters, film lighting, first-visit tutorial
(commits `5d53443`, `48e6a12`; owner approved the plan).** Owner's decisions: RETOUCH is NOT public; @aolivetv is the TEST
account — the series moves to @fegorson_studio (already subscribed to comments + messages) once the game design is finished and
the cloud credits arrive; no investment schemes (licensed banks and fintechs fine); AI posters for stories without paid cast.
- **Our products:** an episode's `alux` may carry `word` (LIGHT / GIF / BOOK) + `line` (the caption's only invitation). The
  product must do something the story needs (The Silent Partner: the relit CCTV frame IS the reveal in "Camera Four" → LIGHT;
  Ifeoma's mother's induction portrait → BOOK; Adaeze's executive portrait in both finales → BOOK). check.mjs: right word for
  the product, never a vote word, never on slides 7–8, never on a slide, never two episodes in a row on any road (`walkRoads`,
  which also prints how many roads are complete). The words reach the existing shop keywords; **@aolivetv was subscribed to
  messages** (Instagram API) so the LIGHT DM flow works there too.
- **Brands:** product link (https, opened to check) + their own comment word (`checkBrandWord`: 3–14 letters, never a bot,
  game or vote word) + a "we don't place" box (`NOT_PLACED`, `NO_CLAIMS` in `lib/drama/brands.ts`); **approved on payment**
  (no owner step). A running story sells "a scene in the next episode" (`/d/drama/<slug>/brand/<n>-next`, slot_key `next`);
  `partnersFor()` puts each brand in a slot (next → first free slot of whichever version is made) and feeds the caption line
  ("Partner: X — <object> in this episode. Comment WORD to see it.") and a framed product card on the slot's designed slide;
  frozen with the episode and marked `placed`. The word → private reply with a button to `/d/go/<code>` (counts taps, 302 to
  the product); `asks`/`taps` on the private report `/d/drama/report/<token>` (emailed to the brand). Migration 085 (psql).
- **Posters** (`lib/drama/poster.ts`): 2:3 key art at 2K behind the same title design (cover.ts sets the title in the lower
  third over a picture); paid lead/main faces when they say "this is me" (story upcoming), else fictional people
  (`fal-ai/nano-banana-pro` text-to-image); max 3 per story (`cover_renders`); prompt + light kept in `cover_meta`; every later
  episode's cover slide uses it (frozen in approveEpisode). Make one: `POST /api/cron/drama-poster?slug=` (internal secret).
  **The Silent Partner's poster is made** (1 of 3, fictional cast). The other 7 wait for the owner's OK.
- **Lighting** (`lib/drama/lighting.ts`): per-genre key/fill ratio/rim/colour temperatures/practicals/haze + a named grade;
  sheets get studio reference light, portraits and posters the genre recipe; recorded with each image (`render_notes`).
- **Tutorial:** `GameTour` ("How it works" in the top bar of the shelf and story pages, once per browser, keys
  `drama-tour-shelf` / `drama-tour-story`), and a "Words you can comment" box on each story page.
- Verified live: brand word checks (8), caption line + product card drawn, a made-up brand's word answered with the button,
  tap counted, report shown (rows removed); tutorial opens on a first visit, stays closed after, reopens from the button.

**Update (2026-10-21, night): ALL 8 stories are written to the end of season one, for every vote road** (owner: "write full
seasons for the other 7 … posters not yet"). Commits `9eec9e0` Third Mainland, `f4504f4` Garden City, `115b52c` Harmattan
Letters, `0b8f960` Aso Ebi, `0d88c92` The Fourth Floor, `d7f82bc` What the River Keeps, `e4516a4` Coal City, 1962; each
copied to the server and seeded (10 drafts each; The Silent Partner has 17). Same shape everywhere: two versions per episode,
each playing out the last vote, then a shared ending (`EPn_ENDING` + `EPn_VOTE` constants spread into both drafts); Ep 6 is
`finale: true` with a season-two hook; Ep 1 now has scene lines. Product words sit in Ep 2/4/6 only (never two in a row):
LIGHT where a dark photo must be relit for the plot (Coal City does it in a 1962 darkroom), GIF for a moving save-the-date
or a first photo together, BOOK for a portrait the story needs (call-to-bar, Eid, funeral navy gele, record sleeve…).
Aso Ebi has a new **guest** role, Sade Bankole the rival planner (cameo, enters Ep 2 — open to buy until Ep 2 is made).
`node tools/drama/check.mjs` → "8 stories, 0 with problems", 32 roads complete for each. **Posters for the 7 un-started
stories are still NOT made** (owner: "not yet").

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
| Storage    | Cloudflare R2                      |
| Database   | PostgreSQL 16 on the VPS           |
| Sign-in    | Own Google OAuth (lib/auth-session) |
| Payments   | Paystack                           |
| Deployment | VPS (PM2, nginx, Cloudflare)       |

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
