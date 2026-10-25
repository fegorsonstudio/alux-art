# Alux Micro Drama — the platform (owner's brief, 2026-10-25)

The owner's update, in their words, then what exists today, what was built for it on
2026-10-25, what it needs next, and the honest state of "50 million users in the first
week".

## The brief

- People **collaborate, create, sponsor and advertise through micro dramas, right from
  Instagram.** They can publish by **downloading the outputs** or by **publishing on our
  sister app** (not built yet; Netflix-style, for micro dramas).
- **Brands** sponsor micro dramas or place products. A sponsor sees the cast, the story
  arc and the **total budget to produce the first season** with every cost, and can pay for
  the production.
- **Actors and creators keep earning** from dramas they made before — a continuous
  payment — and choose to post the content on their own page or publish on ours.
- **Production:** both pictures and video on our platform. Micro dramas start with
  **carousels only**, then **carousels with generated pictures**, then **video only**.
- **The outputs of each episode go to the people who collaborated on it.**
- **Anyone can create their own short drama and invite friends to collaborate via
  Instagram.**
- **Pricing:** 400 % profit on cost. Estimate the cost to produce anything, add 50 % in
  case some images or videos don't generate well, then add the profit.
- **Tools:** the Higgsfield short-drama workflow (tools/drama/skills/source/) with
  Higgsfield → Alux Art, ChatGPT → DeepSeek (`deepseek-flash` = DeepSeek-V4.1-Flash-1017),
  Soul → `fal-ai/nano-banana-2/edit`. The character sheet template follows the
  tutorial's format. The game (Unreal) waits for cloud credits.

## What exists today (before 2026-10-25)

Stage 1–2 of the drama (claude.md, 2026-10-20/21): 8 house stories written to the
season-one finale on every vote road; designed carousel episodes posting themselves
after each vote; votes by comment; fans buy roles (sheet + portrait made by itself);
brands buy product spots and partner words; partnership requests; posters; lighting
recipes; sound v2 in preview mode. All of it on one Hetzner VPS (down since 2026-10-22,
payment not received).

## Built on 2026-10-25 (free, local, committed; nothing deployed — the server is down)

| Piece | Where | State |
|---|---|---|
| The two Higgsfield skills, downloaded, and the blog + video notes | `tools/drama/skills/source/` | read in full |
| **Alux Short Drama Screenwriter** (our rewrite) | `tools/drama/skills/alux-short-drama-screenwriter.md` | done |
| **Alux Cinematic Prompt Writer** (our rewrite: stills for nano-banana-2/edit, video rules kept for phase 3) | `tools/drama/skills/alux-cinematic-prompt-writer.md` | done |
| **DeepSeek brain** | `lib/deepseek.ts` (website), `tools/drama/brain.mjs` (scripts) | done; needs `DEEPSEEK_API_KEY` in `.env.local` |
| **The screenwriter** — DeepSeek writes a whole season in the story-file shape, the referee (`check.mjs`) sends problems back, up to 3 repairs, writes `stories/<slug>.mjs` | `tools/drama/screenwriter.mjs` | built; the free `--check` path tested; a real run needs the key (~$0.05 a season) |
| **Budget engine** — cost of every paid call + 50 % buffer, × 5 | `lib/drama/budget.ts` (+ `budget-rates.ts` for app_config overrides), `tools/drama/budget.mjs` | done, tested on The Silent Partner |
| **Sponsor page** — cast, arc, budget per format, "Fund season one" (request to the owner) | `/d/drama/<slug>/sponsor` | built, type-checks; link on each story page |
| **Character sheet format** — three panels on one grey: full body front (face erased), full body back, one portrait | `lib/character-sheet-order.ts` SHEET_LAYOUT; `lib/drama/character.ts` uses it | done; unproven on a real render |
| **Schema draft** for the platform | `migrations/087_drama_platform.sql` | draft, NOT applied |

Budget, The Silent Partner, 6 episodes, 7 characters (`node tools/drama/budget.mjs the-silent-partner`):

| Format | Cost | +50 % | Production | Price (× 5) |
|---|---|---|---|---|
| carousel (designed slides + soundtrack) | $4.73 | $2.37 | $7.10 | $35.50 ≈ ₦56,800 |
| pictures (+36 generated pictures) | — | — | $13.58 | ≈ ₦108,700 |
| video (placeholder $0.35/s until a real clip is billed) | — | — | $202.58 | ≈ ₦1,620,700 |

The cast and brand prices already set (₦10k–90k a role, ₦30k a spot, ₦100k a sponsor)
sit far above the production cost of a designed-carousel season; the margin rule bites
once pictures and video arrive.

## The platform, piece by piece

### 1. Creator studio — "make your own drama, invite your friends"

- `/d/drama/create`: brief (idea, city, genre, format), **the screenwriter writes the
  season** (DeepSeek, ~$0.05), the referee checks it, the creator reads it and edits
  captions in place. The story row gets `created_by`, `visibility = 'private'`.
- **Invite from Instagram:** the creator posts the cover on their own page and comments
  `INVITE @friend` (our bot on their connected account) or sends the invite link in a DM
  themselves. The link (`drama_invites.token`) opens the role or job page; the friend
  signs in with Google, joins as a collaborator (`drama_collaborators`), sends three
  photos if they play a role (the existing join flow), and their character sheet is made
  by itself. No cast fee inside a creator's own drama; the creator's budget pays for it.
- **Who pays production:** the creator (the budget page, Paystack, `drama_sponsorships`
  with `brand_name = the creator`) or a sponsor they bring.
- **Publish:** `own_page` → the deliverables zip (slides, cover video, soundtrack,
  caption) for every episode, downloaded from the member page; `shelf` → the episode
  posts on our Instagram and sits on the shelf like a house story; later `sister_app`.

