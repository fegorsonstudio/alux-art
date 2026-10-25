---
name: alux-short-drama-screenwriter
description: Write Alux Micro Drama episodes and whole seasons, from zero to ready-to-produce, for the Alux Art drama engine (tools/drama/ENGINE.md). With no idea, it scores the idea bank and the owner's three starting points and picks the strongest. Then it delivers the full package — the cast with a look and a voice for every role, the reference-image prompts for fal-ai/nano-banana-2/edit (faces, outfits, character sheets, locations, groups), every episode on every vote road built on the hook, the context, the escalation and the cliffhanger in the recap-narrator telling, the two-word vote, the brand slots and the Alux moment, and a generation prompt for every picture (and, in the video phase, every clip). Use it whenever someone wants to write, plan, outline, rewrite or fix a micro drama, a season, an episode or a vote road, or wants story ideas, even if they never say "script". Works together with the Alux Cinematic Prompt Writer skill. The brain that runs it is DeepSeek (deepseek-flash, tools/drama/brain.mjs / lib/deepseek.ts).
---

# Alux Short Drama Screenwriter

Turn an idea, or no idea at all, into an Alux Micro Drama that holds attention from the first slide and can be produced scene by scene, on every road the votes can take. You deliver the whole package: the cast with their looks and voices, prompts for every reference image, the season written for every vote road, the brand slots and the Alux moment in each episode, and a generation prompt for every picture.

This skill was learnt from the Higgsfield "How to make a realistic AI short drama" workflow (tools/drama/skills/source/) and rewritten for how Alux works:

| Theirs | Ours |
|---|---|
| ChatGPT with the Higgsfield plugin | **DeepSeek** (`deepseek-flash`) through `tools/drama/brain.mjs` on the command line, `lib/deepseek.ts` on the website |
| Soul 2.0 / GPT Image 2 / Seedream 5.0 for references | **`fal-ai/nano-banana-2/edit`** for every reference image and every episode picture (the edit model takes reference images, so the same face and outfit carry from one picture to the next) |
| Seedance 2.5 video clips | **Phase 1 carousels** (eight designed slides), **phase 2 carousels with pictures**, **phase 3 video** (Seedance through fal). Write for the phase the story is in; the video prompt rules still apply when the time comes |
| One 1–3 minute episode, then "sell the next episodes" | **Eight-slide episodes that end on a two-word vote**, a season of about six episodes written for every road, posted on Instagram at 7 p.m., the comments writing the story; cast roles, product spots and season sponsorship are the business |
| Their stories, their world | **Nigeria, all of it**, classy, every genre — ENGINE.md §6 and §7 |

Most AI dramas look like slop: faces change between shots, the acting is flat, nothing makes you need the next episode. This skill fixes all three: every character is locked to a saved character sheet, every picture directs the performance and the reaction, and every episode is built on the four parts successful short dramas share and ends one breath before the answer.

## Why one line is enough to make a picture

The person producing should never have to engineer a prompt. When they say "make episode 2, picture 5", everything the image model needs is already in the picture prompt you wrote, because each prompt carries every decision a director makes on set:

- **Locked references.** Each character's sheet and the location are attached by name — "face, hair and outfit 100% match the reference" — so the same people show up in every picture.
- **A location map and the frame.** Where the furniture, doors and windows are, who stands where, left and right from the camera's view. Characters don't teleport between slides.
- **Camera and lens.** Shot size, field of view in degrees, camera height, distance. That's what makes it look shot, not generated.
- **Performance and reactions.** What each character does with their face and body, because reactions carry a drama.
- **One lighting logic.** The genre's light (lib/drama/lighting.ts) in every picture, so the slides belong together.
- **Where the words will sit.** A third of the frame kept quiet for the caption (ENGINE.md §1).
- **Positive locks against typical AI mistakes.** Nobody extra wanders in, no text appears in the picture, the assistant is never mistaken for the boss.

That is why the generation step is one line, and why a failed take needs one targeted change instead of a rewrite.

## Quick start

- **No idea yet** ("write me a drama", "give me ideas"): score candidates from the idea bank at the end of this file and from the owner's three starting points (Step 1). Show the top three with a one-line pitch each and say which you recommend. If the user wants speed, go with your top pick.
- **Has an idea:** go straight to Step 1 and find its feeling, then set it in a Nigerian city that fits (rotate cities — ENGINE.md §6).
- **Has no references yet:** write the asset prompts first (Step 4), then the season.
- **Already has references** (a story in `tools/drama/stories/`, cast sheets made): use their exact names (`@Adaeze`, `@Boardroom`) everywhere and skip the asset prompts.
- **Rewriting an existing story:** keep the slug, the cast keys and any episode already posted (they are frozen); rewrite only what has not posted, and keep every vote word a posted episode offered.

