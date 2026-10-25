---
name: short-drama-screenwriter
description: Write AI short dramas that look like real movies, from zero to ready-to-generate. With no idea, it picks the strongest of 100 built-in short-drama premises. Then it delivers the whole package used for the SOUL Angel episode - asset prompts for the characters and the location, a 1-3 minute episode built on hook, context, escalation and cliffhanger, exact dialogue, a voice for every character, and a complete Seedance 2.5 prompt for every clip, so each scene is generated with one line. Use it whenever someone wants to write, plan, outline or fix a short drama, micro-drama, AI series or episode, wants story ideas for AI video, or wants to turn an idea into scenes to generate in Higgsfield, even if they never say "script". Works best together with the Seedance 2.5 Prompt Writer skill.
---

# Short Drama Screenwriter

Turn an idea, or no idea at all, into a short drama episode that holds attention from the first second and can be generated scene by scene. You deliver the same package that was used to make the SOUL Angel episode: prompts for the characters and the location, the story, the cast with their voices, the scenes with exact dialogue, an edit plan and a complete generation prompt for every clip.

Most AI short dramas look like slop: faces change between shots, the acting is flat, and nothing makes you want the next episode. This skill fixes all three. Every character is locked to a saved reference, every shot directs the performances and the reactions, and the episode is built on the four parts that successful short dramas share.

## Why one line is enough to generate a scene

The user should never have to engineer a prompt. When they say "generate scene 2", everything the video model needs is already in the clip prompt you wrote, because each prompt carries every decision a director would make on set:

- **Locked references.** Each character and the location are attached by name, with "face, hair and outfit 100% match the reference", so the same people show up in every shot.
- **A location map and a first frame.** Where the furniture, doors and windows are, who stands where in frame one, left and right from the camera's view. Characters don't teleport between cuts.
- **Timing to the half-second.** Every action and every line has a timestamp, so the pacing, the cuts and the dialogue land where the script needs them.
- **Camera and lens.** Shot size, field of view in degrees, camera height, distance and the reason the camera moves. That's what makes it look shot, not generated.
- **Performance and reactions.** What each character does with their face and body while others speak, because reactions carry a short drama.
- **One lighting logic.** The same light sources in every shot, so the clips cut together.
- **The same voice everywhere.** The voice description is repeated word for word in every clip where that character speaks.
- **Positive locks against typical AI mistakes.** Only the quoted lines are spoken, nobody extra wanders into the scene, no text appears on screen, the assistant is never mistaken for a model.

That is why the generation step is a single sentence, and why a failed take needs one targeted change instead of a rewrite.

## Quick start

- **No idea yet** ("make me a short drama", "give me ideas"): pick from the idea bank at the end of this file. Score the candidates (Step 1), show the top three with a one-line pitch each and say which one you recommend. If the user wants speed ("just pick one"), go with your top pick.
- **Has an idea:** go straight to Step 1 and find its feeling.
- **Has no references yet:** write the asset prompts first (Step 4), then the script.
- **Already has references:** use their exact names (`@Lucy`, `@CastingRoom`) everywhere and skip the asset prompts.

- **Format:** decide the aspect ratio up front and state it in every clip prompt, because it changes every framing: 9:16 for a vertical series on TikTok, Reels or Shorts, 16:9 or 4:3 for YouTube. SOUL Angel was 4:3.
- **Delivery:** the full package is long. If you can attach files, deliver it as one document file. If not, deliver it in parts: first the story, cast, references, asset prompts, scenes and edit order, then the video prompts a few clips per message, or each clip right before it's generated.

Default length: about two minutes. Anything from one to three minutes works for one episode. If something is missing, make a reasonable choice, say what you chose, and keep going instead of stopping to ask.

## Step 1: Choose the story

A short drama has no time to explain its world, so start from a situation the audience already understands. Three reliable starting points:

- **A Cinderella story:** someone ordinary gets an unexpected opportunity.
- **Love against the odds:** two people want to be together, but something stands in their way.
- **A rivalry:** two people want the same thing, and only one can get it.

The idea bank adds two more engines that work well in short form: **hidden identity** (someone isn't who they seem) and **turning the tables** (the underestimated person wins).

Then find the **feeling** underneath the story, the one the audience has felt themselves. For a junior accountant who trips in front of the head of a fashion house, it's "I don't belong here, I just embarrassed myself, and now I'm going to get in trouble." That feeling makes the story relatable, not the setting. You don't need to work in fashion to recognize it, and the same feeling carries a completely different story: a waiter singing along in a café, not realizing a famous producer is listening. Someone who usually goes unnoticed suddenly gets a chance to be seen.

**Scoring ideas.** When choosing from the bank or comparing the user's ideas, score each from 1 to 5 on:

1. **Instant situation:** 5 = clear from a single frame, 3 = needs one line of dialogue, 1 = needs backstory.
2. **Recognizable feeling:** 5 = almost everyone has felt it, 3 = a specific group has, 1 = rare or abstract.
3. **A visible peak:** 5 = a physical event in one shot (a fall, a slap, a spill, a reveal), 3 = a sharp line of dialogue, 1 = an inner thought.
4. **Reaction contrast:** 5 = two characters read the same moment in opposite ways on camera, 3 = one clear reaction, 1 = nobody reacts.
5. **Easy to produce:** 5 = two to four speaking characters, one location, everyday actions; 3 = five characters or two to three locations; 1 = crowds, vehicles, or dance, fights or sports as the main beat, because AI video still handles complex choreography poorly.
6. **Series potential:** 5 = the premise can run for ten or more episodes, 3 = for a few, 1 = a single story.

Recommend the highest total. Ideas marked ★ in the bank score high on all six and make strong first episodes. Idea #1 is the episode from the SOUL Angel video: pick it only if the user wants to recreate that episode. Fit the choice to the user's audience if you know it.

## Step 2: Build the episode on four parts

Plan the four parts before writing any dialogue, then check each one again when the script is done.

**1. The hook.** Open on the peak of the story, not the beginning: an emotional outburst, a conflict, a fall. The viewer sees the loudest moment without knowing how it got there, so they keep watching to find out who these people are, what they want and what's going on. You can flash the most dramatic moment first and then cut back to show how we got there.

**2. The context.** Show who these people are and what they want, but keep the emotional swings coming every 20 to 30 seconds: a starting point, then hope, then another hit, then a chance. A flat stretch of explanation is where viewers scroll away.

**3. The escalation.** Bring in an unexpected turn: a new character shows up, the conflict grows, something happens the viewer didn't see coming. This is also where the biggest secret of viral short dramas lives: **let the viewer catch every little reaction.** The tension comes from how differently the characters read the same moment. She thinks she's in trouble, he thinks he's found someone interesting. Write both performances, and spell out the movement too: who stands up, who crosses the room, who steps back.

**4. The cliffhanger.** End just before the answer the viewer has been waiting for: someone is about to make a decision, reveal who they really are, or walk out with a completely new look. Promise it, don't show it. Cut to black.

Close to the ending, **pick up the pace**: changing angles, a big entrance, small interactions between characters. It should feel like something big is about to happen. Build anticipation before a key character's face appears: show them from behind, then their clothes, hands and eyes, and only then the face. Let lines start while people are still moving, so there are no dead pauses.

The SOUL Angel episode, about two minutes:

| Part | What happens |
|---|---|
| Hook | During a casting, a model wobbles in her heels and falls. The director's sarcasm turns into concern. |
| Context | Every model walks the same walk and strikes the same pose. His "Next" gets quieter and flatter each time. |
| Turn | Lucy, a junior accountant, walks in with paperwork, trips, and her hair comes loose. He notices her. |
| Escalation | He walks over. She waits to be told off, he tries to work out who she is. He offers her the chance to be the face of the house, while his assistant's side-eye says everything. |
| Cliffhanger | The head stylist sits her in front of the mirror: "Well then. Let's begin, muse." Cut to black. |

## Step 3: Cast, voices and continuity

**Cast.** For each character, give their name, age, role, what they want in this episode and how they behave under pressure. Keep it to two to five speaking characters.

**Voices.** Give every speaking character a voice description: accent, pitch, pace and timbre, for example "speaks English with a strong, elegant Parisian French accent, low and quiet, unhurried." That's the stable part. Repeat it word for word in every clip where the character speaks, and the voice stays the same from scene to scene. How they sound at a given moment (calm, cracking, flatter with every model) goes into ACTION TIMING, next to each line.

**Names.** Check that every invented full name doesn't belong to a real public figure. Search it, and rename the character if it does.

**Continuity.** List what each character wears and carries in each scene and when it changes: the glasses fall off in Scene 2 and stay off, the magazines are handed over in Scene 5. Video models forget these things between clips unless every prompt states them.

**Background people.** Take extras from one group reference and say who they are not. If the assistant must never be mistaken for a model, write that in every clip where both appear.

## Step 4: Asset prompts (when references don't exist yet)

Write a ready prompt for every reference the script needs and give each one its final name. The order:

1. **Face** (Soul 2.0, 3:4): for each main character, four to six single face-reference portraits to choose from. Describe age, look and vibe, plus the era's camera, lighting and film texture, so the character already fits the world. The user picks one and saves it as `@NameFace`.
2. **Outfit** (Soul 2.0, 3:4): the clothes from the shoulders to the feet against a plain wall, with no bags or hand-held props. Worn items that come off during the story, like gloves, glasses or a jacket, belong in the outfit if the character starts with them. Save as `@NameOutfit`. The user can also upload a reference photo and say which details to keep.
3. **Character sheet** (GPT Image 2, 16:9): combine `@NameFace` and `@NameOutfit`. Follow three rules, because they decide whether the character stays the same in video:
   - a plain **grey background**, not white or black;
   - **three views**: full-body front, full-body back and a close-up of the face;
   - **erase the face on the full-body front view**, so the close-up is the only face reference. Otherwise the video model may take the face from the close-up in one shot and from the full-body view in another, and the character starts to look like a different person. Ask for it directly: "On the full-body front view, leave the face blank: a smooth, featureless oval, no eyes, nose or mouth." If the model still draws a face, erase it with an edit or in any image editor.

   Save as `@Name`.
4. **A changed look** (Seedream 5.0, edit of the sheet): hair down, glasses off, a new outfit. Keep the face, outfit, body proportions, background and layout the same. Save it under its own name, like `@NameHairDown`, because one sheet can only hold one look.
5. **Small details** (Soul 2.0): jewellery or accessories that must be exact get their own close-up, attached along with the face and outfit when making the sheet.
6. **Background group** (Soul 2.0, 16:9): the whole group in one image, with different faces and poses in a shared style. Save as `@Models`, `@Guests` or similar.
7. **Location** (Soul Cinema, 16:9): a three-quarter view that shows the full layout the scenes need: where the main character sits, the paths people walk, the door they enter through. No people. Save as `@PlaceName`.
8. **Story props** (optional): an object that has to look identical in every clip, like a ring, a folder or a mop bucket, can get its own reference image. Otherwise describe it in the same words in every clip.

In the video prompts, attach the character sheets, the location and the group image. The face and outfit images are only inputs for the sheets. Plan for about three image generations per main character (face options, outfit, sheet) plus one per changed look; side characters can come from the group image instead.

## Step 5: Break the scenes into clips

One Seedance 2.5 generation runs up to 30 seconds, so plan every scene as one or more clips of 30 seconds or less. Within a clip, plan roughly one shot per two to five seconds, or one continuous take. Attach only the references the clip actually uses (the SOUL Angel clips used two to five each). A cut to black goes into the prompt as a hard cut at a stated second.

- **One clip per scene** when the scene fits in 30 seconds.
- **An insert clip** when one moment needs special treatment, like a fall in slow motion or a close-up of a phone call. Generate it separately and cut it into the scene. When a scene works except for one moment, fix that moment with an insert instead of regenerating the whole scene.
- **A one-shot new location** doesn't need its own image. Use the main location as a style reference and describe the new space in the prompt.

End the script with a **generation and edit order** table: every clip in order, its length and how it's used in the edit (whole scene, replaces part of a scene, cut into a scene).

## Step 6: Write the clip prompts

If the **Seedance 2.5 Prompt Writer** skill is available, use it for every clip prompt. It handles camera movement, lens and framing, lighting, timing and performance the way Seedance responds to best.

Otherwise, write each prompt in plain text with these blocks, in this order, using only the ones the clip needs:

- **SCENE CONTEXT:** what happens in the clip in three to five sentences, including the emotional turn.
- **ACTIVE REFERENCES:** every reference by its exact name, then the character: age, role, position, what they hold, their voice, and "face, hair and outfit 100% match the reference."
- **LOCATION MAP:** where the furniture, doors, windows and paths are, and where the camera stands.
- **FIRST FRAME AND SPATIAL BLOCKING:** who is where in the first frame, left and right from the camera's view.
- **FORMAT MODE:** a single shot, or a sequence with hard cuts at stated seconds; real time or slow motion.
- **OPTICS and CAMERA:** shot sizes, field of view in degrees, camera height, distance and movement, and why it moves.
- **ACTION TIMING:** every beat and every line with timestamps, like "4.0s to 6.5s: she lifts her face into the light." Put dialogue in quotes, say who speaks and how.
- **PHYSICS:** how bodies, fabric, hair and objects move.
- **LIGHTING:** the light sources and their direction, the same logic in every shot.
- **AUDIO:** voices, room sound, footsteps, and whether there is music.
- **POSITIVE LOCKS:** what must stay true in every shot, for example "the room is identical to @CastingRoom", "only the quoted lines are spoken", "clean picture without on-screen text."

Write what the camera can see, not mood words. "She freezes, her hand tightens on the folder, her eyes drop to the floor" works. "She feels anxious" doesn't.

Match the length to the clip. A simple insert needs a few blocks and a few hundred words; a dense 30-second dialogue scene with several characters needs far more. Drop any block that doesn't change the result.

## Step 7: Generate and revise

When the user asks to generate, use each clip prompt with its named references attached, one clip at a time, and review it before moving on. The request can be as short as "Generate scene 1 with Higgsfield using Seedance 2.5. Use the approved prompt and our saved assets."

When a take doesn't work, name the problem in plain words: the fall looks fake, the runway feels empty, the accent came out American, the wrong person is in the photo, her face is turned away, the pauses drag. Change only what's broken, keep everything else, return the updated prompt, generate again and compare. Precise direction beats general notes. "A soft French 'r', calm at first and more frustrated as the casting goes on" fixes an accent. "Make the accent better" doesn't.

## Output template

Return everything in one document, in this order:

```
# [TITLE] — Episode [N]: screenplay and video prompts
Format: [aspect ratio] | Length: [about N min] | Clips: [N]

## Plot
[One paragraph: the situation, the turn, where the episode stops.]

## Cast
- **[NAME]**: [age, role, what they want, how they behave]. Voice: [accent, pitch, pace, how it changes].

## Continuity
[Looks, outfits, props and state changes, scene by scene.]

## References
| Name | Use |
|---|---|
| @[Name] | [who or what it locks, in which scenes] |

## Asset prompts
[Only if references don't exist yet: one ready prompt per reference, with its model, aspect ratio and final name.]

## Scene 1 — [Title] ([which of the four parts])
**INT./EXT. [PLACE] — [TIME]**
[Action, written as what we see.]

**[CHARACTER]**
[Line.]

[...every scene...]

## Generation and edit order
| # | Clip | Length | Use in the edit |
|---|---|---|---|

## Video prompts
### Clip 1 — Scene 1 — [Name] ([length] s)
[full prompt in a code block]
```

## Planning a series

For more than one episode, give each episode its own four parts, end every episode on a cliffhanger and open the next one on its answer. Keep the same references and voice descriptions across episodes so the characters stay recognizable. Free episodes earn the curiosity that makes people pay for the next ones, so the first episodes need the strongest hooks.

## Boundaries

These keep the work publishable and keep generations from failing content checks:

- Write original stories. The idea bank is original; borrow structures and feelings from existing shows, never plots, characters, names or dialogue.
- No real people or celebrities as characters, and no imitation of a real person's likeness.
- Keep it platform-safe. Romance plays out through looks, touches and near-misses, with no nudity or sexual content. Every character is an adult. No graphic violence.

## Idea bank: 100 short-drama premises

Each idea: the premise, the feeling underneath it, and the peak to open on. ★ = strongest first-episode picks.

### Cinderella: someone ordinary gets an unexpected opportunity

1. ★ **Soul Angel.** A junior accountant interrupts a casting at a fashion house, trips, and the bored creative director decides she should be the face of the house. *Feeling:* "I don't belong here." *Opens on:* a model falling on the runway.
2. ★ **The Café Aria.** A waiter sings along to the radio while closing up, not knowing a famous music producer is still at the corner table. *Feeling:* nobody ever really hears me. *Opens on:* the whole café going silent as she hits the high note.
3. **Night Shift Ballet.** A cleaner at a ballet company dances alone after hours, while the artistic director, who has just lost her lead, watches from the dark balcony. *Feeling:* too late for my dream. *Opens on:* the lead dancer's ankle giving way at the dress rehearsal.
4. **The Fake on the Wall.** A night guard at an auction house says out loud that the star painting is a fake, in front of the buyers. *Feeling:* who am I to speak up? *Opens on:* the auctioneer's hammer frozen in mid-air.
5. **Ten Minutes to the Altar.** The groom's jacket rips before a society wedding, and the hotel tailor's apprentice fixes it in the corridor while his designer mother watches. *Feeling:* just the help. *Opens on:* the seam tearing as the groom bends over.
6. **Live Translation.** A junior interpreter corrects her CEO's disastrous mistranslation live on stage at a product launch. *Feeling:* I'll be fired for this. *Opens on:* the foreign investors standing up to leave.
7. **Kitchen Porter.** The dishwasher of a top restaurant finishes the head chef's signature dish when the chef burns his hand during a critic's visit. *Feeling:* never allowed near the stove. *Opens on:* a pan bursting into flames.
8. **The Wrong Face.** A courier delivering lunch to a modeling agency gets photographed by accident, and hers is the only photo the client likes. *Feeling:* I'm not that kind of pretty. *Opens on:* the agency boss slamming down a stack of rejected photos.
9. **Chess at Closing Time.** The cleaner of a chess club quietly finishes the grandmaster's abandoned game and wins it. *Feeling:* nobody expects anything from me. *Opens on:* the grandmaster sweeping the pieces off the board.
10. **The Bouquet.** A florist's assistant rebuilds a crushed bridal bouquet in the church hallway; the bride's mother runs the city's biggest events agency. *Feeling:* background staff. *Opens on:* a bridesmaid stepping on the bouquet.
11. **The Elevator Speech.** A receptionist rehearses a speech in the elevator, and the man beside her is the founder looking for someone to present to the shareholders. *Feeling:* I'm not a leader. *Opens on:* the elevator jolting to a stop between floors.
12. **Second Violin.** The orchestra's page-turner plays the solo when the soloist's string snaps on opening night. *Feeling:* always one step behind. *Opens on:* the string snapping and the hall gasping.
13. **The Seamstress Who Said No.** A seamstress refuses to alter a gown because it would ruin it, and the designer in the next room hires her on the spot. *Feeling:* I should just keep quiet. *Opens on:* scissors cutting into silk.
14. **Street Portrait.** A street artist sketches a stranger who turns out to own the city's most important gallery. *Feeling:* my work isn't real art. *Opens on:* a gust of wind scattering her drawings across the square.
15. **The Stand-In Singer.** A wedding singer replaces the headliner at a billionaire's party when the star's voice cracks. *Feeling:* small stages are all I get. *Opens on:* the star's voice breaking on the first note.
16. **On Air.** A night cleaner at a radio station answers a caller live, and the city falls for her voice. *Feeling:* I'm invisible. *Opens on:* the ON AIR light snapping on in an empty studio.
17. **Make-Up Call.** A make-up assistant saves a live TV show when the host's make-up is ruined minutes before air. *Feeling:* I only hold the brushes. *Opens on:* a cup of coffee splashing across the host's face.
18. **The Window.** A shop assistant redesigns the window display overnight, and the brand's creative director stops on the street at dawn. *Feeling:* nobody asked me. *Opens on:* the old display crashing down as she pulls it apart.
19. **The Interpreter's Gift.** A hotel maid is the only person who speaks the language of a stranded VIP guest. *Feeling:* nobody sees what I can do. *Opens on:* the guest shouting at a lobby full of staff who don't understand.
20. **The Recipe Card.** A café cook's handwritten recipe ends up in the hands of a famous food critic who demands to meet the chef. *Feeling:* I just make lunch. *Opens on:* the critic storming into the kitchen holding the card.

### Love against the odds

21. ★ **The Bodyguard's Rule.** A bodyguard has to deliver the heiress he protects to her own engagement party, and he's the one she wants. *Feeling:* I can't have what I want. *Opens on:* him catching her as she slips on the stairs, her fiancé watching.
22. ★ **Fiancée for One Night.** A waitress agrees to play a rich man's fiancée at his family dinner, and his sister recognizes her as yesterday's waitress. *Feeling:* I'll never fit into their world. *Opens on:* the sister pointing across the table: "You served us yesterday."
23. **The Shared Wall.** Two rival bakers share a wall and a feud, until she finds out his new investor is her fiancé. *Feeling:* the wrong person makes sense. *Opens on:* a cloud of flour exploding over both counters.
24. **The Opposing Client.** A divorce lawyer falls for the husband she's been hired to take apart in court. *Feeling:* wrong person, wrong time. *Opens on:* him knocking her case files across the courthouse floor.
25. ★ **Blackout.** A man and the CEO who fired him that morning get stuck in an elevator during a blackout. *Feeling:* pride against need. *Opens on:* the lights dying and her grabbing his arm.
26. **Find Me Someone Like You.** A matchmaker who has never been in love is hired by the man she secretly loves to find him a wife. *Feeling:* I help everyone but me. *Opens on:* him sliding a check across her desk: "Find me someone like you."
27. **The Objection.** A wedding planner falls for the groom's brother, the one person trying to stop the wedding. *Feeling:* loyalty against love. *Opens on:* the brother standing up at the rehearsal: "I object."
28. **The Gardener.** A woman promised to her father's business partner opens up only to the gardener. *Feeling:* my life was decided for me. *Opens on:* her throwing the engagement ring into the fountain.
29. **The Critic's Table.** A food critic who destroyed a chef's restaurant gets snowed in at his new place. *Feeling:* I hurt the one person I could love. *Opens on:* the chef recognizing her and dropping a plate.
30. **Cover-Up.** A tattoo artist is asked to cover up a client's ex's name, and it's his own name. *Feeling:* the past isn't finished. *Opens on:* the needle stopping as he reads the name on her wrist.
31. **One More Final.** Former dance partners who stopped speaking are forced to compete together in a final. *Feeling:* we broke something we can't fix. *Opens on:* her slipping mid-spin and him catching her.
32. **Kill the Mic.** A stage manager falls for the singer she's been ordered to keep off the stage after a scandal. *Feeling:* duty against desire. *Opens on:* her pulling the plug on his mic mid-song.
33. **The Hotel Pianist.** A hotel pianist plays the same song every night for a woman engaged to the hotel's owner. *Feeling:* loving someone who belongs to someone else. *Opens on:* the owner slamming the piano lid shut.
34. **The Masked Ball.** At a masked ball she dances with a stranger, and the next morning he's the man taking over her father's company. *Feeling:* I trusted the wrong person. *Opens on:* her slapping him across the boardroom table.
35. **The Ring in the Window.** A jeweller repairs an engagement ring and realizes it's the one she gave back to her ex years ago. *Feeling:* the one that got away. *Opens on:* the ring rolling across the counter to her feet.
36. **Harvest.** The heirs of two feuding wine families fall for each other during the harvest. *Feeling:* our families will never allow it. *Opens on:* a barrel rolling down the hill between them.
37. **Wrong Phone.** Two strangers swap phones at an airport, and the messages they read change everything. *Feeling:* a stranger knows me better than my partner. *Opens on:* her phone ringing in his pocket at the gate.
38. **The Second Sister.** A man arrives to meet his long-distance love and is greeted by her sister, who has been writing the letters. *Feeling:* I fell for the words, not the face. *Opens on:* the real sister walking in mid-hug.
39. **Dinner for Two.** A hotel room-service waiter and the guest who orders the same dinner for two every night, and eats alone. *Feeling:* lonely in a crowded place. *Opens on:* her bursting into tears as he sets down the second plate.
40. **The Translator's Letters.** A translator falls for the author whose love letters to another woman she's translating. *Feeling:* every word is meant for someone else. *Opens on:* her reading a line aloud and stopping because it's about her.

### Rivalry: two people want the same thing

41. ★ **Sisters at the Stove.** Two estranged sisters meet as the last two contestants of a cooking show. *Feeling:* she always got everything. *Opens on:* one sister's plate shattering on the floor seconds before judging.
42. **The Understudy.** A ballet understudy and the prima share one dressing room and one solo, until someone cuts the prima's ribbons on opening night. *Feeling:* my turn will never come. *Opens on:* the ribbon snapping mid-performance.
43. **One Offer.** Two interns, one job offer, and a laptop that crashes the night before the final presentation. *Feeling:* I did everything right and still might lose. *Opens on:* the screen going black in front of the board.
44. **Same House.** Two real estate agents, once a couple, try to sell the same mansion to the same buyer on the same day. *Feeling:* we can't stop competing. *Opens on:* both pulling the same front door from opposite sides.
45. **First Chair.** Two violinists compete for first chair, and the conductor is one of their fathers. *Feeling:* talent against connections. *Opens on:* a bow snapping during the audition.
46. **The Dress.** A bride and her future mother-in-law fight over the wedding dress. *Feeling:* I'll never be good enough for her. *Opens on:* coffee spilling over the gown on the wedding morning.
47. **Stolen Sketch.** An architect watches her ex-partner present her stolen design at the pitch of the year. *Feeling:* my work, his name. *Opens on:* her standing up mid-presentation: "That's mine."
48. **The Campaign.** Two models compete for one campaign, and the photographer is the ex of one of them. *Feeling:* the past is on set. *Opens on:* a heel snapping in front of the camera.
49. **Opposite Sides.** Two divorced lawyers end up on opposite sides of a celebrity divorce case. *Feeling:* we still need to win against each other. *Opens on:* him objecting before she finishes her first sentence.
50. **Same Face, Two Heirs.** Identical twin sisters compete to run the family hotel, and their father can't tell them apart. *Feeling:* I'm always the other one. *Opens on:* one twin slapping the other at the reading of the will.
51. **Blind Tasting.** Two sommeliers face off in a final blind tasting, and one of them switched the bottles. *Feeling:* winning at any cost. *Opens on:* a wine glass shattering on the marble floor.
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
63. **The Humble Groom.** A bride's family mocks her modest fiancé, who quietly owns the hotel hosting the wedding. *Feeling:* love doesn't need to impress. *Opens on:* his future mother-in-law dropping his gift into the trash.
64. **First Day, Last Mistake.** A manager humiliates the new intern in front of the office, not knowing she's the CEO's daughter. *Feeling:* I want to be judged for my work. *Opens on:* a stack of files thrown at her feet.
65. **The Mechanic Who Wasn't.** She thinks her date is a mechanic, and he's the bank director she pitches the next morning. *Feeling:* I judged too fast. *Opens on:* her walking into the meeting and freezing at the sight of him.
66. **The Quiet Pen.** The quiet assistant of a famous novelist is the one who writes the books. *Feeling:* my words, someone else's fame. *Opens on:* the novelist stammering at a live reading when the page is blank.
67. **The Old Man at the Auction.** An old man nobody notices at an auction is the painter of the masterpiece on sale. *Feeling:* the world forgot me. *Opens on:* him laughing out loud as the bids pass a million.
68. **The Quiet Champion.** A quiet security guard is a former champion, and the club's star picks a fight with him. *Feeling:* I left that life behind. *Opens on:* the star's punch caught in mid-air.
69. **Holding the Keys.** A wealthy family's driver is the lost heir they've been searching for. *Feeling:* I was there all along. *Opens on:* the lawyer reading a name and every head turning to the man holding the car keys.
70. **The Real Designer.** The assistant everyone ignores designed the brand's bestselling collection. *Feeling:* invisible talent. *Opens on:* the founder failing to sketch on live TV.
71. **The Boutique.** A shop assistant refuses to serve a scruffy customer, who turns out to be the store's new owner. *Feeling:* being dismissed at a glance. *Opens on:* the assistant blocking the door: "This store isn't for you."
72. **Switched for a Day.** Identical twins swap places for one day, and the shy one ends up running her sister's board meeting. *Feeling:* I'm braver than they think. *Opens on:* the boardroom falling silent when she walks in.
73. **The Street Musician.** A street musician everyone walks past is a famous composer who vanished ten years ago. *Feeling:* starting over where nobody knows me. *Opens on:* a conductor stopping dead in front of his open case.
74. **The Night Janitor.** A law firm's night janitor is a disbarred lawyer who quietly solves the case they're losing. *Feeling:* a second chance I don't deserve. *Opens on:* the partners finding the answer written on their whiteboard.
75. **The Cook.** The estate's cook is the true heir, and the will is read at dinner. *Feeling:* serving the family that should be mine. *Opens on:* the soup ladle falling as the lawyer reads her name.
76. **The Ignored Guest.** The guest the hotel staff brush off is the critic who decides the hotel's fifth star. *Feeling:* being treated as nobody. *Opens on:* a bellboy tossing her suitcase aside.
77. **The Uninvited Sister.** An uninvited wedding guest is the bride's sister nobody knew existed. *Feeling:* the family secret is me. *Opens on:* her standing up when the officiant asks for objections.
78. **Champion in Sneakers.** The substitute teacher at a run-down adult dance studio is a retired world champion. *Feeling:* I hid from what I lost. *Opens on:* her landing a perfect turn in sneakers.
79. **The Translator at Dinner.** A translator at a business dinner hears the other side plotting in a language they think nobody understands. *Feeling:* staying quiet or speaking up. *Opens on:* her translation stopping mid-sentence.
80. **Grease on His Hands.** The racing team's quiet mechanic is the engineer who designed their winning car. *Feeling:* credit taken by louder people. *Opens on:* the team boss blaming him in front of everyone.

### Turning the tables: the underestimated one wins

81. ★ **The Reunion.** The woman everyone mocked at school walks into the reunion as the guest of honor. *Feeling:* they never saw me. *Opens on:* her old bully spilling wine on her dress at the door.
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
