/**
 * Story pictures for every Photo Wahala episode — Season 1 here, Season 2
 * written beside its stories in season2/ and turned into prompts below.
 *
 * Two pictures per episode, shown full-screen between the text slides. The
 * owner makes them in Google Flow for free — the studio only writes the
 * prompts — and drops each finished picture on its own scene card, so a
 * picture can never land in the wrong slot. (The repo learned that the hard
 * way: guessing afterwards which download belonged where cost 45 wrongly
 * labelled files.)
 *
 * Why two: Instagram stops at 10 slides, and an episode is already 8 — the
 * before, the after and six text cards.
 *
 * CONSISTENT FACES. Each story has a cast:
 *   - The MAIN character is a real person — the one in that episode's before
 *     and after. Their own photo is the face reference in Flow, so the story
 *     pictures and the before/after show the same face. They must have agreed
 *     to play the part, including AI-made scenes of them.
 *   - SUPPORTING characters are invented. Each has a portrait prompt: make the
 *     face once in Flow, then attach that portrait to every scene they are in.
 *
 * Every prompt follows the house template in CLAUDE.md — Scene / Subject /
 * Important Details / Use Case / Constraints — with the face rule spelled out,
 * because Flow keeps likeness only when told to.
 *
 * Flow has no 4:5. Pictures are made at 3:4 and trimmed to Instagram's 4:5,
 * which loses a sliver top and bottom — hence "keep heads clear of the edges".
 */

import { SCENES_S2, CASTS_S2 } from "./plan-season2.mjs";

export const FLOW_SETTINGS = "Google Flow · Nano Banana · 3:4 portrait · 2K";

const USE_CASE =
  "Use Case: a cinematic still from a Nigerian drama series, shown full-screen between the text slides of an Instagram carousel.";
const CONSTRAINTS =
  "Constraints: photo-realistic. Every face must match its attached reference exactly — same face shape, eye spacing, " +
  "nose, lips, jawline, skin tone and hairline; change only expression and pose. Realistic skin texture, natural asymmetry, " +
  "realistic fabric folds, subtle film grain, physically plausible light, 35mm lens feel. No text, captions, logos or " +
  "watermarks, and no phone or laptop screen with readable writing. Keep every head well inside the frame, clear of the " +
  "top and bottom tenth — the picture is trimmed to 4:5. No people beyond those described, apart from blurred background guests where stated.";

/** A face reference for an invented character: made once, attached everywhere. */
const portrait = (who) => [
  "Scene: plain light-grey studio backdrop, soft even light from the front-left, gentle fill, no harsh shadows.",
  `Subject: ${who}. Head and shoulders, facing the camera, relaxed neutral expression, mouth closed.`,
  "Important Details: sharp focus on the eyes; natural skin texture; a simple plain top; nothing covering the face.",
  "Use Case: the face reference for a recurring character in a photo-story series — every scene in the story is matched to this face.",
  "Constraints: photo-realistic, an ordinary real-looking person rather than a model, no retouching, no text or logos, head centred and uncropped.",
].join("\n");

/** One scene: which card it follows, whose faces to attach, and the prompt. */
const scene = (after, attach, setting, subject, details) => ({
  after, attach,
  prompt: [`Scene: ${setting}`, `Subject: ${subject}`, `Important Details: ${details}`, USE_CASE, CONSTRAINTS].join("\n"),
});

const real = (name, who) => ({ name, real: true, note: `Use your photo of the person playing ${name}: ${who}` });
const made = (name, who) => ({ name, real: false, prompt: portrait(who) });

