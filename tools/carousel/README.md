# Carousel plan

The Instagram carousels are made and scheduled on the website now:
**https://aluxartandframes.shop/admin/carousel** (admin login). The laptop
studio that used to live in this folder was retired on 2026-10-06. Nothing
needs to run on a laptop, and the page works on a phone.

This folder holds the **written plan** — the words of every post — and how
they are written. **Every post is a Photo Wahala microdrama episode** (the
owner's decision, 6 October 2026):

| File | What it is |
|---|---|
| `stories/s1-01.mjs` … `s1-11.mjs` | Season 1: 11 stories, Mon 12 Oct – Sun 27 Dec 2026 |
| `stories/s2-01.mjs` … `s2-18.mjs` | Season 2: 18 stories, Mon 28 Dec 2026 – Sun 2 May 2027 |
| `stories/dec-1.mjs` … `dec-4.mjs` | December specials, held for December 2027 (hidden, undated) |
| `schedule.mjs` | The calendar: turns every story into its four dated posts, 7pm Mon/Wed/Fri/Sun |
| `storyboard.mjs` | Turns each story's cast and scenes into Google Flow prompts |
| `COPY-FORMULA.md` | The writing engine every story follows |
| `RESEARCH.md` | Why: how China's hit micro-dramas are written, with sources |
| `stories/check.mjs` | Checks every story file against the engine's rules |

Each story file holds all four episodes: slides, captions, the cast, two story
pictures per episode and the GIF lines.

## Changing the plan

Edit the files here, run `node tools/carousel/stories/check.mjs`, deploy them
to the server, then load them:

```
node --env-file=.env.local scripts/carousel-seed.mjs --dry-run
node --env-file=.env.local scripts/carousel-seed.mjs
```

Safe to run again. It refreshes the words only on posts the owner has not
edited, approved or scheduled on the website, and never touches photographs,
story pictures or hand-set dates.

## How a post goes out (on the website)

1. **Photos.** Every post needs its before and after photograph. The before
   becomes slide 1 — the thumbnail, which decided between a 20,907-reach post
   and a 102-reach one — so a text card never goes first.
2. **Story pictures** (Photo Wahala episodes only). Copy each prompt into
   Google Flow (Nano Banana, 3:4, 2K), attach the faces it lists, and drop the
   result on that same picture's box. Episodes come to 10 slides, Instagram's
   limit.
3. **Preview**, read every slide, **Approve**, **Schedule**. The server posts
   it at its time (`/api/cron/publish-carousel`).

Rules the website enforces:

- Only the version just previewed can be approved. Any change to the words or
  pictures puts a post back to draft, and a scheduled post that changes is
  taken off the schedule until it is approved again.
- A post whose time has passed won't schedule — it would go out at once.
- Once Instagram has a post, nothing on the website can change or resend it.
- Nothing reaches Instagram unless the owner pressed both Approve and Schedule.
- Download slides gives a zip of every slide, the caption and the story GIF.

## Story GIFs

Each post's GIF is made on the server with the same engine as the paid GIF
Maker. It goes to GIPHY only with the tick saying everyone in the photos agreed
to a **public** GIF, and only once — GIPHY's API has no delete. For the GIFs to
show up in Instagram's comment GIF search, the GIPHY account must be an
approved Brand channel.

## Where things live

- Slides are drawn by `lib/carousel/render.ts` in Outfit (`deploy/fonts`,
  installed by `deploy/install-fonts.sh`).
- Posts: table `carousel_posts`; the publishing queue: `scheduled_carousels`;
  GIFs: `carousel_gifs`. Photos and pictures are in R2 under
  `generated-4k/carousels/studio/<post>/`.