**Format:** decide the phase up front and state it on the package: `carousel` (designed slides, scene lines), `pictures` (one generated picture per slide 2–7), `video` (clips). Everything below is written for all three; the picture prompts are only needed from `pictures` on.

**Delivery:** the package is long. Deliver it as the story file (`tools/drama/stories/<slug>.mjs`, the shape in Step 8) and, separately, the asset prompts and picture prompts. If something is missing, make a reasonable choice, say what you chose, and keep going instead of stopping to ask.

## Step 1: Choose the story

A micro drama has no time to explain its world, so start from a situation the audience already understands. Reliable starting points (the first three are the ones the Higgsfield team uses; the next two work as well in short form):

- **A Cinderella story:** someone ordinary gets an unexpected opportunity.
- **Love against the odds:** two people want to be together, but something stands in their way.
- **A rivalry:** two people want the same thing, and only one can get it.
- **Hidden identity:** someone isn't who they seem.
- **Turning the tables:** the underestimated person wins.

Then find the **feeling** underneath the story, the one the audience has felt themselves. For the quiet finance director the board talks over, it's "they don't see me, and I am the only one who knows." That feeling makes the story relatable, not the setting. You don't need to sit on a board to recognise it.

**Scoring ideas.** Score each from 1 to 5 on:

1. **Instant situation:** 5 = clear from a single picture, 3 = needs one line, 1 = needs backstory.
2. **Recognisable feeling:** 5 = almost everyone has felt it, 3 = a specific group has, 1 = rare or abstract.
3. **A visible peak:** 5 = a physical event in one picture (a fall, a slap, a spill, a reveal), 3 = a sharp line, 1 = an inner thought.
4. **Reaction contrast:** 5 = two characters read the same moment in opposite ways on camera, 3 = one clear reaction, 1 = nobody reacts.
5. **Easy to produce:** 5 = two to four speaking characters, one or two locations, everyday actions; 3 = five or six characters or three locations; 1 = crowds, vehicles, or dance, fights or sports as the main beat — image and video models still handle choreography poorly.
6. **Season potential:** 5 = the premise can run six episodes with a real two-way choice at the end of each, 3 = a few, 1 = a single story.
7. **Vote potential:** 5 = the hero faces choices where both options are right and cost something (ENGINE.md §4), 1 = there is one obvious thing to do.

Recommend the highest total. Ideas marked ★ in the bank score high on all seven. Fit the choice to the audience: Instagram, Nigeria, phones, evenings.

**Set it in Nigeria.** Choose a city and let it bring its own light, weather, food and speech (Lagos lagoon at night, harmattan haze in Kano, rain on Port Harcourt zinc, Enugu hills, the Niger at Asaba). Names come from the place. Pidgin and local languages belong in a character's mouth, sparingly. Never: real politicians or parties, real living people, tribes or faiths as villains, mockery of accents, graphic violence, explicit sex, investment schemes.

## Step 2: Build every episode on four parts

Plan the four parts before writing any slide, then check each one again when the episode is done. Every episode, every road.

**1. The hook.** Open on the peak, not the beginning: an outburst, a conflict, a fall, a door opening. Slide 1 is the cover; slide 2 says where we are and what the last vote decided ("8 a.m. Her assistant carries the brass key into the bank."); slide 3 is the loudest moment the viewer does not yet understand, so they swipe to find out.

**2. The context.** Show who these people are and what they want, with an emotional swing on every slide: a starting point, hope, another hit, a chance. A flat slide of explanation is where people swipe away.

**3. The escalation.** Bring in an unexpected turn on slide 5 or 6: a new person, a document, a phone screen. This is where the biggest secret of viral short dramas lives: **let the viewer catch every little reaction.** The tension comes from how differently two characters read the same moment. Write both performances in the picture direction, and the movement too: who stands, who crosses the room, who steps back.

**4. The cliffhanger.** Slide 7 ends one breath before the answer — one of the six shapes (arrival, reveal, clock, message, mirror, loss). Promise it, don't show it. Slide 8 is the vote: one question about what the hero **does**, two uppercase words, both right, both costly.

Close to the end, **pick up the pace**: tighter framing, a big entrance, small interactions. Build anticipation before a key face appears: show them from behind, then their hands, then the eyes, then the face. Never resolve a cliff on slide 2 of the next episode; let it land on slide 3 or later.

**The telling (ENGINE.md §0):** a recap narrator. Short declarative sentences, one fact each. Third person, **labels not names** in narration ("the quiet finance director", "the CEO", "her assistant"); names live in what characters say. One or two spoken lines an episode, the sharpest, like a trailer's dialogue stab. At most 12 words a slide, 70 an episode; cover and vote slides carry no caption.

The Silent Partner, episode 1, as the four parts:

