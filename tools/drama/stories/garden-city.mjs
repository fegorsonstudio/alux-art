// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", who: "amara", see: "Amara at the gate under the rain-heavy mango trees, the faded photograph in her hand; a black car with no plates rolling up, headlights cutting the rain.", say: "At the gate, a black car with no plates. It waits.", scene: "Rain. A car with no plates." },
  { kind: "cliff", see: "A man in a dark suit stepping out of the car with an umbrella he doesn't offer her; Ibiere watching from the tall window above, lamp-lit.", say: "A man steps out: “Miss Amara? Your brother Soye sent us.”", scene: "An umbrella he doesn't offer." },
  { kind: "choice", see: "Ibiere at the rain-streaked window: her father's watch, her coral beads, the black car below.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Does Ibiere go out to Amara or face Soye?", options: [{ word: "GUARD", label: "Go out to Amara" }, { word: "FACE", label: "Face Soye" }] },
  branches: {
    GUARD: "Ibiere walks into the rain and stands between Amara and the men. She tells them who really signs for Briggs Shipping.",
    FACE: "Ibiere takes Soye's phone in front of everyone. The messages show the debt — and who he promised Amara's share to.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "tonye", see: "In the Chief's study by lamplight, Tonye pulling a wrapped canvas from behind a cupboard, dust on his borrowed black shirt.", say: "Tonye pulls a canvas from behind Papa's cupboard. His own work.", scene: "The study. A hidden canvas." },
  { kind: "cliff", who: "tonye", see: "The canvas unwrapped: a portrait of a teenage Amara in a blue dress, signed by Tonye, dated ten years ago; Ibiere's face in the warm lamplight.", say: "“Papa paid me to paint her, ten years ago. I promised.”", scene: "Amara at fourteen. His signature." },
  { kind: "choice", see: "Close on Tonye's signature in the corner of the canvas and Ibiere's hand, her father's watch, reaching toward it.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Who does Ibiere ask for the whole truth?", options: [{ word: "UDO", label: "Ask the barrister" }, { word: "BOMA", label: "Ask Mama Boma" }] },
  branches: {
    UDO: "Barrister Udo opens the second envelope from her bag. It is a letter to Ibiere — about the six years she ran the company.",
    BOMA: "Mama Boma sits down for the first time in forty years and tells Ibiere what happened to the first wife.",
  },
};

const EP4_ENDING = [
  { kind: "beat", who: "ibiere", see: "Friday at the Briggs Shipping office in Trans-Amadi: Ibiere at her desk below a wall of framed directors' portraits — none of them hers. Hard daylight through the blinds.", say: "Friday. Trans-Amadi. Six years at this desk. Not one portrait of her.", scene: "A wall of portraits. None hers." },
  { kind: "cliff", who: "soye", see: "The office door opening: Soye walking in with the man in the dark suit and two others, rain on their shoulders.", say: "“Sign my share over to them, Ibiere. Or they take the ships.”", scene: "Soye walks in. Not alone." },
  { kind: "choice", see: "Close on a pen and a share-transfer form on Ibiere's desk, her coral beads reflected in the glass top.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Does Ibiere pay her brother's debt?", options: [{ word: "PAY", label: "Pay his debt" }, { word: "CUT", label: "Cut him off" }] },
  branches: {
    PAY: "Ibiere pays the forty million from her own six years of savings. The men leave. Soye cannot look at her.",
    CUT: "Ibiere refuses and calls the port police; Amara recorded every word on her phone. The men are stopped at the gate.",
  },
};

