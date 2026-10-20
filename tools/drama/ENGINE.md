# Alux Micro Drama — the story engine

Written 2026-10-20 for the owner's brief: classy people, neat stories, very little
text, every genre, all of Nigeria (not just Lagos), cliffhangers that burn,
viewers decide what happens next, fans join the cast with their own photo,
brands buy a place in the scene. Pictures only — no video.

This is a NEW engine. It is not Photo Wahala (that series keeps its own rules in
`tools/carousel/COPY-FORMULA.md`). One file per story lives in `stories/`;
`node tools/drama/check.mjs` enforces the rules below that a machine can check.

---

## 1. The picture tells the story. The words only point.

Every slide is one photograph that a person can read in two seconds. The image
carries who, where, and how it feels. The caption adds the one thing a picture
cannot say: a thought, a line someone speaks, the time on a clock, a message
on a phone.

- **At most 12 words on a slide.** At most 70 words in a whole episode, cover
  and choice not counted. If a caption needs more, the picture is wrong.
- **Write what the eye would catch.** A brass key on a ribbon. Rain on the
  zinc. A phone at one percent. Concrete nouns and one strong verb — never
  "she was sad", "tension filled the room", "little did he know".
- **Classy means restraint.** No shouting capitals, no emoji, no exclamation
  marks outside someone's mouth, no slapstick, no insults for their own sake.
  Let a silence, a look or an object do the work.
- **Each `see` direction is written for the camera:** who is in frame, where,
  the light, the one telling detail, and where the caption sits (keep that
  third of the frame quiet). Never ask for written words in the image except a
  prop the story needs (a letter, a phone screen, a signature).

## 2. The episode: eight slides, always the same rhythm

| # | Kind | Job |
|---|------|-----|
| 1 | `cover` | The poster frame. Title and episode name only. The thumbnail people stop for. |
| 2 | `time` | Place and hour, felt not explained ("Asaba. Dawn. The Niger is the colour of tea."). |
| 3–6 | `beat` / `line` / `text` | Want → pressure → a turn → the moment tightens. One idea per slide. |
| 7 | `cliff` | The peak. Something arrives, is revealed, or runs out of time. Stop there. |
| 8 | `choice` | One short question and two options, each a single comment word. |

Caption kinds: `beat` is narration in the present tense; `line` is a spoken
line (with `who`); `text` is a message, letter or note shown as an object;
`time` is place and hour. A story may break the rhythm only on purpose, and
the checker will say so.

### Designed episodes (no pictures yet)

An episode can go out before its pictures exist, as designed slides in the
story's cover look (lib/drama/slides.ts). Then each slide from 2 to 7 carries
a `scene` line — **eight words or fewer**, set small above the caption — that
does the camera's job: "Her hand. A pen. A brass key." The caption stays the
star; the scene line only tells the eye where to look. Same word budget for
the captions, and the scene lines are kept just as spare.

## 3. Cliffhangers — every episode ends hot

End the episode one breath **before** the answer. Use one of six shapes and
name it in the episode (`cliff.type`):

- **arrival** — the door opens; someone who should not be here is here.
- **reveal** — the hidden thing shows its face (a name, a ring, a signature).
- **clock** — time runs out (the cars start to move; the lift doors open).
- **message** — a text, letter or call that changes what we know.
- **mirror** — our hero does the thing nobody expected, including them.
- **loss** — something is taken, and we do not yet know by whom.

Never resolve a cliff in the first slide of the next episode; let it land on
slide 3 or later, so the reader has to swipe for the answer.

## 4. The choice — two rights, never a right and a wrong

The question is about what the hero **does**, not what they feel. Both options
must be defensible, cost something, and open a different road. Each option is
one uppercase word people comment (`SPEAK`, `WAIT`), with a label of four words
or fewer. Both next-episode directions are written in advance (`branches`), so
the winning road can be produced the moment the vote closes.

**The vote:** the first option to reach the story's `minVotes` distinct
commenters wins (start at 2; raise it as the audience grows). A tie at the
deadline goes to the option that reached its count first.

## 5. Characters — a fixed cast, built on archetypes

Each story has **five or six roles**, no more. Every role has an archetype — one
of twelve old patterns of character that storytellers have used for thousands
of years — with a light side and two shadows (too much, too little). The vote
pushes a character toward their light or one of their shadows, and that is
where the drama comes from. Our twelve, in our own words:

| Archetype | Light | Too much | Too little |
|---|---|---|---|
| The Oga | holds things together | the tyrant | the absent one |
| The Guardian | shelters people | the smotherer | the stranger |
| The Innocent | trusts and begins again | the easy prey | the sour one |
| The Jester | finds the joke and the truth in it | the clown | the stone face |
| The Rebel | breaks a wrong rule | the crook | the rule-hider |
| The Warrior | stands in the gap | the brute | the one who folds |
| The Lover | lives fully, feels deeply | the reckless | the cold counter |
| The Companion | belongs, keeps it real | the drifter | the snob |
| The Hustler | finds the road nobody saw | the never-home | the stuck |
| The Maker | sees beauty and shows it | all surface | all literal |
| The Visionary | makes the impossible happen | the con artist | the doubter |
| The Sage | finds and tells the truth | the know-all | the wilfully blind |