| Part | Slides | What happens |
|---|---|---|
| Hook | 2–3 | 11:40 p.m. The board is standing. The finance director is not. |
| Context | 4–5 | They vote to sell. She signs the cheques; nobody asks why she is calm. |
| Escalation | 6 | A courier brings a brass key. Only she knows what it opens. |
| Cliffhanger | 7 | The CEO: "Adaeze, is there something you want to tell us?" |
| Vote | 8 | SPEAK / WAIT |

## Step 3: Cast, voices and continuity

**Cast.** Five or six roles on the twelve archetypes (ENGINE.md §5), each with `key`, `name`, `age`, `role`, `archetype`, `side` (light / too much / too little), `tier` (lead / main / cameo), `open`, `look`, `want`, `secret`. The `look` is the house version of the character, written for the camera: build, hair, skin, one signature garment, one object — so the story can be made before any fan joins. Guests (`guest: true, enters: n`) let fans join a running story.

**Voices.** Every speaking character gets a voice description — accent, pitch, pace, timbre — repeated word for word wherever they speak: "Lagos-born, measured, low, never hurries; English with a faint Igbo lilt." That is the stable part. How they sound at a moment (calm, cracking, flatter each time) goes next to each line. For the soundtrack (tools/drama/sound/voices.mjs) each role is a designed Nigerian voice or a standard one; the narrator is the trailer voice.

**Names.** Check that every invented full name doesn't belong to a real public figure. Rename if it does.

**Continuity.** List what each character wears and carries in each episode and when it changes: the glasses come off in episode 2 and stay off, the key is handed over in episode 4. Image models forget these things between pictures unless every prompt states them. A changed look is its own character sheet (`@AdaezeNoJacket`).

**Background people.** Take extras from one group reference and say who they are not: "the assistant is never one of the board members."

## Step 4: Asset prompts (when references don't exist yet)

Every reference is made with **`fal-ai/nano-banana-2/edit`** (2K for Instagram; 4K only for the Character Sheet product). Write a ready prompt for each, in the house structure (Scene / Subject / Important Details / Use Case / Constraints — the Alux Cinematic Prompt Writer skill has the rules), and give each one its final `@name`. The order:

1. **Face** (3:4): for each main character, four to six single face-reference portraits to choose from. Describe age, look and the city's light, plus the camera and film texture of the genre, so the character already fits the world. Pick one, save as `@NameFace`. *When a fan plays the role, their three photos replace this step.*
2. **Outfit** (3:4): the clothes from the shoulders to the feet against a plain wall, no bags or hand-held props. Items that come off during the story (a jacket, glasses) belong in the outfit if the character starts with them. Save as `@NameOutfit`. A real photo of the garment can be the reference instead.
3. **Character sheet** (16:9, the layout in `lib/character-sheet-order.ts` SHEET_LAYOUT): combine `@NameFace` and `@NameOutfit`. Three rules decide whether the character stays the same in every picture:
   - a plain **grey background**, not white or black;
   - **three panels on one seamless backdrop:** full-body front, full-body back, and one large head-and-shoulders portrait filling the right half;
   - **erase the face on the full-body front view** — "a smooth, featureless oval, no eyes, nose or mouth" — so the portrait is the only face reference. Otherwise the model may take the face from the portrait in one picture and from the full-body view in another, and the character drifts. If the model still draws a face, erase it with an edit.

   Save as `@Name`. Fans' sheets are made automatically by lib/drama/character.ts in the same layout.
4. **A changed look** (edit of the sheet): hair down, glasses off, a new outfit. Keep the face, body, background and layout the same. Save under its own name.
5. **Small details**: jewellery or an object that must be exact gets its own close-up, attached with the face and outfit when making the sheet.
6. **Background group** (16:9): the whole group in one image — the board, the wedding guests, the market women — different faces and poses, one style. Save as `@Board`, `@Guests`.
7. **Location** (16:9): a three-quarter view of the full layout the scenes need — where the lead sits, the paths people walk, the door they enter through. No people. Save as `@PlaceName`. One per main location; a one-scene place is described in the prompt with the main location as a style reference.
8. **Story props** (optional): the brass key, the second will, the phone — an object that must look identical every time.

In the picture prompts attach the character sheets, the location and the group image. Face and outfit images are only inputs for the sheets. Plan about three image generations per main character (face options, outfit, sheet) plus one per changed look; side characters come from the group image. Every one of these is a paid call: count them in the budget (`node tools/drama/budget.mjs <slug>`).

## Step 5: Write the season for every road

Episodes are written ahead, one per road (`drafts`, ENGINE.md §4). Splitting every episode in two doubles each time, so **the roads split and meet again** ("branch and bottleneck"): two versions of each middle episode, each playing out the last vote in its own first half, both ending in the same room on the same choice (shared `EPn_ENDING` slides and `EPn_VOTE`); the finale has two versions ending on one season-two hook. `node tools/drama/check.mjs <slug>` must report every road complete.

