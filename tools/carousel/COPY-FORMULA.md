# How every carousel here is written — Photo Wahala

**Every carousel on this account is a Photo Wahala episode.** The owner made
the microdrama style the house style for all carousels on 6 October 2026,
after the experiment. Any new carousel follows this page; the earlier formula
(Sabri Suby's HVCO covers) is retired and only lives in git history.

The style is the short serial drama built for phones: an episode drops you
into a fight already happening and ends on a question instead of an answer.
The photo fix is the turn in the story, never a feature list.

| | Where | When |
|---|---|---|
| Season 1 — 11 stories, `m01`–`m44` | `plan-microdrama.mjs` (+ `storyboard.mjs`, `gif-scripts.mjs`) | 1pm, from a Monday the owner picks in the studio |
| Season 2 — 22 stories, `p01`–`p88` | `season2/s2-01.mjs` … `s2-22.mjs`, built by `plan-season2.mjs`; the plan is `season2/OUTLINE.md` | 7pm, fixed dates from 5 Oct 2026 to 7 Mar 2027 |

A new season gets its own `seasonN/` folder, an `OUTLINE.md` first, and a
builder like `plan-season2.mjs`. Then `node scripts/carousel-seed.mjs` loads it
into the website studio (`/admin/carousel`).

## The loop

**One story a week, four episodes.** Monday sets the stakes, Wednesday and
Friday escalate, Sunday pays off — the villain gets theirs, the hero wins — and
the last card teases next Monday's story. A season's last Sunday ends the
season instead.

**Dated days say so.** An episode that posts on Christmas Day, New Year's Day,
Valentine's Day or Mothering Sunday is written for that day and names it.

## Every episode, in this order

1. **The before and the after** (the app always puts them first — slide 1 is
   the thumbnail). Here they are the ending shown up front; the story is how
   the character got there.
2. **Cold open** (card 1). Mid-conflict, no setup. "Tolu posted Kemi's worst
   photo to 214 people." The builder adds the series label under it.
3. **Previously** (episodes 2–4). One line, so a stranger can start anywhere —
   people meet carousels in the middle of the feed, not in order.
4. **Beats** — three in episode 1, two after that. Timestamp and speaker in the
   small label; the line itself big. Real chat rhythm: short, specific numbers
   and times, Nigerian texture, dialogue in curly quotes.
5. **Cliffhanger.** Tension, not resolution. "Then the bride's mother replied."
6. **The close.** A directive tied to the story ("Send me the photo the hall
   lights ruined."). The builder adds "To be continued · Ep 2 on Wednesday" and
   the comment word.

Six cards; with the two photos and the two story pictures, ten slides —
Instagram's limit.

**Two story pictures per episode**, full-screen and wordless, after cards 2 and
4 in episode 1 and after cards 3 and 4 after that. The owner makes them in
Google Flow from the prompts in the studio (Nano Banana, 3:4, 2K). The main
character is the real person in the before and after; supporting characters
are invented, each with a portrait prompt made once and attached to every
scene they are in.

**The caption** retells the episode in two to four short paragraphs (emoji
live here, never on slides), then the builder adds when the next episode drops,
the comment word, "The story is made up. The result is real." and the hashtags.

**The GIF** — four lines of three or four words, the last one the reveal, for
a story GIF that people can find in Instagram's comment GIF search.

## Rules that never bend

- **No emoji on the slides.** The renderer cannot draw them. Captions only.
- **Every caption ends "The story is made up. The result is real."** (added by
  the builder — never hand-write it, never drop it).
- **The person in the photos agreed to play the part**, including AI-made
  story pictures of them: a model, a friend, staff. Not a customer from the
  consent ask — they agreed to a before-and-after, not to being cast.
- **No real businesses, brands, venues, churches, blogs or celebrities.**
  Rivals are "the big page", "an Ikoyi boutique", "the big gym".
- **Only true timeframes.** The same day, by morning, minutes to hours later.
- **Only words the bot answers.** Every "Comment WORD" must be in `KEYWORDS`
  in `lib/instagram-keywords.ts`:

| Word | What the reply sells | How the story shows it | Price on the slides |
|------|----------------------|------------------------|---------------------|
| LIGHT | Relighting, done in the chat | The same photo, relit: real skin tone, faces visible, nothing else changed | ₦1,000 a photo |
| STUDIO | The Gear Equalizer | The same photo — person, pose, outfit — with a studio backdrop and the lighting look they pick | ₦1,000 a photo |
| ASSETS | The Asset Extractor | One product photo in; clean front, three-quarter, side and back views out | ₦1,000 a photo |
| BOOK | The full shoot | One photo of you in; a set of 1, 5 or 10 images, the same face in every one | none — the link has the packages |
| GIF | The sticker, made in the chat | Two pictures and a few words become a sticker people use in their stories | none, and no link promised |

Name ₦1,000 at most once per story on the slides; the closing card already
carries it. There is no SHOOT: matching is whole-word, and "nice shoot!" would
fire a sales DM under every compliment.

## Checking a season

`node tools/carousel/season2/check.mjs` checks every Season 2 story file:
card counts and lengths, no emoji or hashtags on slides, comment words and
prices, the story-picture slots and cast names, GIF line lengths, and that the
holiday episodes name their day.