Role tiers: **lead** (the story is theirs), **main** (in most episodes),
**cameo** (one or two scenes, a name and a moment). Every role has a `look` —
what the house version of the character looks like — so the story can be made
before anyone joins.

**Fans join the cast** of a story that has not started yet: they claim an open
role and send one clear photo; the engine makes a character sheet (front,
three-quarter, profile, full body) and that face plays the role in every
episode. A role is open only until its first appearance, so nobody's face is
swapped halfway through a story.

## 6. Nigeria, all of it

Rotate cities: Lagos, Abuja, Port Harcourt, Enugu, Kano, Ibadan, Asaba,
Calabar, Benin City, Jos, Owerri, Kaduna, Abeokuta, Uyo, Warri, Ilorin,
Sokoto, Makurdi — and the villages in between. Each place brings its own light,
weather, food, sounds and speech (harmattan haze in Kano, rain on Port Harcourt
zinc, Enugu hills, the Niger at Asaba). Names come from the place. Pidgin and
local languages belong to a character's mouth and are used sparingly.

**Never:** real politicians or parties, real living people, tribes or faiths as
villains, mockery of accents, graphic violence, explicit sex. Juju and the
supernatural are allowed only as atmosphere and mystery, never as cheap scare.

## 7. Genres and their look

| Genre | Cover type | Mood |
|---|---|---|
| `power` (boardrooms, money) | Bodoni Moda capitals, editorial black and white | glass, night, one accent |
| `thriller` / `crime` | Oswald condensed capitals | red and black, sodium light |
| `romance` | Pinyon Script with Cormorant small capitals | warm dark, champagne |
| `romcom` | Pinyon Script over Oswald | cream, colour, daylight |
| `family` (inheritance, sagas) | Cormorant Garamond capitals | gold and brown, old houses |
| `mystery` / `supernatural` | widely spaced Cormorant capitals | moonlit blue-black, mist |
| `period` (1950s–70s) | Oswald + Pinyon, paperback-poster style | warm painted colour, grain |
| `political` | Bodoni Moda + Oswald | grey corridors, red file |

Titles: two to four words, easy to say aloud, no puns that need explaining.
Taglines: eight words or fewer. Loglines: thirty-two words or fewer, built as
*who* + *what they want* + *what stands in the way* + *the secret*.

## 8. Brands in the scene

Each episode lists its `slots` — objects that live naturally in the scene (the
water the stranger offers, the phone at one percent, the fabric everyone is
fighting over, the car waiting below). A brand buys a slot from the game page;
their real product is placed in that object's spot when the episode is made.
Rules: the product must belong in the scene; never on a grieving, frightened or
humiliated character's moment in a way that mocks it; the post says
"Partner: <brand>" in the caption. One brand per slot, two slots per episode
at most.

**Alux sells its own work in every story.** Every slot names a `house` product
— an Alux service that fills the slot when no brand has bought it — and every
story has at least one moment where an Alux service is simply part of life:
the executive portraits on a boardroom wall (Noir Director Editorial), a
nurse's induction photo on her lock screen (Nursing Induction), a lawyer's
framed call-to-bar picture (Call to Bar), the bride's emerald pre-wedding
portrait (Emerald Empress), an Eid portrait in a Kano parlour (Asunma / Elite
Eid), a faded family photograph brought back (Glow Retouch, The Gear
Equalizer), a moving picture on a phone (Instagram GIF Maker). It is never
named in the slide text — the picture shows it, and the game page's "In this
scene" panel links to it. The story must stay better than the advert.

## 9. Seasons

Six episodes a season. A suggested spine (bend it when the votes demand):
1 **Hook** — the wound and the secret. 2 **Pressure** — the rival wins a round.
3 **Turn** — the hidden thing surfaces. 4 **Cost** — winning takes something.
5 **Storm** — every secret in one room. 6 **Crown** — the payoff, and a new hook
for season two. Every episode plants one detail and pays one off.

## 10. How a story file is shaped

```js
export default {
  slug: "the-silent-partner", title: "The Silent Partner", tagline: "…",
  genre: "power", city: "Lagos", logline: "…", minVotes: 2,
  cast: [{ key, name, age, role, archetype, side, tier, open, look, want, secret }],
  episodes: [{
    n: 1, title: "…",
    slides: [{ kind: "cover" | "time" | "beat" | "line" | "text" | "cliff", see: "…", say: "…", who? }],
    cliff: { type: "reveal" },
    choice: { question: "…", options: [{ word: "SPEAK", label: "…" }, { word: "WAIT", label: "…" }] },
    branches: { SPEAK: "next episode in one or two sentences", WAIT: "…" },
    slots: [{ key: "water", object: "…", slide: 5, house: "Instagram GIF Maker" }],
  }],
};
```