Each written episode carries: `n`, `title` (≤4 words), eight `slides` (kinds cover, time, four of beat/line/text, cliff, choice), `cliff.type`, `choice` (question 3–10 words, two options with one uppercase word and a ≤4-word label), `branches` (one line per word), 1–2 `slots` (brand objects on slides 2–6 with an Alux house product as fallback), and an `alux` moment (our own product doing something the story needs; `word` LIGHT / GIF / BOOK on every second episode at most). Each slide has `kind`, `see` (the picture direction, written for the camera), `say` (the caption), optional `who`, and a `scene` line of eight words or fewer for designed slides.

Product words: LIGHT where a dark photo must be relit for the plot, GIF for a moving save-the-date or a first photo together, BOOK for a portrait the story needs. Never on slides 7–8, never on a slide, never two episodes in a row.

## Step 6: Write the picture prompts (phase `pictures`)

One prompt per slide 2–7, written with the **Alux Cinematic Prompt Writer** skill. Each carries: the references by name, the location map, the frame and blocking (who is where, left/right from the camera), optics (shot size, FOV in degrees, camera height), the performance (muscle-level, both reactions), the genre's light, where the caption will sit, and positive locks. The cover is the poster; the choice slide is a close-up of the object the vote turns on.

Write what the camera can see, not mood words. "Her hand tightens on the folder, her eyes drop to the table" works. "She feels anxious" doesn't.

## Step 7: Produce and revise

Pictures are made one at a time, reviewed at 100 % before the next. When a take doesn't work, name the problem in plain words — the face drifted, the wrong person holds the key, the caption area is busy, the light is daylight in a night scene — change only what's broken, keep everything else, return the updated prompt, make it again and compare. Precise direction beats general notes. Every retake is paid: the budget carries a 50 % buffer for exactly this, and the cast-sheet cap is six renders a member.

## Step 8: Output — the story file

Return the story as the module `tools/drama/stories/<slug>.mjs` (the shape every existing story uses, checked by `tools/drama/check.mjs`):

```js
export default {
  slug, title, tagline, genre, city, logline, minVotes: 2,
  cast: [{ key, name, age, role, archetype, side, tier, open, look, want, secret }, …],
  episodes: [{ n: 1, title, slides: [8 × { kind, see, say, who?, scene? }], cliff: { type }, choice: { question, options: [{ word, label }, { word, label }] }, branches: { WORD: "…" }, slots: [{ key, object, slide, house }], alux: { product, where, word?, line? } }],
  drafts: [{ n: 2, after: "SPEAK", … same shape … }, { n: 2, after: "WAIT", … }, …, { n: 6, after: "*.EXPOSE", finale: true, … }],
};
```

Then, separately: the cast's voice descriptions, the continuity table, the asset prompts (Step 4) and the picture prompts (Step 6), each labelled with its `@name`, model and aspect ratio.

## Planning a season

Six episodes, each with its own four parts, each ending on a vote; the next opens on the answer at slide 3. Keep the same references and voice descriptions across episodes. The first episode needs the strongest hook: it is free, and it earns the comments that write the rest. The finale's vote decides how season two begins.

## Boundaries

- Original stories. Borrow structures and feelings from existing shows, never plots, characters, names or dialogue. The idea bank is original.
- No real people, no imitation of a real person's likeness. A fan who plays a role has consented and sent their own photos.
- Platform-safe: romance through looks, touches and near-misses; every character an adult; no graphic violence, no explicit sex, no cheap juju scares (atmosphere and mystery only).
- Classy: no shouting capitals, no emoji, no exclamation marks outside speech, no insults for their own sake.

## Idea bank: short-drama premises

Each idea: the premise, the feeling underneath it, and the peak to open on. ★ = strongest first-episode picks. Set each one in a Nigerian city that fits and let the place rename it.

### Cinderella: someone ordinary gets an unexpected opportunity

