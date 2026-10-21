// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", who: "chuka", see: "A suya spot in Wuse 2 at night, smoke and orange grill light; a man in a rumpled linen shirt with two phones and a press card sits down at Halima's table.", say: "Wuse 2, night. A man with two phones sits at her table.", scene: "Suya smoke. Two phones." },
  { kind: "cliff", who: "chuka", see: "Chuka leaning in under the grill light, sliding his press card across the plastic table to her.", say: "“I'm C. I put the file on your desk.”", scene: "A press card, slid across." },
  { kind: "choice", see: "Close on the press card on the plastic table between Halima's hand and Chuka's, suya smoke drifting through the orange light.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Does Halima work with Chuka?", options: [{ word: "TRUST", label: "Work with him" }, { word: "ALONE", label: "Do it alone" }] },
  branches: {
    TRUST: "Chuka shows her everything he has: her father's signature on six more allocations, all in Maitama, all after he died.",
    ALONE: "Halima walks out on Chuka. At 2 a.m. she lets herself into the records room with her father's old key.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "asabe", see: "Halima's family parlour at 4 a.m., lights off, her mother sitting upright in the dark in a wine-coloured abaya, prayer beads moving.", say: "Home, 4 a.m. Her mother is waiting in the dark.", scene: "Dark parlour. Moving beads." },
  { kind: "cliff", who: "asabe", see: "Hajiya Asabe in the light from the open door, bangles still, holding one page of the file out to her daughter.", say: "“Stop digging, Halima. I signed the first page.”", scene: "One page, held out." },
  { kind: "choice", see: "Close on Halima's hand taking the page, her father's gold watch on her wrist, her mother's signature at the bottom.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "What does Halima do with her mother's page?", options: [{ word: "PROTECT", label: "Keep her mother out" }, { word: "TRUTH", label: "Keep her page in" }] },
  branches: {
    PROTECT: "Halima tears her mother's page out of the file. The next morning, Director Coker asks her for it by name.",
    TRUTH: "Halima keeps her mother's page in the file. Her mother packs one bag and leaves for Kano that night.",
  },
};

const EP4_ENDING = [
  { kind: "line", who: "musa", see: "The ministry car park at dusk: Musa leaning on his spotless car, taking off his sunglasses for the first time, Halima stopping beside him.", say: "“I drove him to the shredding room. He kept one page.”", scene: "Sunglasses off. A spotless car." },
  { kind: "cliff", see: "Close on an official notice pinned on the ministry board: the Maitama land sale to be signed by the Minister, Friday, 9 a.m.", say: "The sale of her father's land: signed Friday, 9 a.m.", scene: "A notice. Friday, 9 a.m." },
  { kind: "choice", see: "Halima in the empty car park at night, the red file in one hand, Chuka's press card in the other.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "clock" },
  choice: { question: "How does Halima stop Friday's signing?", options: [{ word: "PRESS", label: "Chuka publishes tonight" }, { word: "COURT", label: "Court order by morning" }] },
  branches: {
    PRESS: "Chuka publishes at midnight. By 8 a.m. every phone in Abuja has the story — and Director Coker is at Halima's door.",
    COURT: "Halima files at the Federal High Court at 8 a.m. The clerk takes the file, then steps out to make a call.",
  },
};

const EP5_ENDING = [
  { kind: "beat", who: "coker", see: "The Minister's conference room at 9 a.m., a long table, flags, the sale papers laid out; Director Coker uncapping a gold pen.", say: "9 a.m. The Minister's room. Director Coker uncaps his pen.", scene: "Flags. Papers. A gold pen." },
  { kind: "cliff", who: "asabe", see: "The double doors opening behind Coker: Hajiya Asabe walks in, prayer beads in hand, and takes the witness chair at his side.", say: "The doors open. His witness: Halima's mother.", scene: "Her mother, at his side." },
  { kind: "choice", see: "Halima standing at the far end of the long table with the red file, Musa a step behind her by the door.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Who does Halima call to speak first?", options: [{ word: "MUSA", label: "Musa, the driver" }, { word: "MOTHER", label: "Her mother" }] },
  branches: {
    MUSA: "Musa takes off his cap and tells the room where he drove the Director that night.",
    MOTHER: "Halima asks her mother, in front of everyone, to tell the truth. Her mother puts down her prayer beads.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", see: "Halima's new office three months later, a fresh red file open on her desk: Chuka's press photo clipped to a bank transfer slip.", say: "A new red file. Inside: Chuka's photo, and a payment.", scene: "A new file. His photo." },
  { kind: "choice", see: "Close on Halima's hand on the new red file, her father's gold watch on her wrist, her phone showing a message from Chuka.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "reveal" },
  choice: { question: "Does Halima tell Chuka about the file?", options: [{ word: "TELL", label: "Tell him" }, { word: "HIDE", label: "Keep it quiet" }] },
  branches: {
    TELL: "Season two: Chuka reads the file, goes quiet, and disappears that night.",
    HIDE: "Season two: Halima starts digging into the man who gave her the truth.",
  },
};

export default {
  slug: "the-fourth-floor",
  title: "The Fourth Floor",
  tagline: "A red file. Her father's name inside.",
  genre: "political",
  city: "Abuja",
  logline: "Halima is a junior lawyer in a federal ministry. A red file lands on her desk that was never meant to exist — with her late father's signature inside.",
  minVotes: 2,
  cast: [
    { key: "halima", name: "Halima Sani", age: 28, role: "Legal officer, Ministry of Lands", archetype: "The Sage", side: "light", tier: "lead", open: true,
      look: "Slender, deep-green hijab, black blazer, reading glasses pushed up, a thin gold watch that was her father's.",
      want: "To clear her father's name.", secret: "She took this job to find this file." },
    { key: "coker", name: "Director Femi Coker", age: 53, role: "Director, Land Allocation", archetype: "The Visionary", side: "too much", tier: "main", open: true,
      look: "Polished, grey goatee, French-cuff shirt, a car key he turns in his fingers when he lies.",
      want: "To retire rich and untouched.", secret: "He signed her father's name himself." },
    { key: "chuka", name: "Chuka Nwosu", age: 35, role: "Investigative journalist", archetype: "The Rebel", side: "light", tier: "main", open: true,
      look: "Rumpled linen shirt, press card on a lanyard, two phones, a rucksack that is always open.",
      want: "The story of his career.", secret: "He is the one who put the file on her desk." },
    { key: "asabe", name: "Hajiya Asabe Sani", age: 59, role: "Halima's mother", archetype: "The Guardian", side: "too much", tier: "main", open: true,
      look: "Elegant, wine-coloured abaya, gold bangles, a prayer bead strand always in her hand.",
      want: "Her daughter to stop digging.", secret: "She signed the land away to save the family." },
    { key: "musa", name: "Musa", age: 41, role: "The ministry driver", archetype: "The Companion", side: "light", tier: "cameo", open: true,
      look: "Neat white kaftan and cap, sunglasses on his head, a car that is cleaner than any office.",
      want: "To stay invisible.", secret: "He drove the Director to the shredding room last night." },
  ],
  episodes: [
    {
      n: 1,
      title: "Room 412",
      slides: [
        { kind: "cover", see: "Halima alone in a long grey corridor of identical doors, holding a red file against her chest, one fluorescent light flickering above her. Caption space: top third.", say: "" },
        { kind: "time", see: "Abuja at dusk: the Central Area towers in orange haze, Aso Rock a dark shape behind them, traffic thinning.", say: "Abuja. Central Area. 6:15 p.m. Everyone has gone home.", scene: "Orange haze. Aso Rock." },
        { kind: "beat", see: "A red file on a tidy desk, no reference number, a fresh coffee ring on its cover. Beside it, Halima's framed call-to-bar photograph in wig and gown.", say: "A red file. No number. Still warm from someone's hands.", scene: "A red file. A coffee ring." },
        { kind: "beat", see: "The file open: a land map of Maitama and her father's photograph clipped to a signed allocation.", say: "Her father. Twelve years dead. Signing for land he never owned.", scene: "Her father's face. His signature." },
        { kind: "line", who: "coker", see: "Director Coker in the doorway, coat on, turning his car key slowly.", say: "“Working late is how people get promoted, Halima. Or forgotten.”", scene: "A car key, turning." },
        { kind: "text", see: "Halima's phone face-up on the file: a message from an unknown number.", say: "“Don't take it home. They search bags tonight. —C”", scene: "Unknown number. One warning." },
        { kind: "cliff", who: "coker", see: "The lift doors open. The Director is inside, holding the door for her, smiling; the red file is under her arm.", say: "“Going down?”", scene: "The lift. His smile." },
        { kind: "choice", see: "Close on Halima's hand tightening on the red file in the lift's light.", say: "" },
      ],
      cliff: { type: "arrival" },
      choice: {
        question: "Does Halima carry the file out?",
        options: [{ word: "TAKE", label: "Take it home" }, { word: "LEAVE", label: "Leave it behind" }],
      },
      branches: {
        TAKE: "At the gate the guards search every bag for the first time in years. Musa the driver opens his boot for her and says nothing.",
        LEAVE: "In the morning the file is gone. On her desk is a promotion letter — and her mother's signature on a page she has never seen.",
      },
      slots: [
        { key: "coffee", object: "the coffee cup that left the ring on the file", slide: 3, house: "Call to Bar — The New Wig (Female)" },
        { key: "phone", object: "Halima's phone on the file", slide: 6, house: "Instagram GIF Maker" },
      ],
      alux: { product: "Call to Bar — The New Wig (Female)", where: "Halima's framed call-to-bar portrait on her desk, slide 3" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): the stamp on the allocation, and who "C" is.
    {
      n: 2, after: "TAKE", title: "The Boot",
      slides: [
        { kind: "cover", see: "Musa holding his car boot open at the ministry gate at night, the red file hidden under a spare tyre cover, guards searching bags in the floodlight. Caption space: top third.", say: "" },
        { kind: "time", see: "The ministry gate at 6:40 p.m., hard white floodlights, guards in a line searching every bag, a queue of staff.", say: "The gate. 6:40 p.m. They search every bag tonight.", scene: "White floodlights. Open bags." },
        { kind: "beat", who: "musa", see: "Musa closing the boot over the file and waving Halima into the back seat, his face giving nothing away.", say: "Musa opens his boot for her. He says nothing.", scene: "A closed boot. No words." },
        { kind: "beat", who: "halima", see: "Halima at her kitchen table at night, photographing each page; one photo of the allocation too dark to read the stamp.", say: "At home she photographs every page. One is too dark to read.", scene: "A kitchen table. Dark photos." },
        { kind: "text", who: "halima", see: "Halima relighting the dark photo on her phone: the stamp now sharp — a date in 2016.", say: "Relit, the stamp is clear: 2016. Her father died in 2014.", scene: "Relit: a date stamp." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "car", object: "Musa's spotless car", slide: 3, house: "Noir Director Editorial" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Halima relights the dark photo of the allocation and reads the stamp, slide 5",
        word: "LIGHT", line: "One photo too dark to read, until she relit it. Comment LIGHT and we'll relight yours.",
      },
    },
    {
      n: 2, after: "LEAVE", title: "Promoted",
      slides: [
        { kind: "cover", see: "Halima at her desk in the morning holding a promotion letter in one hand and an unfamiliar page in the other, the red file gone. Caption space: top third.", say: "" },
        { kind: "time", see: "The fourth floor at 8 a.m., sun through dusty blinds, cleaners finishing, the desk where the red file was now empty.", say: "8 a.m. The red file is gone. Something else isn't.", scene: "Dusty blinds. An empty desk." },
        { kind: "text", see: "Close on a ministry letterhead: a promotion to Senior Legal Officer, effective today, signed by Director Coker.", say: "A promotion. Effective today. Signed by Director Coker.", scene: "A letter. His signature." },
        { kind: "beat", who: "halima", see: "Under the letter, a page she has never seen: a land transfer with her mother's signature at the bottom.", say: "Under it, a page she has never seen. Her mother's signature.", scene: "Her mother's signature." },
        { kind: "text", who: "halima", see: "Halima relighting a dark phone photo she took of the file last night: the stamp on her father's allocation now sharp — 2016.", say: "She relights last night's photo. The stamp: 2016. He died in 2014.", scene: "Relit: a date stamp." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "blinds", object: "the office blinds and the morning light", slide: 2, house: "Noir Director Editorial" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Halima relights last night's dark photo of the allocation and reads the stamp, slide 5",
        word: "LIGHT", line: "One photo too dark to read, until she relit it. Comment LIGHT and we'll relight yours.",
      },
    },

    // ── Episode 3 (Turn): what Halima finds, and what her mother did.
    {
      n: 3, after: "*.TRUST", title: "Six Signatures",
      slides: [
        { kind: "cover", see: "Halima and Chuka in his cramped flat before a wall of pinned allocations joined by red string, one desk lamp. Caption space: top third.", say: "" },
        { kind: "time", see: "Chuka's flat in Garki at 1 a.m., papers everywhere, two phones charging, a desk lamp making a pool of yellow light.", say: "Garki. 1 a.m. Chuka's wall of paper.", scene: "One lamp. A wall of paper." },
        { kind: "beat", who: "chuka", see: "Chuka pointing along the wall: her father's signature on six allocations, every date after 2014.", say: "Her father's signature, six more times. All after he died.", scene: "Six signatures. Red string." },
        { kind: "line", who: "chuka", see: "Chuka tapping one company name circled in red at the centre of the string.", say: "“Every plot went to one company. Owned by the Director's wife.”", scene: "One company, circled red." },
        { kind: "beat", who: "halima", see: "Halima photographing the wall piece by piece under the desk lamp, Chuka asleep in his chair behind her.", say: "She photographs the whole wall, piece by piece, till 3 a.m.", scene: "Piece by piece. Till 3 a.m." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "lamp", object: "the desk lamp in Chuka's flat", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Call to Bar — The New Wig (Female)", where: "Halima's call-to-bar photo pinned on Chuka's wall among the papers, slide 3" },
    },
    {
      n: 3, after: "*.ALONE", title: "Records Room",
      slides: [
        { kind: "cover", see: "Halima in a dark records room at 2 a.m., a phone torch on endless shelves of files, an old brass key in the door behind her. Caption space: top third.", say: "" },
        { kind: "time", see: "The ministry basement at 2 a.m., one emergency light, the records room door ajar, a brass key in the lock.", say: "2 a.m. The basement. Her father's old key still works.", scene: "Emergency light. A brass key." },
        { kind: "text", who: "halima", see: "Close on the shredding-room log under her phone torch: last night's only entry, Director F. Coker, 7:10 p.m.", say: "The shredding log. Last night, 7:10 p.m.: Director Coker.", scene: "One entry. His name." },
        { kind: "beat", who: "halima", see: "Footsteps in the corridor; Halima switching off her torch and pressing back between two shelves in the dark.", say: "Footsteps in the corridor. She kills her torch.", scene: "Darkness between the shelves." },
        { kind: "beat", who: "musa", see: "A guard's torch sweeping past the shelves; walking behind the guard, Musa, looking straight at her in the dark.", say: "A guard's torch sweeps past. Behind him, Musa looks right at her.", scene: "A torch beam. Musa's eyes." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "torch", object: "Halima's phone torch", slide: 3, house: "Noir Director Editorial" }],
      alux: { product: "Call to Bar — The New Wig (Female)", where: "the call-to-bar photo on Halima's phone lock screen as the torch switches off, slide 5" },
    },

    // ── Episode 4 (Cost): what the choice costs, and the driver's confession.
    {
      n: 4, after: "*.PROTECT", title: "By Name",
      slides: [
        { kind: "cover", see: "Director Coker behind his wide desk, Halima standing before it, her framed call-to-bar portrait in his hands. Caption space: top third.", say: "" },
        { kind: "time", see: "The Director's corner office at 10 a.m., Abuja's towers in the glass, a flag in the corner, air-conditioning humming.", say: "The Director's office. 10 a.m. He sent for her.", scene: "Tall glass. A flag." },
        { kind: "line", who: "coker", see: "Director Coker turning his car key, smiling, holding out his other hand.", say: "“Your mother's page, Halima. Give it to me.”", scene: "A key turning. A hand out." },
        { kind: "beat", who: "coker", see: "Coker lifting her framed call-to-bar portrait from her own desk, studying it: Halima in wig and gown, her father's watch on her wrist, her mother beside her.", say: "He picks up her call-to-bar portrait. Her mother is in it.", scene: "Wig, gown, her mother beside." },
        { kind: "line", who: "coker", see: "Coker setting the portrait down face up, very gently, between them.", say: "“Mothers sign things to protect daughters. Daughters should return the favour.”", scene: "The portrait, set down gently." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "key", object: "the Director's car key", slide: 3, house: "Noir Director Editorial" }],
      alux: {
        product: "Call to Bar — The New Wig (Female)", where: "Halima's call-to-bar portrait in wig and gown, her mother beside her, slide 4",
        word: "BOOK", line: "The day she wore the wig, her mother stood beside her. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 4, after: "*.TRUTH", title: "The Kano Bus",
      slides: [
        { kind: "cover", see: "Hajiya Asabe boarding a night bus to Kano with one bag, Halima on the dark platform, neither waving. Caption space: top third.", say: "" },
        { kind: "time", see: "Jabi motor park at 11 p.m., a night bus to Kano with its engine running, sodium lights, hawkers packing up.", say: "Jabi motor park. 11 p.m. The night bus to Kano.", scene: "Sodium lights. An engine running." },
        { kind: "line", who: "asabe", see: "Hajiya Asabe on the bus step, bangles silent, not looking back.", say: "“You chose your father. I hope he is worth it.”", scene: "Bangles silent. No goodbye." },
        { kind: "beat", who: "halima", see: "Halima at home alone with her framed call-to-bar portrait: herself in wig and gown, her mother beside her, crying with pride.", say: "At home, her call-to-bar portrait. Her mother cried that day.", scene: "Wig, gown, her mother beside." },
        { kind: "beat", who: "halima", see: "The fourth floor next day: colleagues turning back to their screens as Halima walks past, a whisper behind a hand.", say: "Next day at work, nobody will look at her.", scene: "Turned backs. One whisper." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "bus", object: "the night bus to Kano", slide: 2, house: "Noir Director Editorial" }],
      alux: {
        product: "Call to Bar — The New Wig (Female)", where: "Halima's call-to-bar portrait in wig and gown, her mother beside her, slide 4",
        word: "BOOK", line: "The day she wore the wig, her mother stood beside her. Comment BOOK and we'll make yours.",
      },
    },

    // ── Episode 5 (Storm): the truth goes out, and the signing room.
    {
      n: 5, after: "*.PRESS", title: "Midnight Edition",
      slides: [
        { kind: "cover", see: "Chuka at his laptop at midnight, finger over the publish button, Halima beside him, phones lighting their faces blue. Caption space: top third.", say: "" },
        { kind: "time", see: "Chuka's flat at midnight, the laptop glow the only light, the story open on screen with her father's photograph.", say: "Midnight. Chuka presses publish.", scene: "Laptop glow. Her father's face." },
        { kind: "beat", see: "Abuja at dawn: phones in a bus, a newsstand, a ministry lift, all showing the same headline and her father's face.", say: "By 8 a.m., every phone in Abuja has her father's face.", scene: "One headline. Every phone." },
        { kind: "line", who: "coker", see: "Director Coker at Halima's door at 8 a.m., calm, car key turning, his driver's car behind him.", say: "“You've made your father famous. Come and watch the signing.”", scene: "At her door. Key turning." },
        { kind: "beat", who: "musa", see: "Musa at the wheel of the Director's car, meeting Halima's eyes in the mirror as she gets in.", say: "Musa drives them both. In the mirror, he nods at her.", scene: "A mirror. One nod." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "laptop", object: "Chuka's laptop", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Call to Bar — The New Wig (Female)", where: "Halima's call-to-bar portrait used in the published story beside her father's photo, slide 3" },
    },
    {
      n: 5, after: "*.COURT", title: "The Clerk",
      slides: [
        { kind: "cover", see: "Halima on the steps of the Federal High Court at 8 a.m. in her wig and gown, the red file under her arm. Caption space: top third.", say: "" },
        { kind: "time", see: "The Federal High Court, Abuja, at 8 a.m., white columns in hard morning sun, lawyers in black gowns climbing the steps.", say: "Federal High Court. 8 a.m. The signing is at nine.", scene: "White columns. Black gowns." },
        { kind: "beat", see: "A court clerk taking the file across the counter, then stepping into a back corridor with his phone to his ear.", say: "The clerk takes her file. Then steps out to make a call.", scene: "A counter. A phone call." },
        { kind: "line", who: "coker", see: "Director Coker on the court steps, coat over his arm, car key turning, as Halima comes out.", say: "“Courts are slow, Halima. Signings are at nine.”", scene: "On the steps. Key turning." },
        { kind: "beat", who: "musa", see: "Musa pulling up at the court steps and opening the back door for Halima, not for the Director.", say: "Musa pulls up. He opens the door for her, not him.", scene: "An open door. Her, not him." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "car", object: "Musa's spotless car at the court steps", slide: 5, house: "Noir Director Editorial" }],
      alux: { product: "Call to Bar — The New Wig (Female)", where: "Halima in wig and gown on the court steps, slide 1" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.MUSA", title: "The Driver",
      slides: [
        { kind: "cover", see: "Musa standing at the long conference table, cap in his hands, every face turned to him, Coker's gold pen frozen. Caption space: top third.", say: "" },
        { kind: "time", see: "The Minister's conference room at 9:07 a.m., flags, cold air-conditioning, the sale papers still unsigned.", say: "9:07 a.m. The papers are still unsigned.", scene: "Flags. Unsigned papers." },
        { kind: "line", who: "musa", see: "Musa holding his cap in both hands, voice steady, looking straight at the Minister.", say: "“I drove him to the shredding room. He kept one page.”", scene: "Cap in hand. Voice steady." },
        { kind: "beat", who: "asabe", see: "Director Coker's car key going still in his fingers; Hajiya Asabe rising from the witness chair and crossing to Halima's side.", say: "His car key stops turning. Her mother crosses to Halima's side.", scene: "A still key. A mother crossing." },
        { kind: "line", who: "halima", see: "Halima facing Coker as security walk him out, the red file closed in her hands.", say: "“Working late is how people get promoted, Director. Or forgotten.”", scene: "Security at the door." },
        { kind: "beat", who: "halima", see: "Three months later: Halima's editorial portrait on a newspaper front page — black blazer, green hijab, her father's watch — under dramatic side light, a newsstand in Wuse.", say: "Three months later: her portrait on the front page.", scene: "A front page. Her face." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "pen", object: "the Director's gold pen", slide: 2, house: "Call to Bar — The New Wig (Female)" }],
      alux: {
        product: "Noir Director Editorial", where: "Halima's editorial portrait on the newspaper front page, slide 6",
        word: "BOOK", line: "A front-page portrait for the woman who cleared her father's name. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.MOTHER", title: "Her Mother's Voice",
      slides: [
        { kind: "cover", see: "Hajiya Asabe standing at the long conference table, prayer beads laid down before her, every face turned to her. Caption space: top third.", say: "" },
        { kind: "time", see: "The Minister's conference room at 9:07 a.m., flags, cold air-conditioning, the sale papers still unsigned.", say: "9:07 a.m. The papers are still unsigned.", scene: "Flags. Unsigned papers." },
        { kind: "line", who: "asabe", see: "Hajiya Asabe, her prayer beads on the table, looking only at her daughter.", say: "“He threatened my daughter, so I signed. My husband never did.”", scene: "Beads down. Eyes on Halima." },
        { kind: "beat", who: "coker", see: "Director Coker's car key going still in his fingers, the Minister sliding the papers away from him.", say: "His car key stops turning. The Minister takes the papers.", scene: "A still key." },
        { kind: "line", who: "halima", see: "Halima facing Coker as security walk him out, the red file closed in her hands.", say: "“Working late is how people get promoted, Director. Or forgotten.”", scene: "Security at the door." },
        { kind: "beat", who: "halima", see: "Three months later: Halima's editorial portrait on a newspaper front page — black blazer, green hijab, her father's watch — under dramatic side light, a newsstand in Wuse.", say: "Three months later: her portrait on the front page.", scene: "A front page. Her face." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "pen", object: "the Director's gold pen", slide: 2, house: "Call to Bar — The New Wig (Female)" }],
      alux: {
        product: "Noir Director Editorial", where: "Halima's editorial portrait on the newspaper front page, slide 6",
        word: "BOOK", line: "A front-page portrait for the woman who cleared her father's name. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
