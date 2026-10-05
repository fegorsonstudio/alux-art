# Carousel Studio

Builds Instagram carousels on your laptop and hands them to the server to post
on schedule. No Claude subscription, no AI, no internet needed to make a post —
only to send one.

## Starting it

```
cd "C:\Users\FUJITSU\Documents\claude apps"
node tools/carousel/server.mjs
```

Then open **http://localhost:4300**.

To let it schedule to the server as well, start it with the secret:

```
$env:INTERNAL_API_SECRET = "<the value from the VPS .env.local>"
node tools/carousel/server.mjs
```

Without that it still renders and saves; only the Schedule button is off, and
it says so when it starts.

## Making a post

1. **Name it** — for your own list, never shown anywhere.
2. **Drop the before photo.** This becomes **slide 1**, which is the thumbnail
   in the feed. It is the single thing that decided between a 20,907-reach post
   and a 102-reach one, so the app will not let a text card go first.
3. **Drop the after photo.** Slide 2, the payoff, before anyone reads a word.
4. **Write the cards.** The first card automatically shows the two photos side
   by side. The last one gets the button.
5. **Preview**, then **Save to folder**, then **Send to server & schedule**.

Saved posts land in `tools/carousel/data/posts/<id>/`:

```
01.jpg … 07.jpg      the slides, ready to post
caption.txt          the caption
source-before.jpg    your originals, kept so the post can be reopened
source-after.jpg
post.json            what you typed
```

If you would rather post by hand, stop after Save — the folder is everything
you need.

## What the server does with it

`Send to server & schedule` uploads the slides to R2 and writes a row in
`scheduled_carousels`. A cron on the VPS runs every five minutes, finds posts
whose time has come, and publishes them through Instagram's API — three steps:
a container per slide, a carousel container, then publish.

Your laptop can be shut. If a post fails three times you get a Telegram
message naming the reason; the slides are never lost.

## The two batches

- **Load the plan** brings in the main 88 posts on their fixed dates,
  5 October to 7 March. The dates can't move as a block: the Christmas, New
  Year, Valentine's and Mother's Day posts are written for those exact days.
- **Load the experiment** brings in Photo Wahala, 44 microdrama episodes, from
  whichever Monday you pick, at 1pm so they never clash with the 7pm posts.
- **Remove the experiment** (click twice) deletes all 44 drafts and withdraws
  any episode already sent to the server. If the server can't be reached it
  removes nothing, rather than hide a post that would still go out. Episodes
  already published are named so you can take them down on Instagram by hand.

## Things worth knowing

- **Instagram takes at most 10 slides.** The app refuses more rather than
  silently dropping any.
- **Only accounts whose token is on the server** can be scheduled to. It checks
  before accepting, instead of failing quietly later.
- **Re-sending the same post replaces it.** A duplicate row would be a
  duplicate on the feed, and that cannot be taken back.
- **A post whose date has passed won't schedule.** The server publishes
  anything due on its next run, so it would go out within minutes. Give it a
  new date and Save first.
- **The queue is a plain JSON file** at `tools/carousel/data/queue.json`. Open
  it, read it, back it up. No database to install or lose.
- **`data/` is not in git.** Your posts and photographs stay on your machine.
