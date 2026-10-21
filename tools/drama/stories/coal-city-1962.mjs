// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", see: "Saturday morning in a newspaper darkroom under red safelight: a photographer rocking a print in the developer tray, a woman's face rising out of a dark flash photo of the club.", say: "A press darkroom. From a dark flash photo, a face rises.", scene: "Red safelight. A face rising." },
  { kind: "cliff", see: "Close on Saturday's newspaper, 1962 type and halftone: Nkem's face from the darkroom print under a headline about the payday robbery.", say: "Saturday's paper: her face, her name. Wanted for the payday robbery.", scene: "Her face. A headline." },
  { kind: "choice", see: "Nkem at a rain-streaked window in a borrowed coat, the newspaper crushed in one white glove, two doors down the street behind her.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Where does Nkem hide?", options: [{ word: "OGBU", label: "At the Inspector's" }, { word: "IKE", label: "With Ike" }] },
  branches: {
    OGBU: "Nkem goes to Inspector Ogbu's door at dawn. He lets her in, and locks it behind her.",
    IKE: "Nkem hides with Ike in a miner's cottage at Coal Camp. He sleeps with the revolver under his pillow.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "barman", see: "Dusk at the cottage door: Obinna the barman in his bow tie, rain on his shoulders, holding a parcel wrapped in a bar towel.", say: "Dusk. Obinna, with a parcel in a bar towel: “I count everything.”", scene: "A bow tie. A wrapped parcel." },
  { kind: "cliff", see: "Close on Madam Lolo's ledger open under a paraffin lamp: neat columns of names and pounds, the biggest line circled.", say: "Madam Lolo's ledger. The biggest payment: the Police Commissioner.", scene: "Neat columns. One circled line." },
  { kind: "choice", see: "The ledger in Nkem's gloved hands beside the lamp, a box of matches on the table, rain on the window.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "What does Nkem do with the ledger?", options: [{ word: "KEEP", label: "Keep it as proof" }, { word: "BURN", label: "Burn it and live" }] },
  branches: {
    KEEP: "Nkem hides the ledger in her microphone case. By midnight the Commissioner's men are searching every house in Coal Camp.",
    BURN: "Nkem burns the ledger in Obinna's stove — all but one page, which Obinna slips into his bow tie.",
  },
};

const EP4_ENDING = [
  { kind: "line", who: "lolo", see: "Madam Lolo at Nkem's door in her gold head-tie, cigarette holder raised, a new Sunday poster with Nkem's studio portrait rolled in her ringed hand.", say: "“The Commissioner's birthday is Sunday, at my club. You'll sing.”", scene: "A gold head-tie. A new poster." },
  { kind: "cliff", who: "lolo", see: "Madam Lolo leaning in, smoke curling from her holder, rings catching the lamp.", say: "“Sing, and your trumpeter walks free Monday. Refuse, and he doesn't.”", scene: "Smoke. Rings. A deadline." },
  { kind: "choice", see: "Nkem alone with the rolled poster, her emerald sequinned dress hanging on the door behind her.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "clock" },
  choice: { question: "Does Nkem sing at the Commissioner's party?", options: [{ word: "SING", label: "Sing on Sunday" }, { word: "REFUSE", label: "Refuse to sing" }] },
  branches: {
    SING: "Nkem says yes, and asks for one thing: the band plays a song she writes herself.",
    REFUSE: "Nkem refuses. On Sunday, Inspector Ogbu hands her a waiter's jacket: “Then come in the back door.”",
  },
};

const EP5_ENDING = [
  { kind: "cliff", who: "ike", see: "The Commissioner's men leading Ike in, handcuffed, and seating him at the front table beside the Commissioner, who raises a glass to the stage.", say: "The Commissioner's men bring Ike in, cuffed, and sit him front row.", scene: "Handcuffs. A raised glass." },
  { kind: "choice", see: "Nkem at the chrome microphone in emerald sequins, Ike cuffed in the front row, the Commissioner smiling beside him.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "What does Nkem sing?", options: [{ word: "SLOW", label: "The slow one" }, { word: "LEDGER", label: "The ledger, by name" }] },
  branches: {
    SLOW: "Nkem sings the slow one. Every head turns to her — and Obinna slips behind the Commissioner's chair.",
    LEDGER: "Nkem sings the ledger, name by name, to a highlife beat. The room goes silent at the Commissioner's name.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", see: "Enugu station at dawn, steam from the Lagos train; Nkem on the platform with two tickets in her white glove, Ike at one end, Inspector Ogbu at the other.", say: "Dawn train to Lagos. Two tickets in her glove. Two men waiting.", scene: "Steam. Two tickets. Two men." },
  { kind: "choice", see: "Close on the two train tickets in Nkem's gloved hand, the train door open behind her.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "mirror" },
  choice: { question: "Who boards the Lagos train with Nkem?", options: [{ word: "IKE", label: "Ike" }, { word: "OGBU", label: "The Inspector" }] },
  branches: {
    IKE: "Season two: Nkem and Ike reach Lagos — and the man Ike still owes is waiting at the station.",
    OGBU: "Season two: Nkem and the Inspector reach Lagos, where the Commissioner's brother runs the police.",
  },
};

export default {
  slug: "coal-city-1962",
  title: "Coal City, 1962",
  tagline: "She sang for the miners. He robbed them.",
  genre: "period",
  city: "Enugu",
  logline: "Enugu, two years after independence. Nkem is the voice of the Coal City Club. Her lover plans to rob it on payday — during her song.",
  minVotes: 2,
  cast: [
    { key: "nkem", name: "Nkem Okonkwo", age: 26, role: "Highlife singer", archetype: "The Lover", side: "light", tier: "lead", open: true,
      look: "Striking, short pressed curls, emerald sequinned sheath dress, long white gloves, red lipstick, a gap-toothed smile.",
      want: "To leave Enugu with the man she loves.", secret: "She has already bought two train tickets to Lagos." },
    { key: "ike", name: "Ikenna “Ike” Duru", age: 30, role: "Trumpeter in the house band", archetype: "The Rebel", side: "too much", tier: "main", open: true,
      look: "Lean, pencil moustache, white dinner jacket, a trumpet he holds like a weapon.",
      want: "One night's money and a new life.", secret: "He owes the man who planned the robbery." },
    { key: "ogbu", name: "Inspector Charles Ogbu", age: 41, role: "Police inspector", archetype: "The Warrior", side: "light", tier: "main", open: true,
      look: "Upright, khaki uniform under a dark raincoat, felt hat in hand, a thin scar through one eyebrow.",
      want: "To catch the gang that robs paydays.", secret: "He came tonight for Nkem, not for the gang." },
    { key: "lolo", name: "Madam Lolo", age: 50, role: "Owner of the Coal City Club", archetype: "The Oga", side: "too much", tier: "main", open: true,
      look: "Grand, gold head-tie, cigarette holder, rings on every finger, a steel cash box at her elbow.",
      want: "Every miner's wage in her box by midnight.", secret: "The box holds her ledger of who she pays." },
    { key: "barman", name: "Obinna the barman", age: 34, role: "Barman who counts everything", archetype: "The Jester", side: "light", tier: "cameo", open: true,
      look: "Bow tie, white jacket, polishing a glass, eyebrows that say everything.",
      want: "His tips.", secret: "He has counted the robbers already." },
  ],
  episodes: [
    {
      n: 1,
      title: "Highlife",
      slides: [
        { kind: "cover", see: "Painted-poster style: Nkem at a chrome microphone in green sequins, smoke and stage light behind her, a trumpet bell gleaming in the foreground. Caption space: top third.", say: "" },
        { kind: "time", see: "Enugu street at dusk in 1962: a neon sign 'Coal City Club', miners in white shirts queueing, a Morris Minor at the kerb, hills behind.", say: "Enugu, 1962. Friday. The miners have been paid.", scene: "Neon. A Morris Minor." },
        { kind: "beat", see: "A packed dance floor: men in pressed shirts, women in wrappers and gloves, ceiling fans, glasses raised. A framed studio portrait of Nkem on the club poster by the door.", say: "Highlife, palm wine, and every miner's wage in one room.", scene: "Ceiling fans. Raised glasses." },
        { kind: "beat", who: "ike", see: "Backstage: Ike's trumpet case open on a chair. No trumpet — a revolver and a hand-drawn floor plan.", say: "Ike's trumpet case. No trumpet inside.", scene: "A revolver. A floor plan." },
        { kind: "line", who: "lolo", see: "Madam Lolo feeding banknotes into a steel cash box, the key on a gold chain at her neck.", say: "“Sing the slow one, Nkem. Men give more when they're sad.”", scene: "Banknotes. A gold chain." },
        { kind: "beat", who: "nkem", see: "Nkem on stage, mid-song, catching Ike's eye across the band; he mouths 'after this one'.", say: "He said they would run away tonight. He never said how.", scene: "Across the band, his eyes." },
        { kind: "cliff", who: "ogbu", see: "Inspector Ogbu walks in, takes off his hat, sits at the front table and slides a folded note toward the stage: a song request.", say: "The Inspector takes the front table. He requests her song.", scene: "A felt hat. A folded note." },
        { kind: "choice", see: "Nkem's gloved hand on the microphone stand, between the Inspector's table and Ike's empty chair.", say: "" },
      ],
      cliff: { type: "arrival" },
      choice: {
        question: "Does Nkem warn the Inspector, or warn Ike?",
        options: [{ word: "TELL", label: "Warn the Inspector" }, { word: "RUN", label: "Warn Ike and run" }],
      },
      branches: {
        TELL: "She sings a song with the warning hidden in the words. The Inspector understands — but the robbers are not here for the money. They want Madam Lolo's ledger.",
        RUN: "She slips out through the kitchen with Ike. At the station he opens the cash box. It is already empty — and her train tickets are gone from her purse.",
      },
      slots: [
        { key: "drink", object: "the bottles on the bar and the glasses raised on the dance floor", slide: 3, house: "Luma lux" },
        { key: "poster", object: "the club poster by the door", slide: 3, house: "Luma lux" },
      ],
      alux: { product: "Luma lux", where: "Nkem's studio portrait on the club poster, slide 3" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): the robbery, and the face in the darkroom.
    {
      n: 2, after: "TELL", title: "The Coded Song",
      slides: [
        { kind: "cover", see: "Nkem singing into the chrome microphone in a cone of stage light, eyes on the Inspector's table, five men in hats along the back wall. Caption space: top third.", say: "" },
        { kind: "time", see: "The Coal City Club at 11 p.m., blue smoke under the ceiling fans, the band in white jackets, the dance floor full.", say: "11 p.m. Her last song. The robbers are already in the room.", scene: "Blue smoke. White jackets." },
        { kind: "line", who: "nkem", see: "Nkem singing, gloved hand lifted, looking straight at the Inspector as she sings.", say: "“Five men at the door, my love. Don't go home alone.”", scene: "A lyric, aimed at one man." },
        { kind: "beat", who: "ogbu", see: "Inspector Ogbu rising slowly from the front table; at the back wall, five men rising too.", say: "The Inspector understands. He stands. So do five men.", scene: "Six men, standing." },
        { kind: "beat", see: "A robber's gloved hands at Madam Lolo's steel box, pushing the banknotes aside and lifting out a black ledger.", say: "They leave the money. They take a ledger from under it.", scene: "Banknotes aside. A black ledger." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "drink", object: "the palm wine on the front tables", slide: 2, house: "Luma lux" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "the press photographer lifts Nkem's face out of a dark flash photo in the darkroom, slide 6",
        word: "LIGHT", line: "In 1962 it took a darkroom to lift a face from the dark. Comment LIGHT and we'll relight yours.",
      },
    },
    {
      n: 2, after: "RUN", title: "Platform Two",
      slides: [
        { kind: "cover", see: "Nkem and Ike on a bench at a dark railway platform, a steel cash box open and empty between them, a station lamp above. Caption space: top third.", say: "" },
        { kind: "time", see: "Enugu railway station at midnight, one gas lamp, an empty platform, the Lagos train's carriages dark on the track.", say: "Enugu station. Midnight. The Lagos train leaves at dawn.", scene: "One lamp. Dark carriages." },
        { kind: "beat", who: "ike", see: "Ike prising open the steel cash box on the bench: nothing inside.", say: "Ike opens the cash box on the bench. It's empty.", scene: "An empty steel box." },
        { kind: "beat", who: "nkem", see: "Nkem tipping out her purse under the lamp: lipstick, gloves, coins — no tickets.", say: "She opens her purse for the tickets. They're gone too.", scene: "Lipstick. Coins. No tickets." },
        { kind: "line", who: "ike", see: "Ike standing, looking up and down the empty platform, hand inside his jacket.", say: "“Someone robbed the robbers. And knew about your tickets.”", scene: "An empty platform." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "lamp", object: "the station lamp", slide: 2, house: "Luma lux" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "the press photographer lifts Nkem's face out of a dark flash photo in the darkroom, slide 6",
        word: "LIGHT", line: "In 1962 it took a darkroom to lift a face from the dark. Comment LIGHT and we'll relight yours.",
      },
    },

    // ── Episode 3 (Turn): a confession in hiding, and the ledger.
    {
      n: 3, after: "*.OGBU", title: "Locked Door",
      slides: [
        { kind: "cover", see: "Inspector Ogbu and Nkem in his small quarters at dawn, the door bolted, his raincoat on a hook, rain on the window. Caption space: top third.", say: "" },
        { kind: "time", see: "Police quarters in Enugu at dawn, rain on a tin roof, a paraffin lamp, a kettle on a stove.", say: "The Inspector's quarters. Dawn. Rain on a tin roof.", scene: "A paraffin lamp. Rain." },
        { kind: "line", who: "ogbu", see: "Inspector Ogbu at the window, hat in his hands, not looking at her.", say: "“I didn't come on Friday for the gang. I came for you.”", scene: "Hat in his hands." },
        { kind: "line", who: "ogbu", see: "Ogbu turning to her, the scar through his eyebrow catching the lamp.", say: "“Every Friday for a year. Front table. Your slow song.”", scene: "The scar. The lamp." },
        { kind: "beat", who: "nkem", see: "Nkem slowly taking off one long white glove, looking at him.", say: "She doesn't answer. She takes off one glove.", scene: "One glove, off." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "kettle", object: "the kettle on the stove", slide: 2, house: "Luma lux" }],
      alux: { product: "Luma lux", where: "the torn-out newspaper portrait of Nkem pinned inside the Inspector's wardrobe door, slide 4" },
    },
    {
      n: 3, after: "*.IKE", title: "Coal Camp",
      slides: [
        { kind: "cover", see: "Ike and Nkem in a bare miner's cottage at dawn, a revolver on the table between them, rain on the window. Caption space: top third.", say: "" },
        { kind: "time", see: "A miner's cottage at Coal Camp at dawn, rain on a tin roof, a paraffin lamp, a miner's helmet on a nail.", say: "A miner's cottage at Coal Camp. Dawn. Rain on tin.", scene: "A helmet on a nail." },
        { kind: "line", who: "ike", see: "Ike at the table, trumpet beside the revolver, rubbing his face.", say: "“I owe the man who planned it. He says I still owe.”", scene: "A trumpet. A revolver." },
        { kind: "beat", who: "nkem", see: "Ike asleep on the mat with the revolver under his pillow; Nkem awake beside the lamp.", say: "He sleeps with the revolver under his pillow. She doesn't sleep.", scene: "Asleep. Awake." },
        { kind: "line", who: "ike", see: "Ike half-awake, murmuring, his eyes still closed.", say: "“The man I owe has a police cap and a big office.”", scene: "Eyes closed. A name, almost." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "lamp", object: "the paraffin lamp", slide: 2, house: "Luma lux" }],
      alux: { product: "Luma lux", where: "the newspaper portrait of Nkem folded on the cottage table, slide 3" },
    },

    // ── Episode 4 (Cost): what the ledger costs, and Madam Lolo's offer.
    {
      n: 4, after: "*.KEEP", title: "The Search",
      slides: [
        { kind: "cover", see: "Torch beams and boots in the lanes of Coal Camp at midnight, police in a line, Nkem behind a curtain with her microphone case. Caption space: top third.", say: "" },
        { kind: "time", see: "Coal Camp at midnight, torches in the lanes, doors kicked open, a dog barking.", say: "Midnight. Coal Camp. Torches and boots at every door.", scene: "Torches. Open doors." },
        { kind: "beat", see: "The Commissioner's men turning a cottage upside down, tipping out drawers and sacks.", say: "The Commissioner's men search every house for the ledger.", scene: "Drawers tipped out." },
        { kind: "beat", who: "nkem", see: "Nkem's microphone case on a chair, untouched, the men walking right past it.", say: "It's inside her microphone case. They never look at a singer's things.", scene: "An untouched case." },
        { kind: "beat", who: "ike", see: "Two policemen dragging Ike out into the rain in his white dinner jacket.", say: "They don't find the ledger. They take Ike instead.", scene: "A white jacket in the rain." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "torch", object: "the policemen's torches", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Luma lux", where: "Nkem's studio portrait on the new Sunday poster in Madam Lolo's hand, slide 6" },
    },
    {
      n: 4, after: "*.BURN", title: "One Page",
      slides: [
        { kind: "cover", see: "The ledger burning in an iron stove, Nkem and Obinna watching, firelight on their faces. Caption space: top third.", say: "" },
        { kind: "time", see: "Obinna's small room behind the club, an iron stove, crates of bottles, firelight on the walls.", say: "Obinna's room behind the club. The stove. One page left.", scene: "Firelight. Crates of bottles." },
        { kind: "beat", who: "barman", see: "The ledger curling in the flames; Obinna folding one torn page and tucking it into his bow tie.", say: "The ledger burns. Obinna slips the last page into his bow tie.", scene: "One page, in a bow tie." },
        { kind: "line", who: "ike", see: "Ike bursting through the door, seeing the fire, his face falling.", say: "“That book was my way out. You burned my way out.”", scene: "The door flung open." },
        { kind: "beat", who: "ike", see: "Ike walking into the night toward the station; under the station lamp, two policemen waiting.", say: "Ike storms off. At the station, the Commissioner's men are waiting.", scene: "Two men under a lamp." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "bottles", object: "the crates of bottles", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Luma lux", where: "Nkem's studio portrait on the new Sunday poster in Madam Lolo's hand, slide 6" },
    },

    // ── Episode 5 (Storm): the Commissioner's birthday at the club.
    {
      n: 5, after: "*.SING", title: "Her Song",
      slides: [
        { kind: "cover", see: "The Coal City Club dressed for a birthday, bunting and brass, Nkem backstage in emerald sequins writing on a sheet of music. Caption space: top third.", say: "" },
        { kind: "time", see: "The Coal City Club on Sunday night, bunting over the stage, a brass band, men in agbada and suits, a birthday cake on a trolley.", say: "Sunday. The Coal City Club. Bunting, brass, and a birthday.", scene: "Bunting. Brass. A cake." },
        { kind: "beat", who: "nkem", see: "Backstage, Nkem writing new words over an old highlife score with a pencil.", say: "Backstage, she writes new words to an old highlife tune.", scene: "Pencil on an old score." },
        { kind: "beat", who: "barman", see: "Obinna polishing a glass, his eyebrows counting men in dark suits at every door.", say: "Obinna counts the Commissioner's men. Six. One at every door.", scene: "A polished glass. Six men." },
        { kind: "line", who: "lolo", see: "Madam Lolo adjusting Nkem's glove at the side of the stage, cigarette holder in her teeth.", say: "“Smile, Nkem. A birthday, not a funeral.”", scene: "A glove adjusted." },
        { kind: "beat", who: "ogbu", see: "Inspector Ogbu at the back of the room in plain clothes, hat low.", say: "At the back, the Inspector. Plain clothes. Hat low.", scene: "Plain clothes. Hat low." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "cake", object: "the birthday cake on its trolley", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Luma lux", where: "Nkem's studio portrait on the Sunday poster by the stage door, slide 3" },
    },
    {
      n: 5, after: "*.REFUSE", title: "The Back Door",
      slides: [
        { kind: "cover", see: "Nkem in a white waiter's jacket carrying a tray through the crowded club, her emerald dress hidden underneath, stage light ahead. Caption space: top third.", say: "" },
        { kind: "time", see: "The Coal City Club on Sunday night, bunting over the stage, a brass band, men in agbada and suits, a birthday cake on a trolley.", say: "Sunday. The Coal City Club. Bunting, brass, and a birthday.", scene: "Bunting. Brass. A cake." },
        { kind: "beat", who: "ogbu", see: "Inspector Ogbu at the kitchen door handing Nkem a white waiter's jacket.", say: "The Inspector hands her a waiter's jacket at the kitchen door.", scene: "A white jacket." },
        { kind: "beat", who: "nkem", see: "Nkem carrying a tray past the stage, where another singer sings her songs.", say: "She carries trays past the stage. Another girl sings her songs.", scene: "A tray. Her songs." },
        { kind: "beat", who: "barman", see: "Obinna polishing a glass, his eyebrows counting men in dark suits at every door.", say: "Obinna counts the Commissioner's men. Six. One at every door.", scene: "A polished glass. Six men." },
        { kind: "beat", see: "The new singer frozen at the microphone; the miners at the back starting to chant.", say: "The new singer freezes. The room starts chanting one name.", scene: "A frozen singer." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "tray", object: "the drinks on Nkem's tray", slide: 4, house: "Noir Director Editorial" }],
      alux: { product: "Luma lux", where: "Nkem's studio portrait on the Sunday poster by the stage door, slide 4" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.SLOW", title: "The Slow One",
      slides: [
        { kind: "cover", see: "Nkem singing the slow song in a single spotlight, every face in the club turned up to her, Obinna moving low behind the front table. Caption space: top third.", say: "" },
        { kind: "time", see: "The club at 11 p.m., one spotlight, blue smoke, the brass band playing softly, the whole room still.", say: "11 p.m. The slow one. Every man in the room is sad.", scene: "One spotlight. A still room." },
        { kind: "beat", who: "barman", see: "Obinna crouched behind the front table, lifting the handcuff key from a policeman's belt.", say: "While every head is turned, Obinna takes the cuff key.", scene: "A key, lifted." },
        { kind: "line", who: "ogbu", see: "Inspector Ogbu at the Commissioner's shoulder, hand on his arm, the ledger page on the table.", say: "“Sit down, Commissioner. You're under arrest. With your own ledger.”", scene: "A hand on his arm." },
        { kind: "line", who: "nkem", see: "Nkem stepping down from the stage, looking at Madam Lolo, whose fan has stopped.", say: "“Men give more when they're sad, Madam. Tonight they gave him up.”", scene: "Off the stage. Eyes on Lolo." },
        { kind: "beat", who: "nkem", see: "Three months later: Nkem's first record sleeve in a shop window on Ogui Road, a black-and-white editorial portrait under dramatic side light.", say: "Three months later: her first record sleeve. Black and white.", scene: "A shop window. Her face." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "spotlight", object: "the stage spotlight", slide: 2, house: "Luma lux" }],
      alux: {
        product: "Noir Director Editorial", where: "Nkem's black-and-white record sleeve portrait in the shop window, slide 6",
        word: "BOOK", line: "A black-and-white portrait worthy of a record sleeve. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.LEDGER", title: "Name by Name",
      slides: [
        { kind: "cover", see: "Nkem singing with fire in a single spotlight, pointing a gloved hand at the front table, the Commissioner half out of his chair. Caption space: top third.", say: "" },
        { kind: "time", see: "The club at 11 p.m., one spotlight, blue smoke, the brass band driving a highlife beat, the whole room frozen.", say: "11 p.m. She sings a ledger to a highlife beat.", scene: "One spotlight. A frozen room." },
        { kind: "line", who: "nkem", see: "Nkem singing, gloved finger pointing at the front table.", say: "“Fifty pounds a month to the man in the front row.”", scene: "A gloved finger, pointing." },
        { kind: "line", who: "ogbu", see: "Inspector Ogbu's hand pressing the rising Commissioner back into his chair.", say: "“Sit down, Commissioner. You're in her song now.”", scene: "A hand on his shoulder." },
        { kind: "line", who: "nkem", see: "Nkem stepping down from the stage, looking at Madam Lolo, whose fan has stopped.", say: "“Men give more when they're sad, Madam. Tonight they gave him up.”", scene: "Off the stage. Eyes on Lolo." },
        { kind: "beat", who: "nkem", see: "Three months later: Nkem's first record sleeve in a shop window on Ogui Road, a black-and-white editorial portrait under dramatic side light.", say: "Three months later: her first record sleeve. Black and white.", scene: "A shop window. Her face." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "spotlight", object: "the stage spotlight", slide: 2, house: "Luma lux" }],
      alux: {
        product: "Noir Director Editorial", where: "Nkem's black-and-white record sleeve portrait in the shop window, slide 6",
        word: "BOOK", line: "A black-and-white portrait worthy of a record sleeve. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
