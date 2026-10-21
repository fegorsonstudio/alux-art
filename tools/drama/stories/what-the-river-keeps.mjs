// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", who: "apprentice", see: "Morning at a riverside boatyard: sawdust, a half-built boat on trestles, Nneka in overalls waving Ada toward the tall reeds, soft low sun.", say: "Morning. The boatyard. Nneka, the apprentice, waves her into the reeds.", scene: "Sawdust. A half-built boat." },
  { kind: "cliff", who: "apprentice", see: "Deep in the reeds: an old wooden canoe hidden under rotten palm fronds, faded paint on the bow spelling CHIOMA, river light through the stalks.", say: "A canoe hidden twenty years. On the bow: her mother's name.", scene: "Rotten fronds. CHIOMA on the bow." },
  { kind: "choice", see: "Close on Ada's hand on the faded painted name, the ring on her other hand, reeds around her.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Who does Ada bring to the canoe?", options: [{ word: "EBUKA", label: "Baba Ebuka" }, { word: "CHIDI", label: "Her cousin Chidi" }] },
  branches: {
    EBUKA: "Baba Ebuka sees the canoe and sits down in the mud. “I rowed her across that night.”",
    CHIDI: "Chidi tells her to leave it alone. By morning the reeds are cut and the canoe is gone.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "ada", see: "Her grandmother's bedroom at night, one lamp, the funeral programme on the bed, Ada opening a worn leather Bible to choose a reading.", say: "Grandma's room, night. Ada opens the old Bible to choose a reading.", scene: "One lamp. A worn Bible." },
  { kind: "cliff", see: "Close on a postcard tucked inside the Bible, an Onitsha postmark from last year, a few words in a woman's handwriting.", say: "A postcard from Onitsha, last year: “Tell Ada I'm sorry. —C”", scene: "An Onitsha postmark. Last year." },
  { kind: "choice", see: "Ada on the bed with the postcard in one hand and the ring in the other, the river dark through the window.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "message" },
  choice: { question: "Where does Ada take the postcard?", options: [{ word: "FATHER", label: "To her father" }, { word: "ONITSHA", label: "Across to Onitsha" }] },
  branches: {
    FATHER: "Ada lays the postcard in front of her father. He reads it twice, then admits he threw the ring.",
    ONITSHA: "Ada crosses the bridge to Onitsha at dawn. The postcard's return address is a market stall.",
  },
};

const EP4_ENDING = [
  { kind: "beat", who: "chidi", see: "The family hotel lobby at dusk: Chidi shaking hands with a buyer in a dark suit, a land survey rolled under the buyer's arm.", say: "In the lobby, Chidi's buyer. The sale signs after the funeral.", scene: "A handshake. A rolled survey." },
  { kind: "cliff", see: "Close on Ada's phone at night: a message from an unknown number.", say: "Unknown number: “Don't bury her without me. Saturday. —Mama”", scene: "Unknown number. Saturday." },
  { kind: "choice", see: "Ada on the dark riverbank with her phone glowing, the hotel lit behind her, Onitsha's lights across the water.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "message" },
  choice: { question: "Does Ada tell the family her mother is coming?", options: [{ word: "TELL", label: "Tell the family" }, { word: "SECRET", label: "Keep it secret" }] },
  branches: {
    TELL: "Ada tells the family at dinner. Her father leaves the table. Chidi goes white, for a different reason.",
    SECRET: "Ada tells no one. On the funeral morning she watches the river, not the coffin.",
  },
};

const EP5_ENDING = [
  { kind: "cliff", see: "A wooden canoe crossing the wide Niger in late gold light, Baba Ebuka paddling, a woman in white standing in it, mourners turning on the bank.", say: "A canoe crosses the Niger. A woman in white stands in it.", scene: "Gold light. A woman in white." },
  { kind: "choice", see: "On the bank: Ada in black lace and her father in white linen, both a step from the water, the canoe coming in.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Who meets her at the water?", options: [{ word: "ADA", label: "Ada" }, { word: "FATHER", label: "Her father" }] },
  branches: {
    ADA: "Ada walks into the river in her funeral lace to meet her mother halfway.",
    FATHER: "Her father wades out first, in his white linen, to the woman he let the town call drowned.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", see: "Ada's mother on the bank in wet white, holding her daughter's hands, looking past her at a new SOLD signboard on the family land.", say: "Mama: “I didn't run from your father. I ran from that land.”", scene: "Wet white. A SOLD sign." },
  { kind: "choice", see: "Ada looking from her mother to the SOLD sign, a shovel leaning on the boatyard fence behind them.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "reveal" },
  choice: { question: "What does Ada do about the land?", options: [{ word: "DIG", label: "Dig up the truth" }, { word: "LEAVE", label: "Take her mother away" }] },
  branches: {
    DIG: "Season two: Ada brings a team to dig the riverbank — and Chidi's buyer arrives with lawyers.",
    LEAVE: "Season two: Ada takes her mother to Lagos. Within a week, the buyer finds them.",
  },
};

export default {
  slug: "what-the-river-keeps",
  title: "What the River Keeps",
  tagline: "The river returns what it takes. Eventually.",
  genre: "mystery",
  city: "Asaba",
  logline: "Ada comes home to Asaba to bury her grandmother. A fisherman brings her the wedding ring her mother wore the day she vanished on the Niger, twenty years ago.",
  minVotes: 2,
  cast: [
    { key: "ada", name: "Ada Nwachukwu", age: 30, role: "Marine biologist, home from Lagos", archetype: "The Sage", side: "light", tier: "lead", open: true,
      look: "Athletic, short twists, black lace funeral blouse over jeans, barefoot on the sand with sandals in her hand.",
      want: "To bury her grandmother and leave by Monday.", secret: "She has never believed her mother drowned." },
    { key: "ebuka", name: "Baba Ebuka", age: 66, role: "Fisherman", archetype: "The Guardian", side: "light", tier: "main", open: true,
      look: "Wiry, white stubble, faded red cap, a wooden canoe, a cloth bundle held like something sacred.",
      want: "To give back what the river gave him.", secret: "He was on the water the night her mother vanished." },
    { key: "chidi", name: "Chidi Nwachukwu", age: 34, role: "Ada's cousin, runs the family hotel", archetype: "The Companion", side: "too little", tier: "main", open: true,
      look: "Friendly, round glasses, hotel polo shirt, keys on a long chain.",
      want: "To sell the family land by the river.", secret: "A buyer has already paid him a deposit." },
    { key: "obiora", name: "Obiora Nwachukwu", age: 61, role: "Ada's father", archetype: "The Oga", side: "too little", tier: "main", open: true,
      look: "Tall, grey, white linen shirt, a new wife's photo on his phone screen, a habit of looking at the river and away.",
      want: "To keep the past where it is.", secret: "The ring was never lost — he threw it." },
    { key: "apprentice", name: "Nneka", age: 20, role: "The boat-builder's apprentice", archetype: "The Hustler", side: "light", tier: "cameo", open: true,
      look: "Overalls, sawdust on her arms, a pencil behind her ear.",
      want: "To finish her first boat.", secret: "She found a second canoe hidden in the reeds." },
  ],
  episodes: [
    {
      n: 1,
      title: "The Ring",
      slides: [
        { kind: "cover", see: "Ada on the riverbank at dawn, the Niger Bridge in mist behind her, a gold ring lying in her open palm. Caption space: top third, the misty sky.", say: "" },
        { kind: "time", see: "The River Niger at Asaba at first light: wide, brown, still; canoes pulled up on the sand; the bridge a grey line in the mist.", say: "Asaba. Dawn. The Niger is wide and the colour of tea.", scene: "Mist. A grey bridge." },
        { kind: "beat", see: "Funeral canopy chairs stacked on the bank; Ada in black lace, barefoot, sandals in her hand, looking at the water.", say: "She came home to bury one woman. The river remembers another.", scene: "Black lace. Bare feet." },
        { kind: "line", who: "ebuka", see: "Baba Ebuka kneeling in his canoe, unwrapping a cloth: a small gold ring, wet and bright.", say: "“Your mother's. It was inside a fish. Twenty years, Ada.”", scene: "A cloth. A wet gold ring." },
        { kind: "beat", see: "Close on the ring's inner band, engraved: O.N. & C.N. 2006. Beside it on the sand, her mother's old photograph, newly restored.", say: "Her parents' initials. And the year he swore it was lost.", scene: "Initials inside the band." },
        { kind: "beat", who: "obiora", see: "Up on the hotel balcony above the river, her father with a phone to his ear, turning his back to the water.", say: "On the balcony, her father is already on the phone.", scene: "His back to the river." },
        { kind: "cliff", see: "At Ada's feet the water draws back and leaves a child's silver bracelet in the wet sand, a name engraved on it: ADA.", say: "The water leaves something at her feet. Her name on it.", scene: "A child's bracelet. Her name." },
        { kind: "choice", see: "Ada closing her hand over the ring, the bracelet at her feet, her father's silhouette above.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Ada show the ring to her father?",
        options: [{ word: "SHOW", label: "Show her father" }, { word: "HIDE", label: "Hide the ring" }],
      },
      branches: {
        SHOW: "Her father goes grey and asks one question — not 'how', but 'where?'. That night he takes a canoe out alone.",
        HIDE: "She hides the ring in her grandmother's Bible. That night someone searches her hotel room and leaves the window open to the river.",
      },
      slots: [
        { key: "drink", object: "the bottles on the funeral canopy tables", slide: 3, house: "The Gear Equalizer — Pro Studio Upgrade" },
        { key: "hotel", object: "the family hotel's sign on the balcony", slide: 6, house: "The Gear Equalizer — Pro Studio Upgrade" },
      ],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "her mother's old photograph, faded, brought back to life, slide 5" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): a photo too dark to read, and the canoe in the reeds.
    {
      n: 2, after: "SHOW", title: "Out Alone",
      slides: [
        { kind: "cover", see: "A single canoe lamp far out on the black Niger at night, Ada watching from the hotel balcony rail in the foreground. Caption space: top third.", say: "" },
        { kind: "time", see: "The River Niger at 11 p.m., moonlight on the water, one lamp moving out from the bank, the bridge lights far off.", say: "11 p.m. One lamp moving out across the Niger.", scene: "Moonlight. One moving lamp." },
        { kind: "beat", who: "obiora", see: "Her father alone in a canoe in the moonlight, rowing toward the middle of the river.", say: "Her father rows out alone, first time in twenty years.", scene: "Alone, mid-river." },
        { kind: "beat", who: "ada", see: "Ada on the balcony photographing the canoe with her phone; the photo on screen almost black.", say: "She photographs him from the balcony. Too dark to see.", scene: "A black photo." },
        { kind: "text", who: "ada", see: "The photo relit on Ada's phone: her father leaning over the side of the canoe, both arms in the water.", say: "Relit, it's clear: he's searching the water with his hands.", scene: "Relit: arms in the river." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "lamp", object: "the canoe's lamp", slide: 2, house: "Luma lux" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Ada relights the dark photo of her father in the canoe, slide 5",
        word: "LIGHT", line: "One photo too dark to see, until she relit it. Comment LIGHT and we'll relight yours.",
      },
    },
    {
      n: 2, after: "HIDE", title: "The Open Window",
      slides: [
        { kind: "cover", see: "Ada's hotel room at 2 a.m., the window wide open to the river, curtains blowing, her bag emptied on the bed. Caption space: top third.", say: "" },
        { kind: "time", see: "A hotel room by the Niger at 2 a.m., curtains moving in the river wind, a bedside lamp knocked over.", say: "2 a.m. Her room. The window is open to the river.", scene: "Blowing curtains. A fallen lamp." },
        { kind: "beat", who: "ada", see: "Her bag emptied on the bed, drawers pulled out; under the pillow, her grandmother's Bible untouched.", say: "Everything searched. Except Grandma's Bible, under the pillow.", scene: "Pulled drawers. One safe Bible." },
        { kind: "beat", who: "ada", see: "Ada scrolling her phone: one photo it took when she woke, a figure at the window, almost black.", say: "Her phone caught the intruder. Too dark to see a face.", scene: "A black photo." },
        { kind: "text", who: "ada", see: "The photo relit on Ada's phone: no face, but a long chain of hotel keys hanging from the figure's belt.", say: "Relit: no face. But a long chain of hotel keys.", scene: "Relit: a chain of keys." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "lamp", object: "the bedside lamp", slide: 2, house: "Luma lux" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Ada relights the dark photo of the intruder at her window, slide 5",
        word: "LIGHT", line: "One photo too dark to see, until she relit it. Comment LIGHT and we'll relight yours.",
      },
    },

    // ── Episode 3 (Turn): what the canoe means, and the postcard in the Bible.
    {
      n: 3, after: "*.EBUKA", title: "Across",
      slides: [
        { kind: "cover", see: "Baba Ebuka sitting in the mud beside the hidden canoe, cap in his hands, Ada crouched in front of him in the reeds. Caption space: top third.", say: "" },
        { kind: "time", see: "Ebuka's fishing camp at noon, nets drying on poles, smoke from a fish rack, the river glaring white.", say: "Ebuka's camp. Noon. Nets drying. He has not spoken for an hour.", scene: "Drying nets. White glare." },
        { kind: "line", who: "ebuka", see: "Baba Ebuka looking at the river, not at her, the cloth that held the ring folded in his hands.", say: "“She came at midnight with one bag. I rowed her to Onitsha.”", scene: "Eyes on the river." },
        { kind: "line", who: "ebuka", see: "Ebuka finally meeting her eyes, the old man's face wet.", say: "“She made me promise. Not even your grandmother knows.”", scene: "An old promise." },
        { kind: "beat", who: "ada", see: "Ada standing on the bank looking across the wide river at Onitsha's rooftops in the haze.", say: "Across the water, Onitsha. Her mother was always that close.", scene: "Onitsha, across the water." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "fish", object: "the smoked fish on Ebuka's rack", slide: 2, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "her mother's restored photograph tucked in Ada's phone case as she looks at Onitsha, slide 5" },
    },
    {
      n: 3, after: "*.CHIDI", title: "Cleared",
      slides: [
        { kind: "cover", see: "Ada standing in a field of freshly cut reeds at dawn, the hiding place empty, a new signboard behind her. Caption space: top third.", say: "" },
        { kind: "time", see: "The riverbank at dawn, reeds cut flat to the mud, tyre tracks through them, mist on the water.", say: "Dawn. The reeds are cut to the mud. The canoe is gone.", scene: "Flat reeds. Tyre tracks." },
        { kind: "beat", see: "A new signboard on the family land by the river: SOLD — Riverside Estates.", say: "Tyre tracks. And a new sign on family land: SOLD.", scene: "A new SOLD sign." },
        { kind: "line", who: "chidi", see: "Chidi in the hotel office, keys on their long chain, unable to look at her.", say: "“A buyer paid a deposit. I needed it. I'm sorry.”", scene: "The key chain. Eyes down." },
        { kind: "beat", who: "ada", see: "Ada pulling a receipt from his desk drawer: a deposit, dated the week her grandmother fell ill.", say: "The receipt in his drawer: dated the week Grandma fell ill.", scene: "A receipt. A date." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "sign", object: "the developer's signboard", slide: 3, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "her mother's restored photograph on the hotel office wall behind Chidi, slide 4" },
    },

    // ── Episode 4 (Cost): what the truth costs, and Mama's message.
    {
      n: 4, after: "*.FATHER", title: "Thrown",
      slides: [
        { kind: "cover", see: "Ada and her father on the hotel balcony at midnight, the postcard on the rail between them, the black river below. Caption space: top third.", say: "" },
        { kind: "time", see: "The hotel balcony at midnight, the river black below, the bridge lights a far string of pearls.", say: "The balcony. Midnight. The river below, black.", scene: "Black river. Bridge lights." },
        { kind: "line", who: "obiora", see: "Her father gripping the rail, looking at the river for once, not away.", say: "“We fought. I threw her ring. She walked into the dark.”", scene: "Gripping the rail." },
        { kind: "line", who: "ada", see: "Ada stepping back from him, the ring clenched in her fist.", say: "“You let me grieve her for twenty years.”", scene: "The ring in her fist." },
        { kind: "beat", who: "ada", see: "Morning: the women of the family in navy gele and structured capes posing for the funeral portrait under studio light; Ada a step apart from them.", say: "The funeral portrait: every woman in navy gele. Ada stands apart.", scene: "Navy gele. Ada apart." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "phone", object: "her father's phone on the balcony table", slide: 3, house: "Luma lux" }],
      alux: {
        product: "Navy Regal Gele & structured capes (Color-Shift)", where: "the family's funeral portrait in navy gele and capes, slide 5",
        word: "BOOK", line: "Some days the whole family stands together for one portrait. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 4, after: "*.ONITSHA", title: "The Stall",
      slides: [
        { kind: "cover", see: "Ada in Onitsha Main Market before a lace stall, the postcard in her hand, a crowd flowing past. Caption space: top third.", say: "" },
        { kind: "time", see: "Onitsha Main Market at 9 a.m., endless stalls, bright lace hanging overhead, noise and heat.", say: "Onitsha Main Market. 9 a.m. Ten thousand stalls.", scene: "Hanging lace. Endless stalls." },
        { kind: "beat", see: "A lace stall; the woman behind it stopping still when she sees Ada's face.", say: "A lace stall. The woman there knows her face.", scene: "A stall-keeper, still." },
        { kind: "line", see: "The stall-keeper holding Ada's hands across the counter.", say: "“She left yesterday. When she heard you were in Asaba.”", scene: "Hands across the counter." },
        { kind: "beat", who: "ada", see: "Back in Asaba: the women of the family in navy gele and structured capes posing for the funeral portrait under studio light, one space left empty.", say: "Back in Asaba, the funeral portrait. Navy gele. One space empty.", scene: "Navy gele. One empty space." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "lace", object: "the lace at the stall", slide: 2, house: "Luma lux" }],
      alux: {
        product: "Navy Regal Gele & structured capes (Color-Shift)", where: "the family's funeral portrait in navy gele and capes, slide 5",
        word: "BOOK", line: "Some days the whole family stands together for one portrait. Comment BOOK and we'll make yours.",
      },
    },

    // ── Episode 5 (Storm): the burial by the river, and the canoe.
    {
      n: 5, after: "*.TELL", title: "Alive",
      slides: [
        { kind: "cover", see: "The funeral by the Niger: mourners in navy lace under white canopies, the coffin by the water, Ada facing the river. Caption space: top third.", say: "" },
        { kind: "time", see: "Saturday afternoon by the Niger, white canopies, mourners in navy lace, a brass band resting.", say: "Saturday. The burial. Mourners in navy lace along the river.", scene: "White canopies. Navy lace." },
        { kind: "line", who: "chidi", see: "Chidi pulling Ada aside behind a canopy, sweating through his shirt.", say: "“If she's alive, half the land is hers. My sale is dead.”", scene: "Behind the canopy. Sweating." },
        { kind: "beat", who: "obiora", see: "Her father in the front row in white linen, his chair turned slightly toward the water.", say: "Her father sits in the front row. Facing the river.", scene: "His chair, turned to the river." },
        { kind: "beat", who: "ebuka", see: "Baba Ebuka quietly pushing his canoe into the water in the middle of the service.", say: "Mid-service, Baba Ebuka pushes his canoe into the water.", scene: "A canoe, pushed off." },
        { kind: "beat", who: "apprentice", see: "Nneka on the boatyard roof, pointing out at the river, shouting something no one can hear.", say: "On the boatyard roof, Nneka points at the river.", scene: "A pointing hand." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "canopy", object: "the funeral canopies", slide: 2, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "Navy Regal Gele & structured capes (Color-Shift)", where: "the family women in navy gele in the front rows, slide 2" },
    },
    {
      n: 5, after: "*.SECRET", title: "Watching",
      slides: [
        { kind: "cover", see: "The funeral by the Niger: mourners in navy lace under white canopies, Ada at the coffin with her eyes on the river. Caption space: top third.", say: "" },
        { kind: "time", see: "Saturday afternoon by the Niger, white canopies, mourners in navy lace, a brass band resting.", say: "Saturday. The burial. Mourners in navy lace along the river.", scene: "White canopies. Navy lace." },
        { kind: "beat", who: "ada", see: "Ada at the coffin, hand on the wood, eyes on the water.", say: "Ada stands at the coffin. She watches the river.", scene: "Hand on the coffin." },
        { kind: "beat", who: "chidi", see: "Chidi's buyer in a dark suit arriving at the funeral with a folder, Chidi hurrying to meet him.", say: "Chidi's buyer arrives at the funeral. With the papers.", scene: "A dark suit. A folder." },
        { kind: "beat", who: "ebuka", see: "Baba Ebuka quietly pushing his canoe into the water in the middle of the service.", say: "Mid-service, Baba Ebuka pushes his canoe into the water.", scene: "A canoe, pushed off." },
        { kind: "beat", who: "apprentice", see: "Nneka on the boatyard roof, pointing out at the river, shouting something no one can hear.", say: "On the boatyard roof, Nneka points at the river.", scene: "A pointing hand." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "canopy", object: "the funeral canopies", slide: 2, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "Navy Regal Gele & structured capes (Color-Shift)", where: "the family women in navy gele in the front rows, slide 2" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.ADA", title: "Halfway",
      slides: [
        { kind: "cover", see: "Ada waist-deep in the Niger in black funeral lace, holding her mother in white, gold late light on the water. Caption space: top third.", say: "" },
        { kind: "time", see: "The Niger at 4 p.m., gold light, mourners lined along the bank in navy, the canoe drifting empty.", say: "4 p.m. Waist-deep in the river. Halfway.", scene: "Gold water. An empty canoe." },
        { kind: "line", see: "Ada's mother, grey in her hair now, holding her daughter's face in both hands.", say: "“Twenty years, Ada.”", scene: "Both hands on her face." },
        { kind: "line", who: "ebuka", see: "Baba Ebuka in his drifting canoe, cap off, smiling for the first time.", say: "“There was no fish. I kept the ring. And left your bracelet.”", scene: "Cap off. A first smile." },
        { kind: "beat", who: "obiora", see: "On the bank, Ada's father kneeling in the wet sand in his white linen.", say: "On the bank, her father kneels in the sand.", scene: "White linen, wet sand." },
        { kind: "beat", who: "ada", see: "That night on the balcony: the first photo of Ada and her mother together in twenty years, made into a moving picture on Ada's phone, warm lamp light.", say: "Their first photo together in twenty years. She makes it move.", scene: "A moving photo. Lamp light." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "canoe", object: "Baba Ebuka's canoe", slide: 4, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: {
        product: "Instagram GIF Maker", where: "Ada turns the first photo with her mother into a moving picture, slide 6",
        word: "GIF", line: "Twenty years apart, one moving picture together. Comment GIF and we'll make yours move.",
      },
    },
    {
      n: 6, after: "*.FATHER", title: "The Water",
      slides: [
        { kind: "cover", see: "Ada's father waist-deep in the Niger in white linen facing a woman in white in a canoe, gold late light, mourners watching. Caption space: top third.", say: "" },
        { kind: "time", see: "The Niger at 4 p.m., gold light, mourners lined along the bank in navy, the canoe held still.", say: "4 p.m. He walks into the river he wouldn't look at.", scene: "Gold water. A held canoe." },
        { kind: "line", who: "obiora", see: "Obiora in the water at the canoe's side, his head bowed.", say: "“I threw your ring. I let them say you drowned.”", scene: "Head bowed at the canoe." },
        { kind: "line", who: "ebuka", see: "Baba Ebuka at the paddle, cap off, smiling for the first time.", say: "“There was no fish. I kept the ring. And left your bracelet.”", scene: "Cap off. A first smile." },
        { kind: "line", see: "Ada's mother stepping onto the sand and holding her daughter's face in both hands.", say: "“Twenty years, Ada.”", scene: "Both hands on her face." },
        { kind: "beat", who: "ada", see: "That night on the balcony: the first photo of Ada and her mother together in twenty years, made into a moving picture on Ada's phone, warm lamp light.", say: "Their first photo together in twenty years. She makes it move.", scene: "A moving photo. Lamp light." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "canoe", object: "Baba Ebuka's canoe", slide: 4, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: {
        product: "Instagram GIF Maker", where: "Ada turns the first photo with her mother into a moving picture, slide 6",
        word: "GIF", line: "Twenty years apart, one moving picture together. Comment GIF and we'll make yours move.",
      },
    },
  ],
};
