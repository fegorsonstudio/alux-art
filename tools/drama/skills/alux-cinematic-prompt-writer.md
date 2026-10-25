---
name: alux-cinematic-prompt-writer
description: >
  The Alux Art prompt-writing system for micro dramas. Use whenever the user wants a prompt for an
  episode picture, a character reference (face, outfit, character sheet, group, location, prop), a
  poster, or — in the video phase — a Seedance clip; wants to turn a slide's picture direction or a
  script beat into a prompt; or asks about prompting technique. Trigger on "prompt for picture 5",
  "write the picture prompts", "make a scene where…", "build a shot", "prompt for the sheet".
  Images: fal-ai/nano-banana-2/edit (an EDIT model: reference images in, one picture out). Video
  (phase 3): Seedance through fal. Output is always one standalone prompt in a code block. Always
  consult this skill before writing any drama prompt. Works with the Alux Short Drama Screenwriter.
---

# Alux Cinematic Prompt Writer

Turn slides, scenes and ideas into prompts that come back looking shot, not generated. Block, light and frame each picture like a film still; in the video phase, pace each clip like a film.

Learnt from Higgsfield's Seedance 2.5 Prompt Writer (`source/higgsfield-seedance-2.5-prompt-writer.md`); rewritten for our models and our house rules. Everything about writing the visible, blocking, optics, lighting and locks is theirs and still true. What changed: our pictures are stills made by an **edit model with reference images**, so the prompt is also the contract for which reference controls what; our pictures carry a caption, so a third of the frame stays quiet; our light comes from the genre recipes in `lib/drama/lighting.ts`; and the whole prompt is written in the house structure the rest of the studio uses.

**Output: always a single standalone prompt in a code block.**

---

## CORE PRINCIPLE: WRITE THE VISIBLE

The model reacts to what can be **seen and measured**, not to mood words.

- ❌ "tense scene" → ✅ "she freezes, her hand tightens on the folder, the key light from camera left leaves half her face in shadow"
- ❌ "a luxurious boardroom" → ✅ "a long black glass table, seven leather chairs, floor-to-ceiling windows onto the lagoon at night, one brass desk lamp lit"
- ❌ "he is angry" → ✅ "knuckles white on the glass, breath short, eyes never leaving hers"

Plain, instruction-style language. Fewer precise words beat many vague ones. Before writing, "watch" the picture as a viewer: is it unambiguous, is it clear who is where and where they look, where the light comes from, where the words will sit.

---

## WORKFLOW

1. **Read as a director.** Find the moment the slide carries: the turn, the reaction, the object.
2. **Define the continuity anchors.** Who is in frame, which sheet they come from, what they carry, what state they are in (wet, bruised, glasses off).
3. **Write the prompt** in the house structure below.
4. **Order the references.** The edit model reads images by position; say which image is which.

If the slide's `see` direction leaves a gap — blocking, angle, light, where the caption sits — close it in the prompt. The model fills any gap on its own, usually not the way intended.

---

## REFERENCES (the edit model)

`fal-ai/nano-banana-2/edit` takes `image_urls` (up to about six) and one prompt. There are no `@tags` on the wire: references are **Image 1, Image 2…** in the order attached. Keep the `@names` from the screenwriter in your notes and map them at the top of the prompt:

```
References: Image 1 = @Adaeze (character sheet: face from the portrait panel, body and outfit from the full-length panels).
Image 2 = @Boardroom (the location, unchanged). Image 3 = @Board (the seven board members, faces and seats as shown).
```

Rules:
- **A character sheet controls identity and outfit.** Say it: "face, hair, skin tone, build and outfit 100% match Image 1." Keep the written description of the person minimal — long appearance text fights the image and degrades it. State only what is action-critical or easy to drop (the brass key on the ribbon, the rimless glasses in his hand).
- **A location image controls the room.** "The room is exactly Image 2: the same table, chairs, windows and lamp, seen from a new angle." A one-scene place has no image: use the main location as the style reference and describe the new space.
- **A group image controls the extras.** Say who they are and who they are NOT ("the assistant is never one of the board members").
- **Never attach a reference that is not in the picture.** The model will try to force it into frame.
- **A fan's character sheet is the law for their face.** It was made from their own photos with the face erased on the front figure on purpose (`lib/character-sheet-order.ts`); the portrait panel is the only face. Never ask for a prettier, slimmer or younger version.
- Resolution 2K for episode pictures and posters (Instagram shows 1080 px); 4K only for the Character Sheet product. Aspect 4:5 for slides, 2:3 for posters, 16:9 for sheets, groups and locations, 3:4 for face and outfit references.

---

## CONTEXT ISOLATION

Each generation is a blank slate — no memory of the last picture. A prompt is a sealed single-picture document. Do not carry in: slide numbers, the episode title, summaries of earlier slides, unused references, "as before / continues" phrasing, or people and props from an earlier slide that are not in this one.