### 2. Sponsors — "see the cast, the arc, the budget; pay for season one"

Built today as a page and a request. Next: the Paystack branch
(`metadata.type = 'drama_sponsor'`, amount ≥ `price_ngn`, once per reference) in the
shared webhook — **a shared-file change that needs the owner's OK** — then
`drama_sponsorships.status = 'paid'` starts production of the format bought, and the
sponsor's brand goes onto every cover ("Presented by", `lib/drama/cover.ts`) and into the
captions (`captionFor`).

### 3. Continuous pay — "actors keep earning from dramas they made"

Every naira a story earns becomes a `drama_revenue` row with a **pool**: what is left
after production cost (the budget's production figure, pro rata per episode) and our
margin. The pool is split by `drama_collaborators.share_bp` into `drama_earnings`
rows. Suggested default shares of the pool: creator 40 %, lead actor 20 %, main roles
10 % each (split if more), cameos 2 %, the rest to the house. Payouts are rows of the
opposite sign; a member page shows the balance and requests a payout (Paystack
transfers, monthly, above ₦5,000). Sources today: role purchases, product spots, sponsor
payments, product-word sales; later: sister-app views and subscriptions.

### 4. Outputs to the collaborators

`drama_deliverables` is written when an episode is approved/queued (`approveEpisode`
already freezes the slides in R2) and when the soundtrack passes: slides zip, cover
video, soundtrack, caption, their character sheet and portrait, the poster. The member
page (`/d/drama/cast/<id>`, extended to collaborators) lists them with signed 7-day links.

### 5. Production phases

1. **Carousels** — live today (designed slides, sound v2 in preview).
2. **Carousels with pictures** — `lib/drama/pictures.ts` (to build): for each slide 2–7 the
   prompt writer's prompt + the sheets of the characters on the slide + the location
   image → `nanoBananaEdit` at 2K → `drama_art` (the table and the admin upload already
   exist; `slides.ts` already draws words over a picture). One location image per story
   (a three-quarter view, the tutorial's rule), one group image where extras appear.
   Retakes come out of the 50 % buffer; a release check (Gemini, like the sound's) judges
   likeness against the sheet before a picture is accepted.
3. **Video** — Seedance through fal with the clip rules kept in the prompt writer;
   the cast's voices from the sound engine; one-minute episodes cut from two clips.

### 6. The sister app

A Netflix-style shelf for micro dramas. The API it needs already exists in pieces:
`shelfStories`, `storyBySlug`, the episode slides in R2, the cover video. To build later:
a read API with tokens for the app, `drama_publications.channel = 'sister_app'`,
view counting into `drama_revenue (source = 'view')`.

### 7. The game — later (Unreal, cloud credits pending; `tools/unreal/`).

## Scaling honestly: "50 million users the first week"

What we run today: one Hetzner VPS (the app in PM2 behind nginx and Cloudflare, Postgres
on the same box, every image job fenced to 1.7 GB), paid generation on fal and Gemini,
media on R2. That serves thousands of people a day, not millions. What would have to be
true for a spike of that size, in the order it matters:

1. **Pay the bill.** The site has been off since 2026-10-22 because Hetzner did not
   receive the payment. Nothing below matters until it is back.
2. **Cache the public pages at the edge.** `/d/drama` and the story, sponsor and cover
   routes are the same for every visitor: set `Cache-Control: public, s-maxage=60,
   stale-while-revalidate=600` and let Cloudflare serve them. The origin then sees one
   request a minute per page, however many people look. (The cover endpoint already draws
   on every call — it should be cached the same way.)
3. **Keep media on R2 and link to it.** Slides, pictures, covers and downloads are
   already files on R2; serve them through Cloudflare links, never through the app.
4. **Split the writes from the reads.** Votes, joins and payments are the only writes
   from the public; they are small rows with unique indexes and advisory locks already.
   Move Postgres to its own machine (or Hetzner's managed one) before any campaign, and
   put the app on two or three small boxes behind Cloudflare's load balancer. The app is
   stateless (sessions are rows, files are on R2), so adding boxes is just adding boxes.
5. **Queue the paid work.** Generation already runs as cron sweeps (`drama-advance`,
   `drama-sound`, `retouch`); they must stay the only callers of fal/Gemini/DeepSeek, with
   the per-run caps they have, so a spike in viewers never becomes a spike in spend.
   The real ceiling is money, not servers: at 2K pictures every episode of every creator
   drama costs about $0.50 of images and $0.25 of sound before the buffer.
6. **Instagram is the real bottleneck.** Comments and DMs come through Meta's webhook with
   Meta's rate limits (and a 24-hour reply window). Vote counting must stay a cheap insert;
   anything else moves to the sweep.
7. **Watch it.** Error logs and the Telegram watchdogs exist; add an uptime check and a
   queue-depth alert before a launch.

None of this is in the code yet; steps 2 and 3 are a day's work and free, step 4 is
money (a second server and a managed database), steps 5–7 are already mostly true.

## Next steps, in order

1. Server back → deploy what was built today (`next build` proven locally) and apply
   `migrations/087_drama_platform.sql` with psql.
2. Owner adds `DEEPSEEK_API_KEY` to `.env.local` → first screenwriter run on a brief the
   owner chooses (~$0.05) → read it as an editor → seed.
3. Owner OKs the shared-file changes: the Paystack `drama_sponsor` branch; the
   `INVITE` word in the Instagram webhook; the creator studio pages.
4. Rewrite the 8 house stories with the screenwriter where the owner wants changes
   (posted episodes stay frozen).
5. Phase 2 pictures: `lib/drama/pictures.ts` + the release check; first episode with
   pictures on @aolivetv (paid, per-run OK).
6. Edge caching + the second server before any big push.
