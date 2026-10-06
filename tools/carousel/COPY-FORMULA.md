# How every carousel here is written — Photo Wahala

**Every carousel on this account is a Photo Wahala episode** (the owner's
decision, 6 October 2026). The writing engine below was rebuilt the same day
from research into how China's hit micro-dramas (短剧) are written —
`RESEARCH.md` has the findings and the sources.

| | Where | When |
|---|---|---|
| Season 1 — 11 stories | `stories/s1-01.mjs` … `s1-11.mjs` | Mon 12 Oct – Sun 27 Dec 2026 |
| Season 2 — 18 stories | `stories/s2-01.mjs` … `s2-18.mjs` | Mon 28 Dec 2026 – Sun 2 May 2027 |
| December specials — 4 stories | `stories/dec-1.mjs` … `dec-4.mjs` | held, undated, for December 2027 |

One post at 7pm Lagos, Monday, Wednesday, Friday and Sunday. `schedule.mjs`
builds the posts from the story files; `node scripts/carousel-seed.mjs` loads
them into the website studio (`/admin/carousel`). Check every story with
`node tools/carousel/stories/check.mjs` before seeding.

## The engine in one paragraph

Hold the hero down, then lift them (先抑后扬). Someone underestimates the hero
**out loud, in public**; the photo is the face-slap (打脸). Every episode opens
in the middle of the blow, has one turn, and stops on new information. A hidden
truth is planted early and paid off late, so the twist feels earned. The villain
says one quotable insult and gets it thrown back. The ending is public,
witnessed and satisfying — and leaves one new question.

## The story (one file, four episodes, one week)

1. **One engine sentence** (`engine`): "[Underestimated hero] must [goal] before
   [deadline], while [antagonist] [obstacle]." Every episode serves it.
2. **The curve.**
   - **Ep 1 (Mon) — the slap lands.** Public humiliation in the first slide;
     the hero is dismissed out loud; one small sign of fight in them.
   - **Ep 2 (Wed) — the villain wins, for now.** It gets worse, bigger, more
     public. The hero acts (sends the photo, books the shoot). The hidden truth
     is planted by the end of this episode at the latest.
   - **Ep 3 (Fri) — the reversal.** The result lands; the face-slap begins; the
     villain fights back, so it is not over.
   - **Ep 4 (Sun) — the payoff.** Public, witnessed, total: the insult is
     thrown back, every clue is paid off, the villain is humbled (never
     destroyed — this is Nigeria, they will be at the next owambe). Then the
     builder ends on next Monday's hook.
3. **Stakes rise every episode** — a bigger audience (the group chat → the hall
   → the whole of Instagram), more money, or a relationship that matters more.
4. **At most three named characters**: the hero, the antagonist, and one
   sidekick or matriarch (a fourth only when the story cannot stand without
   them). Each has a `label` — "Tolu, the group admin" — used the first time
   they appear.
5. **The hidden truth** (`secret`) — the thing nobody knows that turns the
   story: who really took the photo, why the aunty is so against her, what the
   rival paid for theirs. Planted in Ep 1 or 2, paid off in Ep 3 or 4, with a
   visible clue in a story picture before the reveal. Reasonable, never magic.
6. **The insult and the throwback** (`insult`, `throwback`) — the antagonist's
   quotable dismissal (10 words or fewer) in Ep 1 or 2, thrown back in Ep 3 or
   4. Both lines appear on the slides word for word.
7. **One anti-trope beat** (`antiTrope`) — the place the story refuses the
   expected move: the heroine does not suffer quietly, the villain has a
   reason, the sidekick gets the win. Predictability kills these series.
8. **Nigerian set pieces and stakes** — owambe, bride price, aunties, NEPA,
   the family group chat, Lagos traffic. No imported fantasy tropes, no
   billionaires in disguise: the "hidden identity" is a human-sized truth.
9. **Hook** (`hook`) — two lines that sell this story in one breath. They are
   the cliffhanger on the previous story's Sunday post ("Next Monday on Photo
   Wahala"). Line 1 is the slap; line 2 is the stakes.

## Every episode, in this order

1. **The before and the after** — the app always puts them first. They are
   the payoff shown up front; the story is how the hero got there.
2. **Cover** (card 1) — the golden three seconds. The moment of humiliation
   or crisis, already happening: a shocking line, a face reacting, or a reveal
   in motion. **14 words or fewer, no scene-setting.** Ep 2–4 covers pick up
   exactly where the last cliffhanger cut — no reset, no time skip.
3. **Previously** (Ep 2–4) — one line, **15 words or fewer**, dramatised: the
   quoted line that started it, or a single image. Never a summary paragraph.