const EP5_ENDING = [
  { kind: "line", who: "amara", see: "The whole family in the drawing room at dusk, the rain finally over; Amara standing with the will in her hand, facing Ibiere, warm lamps and blue window light.", say: "“Not his ships. I want a sister. Run it with me.”", scene: "Amara holds out the will." },
  { kind: "cliff", who: "udo", see: "Barrister Udo reading the final page under the father's oil portrait, glasses low, every face turned to her.", say: "“And if Ibiere asks for the company, it is hers alone.”", scene: "The final page. Under his portrait." },
  { kind: "choice", see: "Close on Ibiere's hands: her father's watch on one wrist, the coral beads held in the other.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Does Ibiere share the company or claim it?", options: [{ word: "SHARE", label: "Run it together" }, { word: "CLAIM", label: "Ask for it alone" }] },
  branches: {
    SHARE: "Ibiere takes Amara's hand. The sign over the Trans-Amadi gate changes to carry both mothers' names.",
    CLAIM: "Ibiere asks for the company — and takes it. Then she makes Amara an offer no lawyer saw coming.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", who: "boma", see: "Sunday lunch in the Old GRA dining room: Mama Boma setting cups on the silver tray — five cups; the four siblings looking at one another.", say: "Sunday lunch. Mama Boma sets five cups. Nobody asks why.", scene: "Five cups on the tray." },
  { kind: "choice", see: "Close on the fifth cup on the silver tray, steam rising, an empty chair beyond it.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "reveal" },
  choice: { question: "Does Ibiere ask Mama Boma about the fifth cup?", options: [{ word: "ASK", label: "Ask her now" }, { word: "WAIT", label: "Wait and see" }] },
  branches: {
    ASK: "Season two: Mama Boma says the fifth cup was never for a child. It is for the Chief — who is not dead.",
    WAIT: "Season two: halfway through lunch the doorbell rings, and Mama Boma goes to answer it before anyone else can.",
  },
};

export default {
  slug: "garden-city",
  title: "Garden City",
  tagline: "The will was read. One heir was missing.",
  genre: "family",
  city: "Port Harcourt",
  logline: "Shipping magnate Chief Tamuno Briggs is dead. His three children gather in Old GRA to hear his will. The lawyer reads four names.",
  minVotes: 2,
  cast: [
    { key: "ibiere", name: "Ibiere Briggs", age: 38, role: "The eldest daughter", archetype: "The Oga", side: "light", tier: "lead", open: true,
      look: "Strong jaw, hair in a sleek bun, black lace iro and buba for mourning, coral beads at her throat, her father's watch on her wrist.",
      want: "To keep the company her father never let her run in name.", secret: "She has run it in secret for six years." },
    { key: "soye", name: "Soye Briggs", age: 33, role: "The charming son", archetype: "The Lover", side: "too much", tier: "main", open: true,
      look: "Handsome, beard trimmed sharp, black senator suit, a phone he keeps turning face down.",
      want: "His share, today.", secret: "He owes dangerous people forty million naira." },
    { key: "tonye", name: "Tonye Briggs", age: 27, role: "The youngest, a painter", archetype: "The Maker", side: "too little", tier: "main", open: true,
      look: "Slim, locs tied back, paint under his nails, a borrowed black shirt too big for him.",
      want: "To leave before anyone asks about his work.", secret: "He painted the stranger's portrait — years ago." },
    { key: "udo", name: "Barrister Ekanem Udo", age: 56, role: "The family lawyer", archetype: "The Sage", side: "light", tier: "main", open: true,
      look: "Precise, grey bob, black gown over a cream suit, a sealed envelope held in both hands.",
      want: "To read the will exactly as written.", secret: "There is a second envelope in her bag." },
    { key: "amara", name: "Amara", age: 24, role: "The fourth heir", archetype: "The Innocent", side: "light", tier: "lead", open: true,
      look: "Young, rain-wet, plain blue dress, a faded photograph held to her chest, her father's eyes.",
      want: "To be seen once by the family that never knew her.", secret: "Her mother was the Chief's first wife." },
    { key: "boma", name: "Mama Boma", age: 63, role: "The housekeeper", archetype: "The Guardian", side: "light", tier: "cameo", open: true,
      look: "Small and solid, white wrapper and blouse, a tray of tea cups, eyes that miss nothing.",
      want: "To serve this family one last time.", secret: "She set a fourth cup because she always knew." },
  ],
  episodes: [
    {
      n: 1,
      title: "The Reading",
      slides: [
        { kind: "cover", see: "Three siblings on a long carved sofa under a large oil portrait of their father; an empty armchair faces them. Rain on tall windows. Caption space: top third, the dark ceiling.", say: "" },
        { kind: "time", see: "Old GRA, Port Harcourt: a colonial house with white columns in heavy rain, a black Mercedes in the drive, mango trees bending.", say: "Old GRA, Port Harcourt. Rain. The house is too quiet.", scene: "White columns. Heavy rain." },
        { kind: "beat", who: "boma", see: "Mama Boma setting cups on a silver tray. Four cups, not three. The father's restored wedding photograph in a frame beside the tray.", say: "Mama Boma sets four cups. Nobody asks why.", scene: "Four cups on a silver tray." },
        { kind: "text", who: "soye", see: "Under the table, Soye's phone lights his face: a message from an unknown number.", say: "Unknown: “Your father can't protect you now.”", scene: "Under the table, his phone." },
        { kind: "line", who: "udo", see: "Barrister Udo breaks the red wax seal of an envelope; Ibiere's hand tightens on her knee.", say: "“To my children — all four of them.”", scene: "The red seal breaks." },
        { kind: "line", who: "soye", see: "Soye on his feet; Tonye laughing once, without humour; Ibiere still as stone.", say: "“Four? Barrister, my father had three children.”", scene: "Soye on his feet." },
        { kind: "cliff", who: "amara", see: "The front doors open on the storm. A young woman, soaked, with the Chief's eyes, holds out a faded photograph of him holding a baby.", say: "She has his eyes. And his handwriting on the photograph.", scene: "The doors open on the storm." },
        { kind: "choice", see: "Ibiere rising slowly, her father's watch catching the light, the stranger in the doorway.", say: "" },
      ],
      cliff: { type: "arrival" },
      choice: {
        question: "Does Ibiere let the stranger in?",
        options: [{ word: "WELCOME", label: "Give her a seat" }, { word: "REFUSE", label: "Call security" }],
      },
      branches: {
        WELCOME: "Ibiere gives Amara the fourth cup. The will leaves Amara the shipping company. Soye quietly sends her photograph to the people he owes.",
        REFUSE: "Security walks Amara to the gate. She leaves the photograph behind. On its back, in the Chief's hand, is a confession addressed to Ibiere.",
      },
      slots: [
        { key: "tea", object: "the tea or drink on Mama Boma's silver tray", slide: 3, house: "Regal Burgundy & Gold Tapestry Ensemble" },
        { key: "car", object: "the car in the drive", slide: 2, house: "The Gear Equalizer — Pro Studio Upgrade" },
      ],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "the father's old wedding photograph, restored and framed beside the tray, slide 3" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): the photograph tells more than it should, and Soye's debt comes to the gate.
    {
      n: 2, after: "WELCOME", title: "The Fourth Cup",
      slides: [
        { kind: "cover", see: "Amara seated in the empty armchair with a teacup, rain on the windows behind, three siblings staring from the long sofa. Caption space: top third.", say: "" },
        { kind: "time", see: "The drawing room in Old GRA minutes later, rain on the tall windows, the lamps on in the afternoon gloom.", say: "Old GRA. The fourth cup. The armchair is no longer empty.", scene: "Lamps on. Rain on the glass." },
        { kind: "line", who: "udo", see: "Barrister Udo reading from the will, the red wax seal broken, her reading glasses low.", say: "“The shipping company goes to my daughter, Amara.”", scene: "The barrister reads. Nobody breathes." },
        { kind: "beat", who: "tonye", see: "Tonye holding the faded photograph to the lamp and relighting it on his phone: in the background of the old picture, a young woman wearing coral beads.", say: "Tonye relights the old photograph. Behind the baby: a woman in coral.", scene: "Relit: a woman in coral beads." },
        { kind: "beat", who: "soye", see: "Under the table, Soye photographing Amara with his phone and sending it, the screen glow on his face.", say: "Under the table, Soye takes her photo. And sends it.", scene: "Soye's phone. Send." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "tea", object: "the cup of tea Amara is given", slide: 2, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Tonye relights the faded photograph on his phone, slide 4",
        word: "LIGHT", line: "One relit photograph changed what this family knew. Comment LIGHT and we'll relight one of yours.",
      },
    },
    {
      n: 2, after: "REFUSE", title: "On the Back",
      slides: [
        { kind: "cover", see: "Security guiding Amara down the wet drive toward the gate, the faded photograph left behind on the hall table. Caption space: top third.", say: "" },
        { kind: "time", see: "The front hall in Old GRA, rain blowing in through the open doors, two security men walking Amara out.", say: "Old GRA. The doors close on her. The rain does not stop.", scene: "The doors close. Rain blows in." },
        { kind: "text", see: "Close on the back of the faded photograph on the hall table: the Chief's handwriting in old blue ink.", say: "On the back, his hand: “Ibiere, her mother built this with me.”", scene: "His handwriting. Old blue ink." },
        { kind: "beat", who: "tonye", see: "Tonye relighting the faded photograph on his phone: behind the baby, a young woman wearing coral beads.", say: "Tonye relights the front. Behind the baby: a woman in coral.", scene: "Relit: a woman in coral beads." },
        { kind: "line", who: "udo", see: "Barrister Udo, unmoved, reading on from the will under the lamp.", say: "“The company still goes to Amara. Refusing her changes nothing.”", scene: "The will is the will." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "umbrella", object: "the umbrella the security man holds", slide: 2, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Tonye relights the faded photograph on his phone, slide 4",
        word: "LIGHT", line: "One relit photograph changed what this family knew. Comment LIGHT and we'll relight one of yours.",
      },
    },

    // ── Episode 3 (Turn): the painter's secret.
    {
      n: 3, after: "*.GUARD", title: "Between Them",
      slides: [
        { kind: "cover", see: "Ibiere in black lace standing in the rain between Amara and a man in a dark suit at the gate, the black car's headlights on them. Caption space: top third.", say: "" },
        { kind: "time", see: "The gate in Old GRA in heavy rain, headlights cutting through it, Ibiere's lace soaked.", say: "The gate. Heavy rain. Ibiere walks out without an umbrella.", scene: "Headlights through heavy rain." },
        { kind: "line", who: "ibiere", see: "Ibiere face to face with the man from the car, calm, rain running down her face, her father's watch on her wrist.", say: "“I sign for Briggs Shipping. Six years. Talk to me.”", scene: "Face to face. Calm." },
        { kind: "beat", see: "The man handing Ibiere a card with a number and a date written on it, then getting back into the car.", say: "He hands her a card. Forty million. Friday.", scene: "A card. A sum. A day." },
        { kind: "beat", who: "amara", see: "Back inside, Amara and Ibiere dripping in the hall, Mama Boma wrapping a towel around Amara's shoulders, framed family portraits on the wall.", say: "Inside, Mama Boma wraps a towel around Amara. Then Ibiere.", scene: "Two towels. One housekeeper." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "towel", object: "the towel Mama Boma wraps around Amara", slide: 5, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: { product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the family's framed traditional portraits on the hall wall, slide 5" },
    },
    {
      n: 3, after: "*.FACE", title: "His Phone",
      slides: [
        { kind: "cover", see: "Ibiere holding Soye's phone up in the drawing room, the screen lit, Soye reaching for it, the family frozen. Caption space: top third.", say: "" },
        { kind: "time", see: "The drawing room in Old GRA, the rain louder, the lamps flickering once, framed traditional portraits on the wall.", say: "The drawing room. The rain louder. The lamps flicker once.", scene: "The lamps flicker once." },
        { kind: "text", who: "soye", see: "Close on Soye's phone in Ibiere's hand: the thread with the unknown number, Amara's photo sent.", say: "Soye, to Unknown: “Her share is yours. Just give me Friday.”", scene: "His phone, in her hand." },
        { kind: "line", who: "soye", see: "Soye on the sofa with his head in his hands, his senator suit creased.", say: "“Forty million, Ibiere. They said they'd start with the ships.”", scene: "His head in his hands." },
        { kind: "beat", who: "boma", see: "Mama Boma walking out to the gate with a big umbrella and bringing Amara back inside; the black car pulling away into the rain.", say: "Mama Boma brings Amara back inside. The black car leaves.", scene: "One umbrella. The car leaves." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "umbrella", object: "Mama Boma's big umbrella", slide: 5, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: { product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the family's framed traditional portraits on the drawing-room wall, slide 2" },
    },

    // ── Episode 4 (Cost): whose beads, whose company — and Friday arrives.
    {
      n: 4, after: "*.UDO", title: "The Second Envelope",
      slides: [
        { kind: "cover", see: "Barrister Udo handing Ibiere a second, older envelope in the Chief's study, a green lamp between them. Caption space: top third.", say: "" },
        { kind: "time", see: "The Chief's study at midnight, the rain easing, one green banker's lamp on.", say: "The study. Midnight. The rain easing at last.", scene: "One green lamp. Midnight." },
        { kind: "line", who: "udo", see: "Barrister Udo taking a second envelope from her bag, its seal old and cracked.", say: "“He said: whatever happens tonight, give Ibiere this.”", scene: "A second envelope. An old seal." },
        { kind: "text", see: "Close on the letter in the Chief's hand: blue ink, a shaky signature.", say: "His letter: “I knew you ran it. Too proud to say.”", scene: "His hand. Blue ink." },
        { kind: "beat", who: "ibiere", see: "Ibiere reading the last line and touching the coral beads at her throat.", say: "The last line: the beads at her throat were Amara's mother's.", scene: "Her fingers on the coral." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "lamp", object: "the green banker's lamp on the Chief's desk", slide: 2, house: "Noir Director Editorial" }],
      alux: {
        product: "Noir Director Editorial", where: "the wall of directors' portraits in the Briggs Shipping office, none of them Ibiere, slide 6",
        word: "BOOK", line: "Six years at that desk and not one portrait on the wall. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 4, after: "*.BOMA", title: "Forty Years",
      slides: [
        { kind: "cover", see: "Mama Boma seated at the kitchen table for the first time, Ibiere standing, an old photograph between them. Caption space: top third.", say: "" },
        { kind: "time", see: "The kitchen of the Old GRA house at midnight, one bulb, tea going cold.", say: "The kitchen. Midnight. Mama Boma sits down for once.", scene: "One bulb. Cold tea." },
        { kind: "line", who: "boma", see: "Mama Boma holding an old staff photograph, restored, of herself young beside a woman in coral beads holding a baby.", say: "“I carried Amara for her first year. Then he sent them away.”", scene: "An old staff photo, brought back." },
        { kind: "line", who: "boma", see: "Mama Boma pointing at the coral beads in the photograph, then at Ibiere's throat.", say: "“Those beads were her mother's. He gave them to you.”", scene: "The same beads. Then and now." },
        { kind: "beat", who: "ibiere", see: "Ibiere unfastening the coral beads from her throat and holding them in her palm under the bulb.", say: "Ibiere takes off the beads. She doesn't know who she is.", scene: "The beads in her palm." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "tea", object: "the cooling cups of tea on the kitchen table", slide: 2, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: {
        product: "Noir Director Editorial", where: "the wall of directors' portraits in the Briggs Shipping office, none of them Ibiere, slide 6",
        word: "BOOK", line: "Six years at that desk and not one portrait on the wall. Comment BOOK and we'll make yours.",
      },
    },

    // ── Episode 5 (Storm): the family in one room, and the will's last page.
    {
      n: 5, after: "*.PAY", title: "Six Years of Savings",
      slides: [
        { kind: "cover", see: "Ibiere at her office desk signing a large bank transfer, the men in dark suits waiting, Soye by the window. Caption space: top third.", say: "" },
        { kind: "time", see: "The Briggs Shipping office at noon on Friday, harsh daylight through the blinds in stripes.", say: "Trans-Amadi. Friday noon. The transfer goes through.", scene: "Daylight through the blinds." },
        { kind: "text", see: "Close on Ibiere's phone: a bank alert.", say: "Bank alert: “Debit, ₦40,000,000. Balance: ₦212.”", scene: "Six years, gone in one line." },
        { kind: "beat", who: "soye", see: "The men leaving the office; Soye at the window, unable to look at his sister.", say: "The men leave. Soye cannot look at her.", scene: "Soye at the window." },
        { kind: "beat", who: "amara", see: "That evening in Old GRA: Amara waiting on the veranda with two cups of tea as Ibiere's car pulls in, family portraits in the corridor behind her.", say: "At home, Amara waits on the veranda with two cups.", scene: "Two cups on the veranda." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "tea", object: "the two cups of tea on the veranda", slide: 5, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: { product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the family's traditional portraits along the veranda corridor, slide 5" },
    },
    {
      n: 5, after: "*.CUT", title: "Recorded",
      slides: [
        { kind: "cover", see: "Port police stopping the black car at the Trans-Amadi gate in the rain, Amara holding up her phone to an officer. Caption space: top third.", say: "" },
        { kind: "time", see: "The Trans-Amadi gate on Friday, rain again, port police lights flashing on the wet road.", say: "Trans-Amadi gate. Friday. Rain again. Port police at the barrier.", scene: "Police lights at the barrier." },
        { kind: "beat", who: "amara", see: "Amara playing a recording on her phone to a port police officer: the men's voices.", say: "Amara plays her recording. Every word they said upstairs.", scene: "Her phone. Every word." },
        { kind: "beat", who: "soye", see: "Soye standing alone in the rain beside the stopped car, no umbrella, his phone face down in his hand.", say: "Soye stands alone in the rain. Nobody is coming for him.", scene: "Soye, alone in the rain." },
        { kind: "beat", who: "ibiere", see: "That evening in Old GRA, Ibiere bringing Soye a towel in the hall under the family portraits; neither of them speaks.", say: "At home, Ibiere hands her brother a towel. Nobody speaks.", scene: "A towel. No words." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "phone", object: "Amara's phone playing the recording", slide: 3, house: "Instagram GIF Maker" }],
      alux: { product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the family's traditional portraits on the hall wall, slide 5" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.SHARE", title: "Two Mothers' Names",
      slides: [
        { kind: "cover", see: "Ibiere and Amara side by side at the Trans-Amadi gate, a new sign above them, cranes and the river behind. Caption space: top third.", say: "" },
        { kind: "time", see: "The Trans-Amadi port gate on a clear morning, the rain gone, cranes against a blue sky, soft sunlight.", say: "Trans-Amadi. Monday. The first clear sky in a week.", scene: "Cranes. A clear sky." },
        { kind: "beat", who: "ibiere", see: "Workers lifting a new sign onto the gate: Briggs and Ibinabo Shipping, Amara's mother's name beside the family's.", say: "The new sign goes up. Amara's mother's name beside theirs.", scene: "Two names on one sign." },
        { kind: "beat", who: "amara", see: "Ibiere fastening the coral beads around Amara's neck at the gate, both of them smiling for the first time.", say: "Ibiere fastens the coral beads around Amara's neck.", scene: "The beads go home." },
        { kind: "beat", who: "soye", see: "Soye in work clothes at the dock, a hard hat on, sweeping, a supervisor with a clipboard behind him.", say: "Soye works the docks now. Paying it back, shift by shift.", scene: "A hard hat. A broom." },
        { kind: "line", who: "ibiere", see: "The family portrait being taken in the Old GRA drawing room: four children in traditional dress under their father's oil painting; Ibiere speaking to Soye.", say: "“Four, Soye. Our father had four children.”", scene: "Four children. One portrait." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "hat", object: "Soye's hard hat on the docks", slide: 5, house: "Noir Director Editorial" }],
      alux: {
        product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the new family portrait of all four children in traditional dress, slide 6",
        word: "BOOK", line: "A family portrait with everyone in it, at last. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.CLAIM", title: "Hers Alone",
      slides: [
        { kind: "cover", see: "Ibiere alone at the head of the boardroom table at the port office, the will before her, Amara standing at the window. Caption space: top third.", say: "" },
        { kind: "time", see: "The Briggs Shipping boardroom on Monday morning, clear light, the river beyond the glass.", say: "Trans-Amadi. Monday. The company is hers alone.", scene: "One chair at the head." },
        { kind: "beat", who: "ibiere", see: "Ibiere signing the acceptance in front of Barrister Udo, her father's watch on her wrist.", say: "She signs. Six years in secret, and now in her own name.", scene: "Her own name, at last." },
        { kind: "line", who: "ibiere", see: "Ibiere sliding a second document across the table to Amara: a share certificate.", say: "“Half my shares are yours. Not from him. From me.”", scene: "A share certificate. From her." },
        { kind: "beat", who: "amara", see: "Amara reading the certificate, then fastening around her own neck the coral beads Ibiere hands her.", say: "Amara takes the shares. And the coral beads.", scene: "The beads go home." },
        { kind: "line", who: "ibiere", see: "The family portrait being taken in the Old GRA drawing room: four children in traditional dress under their father's oil painting; Ibiere speaking to Soye.", say: "“Four, Soye. Our father had four children.”", scene: "Four children. One portrait." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "pen", object: "the pen Ibiere signs with", slide: 3, house: "Noir Director Editorial" }],
      alux: {
        product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the new family portrait of all four children in traditional dress, slide 6",
        word: "BOOK", line: "A family portrait with everyone in it, at last. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
