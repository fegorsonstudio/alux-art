// Written for every road of the votes. Each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. So every vote changes what you read, and
// the season stays two versions an episode instead of doubling each time.
// The shared endings are below; the versions follow in `drafts`.

const EP2_ENDING = [
  { kind: "line", who: "driver", see: "The driver at Funmi's window under a sodium streetlight, holding up her hospital ID card from her dashboard: her induction portrait in a white cap.", say: "“Nurse Funmilayo. Ward C. You stitched his head last week.”", scene: "He reads her name off her ID." },
  { kind: "cliff", who: "driver", see: "The driver opening her car door, the SUV's boot wide open behind him, the tied man breathing hard inside; hard amber light, deep shadow.", say: "“He needs a nurse tonight. You're coming with us.”", scene: "The door opens. The boot is open." },
  { kind: "choice", see: "Close on Funmi's hands in her lap: the small silver cross, her nurse's watch, lit by the streetlight.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Does Funmi save the man or run for help?", options: [{ word: "HELP", label: "Save the man" }, { word: "RUN", label: "Run for help" }] },
  branches: {
    HELP: "She stitches the man in the SUV by torchlight. He whispers where his books are: in the water seller's basin.",
    RUN: "She runs between the stopped cars. Behind her the man in the boot shouts one thing: the water boy.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "vendor", see: "Tobi, the lanky water seller in an orange vest, pressing a cold bottle into Funmi's hand; under the bottle, something small and hard. Headlights flaring behind him.", say: "The water seller presses a cold bottle into her hand.", scene: "A cold bottle. Something under it." },
  { kind: "cliff", who: "vendor", see: "Close on Funmi's palm: a small flash drive, wet from the ice; Tobi leaning close, whispering, one earphone hanging loose.", say: "“It fell from that black SUV an hour ago. Hide it.”", scene: "A flash drive, wet from the ice." },
  { kind: "choice", see: "Close on the flash drive in Funmi's fist, the SUV's headlights sweeping across the bridge railings.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Who does Funmi trust with the drive?", options: [{ word: "POLICE", label: "Inspector Hauwa" }, { word: "SISTER", label: "Her sister Bisi" }] },
  branches: {
    POLICE: "Funmi calls Inspector Hauwa on Tobi's phone and is told to wait at the bridge's midpoint. The radio at the post is listening.",
    SISTER: "Funmi calls Bisi on Tobi's phone. Bisi has already shared Funmi's location with a friend in the police. He is close.",
  },
};

const EP4_ENDING = [
  { kind: "beat", see: "A police patrol car stopping hard beside Funmi and Tobi on the bridge, blue lights washing over them, the door opening.", say: "A patrol car stops beside them. Blue lights. No siren.", scene: "Blue lights. No siren." },
  { kind: "cliff", see: "The officer from the post — the one who shook the driver's hand — holding out his palm to Funmi, blue light on half his face.", say: "The officer from the post holds out his hand. “The drive.”", scene: "His hand. Waiting." },
  { kind: "choice", see: "Close on Funmi's two hands: the flash drive in one, her own hospital USB on its lanyard in the other.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "What does Funmi give the officer?", options: [{ word: "SWAP", label: "Give him a fake" }, { word: "KEEP", label: "Keep it, run" }] },
  branches: {
    SWAP: "She hands him her ward-rota USB instead. He drives to the post, where the driver will plug it in.",
    KEEP: "She refuses and runs. Tobi tips his basin of ice across the lane, and they reach the post on foot.",
  },
};

const EP5_ENDING = [
  { kind: "line", who: "driver", see: "Inside the small police post under one fluorescent tube: the driver in his white kaftan, calm, opening a briefcase of cash in front of Funmi; Inspector Hauwa in the doorway.", say: "“Fifty million, Nurse. Say you saw nothing. Go home rich.”", scene: "A briefcase. Fifty million." },
  { kind: "cliff", who: "funmi", see: "Funmi standing, looking past the money at the man in the torn white shirt on the bench, alive, watching her; the tube light flickering.", say: "“I saw you at Ward C, the night his drip was changed.”", scene: "She looks past the money." },
  { kind: "choice", see: "Close on Inspector Hauwa's hand on her radio; through the post window, a news van pulling up — Bisi called them.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "How does Funmi tell what she saw?", options: [{ word: "CAMERA", label: "On camera, to everyone" }, { word: "SEALED", label: "A sealed statement" }] },
  branches: {
    CAMERA: "Funmi walks out to the news van and says it all on live television. By breakfast, Lagos knows his name.",
    SEALED: "Funmi gives Inspector Hauwa a sealed, signed statement. It reaches a judge before the driver's lawyers wake.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", see: "Funmi at home at sunrise, her phone finally charging on the table, a new message from Ward C lighting the screen; soft gold window light.", say: "Her phone wakes: Ward C. Bed four. The same rope marks.", scene: "Her phone, charging. One message." },
  { kind: "choice", see: "Close on Funmi's nurse's shoes by the door and her scrubs folded on a chair, morning light across them.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "message" },
  choice: { question: "Does Funmi go back to Ward C tonight?", options: [{ word: "GO", label: "Go back tonight" }, { word: "REST", label: "Sleep first" }] },
  branches: {
    GO: "Season two: on Ward C a new patient wakes with rope marks and one name for Funmi — a name she has heard before.",
    REST: "Season two: Funmi sleeps one night. By morning the patient in Bed 4 is gone, and so is every record that he was there.",
  },
};

export default {
  slug: "third-mainland",
  title: "Third Mainland",
  tagline: "Two cars. One bridge. No way off.",
  genre: "thriller",
  city: "Lagos",
  logline: "Stuck on Third Mainland Bridge at midnight, a nurse sees a tied hand in the boot of the car beside her. The driver sees her see it.",
  minVotes: 2,
  cast: [
    { key: "funmi", name: "Funmilayo Adebayo", age: 31, role: "Night-shift nurse", archetype: "The Innocent", side: "light", tier: "lead", open: true,
      look: "Petite, short natural hair under a navy scarf, blue scrubs under an open cardigan, tired bright eyes, a small silver cross.",
      want: "To get home and sleep.", secret: "She has seen the driver before — at the hospital, a week ago." },
    { key: "driver", name: "Kunle Martins", age: 44, role: "The driver of the black SUV", archetype: "The Visionary", side: "too much", tier: "main", open: true,
      look: "Calm, handsome, shaved head, white kaftan, gold-rimmed glasses, a voice like a radio presenter.",
      want: "To get off the bridge before the police post.", secret: "The man in the boot is his business partner." },
    { key: "hauwa", name: "Inspector Hauwa Bello", age: 39, role: "Police inspector", archetype: "The Warrior", side: "light", tier: "main", open: true,
      look: "Tall, black hijab under a police beret, reflective vest over uniform, notebook in her breast pocket.",
      want: "One clean case before her transfer.", secret: "She is the only officer the driver cannot buy." },
    { key: "bisi", name: "Bisi Adebayo", age: 27, role: "Funmi's sister", archetype: "The Companion", side: "light", tier: "main", open: true,
      look: "Round face, big braids, oversized T-shirt, phone always at 100%.",
      want: "Her sister home safe.", secret: "She shared Funmi's location with a friend in the police." },
    { key: "partner", name: "Emeka Obi", age: 46, role: "The man in the boot", archetype: "The Sage", side: "too little", tier: "main", open: true,
      look: "Heavy-set, torn white shirt, a wedding ring, wrists tied with blue nylon rope.",
      want: "To live long enough to talk.", secret: "He has the second set of books." },
    { key: "vendor", name: "Tobi", age: 19, role: "Water seller walking between the cars", archetype: "The Jester", side: "light", tier: "cameo", open: true,
      look: "Lanky, bright orange vest, a basin of cold bottles on his head, earphones in one ear.",
      want: "To sell the last bottles.", secret: "He saw the SUV stop on the bridge an hour ago." },
  ],
  episodes: [
    {
      n: 1,
      title: "Gridlock",
      slides: [
        { kind: "cover", see: "Funmi's face reflected in her car's side mirror, red tail lights everywhere; in the mirror, behind her, the black SUV's boot lid is open an inch. Caption space: top third, night sky.", say: "" },
        { kind: "time", see: "Wide, high view of Third Mainland Bridge at midnight: two frozen rivers of red and white light over a black lagoon.", say: "Third Mainland Bridge. 12:07 a.m. Nothing has moved in an hour.", scene: "The bridge at midnight. Nothing moves." },
        { kind: "beat", see: "Inside an old car, Funmi in scrubs, head against the window, phone face-up on her knee. Her lock screen: her own induction portrait in a white cap.", say: "Night shift done. Phone at four percent. The lagoon black as oil.", scene: "Her phone. Four percent." },
        { kind: "beat", see: "Through her window: the SUV's boot lifts an inch in the wind. A man's hand, tied at the wrist with blue rope, slides into the light.", say: "The boot beside her opens one inch. A hand.", scene: "The boot. An inch. A hand." },
        { kind: "line", who: "driver", see: "The SUV window slides down. The driver smiles kindly and holds out a cold bottle of water to her.", say: "“Hot night, Madam. Drink something. Traffic will soon move.”", scene: "His window slides down. A bottle." },
        { kind: "text", see: "Close on Funmi's thumb over her phone: battery at 1%, a message to Bisi half typed.", say: "To Bisi: “If I don't call you by one —”", scene: "One percent. A message, unsent." },
        { kind: "cliff", who: "driver", see: "Brake lights ahead go dark; cars begin to roll. The SUV's indicator blinks toward her lane. In his mirror, the driver's eyes are on her.", say: "The cars start to move. He is waiting for her to.", scene: "Brake lights die. He waits." },
        { kind: "choice", see: "Funmi's hands on the wheel at ten and two, knuckles pale, the SUV's red lights pulling away.", say: "" },
      ],
      cliff: { type: "clock" },
      choice: {
        question: "Does Funmi follow the SUV, or call it in?",
        options: [{ word: "FOLLOW", label: "Follow the SUV" }, { word: "CALL", label: "Call the police" }],
      },
      branches: {
        FOLLOW: "She follows it off at Oworonshoki into a dark estate. Her phone dies. When the boot opens, she knows the man inside — he was her patient last week.",
        CALL: "Her call reaches Inspector Hauwa. But at the police post at the end of the bridge, the SUV is already parked — and the driver is shaking hands with the officers.",
      },
      slots: [
        { key: "water", object: "the cold bottle of water the driver holds out", slide: 5, house: "Nursing Induction" },
        { key: "power", object: "a power bank or phone in Funmi's hand", slide: 6, house: "Nursing Induction" },
      ],
      alux: { product: "Nursing Induction", where: "Funmi's own induction portrait on her phone's lock screen, slide 3" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): she is caught either way.
    {
      n: 2, after: "FOLLOW", title: "Oworonshoki",
      slides: [
        { kind: "cover", see: "A dark half-built estate off the bridge: the black SUV's boot wide open in Funmi's headlights, a figure bent over it. Caption space: top third.", say: "" },
        { kind: "time", see: "The Oworonshoki exit ramp at night, one streetlight out, an unfinished estate beyond; Funmi's car following the SUV's tail lights.", say: "Oworonshoki exit. 12:31 a.m. She follows the red lights off.", scene: "Off the bridge. Into the dark." },
        { kind: "beat", who: "funmi", see: "Funmi's phone on her knee going black, 0%, the dashboard the only light on her face.", say: "Her phone dies at the gate. No one knows where she is.", scene: "The screen goes black." },
        { kind: "beat", who: "driver", see: "The SUV stopped beside an unfinished building; the driver lifting the boot under a bare security bulb.", say: "He stops at an unfinished block. He opens the boot.", scene: "A bare bulb. The boot lifts." },
        { kind: "beat", who: "partner", see: "In the boot, a heavy-set man in a torn white shirt, wrists tied with blue rope, alive, a fresh cut on his head; Funmi's shocked face behind her windscreen.", say: "The man inside is alive. She knows his face. Her patient.", scene: "Blue rope. A face she knows." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "torch", object: "the torch the driver carries", slide: 4, house: "Nursing Induction" }],
      alux: {
        product: "Nursing Induction", where: "Funmi's induction portrait on her hospital ID, which gives her name away, slide 6",
        word: "BOOK", line: "Funmi's induction portrait says who she is at a glance. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 2, after: "CALL", title: "The Police Post",
      slides: [
        { kind: "cover", see: "The police post at the end of the bridge: an officer's torch in Funmi's face, the black SUV parked behind the barrier. Caption space: top third.", say: "" },
        { kind: "time", see: "The end of Third Mainland Bridge at 12:40 a.m., a police barrier and a small lit post, the traffic squeezing into one lane.", say: "End of the bridge. 12:40 a.m. One lane. One police post.", scene: "A barrier. A torch. One lane." },
        { kind: "text", who: "hauwa", see: "Close on Funmi's phone, one percent, a reply from Inspector Hauwa.", say: "Inspector Hauwa: “I'm in Ikeja. Stay in your car. Don't stop.”", scene: "Her phone. One percent. A reply." },
        { kind: "beat", who: "driver", see: "Behind the barrier, the black SUV parked; the driver laughing with two officers under the post's tube light, a handshake, an envelope changing hands.", say: "The SUV is already there. He is shaking hands with them.", scene: "A handshake. An envelope." },
        { kind: "beat", see: "An officer waving Funmi out of the lane with his torch and taking her phone through the window.", say: "An officer waves her over and takes her phone.", scene: "Her phone, in his hand." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "torch", object: "the officer's torch", slide: 5, house: "Nursing Induction" }],
      alux: {
        product: "Nursing Induction", where: "Funmi's induction portrait on her hospital ID, which gives her name away, slide 6",
        word: "BOOK", line: "Funmi's induction portrait says who she is at a glance. Comment BOOK and we'll make yours.",
      },
    },

    // ── Episode 3 (Turn): the hidden thing surfaces — the second books, and the water seller who saw.
    {
      n: 3, after: "*.HELP", title: "Stitches",
      slides: [
        { kind: "cover", see: "The back seat of the black SUV lit by a phone torch: Funmi in scrubs stitching a cut on the tied man's head, the driver watching from the front. Caption space: top third.", say: "" },
        { kind: "time", see: "Inside the SUV at 1 a.m., rain starting on the windscreen, the bridge lights smeared into streaks.", say: "Inside the SUV. 1:02 a.m. Rain on the windscreen.", scene: "The back seat. A phone torch." },
        { kind: "beat", who: "funmi", see: "Funmi's hands stitching the cut with a kit from her bag, steady, the man wincing in the hard white torchlight.", say: "Her hands are steady. Ward C taught her that.", scene: "Needle, thread, steady hands." },
        { kind: "line", who: "partner", see: "The tied man pulling Funmi close by her sleeve and whispering while the driver is on the phone outside in the rain.", say: "“The second books. The water boy's basin. Tell no one.”", scene: "A whisper, while the driver talks." },
        { kind: "beat", who: "driver", see: "The driver back behind the wheel, pulling onto the bridge again toward the police post, traffic crawling, a water seller walking between the cars.", say: "He drives back onto the bridge. Water sellers walk the lanes.", scene: "Back on the bridge. Crawling again." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [
        { key: "kit", object: "the first-aid kit in Funmi's bag", slide: 3, house: "Nursing Induction" },
        { key: "water", object: "the cold bottle the water seller hands over", slide: 6, house: "Nursing Induction" },
      ],
      alux: { product: "Nursing Induction", where: "Funmi's induction photo tucked in the lid of her first-aid kit, slide 3" },
    },
    {
      n: 3, after: "*.RUN", title: "On Foot",
      slides: [
        { kind: "cover", see: "Funmi running in blue scrubs between two lanes of stopped cars on the bridge at night, headlights behind her. Caption space: top third.", say: "" },
        { kind: "time", see: "Third Mainland Bridge at 12:55 a.m., the traffic stopped again, Funmi on foot between the lanes, headlights raking the railings.", say: "The bridge again. 12:55 a.m. Running in nurse's shoes.", scene: "Between two lanes of cars." },
        { kind: "line", who: "partner", see: "Behind her, the SUV's open boot; the tied man shouting after her, the driver's hand over his mouth too late.", say: "From the boot, one shout: “The water boy! The basin!”", scene: "One shout from the boot." },
        { kind: "beat", who: "driver", see: "The driver walking fast between the cars after her, calm, smiling at the drivers who look.", say: "He follows on foot, smiling at every driver who looks.", scene: "He walks. He smiles." },
        { kind: "beat", who: "vendor", see: "Ahead, a lanky boy in an orange vest with a basin of bottles on his head, earphones in, turning toward her.", say: "Ahead, a water seller in an orange vest turns around.", scene: "An orange vest. A basin." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [
        { key: "shoes", object: "Funmi's nurse's shoes", slide: 2, house: "Nursing Induction" },
        { key: "water", object: "the cold bottle the water seller hands over", slide: 6, house: "Nursing Induction" },
      ],
      alux: { product: "Nursing Induction", where: "Funmi's hospital ID swinging on its lanyard as she runs, slide 2" },
    },

    // ── Episode 4 (Cost): the photo that shows too much, and the uniform that comes for the drive.
    {
      n: 4, after: "*.POLICE", title: "Midpoint",
      slides: [
        { kind: "cover", see: "Funmi and Tobi crouched at the bridge's midpoint railing, Tobi's cracked phone at her ear, the lagoon black below. Caption space: top third.", say: "" },
        { kind: "time", see: "The middle of Third Mainland Bridge at 1:20 a.m., the lagoon wind, a lamp post with a broken light.", say: "The bridge's midpoint. 1:20 a.m. Tobi's phone, cracked but charged.", scene: "A borrowed phone. The lagoon wind." },
        { kind: "text", who: "hauwa", see: "Close on Tobi's cracked phone screen: a call with Inspector Hauwa.", say: "Inspector Hauwa: “Stay at the midpoint. Ten minutes. Trust no uniform.”", scene: "Ten minutes. Trust no uniform." },
        { kind: "beat", who: "vendor", see: "Tobi showing Funmi a dark, grainy photo on his phone: the black SUV stopped on the bridge an hour ago, too dark to read.", say: "Tobi took a photo when the SUV stopped. Too dark to read.", scene: "His photo. Black as the lagoon." },
        { kind: "beat", who: "funmi", see: "Funmi relighting the photo on the phone: the plate number appears, and the driver's face lifting a man into the boot.", say: "She relights it. The plate. His face. The man going in.", scene: "Relit: the plate, the face." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "phone", object: "Tobi's cracked phone", slide: 3, house: "Instagram GIF Maker" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Funmi relights Tobi's dark photo of the SUV on his phone, slide 5",
        word: "LIGHT", line: "One relit photo showed the plate and his face. Comment LIGHT and we'll relight one of yours.",
      },
    },
    {
      n: 4, after: "*.SISTER", title: "Location Shared",
      slides: [
        { kind: "cover", see: "Funmi on the bridge with Tobi's phone at her ear, Bisi's voice on speaker, a patrol car's blue light far behind. Caption space: top third.", say: "" },
        { kind: "time", see: "Third Mainland Bridge at 1:20 a.m., Funmi and Tobi against the railing, the traffic crawling past.", say: "The bridge. 1:20 a.m. Tobi's phone, cracked but charged.", scene: "A borrowed phone. Her sister's voice." },
        { kind: "line", who: "bisi", see: "Bisi at home in an oversized T-shirt, phone to her ear, pacing under a ring light, a laptop open with a map pin on it.", say: "“I shared your location with my friend in the police. He's close.”", scene: "Bisi's map. One pin." },
        { kind: "beat", who: "vendor", see: "Tobi showing Funmi a dark, grainy photo on his phone: the black SUV stopped on the bridge an hour ago.", say: "Tobi took a photo when the SUV stopped. Too dark to read.", scene: "His photo. Black as the lagoon." },
        { kind: "beat", who: "funmi", see: "Funmi relighting the photo: the plate number appears, and in the corner of the frame a patrol car parked beside the SUV.", say: "She relights it. Beside the SUV: a patrol car. Already there.", scene: "Relit: a patrol car, already there." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "laptop", object: "Bisi's laptop with the map open", slide: 3, house: "Instagram GIF Maker" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Funmi relights Tobi's dark photo of the SUV on his phone, slide 5",
        word: "LIGHT", line: "One relit photo showed who was already there. Comment LIGHT and we'll relight one of yours.",
      },
    },

    // ── Episode 5 (Storm): every secret in one police post.
    {
      n: 5, after: "*.SWAP", title: "The Fake",
      slides: [
        { kind: "cover", see: "The small police post at night under one fluorescent tube: the driver at a desk plugging a USB into a laptop, an officer beside him. Caption space: top third.", say: "" },
        { kind: "time", see: "The police post at 2:10 a.m., one fluorescent tube humming, the bridge traffic finally moving outside the window.", say: "The police post. 2:10 a.m. The bridge is finally moving.", scene: "One tube light. Traffic moving." },
        { kind: "text", see: "Close on the laptop screen: a spreadsheet titled Ward C Night Rota.", say: "The laptop: “Ward C — Night Rota, October.”", scene: "Not the books. A rota." },
        { kind: "beat", who: "driver", see: "The driver closing the laptop slowly, his smile gone for the first time, framed portraits of past station officers on the wall behind him.", say: "For the first time tonight, he stops smiling.", scene: "The smile goes." },
        { kind: "beat", who: "hauwa", see: "Inspector Hauwa walking into the post in her hijab and beret, Funmi and Tobi behind her, the real drive in Funmi's hand.", say: "Inspector Hauwa walks in. Funmi holds up the real drive.", scene: "The doorway. The real drive." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "laptop", object: "the laptop on the post desk", slide: 3, house: "Noir Director Editorial" }],
      alux: { product: "Noir Director Editorial", where: "the framed portraits of past station officers on the post wall, slide 4" },
    },
    {
      n: 5, after: "*.KEEP", title: "Ice on the Road",
      slides: [
        { kind: "cover", see: "Tobi tipping a basin of ice across the bridge lane, bottles rolling, a police officer slipping, Funmi running past. Caption space: top third.", say: "" },
        { kind: "time", see: "Third Mainland Bridge at 1:31 a.m., ice and bottles scattered across a lane under the patrol car's blue lights.", say: "The bridge. 1:31 a.m. Ice everywhere. Bottles rolling.", scene: "Ice across the lane." },
        { kind: "beat", who: "vendor", see: "Tobi grinning, empty basin in his hands, as the officer goes down on the ice behind them.", say: "Tobi tips his basin. The officer goes down on the ice.", scene: "An empty basin. A grin." },
        { kind: "beat", who: "funmi", see: "Funmi and Tobi running the last stretch to the police post at the bridge's end, the real drive in her fist.", say: "They run the last stretch to the post. She keeps the drive.", scene: "The last stretch, on foot." },
        { kind: "beat", who: "hauwa", see: "Inspector Hauwa arriving at the post at the same moment, stepping out of an unmarked car, beret on, headlights behind her.", say: "Inspector Hauwa's car pulls up at the same moment.", scene: "An unmarked car. A beret." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "basin", object: "Tobi's basin of iced water bottles", slide: 3, house: "Nursing Induction" }],
      alux: { product: "Nursing Induction", where: "Funmi's hospital ID on its lanyard as she runs, slide 4" },
    },

    // ── Episode 6 (Crown), the season finale: two versions, whichever road led here.
    {
      n: 6, after: "*.CAMERA", title: "Live at Dawn",
      slides: [
        { kind: "cover", see: "Funmi in blue scrubs in front of a news camera at the end of the bridge at sunrise, the lagoon gold behind her. Caption space: top third.", say: "" },
        { kind: "time", see: "The end of Third Mainland Bridge at 6:10 a.m., a news van, a camera light, the traffic flowing at last under a gold sky.", say: "End of the bridge. 6:10 a.m. A camera light at dawn.", scene: "A camera. The gold lagoon." },
        { kind: "beat", who: "funmi", see: "Funmi speaking to the camera, steady, her hospital ID visible, the reporter silent; soft morning key light, warm rim from the sun.", say: "She tells it all. The bridge, the boot, Ward C.", scene: "She speaks. Nobody interrupts." },
        { kind: "beat", who: "hauwa", see: "Inspector Hauwa leading the driver out of the post in handcuffs, his white kaftan creased, cameras flashing.", say: "Inspector Hauwa walks him out in handcuffs. Cameras everywhere.", scene: "Handcuffs. A creased kaftan." },
        { kind: "beat", who: "partner", see: "The man from the boot on a stretcher being lifted into an ambulance, alive, giving Funmi a small nod.", say: "The man from the boot will live. He nods at her.", scene: "A stretcher. A small nod." },
        { kind: "line", who: "funmi", see: "Funmi stopping beside the handcuffed driver and holding out a cold bottle of water to him.", say: "“Hot morning, Mr Martins. Drink something. Traffic will soon move.”", scene: "She holds out a bottle." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [
        { key: "van", object: "the news van at the end of the bridge", slide: 2, house: "Penthouse Dusk Paparazzi" },
        { key: "water", object: "the cold bottle Funmi holds out", slide: 6, house: "Nursing Induction" },
      ],
      alux: {
        product: "Nursing Induction", where: "Funmi's induction portrait on the hospital's Nurse of the Year board, shown on the news, slide 3",
        word: "BOOK", line: "By noon the hospital had Funmi's portrait on its wall. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.SEALED", title: "Before They Wake",
      slides: [
        { kind: "cover", see: "A judge's chambers at dawn: a sealed envelope on the desk, Inspector Hauwa standing, Funmi beside her in scrubs. Caption space: top third.", say: "" },
        { kind: "time", see: "The court building at 6:30 a.m., the gates just opening, Inspector Hauwa's car outside in the blue dawn.", say: "The High Court. 6:30 a.m. The gates are just opening.", scene: "The court gates, just opening." },
        { kind: "beat", who: "hauwa", see: "Inspector Hauwa handing a sealed envelope to a judge in chambers, Funmi's signature across the seal; a green banker's lamp the only light.", say: "A sealed statement, signed across the seal. A judge reads it.", scene: "Her signature, across the seal." },
        { kind: "beat", see: "A warrant being stamped on the judge's desk, the ink still wet.", say: "By seven, a warrant. The ink still wet.", scene: "The stamp. The wet ink." },
        { kind: "beat", who: "driver", see: "The driver at his Lekki gate in his white kaftan, police cars arriving, his lawyer's car pulling up too late behind them.", say: "His lawyers arrive ten minutes after the police.", scene: "His gate. Ten minutes too late." },
        { kind: "line", who: "funmi", see: "Funmi at the driver's gate as he is led out, holding out a cold bottle of water to him.", say: "“Hot morning, Mr Martins. Drink something. Traffic will soon move.”", scene: "She holds out a bottle." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [
        { key: "car", object: "Inspector Hauwa's car at the court gates", slide: 2, house: "Penthouse Dusk Paparazzi" },
        { key: "water", object: "the cold bottle Funmi holds out", slide: 6, house: "Nursing Induction" },
      ],
      alux: {
        product: "Nursing Induction", where: "Funmi's induction portrait on her hospital ID as she signs across the seal, slide 3",
        word: "BOOK", line: "Funmi's ID still carries the portrait from her induction day. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