4. **Beats** — three in Ep 1, two after. Timestamp and speaker in the small
   label; the line big. **One thought per slide.** Dialogue lines are 10 words or
   fewer and sound spoken (curly quotes). Bodies 22 words or fewer. Specific
   numbers and times. No inner monologue, no explaining feelings, no narrator.
5. **Cliffhanger** (Ep 1–3, `twist`) — a real 卡点, with its `cliff` type:
   - `reveal` — new information cut off mid-way ("Then the bride's mother replied.")
   - `reversal` — the power flips the wrong way
   - `deadline` — a clock starts ("Photos on the church page by 9am.")
   - `intrusion` — someone powerful walks in or messages
   - `document` — a photo, a receipt, a screenshot, half-shown

   It always adds something new. Never "to be continued" on its own, never a
   restatement, never a gasp at something the reader can't know about. Use at
   least two different types across the three cliffhangers.
6. **The close** — a directive tied to the reader's own wahala ("Send me the
   photo the hall lights ruined."). The builder adds "To be continued" and the
   comment word.

Six cards; with the two photos and the two story pictures, ten slides —
Instagram's limit.

**Two story pictures per episode**, full-screen and wordless, after cards 2 and
4 in Ep 1 and after cards 3 and 4 after that. Tight on faces and hands, at peak
emotion — ideally one at the blow and one at the reaction. The owner makes them
in Google Flow from the prompts in the studio. The hero is the real person in
the before and after; supporting characters are invented, each with a
description that becomes a portrait made once and attached to every scene.

**The caption** retells the episode in two to four short paragraphs, in the
same voice (emoji live here, never on slides). The builder adds when the next
episode drops, the comment word, "The story is made up. The result is real."
and the hashtags.

**The GIF** — four lines of three or four words, the last one the reveal.

## Rules that never bend

- **No emoji on the slides.** The renderer cannot draw them. Captions only.
- **No hype words** — stunning, masterpiece, epic, breathtaking, flawless,
  insane, jaw-dropping, mind-blowing. **One exclamation mark per episode**, at
  most, across the slides.
- **Every caption ends "The story is made up. The result is real."** (added by
  the builder — never hand-write it, never drop it).
- **The person in the photos agreed to play the part**, including AI-made
  story pictures of them: a model, a friend, staff. Not a customer from the
  consent ask.
- **No real businesses, brands, venues, churches, blogs or celebrities.**
  Rivals are "the big page", "an Ikoyi boutique", "the big gym".
- **Only true timeframes and true results.** The same day, by morning, minutes
  to hours later. A relit photo is the same photo relit — the story never
  claims the product changed an outfit, a face or a body.
- **Holiday episodes name their day:** S1 Story 11 Ep 3 (Christmas Day),
  S2 Story 1 Ep 3 (New Year's Day), S2 Story 7 Ep 4 (Valentine's Day),
  S2 Story 10 Ep 4 (Mothering Sunday), S2 Story 13 Ep 4 (Easter Sunday),
  December Special 4 Ep 3 (Christmas Day).
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

## The story file

```js
export default {
  id: "s1-01",                    // the file name; the calendar's name for it
  title: "The Asoebi Group Chat",
  product: "relight", trigger: "LIGHT",
  tags: ["#asoebi", "#owambe", "#naijawedding"],   // three; #photowahala and #aluxart are added
  photos: "What the before and after show.",
  person: true,                   // the photos show a person (then one cast member is real)
  engine: "Kemi must …, before …, while Tolu …",
  hook: ["The slap, in one line.", "The stakes, in one line."],
  secret: { truth: "…", planted: 1, paid: 4 },
  insult: { ep: 1, line: "“Kemi, is this you or your shadow?”" },
  throwback: { ep: 4, line: "“Tolu, is this you or your shadow?”" },
  antiTrope: "…",
  cast: [
    { name: "Kemi", label: "the bridesmaid", real: true, who: "the woman in this story's before and after." },
    { name: "Tolu", label: "the group admin", real: false, who: "a Nigerian woman of 30, …" },
  ],
  eps: [
    { cover, beats: [[eyebrow, headline, body], …], twist: [eyebrow, headline, body?], cliff: "reveal",
      close, caption, ask, scenes: [{ after, attach, setting, subject, details }, …], gif: [4 lines] },
    { cover, previously, beats, twist, cliff, close, caption, ask, scenes, gif },
    { … },
    { cover, previously, beats, close, caption, ask, scenes, gif },   // Ep 4: no twist — the next story's hook goes there
  ],
};
```