1. ★ **The Face of the House.** A junior accountant interrupts a casting at a Lagos fashion house, trips, and the bored creative director decides she should be the face of the house. *Feeling:* "I don't belong here." *Opens on:* a model falling on the runway.
2. ★ **The Buka Aria.** A waitress sings along to the radio while closing a buka, not knowing a famous producer is still at the corner table. *Feeling:* nobody ever really hears me. *Opens on:* the whole place going silent as she hits the high note.
3. **Night Shift.** A cleaner at a dance company dances alone after hours while the artistic director, who has just lost her lead, watches from the dark balcony. *Feeling:* too late for my dream. *Opens on:* the lead's ankle giving way at rehearsal.
4. **The Fake on the Wall.** A night guard at an Abuja gallery says out loud that the star painting is a fake, in front of the buyers. *Feeling:* who am I to speak up? *Opens on:* the auctioneer's hammer frozen mid-air.
5. **Ten Minutes to the Altar.** The groom's agbada tears before a society wedding; the hotel tailor's apprentice fixes it in the corridor while his designer mother watches. *Feeling:* just the help. *Opens on:* the seam tearing as the groom bends.
6. **Live Translation.** A junior interpreter corrects her CEO's disastrous mistranslation live at a product launch. *Feeling:* I'll be fired for this. *Opens on:* the foreign investors standing up to leave.
7. **Kitchen Porter.** The dishwasher of a top restaurant finishes the head chef's signature dish when the chef burns his hand during a critic's visit. *Feeling:* never allowed near the stove. *Opens on:* a pan bursting into flames.
8. **The Wrong Face.** A courier delivering lunch to a modelling agency gets photographed by accident, and hers is the only photo the client likes. *Feeling:* I'm not that kind of pretty. *Opens on:* the agency boss slamming down a stack of rejected photos.
9. **Chess at Closing Time.** The cleaner of a chess club quietly finishes the grandmaster's abandoned game and wins it. *Feeling:* nobody expects anything from me. *Opens on:* the grandmaster sweeping the pieces off the board.
10. **The Bouquet.** A florist's assistant rebuilds a crushed bridal bouquet in the church hallway; the bride's mother runs the city's biggest events agency. *Feeling:* background staff. *Opens on:* a bridesmaid stepping on the bouquet.
11. **The Lift Speech.** A receptionist rehearses a speech in the lift, and the man beside her is the founder looking for someone to present to the shareholders. *Feeling:* I'm not a leader. *Opens on:* the lift jolting to a stop between floors.
12. **Second Violin.** The orchestra's page-turner plays the solo when the soloist's string snaps on opening night. *Feeling:* always one step behind. *Opens on:* the string snapping and the hall gasping.
13. **The Seamstress Who Said No.** A seamstress refuses to alter a gown because it would ruin it; the designer in the next room hires her on the spot. *Feeling:* I should just keep quiet. *Opens on:* scissors cutting into silk.
14. **Street Portrait.** A street artist sketches a stranger who turns out to own the city's most important gallery. *Feeling:* my work isn't real art. *Opens on:* a gust scattering her drawings across the square.
15. **The Stand-In Singer.** A wedding singer replaces the headliner at a billionaire's party when the star's voice cracks. *Feeling:* small stages are all I get. *Opens on:* the star's voice breaking on the first note.
16. **On Air.** A night cleaner at a radio station answers a caller live, and the city falls for her voice. *Feeling:* I'm invisible. *Opens on:* the ON AIR light snapping on in an empty studio.
17. **Make-Up Call.** A make-up assistant saves a live TV show when the host's make-up is ruined minutes before air. *Feeling:* I only hold the brushes. *Opens on:* coffee splashing across the host's face.
18. **The Window.** A shop assistant redesigns the window display overnight, and the brand's creative director stops on the street at dawn. *Feeling:* nobody asked me. *Opens on:* the old display crashing down.
19. **The Interpreter's Gift.** A hotel maid is the only person who speaks the language of a stranded VIP guest. *Feeling:* nobody sees what I can do. *Opens on:* the guest shouting at a lobby that doesn't understand.
20. **The Recipe Card.** A café cook's handwritten recipe ends up with a famous food critic who demands to meet the chef. *Feeling:* I just make lunch. *Opens on:* the critic storming into the kitchen holding the card.

### Love against the odds

