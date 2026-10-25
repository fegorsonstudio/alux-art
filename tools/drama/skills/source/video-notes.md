# What the Higgsfield video teaches (watched 2026-10-25)

Video: "5-Step Workflow: How to Make Viral AI Short Dramas (60M Views)", Higgsfield AI,
https://www.youtube.com/watch?v=cBxKZcalwkM (20 min). Watched with the local `watch`
skill: English captions (`drama-video-transcript.txt` in the session scratchpad) and
100 frames. The blog post (`higgsfield-blog-how-to-make-ai-short-drama.txt`, same folder)
is the same workflow with every prompt written out; the two skills are in this folder
as downloaded. Our rewrites: `../alux-short-drama-screenwriter.md`,
`../alux-cinematic-prompt-writer.md`.

## The five steps, as spoken

1. **Pick a story people get in seconds** (02:40). Three starting points: Cinderella,
   love against the odds, rivalry. One to three minutes. Four parts: hook, context,
   escalation, cliffhanger. "Memorable characters and a setting" come before the script.
2. **Characters that keep their face** (03:50). Make 4–6 face options, avoid washed-out
   faces, name the chosen one (`@LucyFace`) and use the same names all through the chat
   so an old version is never pulled by accident. Outfit reference separately
   (`@LucyOutfit`), shoulders to feet, plain wall, no props; a real photo can be the
   reference. **Character sheet rules (05:00):** plain grey background (not white or
   black); three views — full-body front, back, close-up of the face; **erase the face
   on the full-body front view** so the video model has one face reference. A second
   look (hair down, glasses off) is an EDIT of the first sheet, never a new sheet.
   Jewellery and small details get their own close-up attached when the sheet is made.
   Background groups (the casting models) are one group image used for the whole scene.
3. **Build the whole set in one image** (06:37). A three-quarter view of the location
   showing the table, the path and where the lead enters: "a straight-on shot might look
   great, but when you change angles the video model has to guess the rest of the room."
4. **Script it, then generate every scene** (07:10). Attach the two skills, give the
   outline, ask for dialogue, action and a generation prompt per scene. Then one line
   per scene: "generate scene N with the approved prompt and our saved assets."
   - Scene 1, the loudest moment first (07:51): the fall looked silly and the runway was
     empty → reworked that one shot and added models waiting in the background; the
     accent came out American → describe the sound of the accent in detail ("a soft
     uvular R made at the back of the throat"); the assistant's headshot ended up among
     the models → state who she is NOT in every prompt. Keep what works (acting, camera).
   - Scene 2, the fall (10:33): start from a feeling the audience recognises ("I don't
     belong here, I just embarrassed myself") — that is what makes it relatable, not the
     setting.
   - Scene 3, the biggest secret (11:37): **describe both performances and spell out the
     movement** — she apologises nervously, his boredom turns to curiosity; he gets up
     from the red chair, leaves the table, crosses the floor to her.
   - Scene 4 (12:37): the offer; a separate close-up insert of the assistant's reaction.
   - Scene 5, a big entrance (13:16): the entrance jumped between front and back and the
     long pauses slowed it → build anticipation before the face is seen, start the
     dialogue while people are still moving, move closer so the reaction is seen, give
     the character a physical thing to do (lift a strand of her hair). Point out what to
     change, update the prompt, generate again, compare.
   - Scene 6, end right before the reveal (15:12): one 10-second shot in a new room, no
     extra location image — the first room is the style reference and the new space is
     described in the prompt. Cut to black just before the answer.
5. **Three ways to monetise** (18:05): dramas for clients; paid brand integrations
   ("people keep watching for the story while getting familiar with the product"); sell
   access to the next episodes — free episodes earn the curiosity, then a $5–10 monthly
   subscription on a creator platform; 500 × $5 = $2,500 a month before fees.

## What we take, and what we add (the owner's brief, 2026-10-25)

- Same spine: four parts per episode, named references, one voice description repeated
  everywhere, both performances written, positive locks, one targeted fix per failed
  take. The character sheet rules are now the Character Sheet product's layout
  (`lib/character-sheet-order.ts`) and the drama cast sheet (`lib/drama/character.ts`).
- Their tools → ours: ChatGPT → DeepSeek (`deepseek-flash`), Soul 2.0 / GPT Image 2 /
  Seedream → `fal-ai/nano-banana-2/edit`, Seedance 2.5 → phase 3 (via fal).
- Their money → ours, bigger: the three ways become a platform (`../../PLATFORM.md`):
  (1) dramas for clients = brands sponsor a season after seeing the cast, the arc and the
  budget (the sponsor page, `lib/drama/budget.ts`: cost + 50 % buffer, × 5);
  (2) brand integrations = product spots and partner words, already live;
  (3) selling the next episode becomes **continuous pay for the people in it** — cast
  and creators earn a share every time an episode they are in sells a spot, a sponsor
  or a view on the sister app — and **anyone can create a drama and invite friends from
  Instagram to collaborate**, then download the outputs or publish on our shelf.
- Their one episode → our season on every vote road, posting itself at 7 p.m.