---

## THE HOUSE STRUCTURE

Every prompt in the studio is written as Scene / Subject / Important Details / Use Case / Constraints (CLAUDE.md). For drama pictures the blocks carry this, in this order:

```
Scene: [the location image and what of it is in frame · the frame: shot size, FOV°, camera height and distance ·
        the blocking: who is where, facing where, left/right from the camera · the light: the genre recipe,
        key direction, ratio, rim, practicals, colour temperatures, haze · time of day · where the caption sits]

Subject: [each character: Image N, the sheet · their state and what they carry · the performance in muscle
          movement: eyes, jaw, hands, breath · both reactions when two people read one moment differently]

Important Details: [the objects the story turns on, stated in words even though they are on a reference ·
                    continuity: glasses off since the fall, the key now in her fist · fabric, texture, skin ·
                    the colour grade of the genre]

Use Case: a still frame from a prestige Nigerian streaming drama, [genre], Instagram carousel slide [4:5].

Constraints: [preserve: identity and outfit exactly as the sheet, the room exactly as the location ·
              change only: pose, angle, expression, composition · the quiet third for the caption ·
              no text in the picture · nobody extra in frame · PRINT NO TEXT]
```

Style is **distributed, not a prefix**: light lives in Scene, acting in Subject, grade and texture in Important Details, format in Use Case. Nothing style-related opens the prompt.

**Realism words that work:** realistic skin texture, natural asymmetry, physically plausible light direction, realistic fabric folds, subtle film grain, editorial lens feel, shallow depth of field, documentary photograph. **Never:** stunning, beautiful, masterpiece, epic, insane detail, ultra-detailed, award-winning.

---

## THE QUIET THIRD

Every slide carries its caption (lib/drama/slides.ts draws it over the picture, white words, a fade at the top or the bottom). Say where: "the top third of the frame is quiet — plain dark glass, no faces, no bright objects" or "the bottom third is the empty table top." Put the eyes and the hands in the other two thirds. The cover slide is the poster (the title design goes over its lower third); the choice slide is a close-up of the object the vote turns on, centred, the top third dark.

---

## DIRECTING

**Blocking.** State where each character stands, sits, moves; what their hands do; what sits between them. "She stands at the far end of the table, both hands flat on the glass, the key under her right palm" beats "she stands at the table."

**Reactions.** The secret of viral short dramas: let the viewer catch every little reaction. When two people read one moment differently, write both — "she thinks she is in trouble: eyes down, shoulders in; he has found something interesting: chin up, the beginning of a smile."

**Acting.** Emotion through muscle movement, never labels. Restraint by default — a stillness out-acts a shout.

**Build an entrance.** Before a key face appears, show them from behind, then their hands, then the eyes; the face comes in the next slide. Let a line start while people are still moving.

**Continuity** (hold in mind, written only where it changes): state carried forward (wet, torn, bloodied), one time of day and weather per location, the object's position.

---

## OPTICS — SHOT SIZE, LENS, FOV

Two levers define "how it is shot": **shot size** and **field of view**. Use degrees in the prompt, not millimetres, and only these steps:

| FOV | mm equiv | Purpose |
|-----|----------|---------|
| 84° | 20–24mm | establish, group blocking |
| 63° | 28–35mm | observational wide |
| 47° | 40–50mm | neutral human perspective, medium |
| 29° | 75–85mm | portrait compression, dialogue bust |
| 18° | 100–135mm | close portrait, identity-preserving |
| 12° | 180–200mm | hands, objects, detail |

Shot sizes: ECU (a detail — eyes, a key), CU (full face), MCU (head and shoulders), MS (to the waist), WS (full figure and room), EWS (the place). Camera height and distance stated ("camera at seated eye level, 2.5 m away"). Camera on the shadow side of the key light. Place the camera lines **inside Scene** (position three of the five blocks): moved to the end they are ignored, moved to the front they fight identity.

The ENGINE's `framingOf()` reads the first words of a `see` direction: start it with "Close on", "Wide" or a medium description so the design engine and this prompt agree.

---

## LIGHT — THE GENRE RECIPES

Every picture names its light in film terms. Use the recipe for the story's genre from `lib/drama/lighting.ts` (`GENRE_LIGHT`), then motivate it in the room: the key is the window, the lamp, the sodium streetlight.

