# How every carousel here is written

Sabri Suby's High-Value Content Offer structure, from *Sell Like Crazy*. This
is the house formula. Any new carousel written for this account follows it,
and `plan.mjs` is already built this way: **card 1 of every post is the cover.**

## 1. The cover — one of exactly four title formulas

Never improvise a cover. Pick the formula that fits the product and fill it in.

| # | Formula | Suby's example |
|---|---------|----------------|
| 1 | *X ways to achieve **[desirable thing]** without doing **[undesirable thing]*** | 6 Ways to Get Washboard Abs Without Doing a Single Sit-Up |
| 2 | ***[Do difficult thing]** in **[specific period]** even if **[shortcoming]*** | Pay Off Your Mortgage in 7 Years Even if You Have a Modest Income |
| 3 | *Achieve **[desirable thing]** like **[an expert]** even without **[something expected]*** | Paint Masterpieces Like Picasso Without Ever Having a Single Lesson |
| 4 | *How to eliminate **[biggest problem]** without doing **[the thing they hate]** within **[timeframe]*** | How to Eliminate Your Muffin Top Without Giving Up Foods You Love — Within 21 Days or Less |

How they map onto what this studio sells:

- **Formula 1** — counting ways to get a good photograph without a studio, a
  camera or a reshoot.
- **Formula 2** — the speed claim. Only ever with a number that is true: the
  same day, by morning.
- **Formula 3** — "like a boutique", "like a studio", without the model,
  mannequin or ring light a vendor assumes they need.
- **Formula 4** — the strongest for relighting, because the customer already
  has a named enemy: a dark photo, an orange hall, a flash that flattened them.

## 2. The body slides

- **Every slide answers a burning question.** Not a feature — a thing the
  customer has actually wondered about their own photographs.
- **Keep the promise.** A cover that counts three ways owes three ways. A cover
  that says "the same day" owes a slide that says when. Nothing in the body may
  quietly be about something else.
- **One idea per slide, written for a skimmer.** A subhead that works alone and
  a body line that earns the swipe.

## 3. The final slide

A directive. Not a summary, not a thank-you: the single next action, and the
word to type.

## Two rules of this account that sit on top of Suby

**The rendered slide 1 is a photograph, not the cover text.** The app puts the
before and after first and the cover card third, because the first slide is the
thumbnail and a text card there reached 102 people against 20,907 for a photo.
The cover's job is to hold the swipe once the photograph has earned it.

**Only true timeframes.** "The same day" and "by morning" are real. Nothing
here claims an hour, or a result the studio cannot produce.

**Only words the bot answers.** Every "Comment WORD" must be in `KEYWORDS` in
`lib/instagram-keywords.ts`. Which word sells what:

| Word | What the reply sells | Price on the slide |
|------|----------------------|--------------------|
| LIGHT | Relighting, done in the chat | ₦1,000 a photo |
| STUDIO | The Gear Equalizer: their own photo, a new backdrop and the lighting look they pick | ₦1,000 a photo |
| BOOK | The full shoot: one photo of you, a set of 1, 5 or 10 | none — the link has the packages |
| ASSETS | The Asset Extractor | ₦1,000 a photo |
| GIF | The sticker, made right there in the chat | none, and no link promised |

There is no SHOOT. Matching is whole-word, and "nice shoot!" would fire a sales
DM under every compliment.

---

# The other style: microdrama (Photo Wahala)

Used only when asked for, and kept in its own file, `plan-microdrama.mjs`, so
the batch can be removed whole. Modelled on the short serial dramas built for
phones: an episode drops you into a fight already happening and ends on a
question instead of an answer.

**The loop.** One story a week, four episodes. Monday sets the stakes,
Wednesday and Friday escalate, Sunday pays off — the villain gets theirs, the
hero wins — and teases next Monday's story.

**Every episode, in this order:**

1. The before and the after. Here they are the ending shown first; the story
   is how the character got there.
2. **Cold open.** Mid-conflict, no setup. "Tolu posted Kemi's worst photo to
   214 people."
3. **Previously** (episodes 2 to 4). One line, so a stranger can start
   anywhere — people meet carousels in the middle of the feed.
4. **Beats.** Timestamp and speaker in the small label, the line itself big.
   Real chat rhythm: short, specific, Nigerian.
5. **Cliffhanger.** Tension, not resolution. "Then the bride's mother replied."
6. **To be continued.** The next episode's day, then the one comment word.

**The product is the turn in the story**, never a feature list: the photo gets
fixed, and that is what changes what happens next.

**Three hard rules.** No emoji on the slides (the renderer draws them as
outlines). Every caption ends "The story is made up. The result is real." And a
person in the photos must have agreed to play the part — not a customer from
the consent ask, who agreed to a before-and-after, not to being cast.