21. ★ **The Bodyguard's Rule.** A bodyguard has to deliver the heiress he protects to her own engagement party, and he's the one she wants. *Feeling:* I can't have what I want. *Opens on:* him catching her as she slips on the stairs, her fiancé watching.
22. ★ **Fiancée for One Night.** A waitress agrees to play a rich man's fiancée at his family dinner, and his sister recognises her as yesterday's waitress. *Feeling:* I'll never fit into their world. *Opens on:* the sister pointing across the table: "You served us yesterday."
23. **The Shared Wall.** Two rival bakers share a wall and a feud, until she finds out his new investor is her fiancé. *Feeling:* the wrong person makes sense. *Opens on:* a cloud of flour exploding over both counters.
24. **The Opposing Client.** A divorce lawyer falls for the husband she's been hired to take apart in court. *Feeling:* wrong person, wrong time. *Opens on:* him knocking her case files across the courthouse floor.
25. ★ **Blackout.** A man and the CEO who fired him that morning get stuck in a lift during a blackout. *Feeling:* pride against need. *Opens on:* the lights dying and her grabbing his arm.
26. **Find Me Someone Like You.** A matchmaker who has never been in love is hired by the man she secretly loves to find him a wife. *Feeling:* I help everyone but me. *Opens on:* him sliding a cheque across her desk.
27. **The Objection.** A wedding planner falls for the groom's brother, the one person trying to stop the wedding. *Feeling:* loyalty against love. *Opens on:* the brother standing up at the rehearsal: "I object."
28. **The Gardener.** A woman promised to her father's business partner opens up only to the gardener. *Feeling:* my life was decided for me. *Opens on:* her throwing the engagement ring into the fountain.
29. **The Critic's Table.** A food critic who destroyed a chef's restaurant gets stranded by the rains at his new place. *Feeling:* I hurt the one person I could love. *Opens on:* the chef recognising her and dropping a plate.
30. **Cover-Up.** A tattoo artist is asked to cover up a client's ex's name, and it's his own name. *Feeling:* the past isn't finished. *Opens on:* the needle stopping as he reads the name.
31. **One More Final.** Former dance partners who stopped speaking are forced to compete together in a final. *Feeling:* we broke something we can't fix. *Opens on:* her slipping mid-spin and him catching her.
32. **Kill the Mic.** A stage manager falls for the singer she's been ordered to keep off the stage after a scandal. *Feeling:* duty against desire. *Opens on:* her pulling the plug on his mic mid-song.
33. **The Hotel Pianist.** A hotel pianist plays the same song every night for a woman engaged to the hotel's owner. *Feeling:* loving someone who belongs to someone else. *Opens on:* the owner slamming the piano lid shut.
34. **The Masked Ball.** At a masked ball she dances with a stranger; next morning he's the man taking over her father's company. *Feeling:* I trusted the wrong person. *Opens on:* her slapping him across the boardroom table.
35. **The Ring in the Window.** A jeweller repairs an engagement ring and realises it's the one she gave back to her ex years ago. *Feeling:* the one that got away. *Opens on:* the ring rolling across the counter to her feet.
36. **Harvest.** The heirs of two feuding cocoa families fall for each other during the harvest. *Feeling:* our families will never allow it. *Opens on:* a sack bursting between them.
37. **Wrong Phone.** Two strangers swap phones at the airport, and the messages they read change everything. *Feeling:* a stranger knows me better than my partner. *Opens on:* her phone ringing in his pocket at the gate.
38. **The Second Sister.** A man arrives to meet his long-distance love and is greeted by her sister, who has been writing the letters. *Feeling:* I fell for the words, not the face. *Opens on:* the real sister walking in mid-hug.
39. **Dinner for Two.** A hotel room-service waiter and the guest who orders dinner for two every night, and eats alone. *Feeling:* lonely in a crowded place. *Opens on:* her bursting into tears as he sets down the second plate.
40. **The Translator's Letters.** A translator falls for the author whose love letters to another woman she's translating. *Feeling:* every word is meant for someone else. *Opens on:* her reading a line aloud and stopping because it's about her.

### Rivalry: two people want the same thing

41. ★ **Sisters at the Stove.** Two estranged sisters meet as the last two contestants of a cooking show. *Feeling:* she always got everything. *Opens on:* one sister's plate shattering seconds before judging.
42. **The Understudy.** A dance understudy and the lead share one dressing room and one solo, until someone cuts the lead's ribbons on opening night. *Feeling:* my turn will never come. *Opens on:* the ribbon snapping mid-performance.
43. **One Offer.** Two interns, one job offer, and a laptop that crashes the night before the final presentation. *Feeling:* I did everything right and still might lose. *Opens on:* the screen going black in front of the board.
44. **Same House.** Two estate agents, once a couple, try to sell the same mansion to the same buyer on the same day. *Feeling:* we can't stop competing. *Opens on:* both pulling the same front door from opposite sides.
45. **First Chair.** Two violinists compete for first chair, and the conductor is one of their fathers. *Feeling:* talent against connections. *Opens on:* a bow snapping during the audition.
46. **The Dress.** A bride and her future mother-in-law fight over the wedding dress. *Feeling:* I'll never be good enough for her. *Opens on:* coffee spilling over the gown on the wedding morning.
47. **Stolen Sketch.** An architect watches her ex-partner present her stolen design at the pitch of the year. *Feeling:* my work, his name. *Opens on:* her standing up mid-presentation: "That's mine."
48. **The Campaign.** Two models compete for one campaign, and the photographer is the ex of one of them. *Feeling:* the past is on set. *Opens on:* a heel snapping in front of the camera.
49. **Opposite Sides.** Two divorced lawyers end up on opposite sides of a celebrity divorce. *Feeling:* we still need to win against each other. *Opens on:* him objecting before she finishes her first sentence.
50. **Same Face, Two Heirs.** Identical twin sisters compete to run the family hotel, and their father can't tell them apart. *Feeling:* I'm always the other one. *Opens on:* one twin slapping the other at the reading of the will.
51. **Blind Tasting.** Two sommeliers face off in a final blind tasting, and one of them switched the bottles. *Feeling:* winning at any cost. *Opens on:* a glass shattering on the marble.
52. **Prime Time.** Two news anchors fight for the evening slot, and one finds the other's secret on the teleprompter live. *Feeling:* one mistake ends a career. *Opens on:* the anchor reading the wrong script on air.
53. **Two Cakes.** Rival bakers are forced to build one wedding cake together for a celebrity couple. *Feeling:* I can't share credit. *Opens on:* the top tier sliding off.
54. **The Barbershop.** Two brothers inherit one barbershop and refuse to sell or share it. *Feeling:* Dad loved him more. *Opens on:* both slamming their keys on the same counter.
55. **The Title Fight.** The gym's best fighter and the owner's son want the same title fight. *Feeling:* hard work against a last name. *Opens on:* a punch landing before the bell.
56. **The Paddle War.** Two collectors bid for the same painting for very different reasons. *Feeling:* this isn't about money for me. *Opens on:* the price doubling with every raised paddle.
57. **Head Chef.** The new head chef walks in, and the sous chef who expected the job is waiting. *Feeling:* it should have been me. *Opens on:* the sous chef dropping the new menu in the bin in front of the team.
58. **Runway Slot.** Two designers get one runway slot at fashion week. *Feeling:* only one of us gets seen. *Opens on:* the lights cutting out mid-show.
59. **The Last Table.** Two powerful guests claim the last table at the city's hottest restaurant. *Feeling:* I don't lose. *Opens on:* both sitting down at the same moment.
60. **The Solo.** Two singers in a choir fight for the Christmas solo, and the choir director is about to choose. *Feeling:* this is my one chance to be heard. *Opens on:* the organ stopping as both start singing at once.

