# Carousel plan

The Instagram carousels are made and scheduled on the website now:
**https://aluxartandframes.shop/admin/carousel** (admin login). The laptop
studio that used to live in this folder was retired on 2026-10-06. Nothing
needs to run on a laptop, and the page works on a phone.

This folder holds the **written plan** — the words of every post — and how
they are written:

| File | What it is |
|---|---|
| `plan.mjs`, `plan-newyear.mjs` | The 88 main posts, 5 October to 7 March, on fixed dates |
| `plan-microdrama.mjs` | Photo Wahala, the 44-episode microdrama experiment |
| `gif-scripts.mjs` | Each post's short story-GIF lines |
| `storyboard.mjs` | Each episode's cast and story-picture prompts for Google Flow |
| `COPY-FORMULA.md` | The HVCO and microdrama rules every post is written to |

## Changing the plan

Edit the files here, deploy them to the server, then load them:

```
node --env-file=.env.local scripts/carousel-seed.mjs --dry-run
node --env-file=.env.local scripts/carousel-seed.mjs
```

Safe to run again. It refreshes the words only on posts the owner has not
edited, approved or scheduled on the website, and never touches photographs,
story pictures, hand-set dates, or whether the experiment is showing.

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
- The Photo Wahala experiment is loaded from a chosen Monday (1pm posts) and
  removed with one button, which also withdraws any episode already scheduled.

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