/** Story number → its cast. */
export const CASTS = {
  1: [real("Kemi", "the woman in this story's before and after."),
      made("Tolu", "a Nigerian woman of 30, light-brown skin, sharp cheekbones, long box braids, a face made for a smirk"),
      made("Mummy Bride", "a Nigerian woman in her late fifties, full round face, warm dark-brown skin, gold stud earrings, motherly but formidable")],
  2: [real("Amaka", "the wig vendor; the before and after are her stock, so use a clear photo of her face."),
      made("Nkiru", "a Nigerian woman of 27, Amaka's younger sister, round face, short natural hair, sceptical eyes")],
  3: [real("Mama", "the woman in this story's before and after."),
      made("Chioma", "a Nigerian woman of 32, Mama's daughter, warm dark-brown skin, oval face, shoulder-length braids, kind tired eyes"),
      made("Aunty Nkechi", "a Nigerian woman of 58, sharp eyes, high forehead, elegant head tie, a mouth that disapproves easily")],
  4: [real("Funmi", "the woman in this story's before and after."),
      made("Lola", "a Nigerian woman of 28, Funmi's best friend, light-brown skin, short curly hair, wide expressive mouth")],
  5: [real("Tunde", "the young man in this story's before and after."),
      made("Bayo", "a Nigerian man of 27, Tunde's cousin, round face, chubby cheeks, low haircut, easy grin"),
      made("The CEO", "a Nigerian woman in her fifties, poised, short tapered natural hair, rimless glasses, calm authority")],
  6: [made("Bisi", "a Nigerian woman of 35, a home caterer, round warm face, colourful headwrap, cheerful eyes")],
  7: [real("The bride and groom", "the couple in this story's before and after — attach a photo of each."),
      made("Dayo", "a Nigerian man of 24, a young wedding photographer, slim face, dark skin, thin moustache, plain baseball cap"),
      made("Femi", "a Nigerian man of 55, a senior photographer, heavy-set, bald head, neat grey beard, self-satisfied expression")],
  8: [real("Adaeze", "the five-year-old in this story's before and after. A child: you need her parent's written permission, including for AI-made scenes."),
      made("Emeka", "a Nigerian man of 34, Adaeze's father, Igbo features, full neat beard, warm eyes, low cut hair"),
      made("Ugochi", "a Nigerian woman of 32, Emeka's wife, oval face, long braids, gentle smile"),
      made("Grandma", "a Nigerian woman of 63, Emeka's mother-in-law, round face, short grey hair, reading glasses on a chain")],
  9: [real("Ngozi", "the nurse in this story's before and after."),
      made("Mama Ngozi", "a Nigerian woman of 56 from a village, dark skin, deep laugh lines, simple headscarf")],
  10: [real("Seyi and Ronke", "the couple in this story's before and after — attach a photo of each."),
       made("Wale", "a Nigerian man of 33, Ronke's older brother, stern face, strong jaw, clean-shaven head, intense eyes"),
       made("Kunle", "a Nigerian man of 29, Seyi's friend, round playful face, small goatee")],
  11: [real("Zainab", "the graduate in this story's before and after."),
       made("Zainab's mum", "a Nigerian Hausa woman of 55 wearing a hijab, gentle round face, warm eyes"),
       made("Hauwa", "a Nigerian Hausa woman of 27 wearing a hijab, sharp features, expressive eyebrows")],
};

/**
 * Episode → its two scenes. `after` is the card the picture follows: in
 * episode 1 the cards are cover, three beats, cliffhanger, ask; in episodes 2–4
 * they are cover, previously, two beats, cliffhanger, ask.
 */