### Hidden identity: someone isn't who they seem

61. ★ **The New Cleaner.** The cleaner the staff humiliate on her first day is the company's new owner. *Feeling:* being judged by how you look. *Opens on:* a manager kicking her bucket aside: "Not in front of the clients."
62. ★ **The Waiter Was the Inspector.** A restaurant owner bullies a waiter on inspection night, and the waiter is the inspector. *Feeling:* respect shouldn't depend on status. *Opens on:* the owner throwing a plate at the waiter's feet.
63. **The Humble Groom.** A bride's family mocks her modest fiancé, who quietly owns the hotel hosting the wedding. *Feeling:* love doesn't need to impress. *Opens on:* his future mother-in-law dropping his gift into the bin.
64. **First Day, Last Mistake.** A manager humiliates the new intern in front of the office, not knowing she's the CEO's daughter. *Feeling:* I want to be judged for my work. *Opens on:* a stack of files thrown at her feet.
65. **The Mechanic Who Wasn't.** She thinks her date is a mechanic, and he's the bank director she pitches the next morning. *Feeling:* I judged too fast. *Opens on:* her walking into the meeting and freezing at the sight of him.
66. **The Quiet Pen.** The quiet assistant of a famous novelist is the one who writes the books. *Feeling:* my words, someone else's fame. *Opens on:* the novelist stammering at a live reading when the page is blank.
67. **The Old Man at the Auction.** An old man nobody notices at an auction is the painter of the masterpiece on sale. *Feeling:* the world forgot me. *Opens on:* him laughing out loud as the bids pass a hundred million.
68. **The Quiet Champion.** A quiet security guard is a former champion, and the club's star picks a fight with him. *Feeling:* I left that life behind. *Opens on:* the star's punch caught in mid-air.
69. **Holding the Keys.** A wealthy family's driver is the lost heir they've been searching for. *Feeling:* I was there all along. *Opens on:* the lawyer reading a name and every head turning to the man holding the car keys.
70. **The Real Designer.** The assistant everyone ignores designed the brand's bestselling collection. *Feeling:* invisible talent. *Opens on:* the founder failing to sketch on live TV.
71. **The Boutique.** A shop assistant refuses to serve a scruffy customer, who turns out to be the store's new owner. *Feeling:* being dismissed at a glance. *Opens on:* the assistant blocking the door: "This store isn't for you."
72. **Switched for a Day.** Identical twins swap places for one day, and the shy one ends up running her sister's board meeting. *Feeling:* I'm braver than they think. *Opens on:* the boardroom falling silent when she walks in.
73. **The Street Musician.** A street musician everyone walks past is a famous composer who vanished ten years ago. *Feeling:* starting over where nobody knows me. *Opens on:* a conductor stopping dead in front of his open case.
74. **The Night Janitor.** A law firm's night janitor is a disbarred lawyer who quietly solves the case they're losing. *Feeling:* a second chance I don't deserve. *Opens on:* the partners finding the answer on their whiteboard.
75. **The Cook.** The estate's cook is the true heir, and the will is read at dinner. *Feeling:* serving the family that should be mine. *Opens on:* the soup ladle falling as the lawyer reads her name.
76. **The Ignored Guest.** The guest the hotel staff brush off is the critic who decides the hotel's fifth star. *Feeling:* being treated as nobody. *Opens on:* a bellboy tossing her suitcase aside.
77. **The Uninvited Sister.** An uninvited wedding guest is the bride's sister nobody knew existed. *Feeling:* the family secret is me. *Opens on:* her standing up when the officiant asks for objections.
78. **Champion in Sneakers.** The substitute teacher at a run-down dance studio is a retired world champion. *Feeling:* I hid from what I lost. *Opens on:* her landing a perfect turn in sneakers.
79. **The Translator at Dinner.** A translator at a business dinner hears the other side plotting in a language they think nobody understands. *Feeling:* staying quiet or speaking up. *Opens on:* her translation stopping mid-sentence.
80. **Grease on His Hands.** The racing team's quiet mechanic is the engineer who designed their winning car. *Feeling:* credit taken by louder people. *Opens on:* the team boss blaming him in front of everyone.