| Genre | Key light | Grade |
|---|---|---|
| power | large soft key 45° camera left, 4:1, cool steel-blue rim (5600K), warm practicals (3200K), haze | inky blacks, teal shadows, warm skin, Vision3 500T grain |
| thriller / crime | hard sodium key (2000K) high camera right, 8:1, cold moonlight backlight, one red practical, wet surfaces | crushed blacks, amber-red vs teal-black, coarse grain |
| romance | golden-hour window key (3000K), 2:1 bounce fill, hair halo, candle bokeh | champagne and honey, soft contrast, halation |
| romcom | soft daylight (5600K), high-key 2:1, colourful practicals | clean whites, vibrant natural colour |
| family | warm tungsten interiors, rain outside tall windows, gold and dark wood | — |
| mystery / supernatural | blue dawn mist, low contrast, silver highlights, thin backlight | — |
| period | 1960s tungsten practicals, smoke haze, film grain | painted-poster warmth |
| political | flat fluorescent corridors, grey-green, one red object, blinds | — |

White balance in Kelvin, fixed within a scene. Colour tied to **material + light + role**, never a flat list: "crimson aso-oke catching the warm tungsten spill from the corridor."

Character sheets and portraits use the studio recipe (`SHEET_LIGHT`), not the genre: even, neutral, 18 % grey.

---

## PROMPTING RULES

- **Positive only.** Describe what should happen, not what to avoid. ❌ "no second face" → ✅ "she is the only person in frame."
- **Left/right is from the camera.**
- **Environment interaction stated physically.** Rain runs down the zinc, harmattan dust hangs in the beam, the gele's edge catches the lamp.
- **Giant scale via human height.** "A door twice her height."
- **State critical details in words** even if they are on the reference (the number on the key, the colour of the file): the model can drop them.
- **One lock per hazard, in positive form, next to what it protects**: "the room is identical to Image 2", "the assistant stands behind the chair, never at the table", "clean picture, no written words anywhere."

---

## POSTERS AND REFERENCE IMAGES

- **Face options** (3:4, text-to-image or from a fan's photo): age, build, skin, hair, the city's light, the genre's film texture; neutral expression, eyes to the lens, 18° FOV, plain background. Four to six candidates; pick the one that already belongs to the world.
- **Outfit** (3:4): shoulders to feet, plain wall, flash-lit, no props; every garment element named (prints, neckline, hem, shoes, jewellery) — it will be reproduced element for element.
- **Character sheet** (16:9): the layout text is `SHEET_LAYOUT` in `lib/character-sheet-order.ts` — use it verbatim: two full-length figures on the left (front with the face erased, back), one large portrait on the right, one seamless grey, studio light. A changed look is an **edit of the sheet**: "Edit Image 1: let her hair down and remove the glasses; keep her face, outfit, body, backdrop and layout the same, the face still erased on the front figure."
- **Group** (16:9): the whole group in one picture, different faces and poses, one wardrobe rule, 35mm from hip height.
- **Location** (16:9): a **three-quarter view** that shows the whole layout the scenes need (the table, the path, the door), no people, the genre's light at the story's hour. A straight-on view leaves the model guessing the rest of the room.
- **Poster** (2:3, `lib/drama/poster.ts`): the lead (from their sheet when a fan plays them), the genre's light, the lower third quiet for the title.
- **Prop**: an object that must be identical every time (the brass key, the second will) gets a clean close-up on grey.

---

## VIDEO (phase 3 — Seedance through fal)

When the story moves to video, the Seedance rules from the source skill apply unchanged: SCENE CONTEXT and ACTIVE REFERENCES first, LOCATION MAP, FIRST FRAME / BLOCKING, FORMAT MODE (one continuous shot, or HARD CUTs at stated seconds), OPTICS per segment with "no drift mid-segment", CAMERA in third position, ACTION TIMING to the half-second with every line in quotes and who speaks and how, PERFORMANCE, PHYSICS, LIGHTING, AUDIO, STYLE and OUTPUT SETTINGS as a short suffix, POSITIVE LOCKS last. One generation runs up to 30 seconds; a one-minute episode is two clips plus inserts. The voice description is repeated word for word in every clip where that character speaks; describe an accent by how it sounds, not by its name ("a soft Igbo lilt, the 'r' light, unhurried"). Speeds in km/h, atmosphere in percent and metres, cuts only at the stated points.

---

## CHECKLIST (before each prompt)

- Five blocks in the house order, style distributed into them, nothing style-related at the top?
- References mapped to Image numbers, each one present in the picture, each told what it controls?
- Identity and outfit locked to the sheet in one sentence, the person described minimally?
- Blocking: who is where, facing where, left/right from the camera? Both reactions written?
- Optics: shot size, FOV from the table, camera height and distance, inside Scene?
- Light: the genre recipe, motivated in the room, Kelvin stated, camera on the shadow side?
- The quiet third named for the caption? Eyes and hands outside it?
- Everything positive? Critical details in words? No text in the picture? Nobody extra?
- Aspect and resolution stated (4:5 2K for a slide)?

## FINAL RULES

- English prompts only. Positive phrasing only. No director names, no signature-work references, no camera or lens brand names.
- Nigeria as it is: real streets, real weather, real fabrics — never a tourist postcard, never a caricature.