export const STORYBOARD = {
  // ── 1 · The Asoebi Group Chat ──────────────────────────────────────────────
  m01: [
    scene(2, ["Tolu"], "a Nigerian wedding reception at night, round tables, warm orange hall light, blurred guests in matching asoebi.",
      "Tolu seated at a table, holding up her phone, typing with a smirk, eyes narrowed with mischief.",
      "rose-gold asoebi lace and gele; the phone held towards camera with the screen angled away; party clutter on the table."),
    scene(4, ["Kemi"], "a small bedroom late at night, lights off, only the phone's glow.",
      "Kemi sitting on the edge of her bed still in her asoebi, gele off, staring at her phone, worried and embarrassed.",
      "the gele folded beside her; a lamp switched off; the blue-white phone light on her face; screen angled away."),
  ],
  m02: [
    scene(3, ["Mummy Bride"], "the wedding hall after midnight, chairs being stacked, warm low light.",
      "Mummy Bride reading her phone through glasses lowered on her nose, eyebrows raised, thoroughly unimpressed.",
      "rich gold lace and a tall gele; one hand on her hip; staff blurred in the background."),
    scene(4, ["Kemi"], "Kemi's bedroom at 1am, only the phone lighting her face.",
      "Kemi propped on her elbows in bed, zooming into her phone with two fingers, jaw set, deciding something.",
      "bonnet on; duvet bunched; the phone screen turned away from camera."),
  ],
  m03: [
    scene(3, ["Kemi"], "Kemi's bedroom at 2am, soft phone glow, everything else dark.",
      "Kemi lying back on her pillow smiling at her phone, relieved, almost laughing.",
      "bonnet on; one hand on her chest; warm light on her face from the screen, which faces away."),
    scene(4, ["Kemi"], "a small sunlit kitchen the next morning.",
      "Kemi at a table sipping tea, her phone face-down beside the cup, a small knowing smile.",
      "casual wrapper; morning light from a window behind her; breakfast plate."),
  ],
  m04: [
    scene(3, ["Kemi"], "Kemi's living room on Sunday evening, warm lamp light.",
      "Kemi on the sofa laughing at her phone, knees pulled up, delighted.",
      "throw pillows; a cup of zobo on the side table; phone screen angled away."),
    scene(4, ["Mummy Bride"], "a Nigerian living room with family photos on a shelf, afternoon light.",
      "Mummy Bride placing a new framed photograph on the shelf, stepping back with a proud smile.",
      "the frame seen from behind so its picture is not visible; wedding souvenirs on the shelf; house dress and head tie."),
  ],

  // ── 2 · 200 Wigs ───────────────────────────────────────────────────────────
  m05: [
    scene(2, ["Amaka"], "a small Lagos room in the morning, a bed and shelves piled with wigs in clear nylon bags.",
      "Amaka standing in the middle of the room reading a text message, worried, one hand on her forehead.",
      "a burgundy wig on a mannequin head on the dresser; rent receipts on the table; soft window light."),
    scene(4, ["Amaka"], "the same room, evening, one overhead bulb.",
      "Amaka sitting on the floor against the bed, scrolling her phone, mouth open in disbelief.",
      "bagged wigs all around her; the phone screen angled away; hard bulb light from above."),
  ],
  m06: [
    scene(3, ["Amaka"], "Amaka's bedroom at night under a single bare bulb.",
      "Amaka leaning over her bed photographing a burgundy wig on a mannequin head with her phone.",
      "a patterned duvet behind the wig; her other hand smoothing the hair; flat, unflattering light."),
    scene(4, ["Amaka", "Nkiru"], "a small sitting room at night, TV glow.",
      "Amaka and her sister Nkiru on a sofa; Nkiru sceptical with arms folded, Amaka hopeful, phone in her lap.",
      "a plate of chin-chin between them; casual home clothes."),
  ],
  m07: [
    scene(3, ["Amaka"], "Amaka's room the next morning, bright and tidy.",
      "Amaka at a small table packing wig orders into bags, humming, determined smile.",
      "a stack of courier envelopes; a handwritten list of orders; morning sun."),
    scene(4, ["Amaka"], "the same room in the evening.",
      "Amaka on a phone call, grinning, gesturing with her free hand.",
      "sticky notes with orders on the wall behind her; a ring light switched off in the corner."),
  ],
  m08: [
    scene(3, ["Amaka"], "the gate of a Lagos compound in the morning.",
      "Amaka handing an envelope of cash to her landlord, a man in his sixties in a kaftan; both smiling.",
      "the landlord surprised and pleased; a parked car and a plastic chair behind them."),
    scene(4, ["Amaka"], "Amaka's room, afternoon, wigs now displayed neatly on stands.",
      "Amaka lying on her bed laughing at her phone, triumphant.",
      "neat display of wigs behind her; phone screen angled away; warm light."),
  ],

  // ── 3 · Mama's 60th ───────────────────────────────────────────────────────
  m09: [
    scene(2, ["Chioma"], "a small print shop at night, banners and calendars pinned to the walls.",
      "Chioma at the counter while the printer, a man in his forties, taps his watch; Chioma pleading.",
      "a large-format printer behind them; fluorescent shop light; a receipt book on the counter."),
    scene(4, ["Mama"], "a warm Nigerian kitchen, steam rising from a pot on the stove.",
      "Mama laughing at the stove, head thrown back, a wooden spoon in her hand.",
      "wrapper and blouse; a pot of stew; a small window with evening light."),
  ],
  m10: [
    scene(3, ["Chioma"], "a sitting room at night, TV glow.",
      "Chioma on the sofa holding her phone in both hands, anxious, waiting.",
      "a half-eaten plate of rice beside her; the phone screen turned away."),
    scene(4, ["Chioma"], "the same sitting room.",
      "Chioma covering her mouth with one hand, eyes wide and welling, looking at her phone.",
      "the screen glow on her face; the screen itself turned away from camera."),
  ],
  m11: [
    scene(3, ["Aunty Nkechi"], "an elegant living room in the morning.",
      "Aunty Nkechi on a phone call, one eyebrow raised, voice clearly lowered, suspicious.",
      "a gold head tie; a velvet armchair; a framed family photo on the wall behind her."),
    scene(4, ["Mama", "Chioma"], "a corridor in a family home.",
      "Mama in a doorway with hands on her hips and a curious half-smile; Chioma in front of her hiding a phone behind her back.",
      "Chioma's guilty face towards camera; morning light from the corridor window."),
  ],
  m12: [
    scene(3, ["Mama"], "a decorated party hall, balloons and a cake table, guests blurred.",
      "Mama with both hands on her cheeks, laughing in disbelief, as a large banner unrolls behind her.",
      "the banner seen from behind or edge-on so no picture or writing shows; a lace outfit; warm party light."),
    scene(4, ["Aunty Nkechi", "Chioma"], "the same party, later, at a guests' table.",
      "Aunty Nkechi leaning towards Chioma and whispering with a sheepish smile; Chioma trying not to laugh.",
      "party plates and souvenirs on the table; soft background bokeh."),
  ],

  // ── 4 · The Ex's Wedding ──────────────────────────────────────────────────
  m13: [
    scene(2, ["Funmi"], "Funmi's bedroom in the evening, an emerald gown hanging on the wardrobe door.",
      "Funmi on her bed on a video call, laughing confidently, phone held up in front of her.",
      "the phone's back to the camera; the gown in soft focus behind her."),
    scene(4, ["Funmi"], "a wedding hall at night under harsh yellow lights shining straight down.",
      "Funmi standing poised in an emerald gown, chin up, guests blurred behind.",
      "shadows under her eyes from the overhead light; a gold clutch; long braids."),
  ],
  m14: [
    scene(3, ["Funmi"], "Funmi's bedroom at 1:30am, lights off.",
      "Funmi in bed with her makeup still on, scrolling her phone, hurt but composed.",
      "phone glow on her face; screen angled away; the emerald gown over a chair."),
    scene(4, ["Funmi"], "the same room.",
      "Funmi sitting up straight, typing fast with both thumbs, determined.",
      "duvet thrown back; jaw set; phone screen angled away."),
  ],
  m15: [
    scene(3, ["Funmi"], "a bright kitchen in the morning.",
      "Funmi making tea, perfectly calm, while her phone lights up on the counter beside her.",
      "the phone face-up but out of focus; a mug and a kettle; dressing gown."),
    scene(4, ["Lola"], "Lola's living room in the morning.",
      "Lola on her sofa with her phone to her ear, mouth wide open in shock.",
      "one hand flung up; cushions knocked askew; morning light."),
  ],
  m16: [
    scene(3, ["Funmi"], "a balcony at sunrise over a Lagos skyline.",
      "Funmi typing on her phone with a serene, unbothered smile.",
      "a mug on the railing; golden light; phone screen angled away."),
    scene(4, ["Funmi"], "a Lagos street in the morning.",
      "Funmi walking towards camera, confident, sunglasses on, smiling slightly.",
      "a stylish casual outfit; morning sun; blurred traffic behind."),
  ],

  // ── 5 · The Headshot ──────────────────────────────────────────────────────
  m17: [
    scene(2, ["Tunde"], "a small bedroom in the evening, a laptop open on the bed.",
      "Tunde face-down screaming into a pillow, fists clenched, half joy and half panic.",
      "the laptop screen angled away; a tie hanging on a chair; warm lamp light."),
    scene(4, ["Bayo"], "a residential compound in the evening.",
      "Bayo lounging on a plastic chair, laughing at his phone, feet up.",
      "a parked car; a bottle of malt; string lights."),
  ],
  m18: [
    scene(3, ["Tunde"], "a desk at night, a laptop the only light.",
      "Tunde leaning in, focused, cropping a photo.",
      "the screen angled away; a mug of tea; a notebook."),
    scene(4, ["Tunde"], "the same desk.",
      "Tunde grinning at his laptop, both fists raised in quiet celebration.",
      "the screen angled away; late-night light."),
  ],
  m19: [
    scene(3, ["Tunde"], "a modern Lagos office corridor with glass walls.",
      "Tunde in a new shirt, swallowing nervously, as a colleague points him towards a glass office.",
      "the colleague out of focus; city view through the glass."),
    scene(4, ["The CEO"], "a glass-walled executive office.",
      "The CEO behind her desk looking up from her monitor with one eyebrow raised.",
      "the monitor's back to camera; a plant; a city view behind her."),
  ],
  m20: [
    scene(3, ["Tunde", "The CEO"], "the CEO's office.",
      "Tunde sitting across from the CEO explaining with open hands; the CEO listening intently, a pen to her lips.",
      "a glass desk; afternoon light."),
    scene(4, ["Tunde"], "a meeting room with a long table.",
      "Tunde standing at the head of the table holding a tablet, colleagues smiling at him.",
      "colleagues softly out of focus; a whiteboard with no writing."),
  ],

  // ── 6 · The Sticker ───────────────────────────────────────────────────────
  m21: [
    scene(2, ["Bisi"], "a small home kitchen in Ibadan, golden afternoon light.",
      "Bisi frying puff-puff in a deep pan, proud and absorbed.",
      "an apron; steam rising; trays of small chops cooling on the counter."),
    scene(4, ["Bisi"], "the same kitchen.",
      "Bisi sitting on a stool with her phone, shoulders dropped, deflated.",
      "trays of untouched small chops beside her; the phone screen angled away."),
  ],
  m22: [
    scene(3, ["Bisi"], "the kitchen counter by a window.",
      "Bisi arranging puff-puff, samosas and spring rolls neatly on a tray, concentrating.",
      "a phone propped on a cup ready to take the picture; window light."),
    scene(4, ["Bisi"], "the same counter.",
      "Bisi typing on her phone with a small hopeful smile.",
      "the styled tray beside her; the phone screen angled away."),
  ],
  m23: [
    scene(3, [], "a living room set up for filming, a ring light on a stand.",
      "a young Nigerian comedian in his twenties filming a skit on his phone, laughing mid-take.",
      "a colourful shirt; a plate of puff-puff as a prop; the phone's back to camera."),
    scene(4, ["Bisi"], "Bisi's bedroom at night.",
      "Bisi sitting up in bed, staring at her phone in astonishment, one hand on her head.",
      "the phone screen glowing and angled away; a headwrap off on the pillow."),
  ],
  m24: [
    scene(3, ["Bisi"], "Bisi's kitchen in the morning.",
      "Bisi on a phone call with her hand on her chest, overwhelmed and smiling.",
      "a pan on the stove; trays; morning light."),
    scene(4, ["Bisi"], "a busy kitchen a month later.",
      "Bisi and two helpers in matching aprons packing small chops into packs, laughing.",
      "stacked packs ready for delivery; bright light."),
  ],

  // ── 7 · The Flash Died ────────────────────────────────────────────────────
  m25: [
    scene(2, ["The bride and groom", "Dayo"], "a dark wedding reception, a single spotlight on the dance floor.",
      "The bride and groom in their first dance under the spotlight; Dayo crouched in the foreground with a camera raised.",
      "the hall dark around them; guests as silhouettes; Dayo's camera flash unit dark."),
    scene(4, ["Femi"], "the side of the same hall.",
      "Femi with two cameras around his neck, arms folded, smirking.",
      "spill light from the dance floor on his face; blurred guests."),
  ],
  m26: [
    scene(3, ["Femi"], "outside the hall the next morning.",
      "Femi on a phone call, confident, gesturing as he talks.",
      "his car behind him; sunglasses pushed up on his head."),
    scene(4, ["Dayo"], "a small bedroom studio at dawn.",
      "Dayo at a laptop scrolling through photos, focused and tense.",
      "the screen angled away; camera bodies on the desk; grey dawn light."),
  ],
  m27: [
    scene(3, ["Dayo"], "the same bedroom studio, now bright.",
      "Dayo leaning back from his laptop with a long relieved breath, almost smiling.",
      "the screen angled away; afternoon light."),
    scene(4, ["The bride and groom", "Femi"], "a family living room.",
      "The bride and groom on a sofa while Femi shows them a portfolio on a tablet propped on a stand.",
      "the tablet's back to camera; the couple polite but unconvinced."),
  ],
  m28: [
    scene(3, ["The bride and groom"], "the same living room.",
      "The bride in tears holding a phone, the groom's hand on her shoulder, both moved.",
      "the phone screen angled away; warm afternoon light."),
    scene(4, ["Femi", "Dayo"], "a residential driveway in the late afternoon.",
      "Femi calling out after Dayo, who smiles from the window of his car.",
      "Femi's open-handed gesture; golden light."),
  ],

  // ── 8 · Daddy's Turn ──────────────────────────────────────────────────────
  m29: [
    scene(2, ["Emeka", "Ugochi"], "a home kitchen in the morning.",
      "Emeka holding a coffee mug, nodding obediently at a video call with his wife Ugochi on the phone in his other hand.",
      "the phone facing him so Ugochi's face is small on the screen, turned partly to camera; morning light."),
    scene(4, ["Emeka"], "a sitting room at night after a party.",
      "Emeka slumped on the sofa reviewing photos on his phone, exhausted.",
      "deflated balloons; cake crumbs; party hats; the phone screen angled away."),
  ],
  m30: [
    scene(3, ["Emeka"], "a dining table at night with birthday decorations behind.",
      "Emeka typing with intense focus, tongue between his teeth.",
      "a laptop and his phone; the screens angled away."),
    scene(4, ["Emeka"], "the same table.",
      "Emeka smiling tenderly at his phone, eyes soft.",
      "the phone screen angled away; warm lamp light."),
  ],
  m31: [
    scene(3, ["Grandma"], "a living room with lace curtains at night.",
      "Grandma staring at her phone through reading glasses, lips pursed, typing slowly.",
      "a wrapper; glasses chain; TV glow."),
    scene(4, ["Emeka"], "Emeka's sitting room.",
      "Emeka holding a ringing phone at arm's length, eyes wide with dread.",
      "the phone screen angled away; party leftovers behind."),
  ],
  m32: [
    scene(3, ["Ugochi"], "a small apartment abroad in winter, snow visible through the window.",
      "Ugochi on a video call, laughing and crying at once, a hand over her heart.",
      "a winter coat on a chair; the phone held towards her face, its back to camera."),
    scene(4, ["Emeka", "Adaeze"], "the family sofa the next day.",
      "Adaeze on Emeka's lap laughing, Emeka beaming with pride.",
      "her party dress; soft afternoon light; a balloon tied to the sofa."),
  ],

  // ── 9 · The Induction ─────────────────────────────────────────────────────
  m33: [
    scene(2, ["Ngozi"], "a hostel room at dawn.",
      "Ngozi in a crisp white nurse uniform adjusting her cap in a small mirror, nervous and proud.",
      "a pressed uniform; a bag packed by the door; soft dawn light."),
    scene(4, ["Ngozi"], "outside a ceremony hall in harsh noon sun.",
      "Ngozi squinting in the glare while a cousin holds up a phone with a cracked screen to take her picture.",
      "the cousin from behind; hard shadows; other graduates blurred."),
  ],
  m34: [
    scene(3, ["Ngozi"], "Ngozi's room at night.",
      "Ngozi sitting on her bed scrolling through photos on her phone, tired but hopeful.",
      "her uniform hanging on the wall; the phone screen angled away."),
    scene(4, ["Ngozi"], "the same room.",
      "Ngozi at a small desk with a laptop, smiling softly.",
      "the screen angled away; lamp light."),
  ],
  m35: [
    scene(3, ["Ngozi"], "a hospital staff room.",
      "Ngozi in scrubs on a break, checking her phone and frowning slightly.",
      "a locker behind her; a cup of tea; the phone screen angled away."),
    scene(4, ["Mama Ngozi"], "inside a bus heading into town.",
      "Mama Ngozi sitting upright holding her handbag tightly in her lap, determined.",
      "other passengers blurred; window light."),
  ],
  m36: [
    scene(3, ["Mama Ngozi"], "a village parlour with a cement floor and a cushioned bench.",
      "Mama Ngozi hanging a framed portrait on the wall, stepping back proudly.",
      "the frame seen from the side so its picture is not visible; afternoon light through a window."),
    scene(4, ["Ngozi"], "a hospital corridor.",
      "Ngozi in uniform listening to a voice note with her hand on her chest, teary and smiling.",
      "the phone held to her ear; colleagues blurred."),
  ],

  // ── 10 · The Proposal in the Dark ────────────────────────────────────────
  m37: [
    scene(2, ["Seyi and Ronke"], "a rooftop at night, city lights behind.",
      "Seyi on one knee holding up a ring box; Ronke with both hands over her mouth.",
      "the scene almost too dark; string lights; the city glow."),
    scene(4, ["Kunle"], "the same rooftop.",
      "Kunle half-hidden behind a potted plant, phone raised, giving a sheepish thumbs up.",
      "the phone's back to camera; dark night."),
  ],
  m38: [
    scene(3, ["Seyi and Ronke"], "inside a car at night.",
      "Ronke reassuring Seyi with a hand on his arm; Seyi serious, staring ahead.",
      "streetlights passing; the engagement ring visible."),
    scene(4, ["Wale"], "a dim living room.",
      "Wale reading his phone with his arms crossed, stern.",
      "the phone screen angled away; TV glow."),
  ],
  m39: [
    scene(3, ["Seyi and Ronke"], "a bedroom at night.",
      "Seyi sitting up in bed smiling at his phone; Ronke asleep beside him.",
      "the phone screen angled away; soft light."),
    scene(4, ["Wale", "Seyi and Ronke"], "a family living room on Sunday evening.",
      "uncles and aunties on the sofas; Wale standing by the door with arms folded; Seyi holding a tablet.",
      "the tablet's back to camera; relatives blurred; tension in the room."),
  ],
  m40: [
    scene(3, ["Wale"], "the same living room.",
      "Wale holding the tablet, his stern face softening into something like a smile.",
      "the tablet's back to camera; relatives blurred."),
    scene(4, ["Wale", "Seyi and Ronke"], "a compound gate at dusk.",
      "Wale with his hand on Seyi's shoulder, a half-smile, Seyi relieved.",
      "golden dusk light; parked cars."),
  ],

  // ── 11 · Six Years, First Class ──────────────────────────────────────────
  m41: [
    scene(2, ["Zainab"], "convocation grounds at noon, graduates in gowns.",
      "Zainab in a hijab and graduation gown, beaming, holding her cap.",
      "harsh noon sun; other graduates blurred."),
    scene(4, ["Zainab", "Zainab's mum"], "the same grounds.",
      "Zainab and her mum squinting in the sun, her mum shading her eyes with her hand.",
      "hard shadows on their faces; bright sky."),
  ],
  m42: [
    scene(3, ["Zainab"], "a bedroom at night, a graduation gown hanging on the wardrobe door.",
      "Zainab at a desk with a laptop, chin in hand, hopeful.",
      "the screen angled away; lamp light."),
    scene(4, ["Zainab"], "the same desk.",
      "Zainab with her hand over her mouth, eyes glistening.",
      "the laptop glow on her face; the screen angled away."),
  ],
  m43: [
    scene(3, ["Zainab"], "a kitchen in the morning.",
      "Zainab making tea, phone face-down on the counter, a small proud smile.",
      "morning light; a kettle."),
    scene(4, ["Hauwa"], "a bedroom.",
      "Hauwa lying on her bed frowning at her phone, then starting to type.",
      "the phone screen angled away; afternoon light."),
  ],
  m44: [
    scene(3, ["Zainab"], "a garden bench in the afternoon.",
      "Zainab laughing as she types a reply on her phone.",
      "dappled light; the phone screen angled away."),
    scene(4, ["Zainab's mum"], "a family living room.",
      "Zainab's mum hanging a large framed graduation portrait on the wall, stepping back proudly.",
      "the frame seen from the side so its picture is not visible; warm light."),
  ],
};

/**
 * Everything the studio needs for one episode: the cast, the two scene prompts
 * and the Flow settings. Season 1 is m01–m44; Season 2 is p01–p88, its scenes
 * and cast written as plain sentences beside each story and given the same
 * prompt template here, so both seasons' pictures are asked for alike.
 */
export function storyboardFor(id) {
  const key = String(id).replace(/^plan-/, "");
  const story = Math.ceil(Number(key.slice(1)) / 4);
  if (/^p\d+$/.test(key)) {
    const written = SCENES_S2[key];
    if (!written) return null;
    return {
      season: 2, story,
      cast: (CASTS_S2[story] ?? []).map((c) => (c.real ? real(c.name, c.who) : made(c.name, c.who))),
      scenes: written.map((x) => scene(x.after, x.attach, x.setting, x.subject, x.details)),
      flow: FLOW_SETTINGS,
    };
  }
  const scenes = STORYBOARD[key];
  if (!scenes) return null;
  return { season: 1, story, cast: CASTS[story] ?? [], scenes, flow: FLOW_SETTINGS };
}