### Turning the tables: the underestimated one wins

81. ★ **The Reunion.** The woman everyone mocked at school walks into the reunion as the guest of honour. *Feeling:* they never saw me. *Opens on:* her old bully spilling wine on her dress at the door.
82. ★ **Fired, Then Owner.** A woman fired in front of the whole office returns a month later as the company's new owner. *Feeling:* humiliation that becomes fuel. *Opens on:* her box of things dumped on the pavement.
83. **The Altar.** A bride left at the altar walks into her ex's new wedding as the owner of the venue. *Feeling:* he thought I'd disappear. *Opens on:* the ex's face as she takes the microphone.
84. **Not Your Store.** A woman refused service at a luxury store comes back with the owner. *Feeling:* being judged by your wallet. *Opens on:* the assistant laughing at her card.
85. **The Stolen Collection.** A designer's stolen collection walks the runway under her ex-partner's name, and she proves it backstage. *Feeling:* they took my work. *Opens on:* her cutting the lights in the middle of the show.
86. **The Receptionist.** The receptionist everyone ignored is announced as their new director. *Feeling:* quiet people notice everything. *Opens on:* the room going silent at the announcement.
87. **Across the Street.** A chef fired for having "no talent" opens a restaurant across the street from her old boss. *Feeling:* proving them wrong. *Opens on:* a queue outside her door and his empty dining room.
88. ★ **The Audit.** A mocked junior accountant exposes the director's fraud at the shareholders' meeting. *Feeling:* the small person who refuses to stay small. *Opens on:* her slamming a folder on the table: "These numbers are fake."
89. **Too Old.** A man rejected as too old for the job is the investor at the recruiter's next meeting. *Feeling:* being written off. *Opens on:* the recruiter's smile freezing as he walks in.
90. **The Ring Back.** A woman returns the ring at her own engagement party and reveals why her fiancé really wanted to marry her. *Feeling:* I won't be used. *Opens on:* the ring dropping into his champagne glass.
91. **Buy the Building.** A café owner evicted by her landlord buys the whole building. *Feeling:* they thought I had nowhere to go. *Opens on:* the landlord tearing down her sign.
92. **Booed Off.** A comedian booed off stage returns a year later as the headliner. *Feeling:* failing in public. *Opens on:* a glass thrown at the stage.
93. **The Scholarship.** A scholarship student mocked by her wealthy classmates wins the competition they paid to enter. *Feeling:* I don't belong among them. *Opens on:* her notes torn up in the library.
94. **The Family Contest.** A daughter-in-law treated like a maid wins her husband's family's annual cooking contest. *Feeling:* never accepted. *Opens on:* her mother-in-law tasting the dish and dropping her spoon.
95. **Party of One.** A woman whose husband left her for his assistant throws a divorce party the whole city wants to attend. *Feeling:* turning the page loudly. *Opens on:* the ex walking in uninvited.
96. **The Stolen Idea.** A manager presents her stolen idea to the board, not knowing she's the consultant they hired to judge it. *Feeling:* credit stolen. *Opens on:* her walking to the head of the table.
97. **Keys to the Boss.** A valet insulted by a rich guest turns out to be the guest's new boss. *Feeling:* respect for everyone, not just some. *Opens on:* car keys thrown at his chest.
98. **The Scar.** A model rejected because of a scar becomes the face of the brand's next campaign. *Feeling:* my difference is my strength. *Opens on:* the casting director tossing her photo aside.
99. **The Fiancé Who Left.** A man who left his fiancée for money meets her again when she decides his company's future. *Feeling:* choices come back. *Opens on:* him kneeling to pick up his papers at her feet.
100. **Cut, Then Crowned.** A dancer cut from the company returns to win the competition they host. *Feeling:* they said I wasn't enough. *Opens on:* her name read out as the winner and the director's clipboard falling.
