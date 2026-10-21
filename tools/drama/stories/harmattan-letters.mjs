// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", who: "garba", see: "Sunset at the house: Alhaji Garba in an embroidered babban riga stepping out of a car with two police officers and a fresh permit, the dust gold in the low sun.", say: "At sunset, Alhaji Garba arrives with two police officers. A new permit.", scene: "Gold dust. A fresh permit." },
  { kind: "cliff", who: "mason", see: "Malam Sule pulling Zainab behind a wall and unwrapping a cloth from a second bundle of letters tied in red thread, low gold light on his face.", say: "Malam Sule, whispering: “There's a second bundle. Your name is on it.”", scene: "A second bundle. Red thread." },
  { kind: "choice", see: "Close on the red-thread bundle in Zainab's dusty hands, her name written on the top envelope.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Who opens the second bundle with Zainab?", options: [{ word: "YUSUF", label: "Yusuf, tonight" }, { word: "HAUWA", label: "Her grandmother" }] },
  branches: {
    YUSUF: "By lantern light in the courtyard, Zainab and Yusuf open the bundle together. Inside is a deed for the house.",
    HAUWA: "Hajiya Hauwa opens the bundle with shaking hands, and tells Zainab what the house really is.",
  },
};

const EP3_ENDING = [
  { kind: "text", see: "Close on a yellowed deed from the bundle under lantern light: an old stamp, a name, one line of handwriting.", say: "The deed: “Yusuf Bello, 1984. For Hauwa, as long as she lives.”", scene: "An old stamp. His name." },
  { kind: "cliff", who: "zainab", see: "Zainab facing Yusuf in the dark courtyard, the deed between them, warm lantern light on both faces, cold blue harmattan night behind.", say: "“The house you came to knock down is yours, Yusuf.”", scene: "Lantern light. The deed between them." },
  { kind: "choice", see: "Close on Yusuf's hands holding the deed, his Lagos phone lighting up in his pocket with his uncle's name.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "What does Yusuf do with the house?", options: [{ word: "CLAIM", label: "Claim it himself" }, { word: "GIVE", label: "Give it to Hajiya" }] },
  branches: {
    CLAIM: "Yusuf takes the deed to his uncle's compound and puts it on the table. His uncle doesn't even pick it up.",
    GIVE: "At dawn Yusuf signs the house over to Hajiya Hauwa. She holds the deed and gives it straight to Zainab.",
  },
};

const EP4_ENDING = [
  { kind: "beat", who: "yusuf", see: "Yusuf alone on the roof of the old house at night, Kano's mud rooftops around him, his phone glowing blue in his hand.", say: "Night. Yusuf on the roof. Kano all around him, like a memory.", scene: "Mud rooftops. One phone glowing." },
  { kind: "cliff", see: "Close on Yusuf's phone: two messages, one from his airline, one from his uncle.", say: "7 a.m.: his flight to Lagos. 7 a.m.: the bulldozers.", scene: "Two messages. The same hour." },
  { kind: "choice", see: "Close on Yusuf's Lagos shoes on the dusty roof, his laptop bag beside them, the first grey light coming.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "clock" },
  choice: { question: "Does Yusuf stay in Kano or catch his flight?", options: [{ word: "STAY", label: "Stay in Kano" }, { word: "FLY", label: "Catch his flight" }] },
  branches: {
    STAY: "At dawn Yusuf stands beside Zainab in front of the bulldozer. His uncle arrives to find his nephew in the way.",
    FLY: "Yusuf boards his flight. In his pocket is one letter from the bundle he hasn't read yet.",
  },
};

const EP5_ENDING = [
  { kind: "beat", who: "hauwa", see: "Dawn at the old house: the bulldozer's engine running, Alhaji Garba by the permit, and Hajiya Hauwa in white lace walking slowly into its path, low sun through the haze.", say: "The engine starts. Hajiya Hauwa walks into its path.", scene: "White lace. A yellow bulldozer." },
  { kind: "cliff", who: "hauwa", see: "Hajiya Hauwa with one hand on the old wall, facing everyone, the dust gold in the first sun.", say: "“He sent every letter. I hid them here. I never answered.”", scene: "Her hand on the wall." },
  { kind: "choice", see: "Close on Zainab, between Yusuf and her grandmother, a blank sheet of paper and a pencil in her dusty hand.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Does Zainab tell Yusuf, or write to him?", options: [{ word: "SAY", label: "Say it out loud" }, { word: "WRITE", label: "Write him a letter" }] },
  branches: {
    SAY: "Zainab says it in front of everyone, by the bulldozer, in the first sun. Alhaji Garba turns the engine off himself.",
    WRITE: "Zainab writes the letter her grandmother never wrote back — and this time it is posted. It reaches Yusuf the same day.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", who: "mason", see: "Months later, the restored house in soft morning light; Malam Sule handing Zainab a third bundle tied in green thread.", say: "Malam Sule: “There was a third bundle. From Hajiya, to someone else.”", scene: "A third bundle. Green thread." },
  { kind: "choice", see: "Close on the green-thread bundle in Zainab's hands, an unfamiliar man's name on the top envelope.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "reveal" },
  choice: { question: "Does Zainab read her grandmother's letters?", options: [{ word: "READ", label: "Read them now" }, { word: "RETURN", label: "Give them back" }] },
  branches: {
    READ: "Season two: the letters are from Hajiya Hauwa to a man in Zaria — and they are dated after she married.",
    RETURN: "Season two: Zainab gives the bundle back. That night, Hajiya Hauwa takes a bus to Zaria alone.",
  },
};

export default {
  slug: "harmattan-letters",
  title: "Harmattan Letters",
  tagline: "Some love arrives with the dust.",
  genre: "romance",
  city: "Kano",
  logline: "Zainab restores old houses in Kano's ancient city. Behind a crumbling wall she finds forty years of unsent love letters — to her grandmother, signed by the demolition architect's grandfather.",
  minVotes: 2,
  cast: [
    { key: "zainab", name: "Zainab Danladi", age: 30, role: "Conservation architect", archetype: "The Maker", side: "light", tier: "lead", open: true,
      look: "Graceful, indigo veil loosely over her hair, white shirt with rolled sleeves, a measuring tape and a pencil, dust on her hands.",
      want: "To save one house the city has forgotten.", secret: "This is the house she was born in." },
    { key: "yusuf", name: "Yusuf Bello", age: 33, role: "Developer's architect from Lagos", archetype: "The Hustler", side: "too much", tier: "lead", open: true,
      look: "Tall, neat beard, sunglasses, a blue kaftan with a laptop bag across it, Lagos shoes in Kano dust.",
      want: "To finish the job and go back to Lagos.", secret: "He was born in Kano and has never been back." },
    { key: "hauwa", name: "Hajiya Hauwa", age: 78, role: "Zainab's grandmother", archetype: "The Sage", side: "light", tier: "main", open: true,
      look: "Small and regal, white lace veil, kohl-lined eyes, prayer beads, a voice like a radio from another age.",
      want: "To keep one secret until she dies.", secret: "She loved Yusuf's grandfather and married another." },
    { key: "garba", name: "Alhaji Garba Danjuma", age: 56, role: "The developer, Yusuf's uncle", archetype: "The Oga", side: "too much", tier: "main", open: true,
      look: "Heavy, embroidered babban riga, gold-rimmed glasses, a sheaf of permits.",
      want: "A shopping mall where the house stands.", secret: "He knows exactly whose house it was." },
    { key: "mason", name: "Malam Sule", age: 49, role: "The mason who found the wall", archetype: "The Companion", side: "light", tier: "cameo", open: true,
      look: "Lean, dusty work clothes, a cloth tied round his head, a trowel tucked in his belt.",
      want: "To be paid on Friday.", secret: "He found a second bundle and hid it." },
  ],
  episodes: [
    {
      n: 1,
      title: "The Wall",
      slides: [
        { kind: "cover", see: "Zainab in a sunlit mud-walled room, dust floating in beams of light, holding a bundle of old letters tied with indigo thread. Caption space: top third, the bright wall.", say: "" },
        { kind: "time", see: "Kano's old city in harmattan haze: mud rooftops with pointed corners, a white sun low and pale, a minaret far off.", say: "Kano. Old City. Harmattan. The sun is a white coin.", scene: "Harmattan haze. A white sun." },
        { kind: "beat", see: "Workers with hammers before a cracked mud wall, dust in the air. On the wall, an old framed Eid portrait of a young woman in white.", say: "One week before the bulldozers. She has less.", scene: "Hammers. Dust. An old portrait." },
        { kind: "beat", who: "mason", see: "Behind a loose block: letters tied with faded indigo thread, the paper the colour of tea.", say: "Behind the wall, forty years of letters. Never posted.", scene: "Behind a loose block: letters." },
        { kind: "text", see: "Close on one letter, handwriting in English and Hausa: 'For Hauwa — when you are brave enough to read this.'", say: "“For Hauwa — when you are brave enough to read this.”", scene: "One letter, in two languages." },
        { kind: "line", who: "yusuf", see: "Yusuf in the doorway, sunglasses up, a demolition permit in his hand, dust settling on his Lagos shoes.", say: "“Miss Danladi? I'm the architect. I'm here to take it down.”", scene: "His permit. Her dusty hands." },
        { kind: "cliff", see: "Zainab turning over the last letter: the signature reads 'Y. Bello, 1984'. Yusuf is reading it over her shoulder.", say: "The letters are signed Bello. His grandfather's name.", scene: "The signature: Y. Bello, 1984." },
        { kind: "choice", see: "Zainab and Yusuf in the doorway light, the letters between them, the bulldozer visible in the street behind.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Zainab share the letters with Yusuf?",
        options: [{ word: "SHARE", label: "Share the letters" }, { word: "KEEP", label: "Keep them hidden" }],
      },
      branches: {
        SHARE: "Yusuf reads one letter and stops the demolition for a day. His uncle arrives before sunset with the police and a new permit.",
        KEEP: "Zainab takes the letters to her grandmother. Hajiya Hauwa reads one, then burns it before Zainab can stop her.",
      },
      slots: [
        { key: "drink", object: "the water or kunu the workers drink in the heat", slide: 3, house: "Asunma / Elite Eid" },
        { key: "phone", object: "the phone Yusuf photographs the permit with", slide: 6, house: "Asunma / Elite Eid" },
      ],
      alux: { product: "Asunma / Elite Eid", where: "the framed Eid portrait on the old wall, slide 3" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): the doorway in the photograph, and the uncle's new permit.
    {
      n: 2, after: "SHARE", title: "One Day",
      slides: [
        { kind: "cover", see: "Zainab and Yusuf sitting on a low mud step in the courtyard, reading one letter together in the harmattan light, the bulldozer idle behind. Caption space: top third.", say: "" },
        { kind: "time", see: "The house's courtyard at noon in harmattan haze, the bulldozer parked and silent in the lane outside.", say: "Noon. The bulldozer is parked. Yusuf has given her one day.", scene: "A silent bulldozer. One day." },
        { kind: "text", see: "Close on a letter in the grandfather's hand, English and Hausa, the ink brown with age.", say: "The letter: “I built your doorway so you would pass me daily.”", scene: "Brown ink. A young man's hand." },
        { kind: "beat", who: "yusuf", see: "Yusuf photographing a dark old photograph found in the bundle and relighting it on his phone: a young couple under a carved doorway — this doorway.", say: "Yusuf relights a photo from the bundle. This doorway. Two young people.", scene: "Relit: this doorway, forty years ago." },
        { kind: "beat", who: "zainab", see: "Zainab running her fingers over the carved doorway beside them, the same pattern as in the photograph, side light raking the carving.", say: "The same carving, under her fingers. He built this.", scene: "The carving, under her fingers." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "phone", object: "the phone Yusuf relights the photograph on", slide: 4, house: "Asunma / Elite Eid" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Yusuf relights the dark old photograph from the bundle, slide 4",
        word: "LIGHT", line: "Forty years in the dark, then one relit photo. Comment LIGHT and we'll relight one of yours.",
      },
    },
    {
      n: 2, after: "KEEP", title: "Ashes",
      slides: [
        { kind: "cover", see: "Hajiya Hauwa in white lace holding a burning letter over a brazier in her compound, Zainab reaching too late. Caption space: top third.", say: "" },
        { kind: "time", see: "Hajiya Hauwa's compound at noon, a charcoal brazier, prayer beads on a mat, harmattan haze over the walls.", say: "Hajiya Hauwa's compound. Noon. One letter already ash.", scene: "A brazier. One letter, ash." },
        { kind: "line", who: "hauwa", see: "Hajiya Hauwa watching the ash rise, prayer beads in her other hand, her kohl-lined eyes dry.", say: "“Some letters are for keeping. That one was for burning.”", scene: "Ash rising. Dry eyes." },
        { kind: "beat", who: "zainab", see: "Zainab relighting on her phone a dark old photograph that fell from the bundle: a young couple under a carved doorway.", say: "From the bundle, a dark photo. She relights it. Grandma, young.", scene: "Relit: Grandma at twenty." },
        { kind: "beat", who: "zainab", see: "Zainab back at the old house comparing the photo to the carved doorway: the same pattern.", say: "Back at the house: the same doorway. Somebody built it for her.", scene: "The same doorway. The same carving." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "tea", object: "the tea glasses on Hajiya Hauwa's mat", slide: 3, house: "Asunma / Elite Eid" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Zainab relights the dark old photograph from the bundle, slide 4",
        word: "LIGHT", line: "Forty years in the dark, then one relit photo. Comment LIGHT and we'll relight one of yours.",
      },
    },

    // ── Episode 3 (Turn): the baby born in the house, and the deed.
    {
      n: 3, after: "*.YUSUF", title: "Lantern",
      slides: [
        { kind: "cover", see: "Zainab and Yusuf on the courtyard floor by lantern light, the red-thread bundle open between them, the night sky hazy above. Caption space: top third.", say: "" },
        { kind: "time", see: "The courtyard at 10 p.m., harmattan cold, one lantern, stars dim behind the haze, an Eid portrait lantern-lit on the wall.", say: "The courtyard. 10 p.m. Harmattan cold. One lantern.", scene: "One lantern. Cold air." },
        { kind: "text", see: "Close on the top envelope: Zainab's name and a date in 1996.", say: "The envelope: “For the baby born in this house. Zainab.”", scene: "Her name. 1996." },
        { kind: "line", who: "zainab", see: "Zainab holding the envelope, looking up at the dark rooms of the house.", say: "“I was born in this house. I never told anyone.”", scene: "Her secret, out loud." },
        { kind: "beat", who: "yusuf", see: "Yusuf putting his coat around her shoulders, silent, the lantern between them.", say: "Yusuf puts his coat around her. He doesn't say anything.", scene: "His coat. No words." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "lantern", object: "the lantern on the courtyard floor", slide: 2, house: "Asunma / Elite Eid" }],
      alux: { product: "Asunma / Elite Eid", where: "the framed Eid portrait on the courtyard wall, lantern-lit, slide 2" },
    },
    {
      n: 3, after: "*.HAUWA", title: "What the House Is",
      slides: [
        { kind: "cover", see: "Hajiya Hauwa opening the red-thread bundle with shaking hands on her mat, Zainab kneeling beside her. Caption space: top third.", say: "" },
        { kind: "time", see: "Hajiya Hauwa's room at night, a kerosene lamp, prayer beads, her own Eid portrait on the wall, the harmattan rattling the shutters.", say: "Hajiya's room. Night. The harmattan rattles the shutters.", scene: "A kerosene lamp. Rattling shutters." },
        { kind: "line", who: "hauwa", see: "Hajiya Hauwa holding the top envelope, Zainab's name on it, tears on her cheeks in the lamplight.", say: "“He wrote to you the night you were born. In that house.”", scene: "Your name, in his hand." },
        { kind: "line", who: "zainab", see: "Zainab frozen, looking from the envelope to her grandmother.", say: "“You knew I was born there. You said nothing.”", scene: "Her grandmother's silence." },
        { kind: "beat", who: "zainab", see: "Zainab running through the old city at night to the site, the bundle under her arm, Yusuf's car parked by the house.", say: "She runs back to the house. Yusuf is still there.", scene: "Through the old city, running." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "lamp", object: "the kerosene lamp in Hajiya's room", slide: 2, house: "Asunma / Elite Eid" }],
      alux: { product: "Asunma / Elite Eid", where: "Hajiya Hauwa's own Eid portrait on the wall above her mat, slide 2" },
    },

    // ── Episode 4 (Cost): the portrait he took, and two messages at the same hour.
    {
      n: 4, after: "*.CLAIM", title: "His Uncle's Table",
      slides: [
        { kind: "cover", see: "Alhaji Garba's grand sitting room, the deed on a low table between him and Yusuf, an old Eid portrait on the wall. Caption space: top third.", say: "" },
        { kind: "time", see: "Alhaji Garba's compound at night, a generator humming, a ceiling fan turning slowly under a chandelier.", say: "His uncle's compound. Night. The fan turns. Nobody sits.", scene: "A ceiling fan. Nobody sits." },
        { kind: "line", who: "garba", see: "Alhaji Garba glancing at the deed without picking it up, gold-rimmed glasses low.", say: "“Your grandfather's paper. My permits. The bulldozer can't read either.”", scene: "He doesn't pick it up." },
        { kind: "beat", who: "yusuf", see: "Yusuf noticing the old framed Eid portrait on his uncle's wall: the same young woman in white as on the old house's wall — Hajiya Hauwa at twenty.", say: "On his uncle's wall: the same Eid portrait. Hajiya, at twenty.", scene: "The same portrait. Two walls." },
        { kind: "line", who: "garba", see: "Alhaji Garba, seeing what Yusuf sees, turning the portrait to face the wall.", say: "“Your grandfather took that photograph. Then he spent his life on her.”", scene: "He turns it to the wall." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "fan", object: "the ceiling fan in Alhaji Garba's sitting room", slide: 2, house: "Asunma / Elite Eid" }],
      alux: {
        product: "Asunma / Elite Eid", where: "Hajiya Hauwa's Eid portrait at twenty, taken by Yusuf's grandfather, on his uncle's wall, slide 4",
        word: "BOOK", line: "Forty years on, that Eid portrait still stops a room. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 4, after: "*.GIVE", title: "Signed Over",
      slides: [
        { kind: "cover", see: "Yusuf signing a document on Hajiya Hauwa's mat at dawn, Hauwa holding the deed, Zainab in the doorway. Caption space: top third.", say: "" },
        { kind: "time", see: "Hajiya Hauwa's room at dawn, grey light through the shutters, the call to prayer far off.", say: "Hajiya's room. Dawn. The call to prayer, far off.", scene: "Grey dawn through the shutters." },
        { kind: "beat", who: "yusuf", see: "Yusuf signing the transfer and handing the deed to Hajiya Hauwa.", say: "Yusuf signs. The house is Hajiya's again, on paper.", scene: "His signature. Her house." },
        { kind: "line", who: "hauwa", see: "Hajiya Hauwa giving the deed straight to Zainab and pointing to an old Eid portrait on her wall: herself at twenty, in white.", say: "“Give it to her. And that portrait — he took it.”", scene: "The deed changes hands again." },
        { kind: "beat", who: "zainab", see: "Zainab taking the Eid portrait off the wall: on the back, a photographer's stamp, Y. Bello, 1983.", say: "On the back of the portrait: a stamp. Y. Bello, 1983.", scene: "His stamp, on the back." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "pen", object: "the pen Yusuf signs with", slide: 3, house: "Asunma / Elite Eid" }],
      alux: {
        product: "Asunma / Elite Eid", where: "Hajiya Hauwa's Eid portrait at twenty, taken by Yusuf's grandfather, slide 4",
        word: "BOOK", line: "Forty years on, that Eid portrait still stops a room. Comment BOOK and we'll make yours.",
      },
    },

    // ── Episode 5 (Storm): everyone at the wall at dawn, and Hajiya's answer.
    {
      n: 5, after: "*.STAY", title: "In the Way",
      slides: [
        { kind: "cover", see: "Zainab and Yusuf standing side by side in front of a yellow bulldozer at the old house's wall at dawn. Caption space: top third.", say: "" },
        { kind: "time", see: "The lane outside the old house at 6:55 a.m., harmattan haze, the bulldozer's headlights on.", say: "6:55 a.m. The flight leaves without him.", scene: "Bulldozer lights in the haze." },
        { kind: "beat", who: "yusuf", see: "Yusuf standing beside Zainab in front of the bulldozer, his laptop bag dropped in the dust, the Eid portrait back on the wall behind them.", say: "Yusuf stands beside her. His Lagos bag in the dust.", scene: "Two people. One wall." },
        { kind: "line", who: "garba", see: "Alhaji Garba stepping out of his car and seeing his nephew in front of the bulldozer.", say: "“Yusuf. Move. Or you are no family of mine.”", scene: "His uncle's car door." },
        { kind: "beat", who: "mason", see: "Malam Sule and the other workers putting down their hammers one by one and stepping beside Zainab.", say: "Malam Sule puts down his hammer. Then the others do.", scene: "Hammers down, one by one." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "bag", object: "Yusuf's laptop bag in the dust", slide: 3, house: "Noir Director Editorial" }],
      alux: { product: "Asunma / Elite Eid", where: "the Eid portrait back on the old wall behind them, slide 3" },
    },
    {
      n: 5, after: "*.FLY", title: "The Unread Letter",
      slides: [
        { kind: "cover", see: "Yusuf in a plane seat by the window, reading an old letter, the Kano runway in harmattan haze outside. Caption space: top third.", say: "" },
        { kind: "time", see: "Kano airport at 6:50 a.m., a plane at the gate, pale haze over the runway.", say: "Kano airport. 6:50 a.m. Seat 14A. Doors closing.", scene: "A window seat. Haze outside." },
        { kind: "text", see: "Close on the old letter in his hands, his grandfather's handwriting, a small Eid photograph folded inside.", say: "The letter: “Grandson, don't do what I did. Send it.”", scene: "His grandfather's hand." },
        { kind: "beat", who: "yusuf", see: "Yusuf standing up as the doors close and walking down the aisle against the crew.", say: "Yusuf stands up as the doors close. He walks off.", scene: "Against the aisle." },
        { kind: "beat", who: "yusuf", see: "A taxi racing through the old city gates in the haze, Yusuf in the back seat, 7:10 on the dashboard clock.", say: "7:10 a.m. A taxi through the old city gates.", scene: "Through the gates. Too late?" },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "taxi", object: "the taxi through the old city gates", slide: 5, house: "Noir Director Editorial" }],
      alux: { product: "Asunma / Elite Eid", where: "the small Eid photograph folded inside the grandfather's letter, slide 3" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.SAY", title: "Out Loud",
      slides: [
        { kind: "cover", see: "Zainab and Yusuf in the courtyard months later, fresh mud plaster glowing in late light, the carved doorway repaired. Caption space: top third.", say: "" },
        { kind: "time", see: "The lane outside the house three months later, scaffolding where the bulldozer stood, warm afternoon light.", say: "Three months later. The same lane. Scaffolding, not bulldozers.", scene: "Scaffolding in warm light." },
        { kind: "line", who: "zainab", see: "Zainab meeting Yusuf at the gate in a hard hat, a tape measure in hand, teasing, scaffolding behind her.", say: "“Mr Bello? I'm the architect. I'm here to put it back up.”", scene: "A hard hat. A tape measure." },
        { kind: "beat", who: "yusuf", see: "Yusuf on a ladder fixing the carved lintel, Zainab steadying it from below.", say: "She said it in front of everyone. He stayed.", scene: "A ladder. A lintel. Him." },
        { kind: "beat", who: "garba", see: "Alhaji Garba at the gate holding a framed copy of the old deed, handing it to Hajiya Hauwa with a small bow.", say: "Alhaji Garba brings the deed back, framed. A small bow.", scene: "A framed deed. A bow." },
        { kind: "beat", who: "hauwa", see: "Hajiya Hauwa and Zainab in white and indigo posing for a new Eid portrait in the restored doorway, a photographer's softbox to one side, warm key light.", say: "Next Eid, a new portrait. Hajiya and Zainab, in the same doorway.", scene: "The same doorway. A new portrait." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "hat", object: "Zainab's hard hat at the gate", slide: 3, house: "Noir Director Editorial" }],
      alux: {
        product: "Asunma / Elite Eid", where: "the new Eid portrait of Hajiya Hauwa and Zainab in the restored doorway, slide 6",
        word: "BOOK", line: "A new Eid portrait in the same doorway. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.WRITE", title: "Posted",
      slides: [
        { kind: "cover", see: "Yusuf at the old house's gate holding an opened letter, Zainab watching from the doorway, scaffolding going up. Caption space: top third.", say: "" },
        { kind: "time", see: "The lane outside the house three months later, scaffolding where the bulldozer stood, warm afternoon light.", say: "Three months later. The same lane. Scaffolding, not bulldozers.", scene: "Scaffolding in warm light." },
        { kind: "text", see: "Close on Zainab's letter in Yusuf's hand, her handwriting, a postmark.", say: "Her letter: “Come back. Help me put it back up.”", scene: "Her handwriting. A postmark." },
        { kind: "line", who: "zainab", see: "Zainab meeting Yusuf at the gate in a hard hat, a tape measure in hand, teasing.", say: "“Mr Bello? I'm the architect. I'm here to put it back up.”", scene: "A hard hat. A tape measure." },
        { kind: "beat", who: "garba", see: "Alhaji Garba at the gate holding a framed copy of the old deed, handing it to Hajiya Hauwa with a small bow.", say: "Alhaji Garba brings the deed back, framed. A small bow.", scene: "A framed deed. A bow." },
        { kind: "beat", who: "hauwa", see: "Hajiya Hauwa and Zainab in white and indigo posing for a new Eid portrait in the restored doorway, a photographer's softbox to one side, warm key light.", say: "Next Eid, a new portrait. Hajiya and Zainab, in the same doorway.", scene: "The same doorway. A new portrait." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "hat", object: "Zainab's hard hat at the gate", slide: 4, house: "Noir Director Editorial" }],
      alux: {
        product: "Asunma / Elite Eid", where: "the new Eid portrait of Hajiya Hauwa and Zainab in the restored doorway, slide 6",
        word: "BOOK", line: "A new Eid portrait in the same doorway. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
