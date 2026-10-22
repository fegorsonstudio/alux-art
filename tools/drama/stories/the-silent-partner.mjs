// Slides rewritten 2026-10-22 in the owner's recap style (ENGINE.md §1): plain
// sentences, labels not names in narration, one or two spoken lines, slide 2 says
// what the last vote decided. Episode 1 is as posted.
// Episode 5 (Storm) is written for all eight roads, and every road ends in the
// same room with the same choice, so the finale (Episode 6) needs only two
// versions — the roads split, then meet again. These are the shared parts.
const EP5_ENDING = [
  { kind: "line", who: "damola", see: "Damola standing at the far end of the boardroom, rimless glasses in his hand, every face turned to him; Chief Eze very still at the head.", say: "“The buyer is Lagoon Holdings. Its owner is at this table.”", scene: "Damola stops lying. Quietly." },
  { kind: "cliff", who: "eze", see: "Chief Eze rising slowly, his walking stick laid flat on the second will; Adaeze standing opposite with the brass key in her fist.", say: "“Then do it, Adaeze. End me in front of them all.”", scene: "The Chairman stands. The stick lies down." },
  { kind: "choice", see: "Close on the second will on the glass table, the brass key beside it, seven men's hands flat on the wood.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "reveal" },
  choice: {
    question: "What does Adaeze do with Chief Eze?",
    options: [{ word: "EXPOSE", label: "Expose him to everyone" }, { word: "SPARE", label: "Let him leave quietly" }],
  },
  branches: {
    EXPOSE: "Adaeze reads the second will aloud to the board and the waiting press. The sale dies; Chief Eze is voted out before lunch.",
    SPARE: "Adaeze offers Chief Eze a quiet exit: repay the debt, resign today, and the will stays in the room. He signs.",
  },
};
// The finale ends both ways on the same hook for season two.
const EP6_ENDING = [
  { kind: "cliff", see: "Close on the brass key in Adaeze's palm, turned over: on its back, a second number engraved — Box 2.", say: "The brass key has a second number on its back.", scene: "The key, turned over." },
  { kind: "choice", see: "Close on the engraved 2 on the key, Adaeze's thumb over it, the lagoon blurred behind.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "reveal" },
  choice: {
    question: "Does Adaeze open the second box?",
    options: [{ word: "OPEN", label: "Open the second box" }, { word: "LEAVE", label: "Leave the past alone" }],
  },
  branches: {
    OPEN: "Season two: the second box holds a photograph of the old man with a child nobody knew he had — and a will of her own.",
    LEAVE: "Season two: Adaeze leaves the box shut and runs the company. Six months later, someone else opens it.",
  },
};

export default {
  slug: "the-silent-partner",
  title: "The Silent Partner",
  tagline: "She signs the cheques. Nobody knows why.",
  genre: "power",
  city: "Lagos",
  logline: "Adaeze is the quiet finance director the board talks over. Tonight they vote to sell the company. Only she knows who owns the other half.",
  minVotes: 2,
  cast: [
    { key: "adaeze", name: "Adaeze Okafor", age: 36, role: "Finance Director", archetype: "The Sage", side: "light", tier: "lead", open: true,
      look: "Tall, composed, close-cropped natural hair, small gold studs, charcoal tailored suit, a brass key on a black ribbon at her wrist.",
      want: "To stop the sale without showing her hand.", secret: "The anonymous trust that owns 51% was left to her by her late mentor." },
    { key: "tunde", name: "Tunde Bakare", age: 47, role: "Chief Executive", archetype: "The Oga", side: "too much", tier: "main", open: true,
      look: "Broad, silver at the temples, navy agbada over a white shirt for board days, heavy watch, a laugh that fills rooms.",
      want: "To sell the company and walk away with the bonus.", secret: "He has already spent the bonus." },
    { key: "ifeoma", name: "Ifeoma Nnaji", age: 28, role: "Adaeze's assistant", archetype: "The Companion", side: "light", tier: "main", open: true,
      look: "Slim, braids in a low bun, cream blouse, lanyard, always holding two phones.",
      want: "To keep Adaeze safe tonight.", secret: "The buyer's lawyer offered her a job last week." },
    { key: "eze", name: "Chief Obinna Eze", age: 69, role: "Board Chairman", archetype: "The Guardian", side: "too little", tier: "main", open: true,
      look: "Small, upright, white isiagu and red cap, reading glasses on a chain, walking stick he does not need.",
      want: "To end his career without a scandal.", secret: "He knew the mentor's will before anyone." },
    { key: "damola", name: "Damola Adeyemi", age: 41, role: "The buyer's lawyer", archetype: "The Visionary", side: "too much", tier: "main", open: true,
      look: "Lean, beautifully cut grey suit, rimless glasses, never raises his voice.",
      want: "To close tonight, at any price.", secret: "He wrote the trust deed himself, years ago." },
    { key: "guard", name: "Sunday", age: 52, role: "Night guard at the Marina tower", archetype: "The Innocent", side: "light", tier: "cameo", open: true,
      look: "Navy security uniform, cap held in both hands, kind tired eyes.",
      want: "To finish his shift.", secret: "He saw who opened the safe last night." },
    // A guest, written in while the story runs: open to play until Episode 4 is made.
    { key: "funke", name: "Mrs Funke Adebayo", age: 63, role: "The late mentor's housekeeper", archetype: "The Guardian", side: "light", tier: "cameo", open: true,
      guest: true, enters: 4,
      look: "Small and upright, grey hair in a neat bun, white lace blouse over a blue wrapper, reading glasses on a cord, a cloth handbag held in both hands.",
      want: "To tell the truth she promised the old man she would keep.", secret: "She witnessed him sign a second will the night he died." },
  ],
  episodes: [
    {
      n: 1,
      title: "The Last Meeting",
      slides: [
        { kind: "cover", see: "Glass boardroom at night, the lagoon lights behind. Seven men face Tunde at the head; Adaeze sits apart at the far end, the only one looking at the contract, not at him. Caption space: top third, dark glass.", say: "" },
        { kind: "time", see: "Exterior, Marina tower in the rain, one floor lit near the top, water on the lens, the Third Mainland lights a thin line far off.", say: "Marina, Lagos. 9:40 p.m. One floor is still awake.", scene: "Rain on the glass. The lagoon below." },
        { kind: "line", who: "tunde", see: "Tunde standing, sliding a thick contract down the table; men laughing; Adaeze writing, head down. Framed black-and-white executive portraits on the wall behind them.", say: "“Adaeze, bring the cheque book. The grown-ups have decided.”", scene: "The boardroom. Seven men. One laugh." },
        { kind: "beat", see: "Close on Adaeze's hand: a fountain pen resting, not writing. The brass key on its ribbon lies against her wrist.", say: "She writes nothing. She is counting signatures.", scene: "Her hand. A pen. A brass key." },
        { kind: "text", who: "ifeoma", see: "Ifeoma at the glass door, a phone glowing in her hand, mouthing something; Adaeze does not look up.", say: "Ifeoma: “The trust's lawyer is downstairs. He says it's time.”", scene: "At the glass door, a phone glows." },
        { kind: "beat", see: "Tunde lifts a gold pen over the signature line. Chief Eze is watching Adaeze, not the contract.", say: "The Chairman watches the wrong person. Or the right one.", scene: "The gold pen, above the line." },
        { kind: "cliff", who: "adaeze", see: "Adaeze standing; every head turning; she lays the brass key on the open contract, right over Tunde's name.", say: "“Before you sign — ask who owns the other fifty-one percent.”", scene: "She stands. Every head turns." },
        { kind: "choice", see: "Close on the key on the paper, the gold pen frozen above it.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Adaeze name herself tonight?",
        options: [{ word: "SPEAK", label: "Name herself now" }, { word: "WAIT", label: "Let them sign" }],
      },
      branches: {
        SPEAK: "She names the trust as hers. The buyer's side goes silent — then Chief Eze calls her a liar: the trust papers are not in the safe.",
        WAIT: "She sits down and lets them sign, knowing the sale is void without the trust. In the car park the trust's lawyer is waiting for her: it is Damola, the buyer's lawyer.",
      },
      slots: [
        { key: "water", object: "the bottled water at every seat on the boardroom table", slide: 3, house: "Noir Director Editorial" },
        { key: "phone", object: "the phone glowing in Ifeoma's hand", slide: 5, house: "Instagram GIF Maker" },
      ],
      alux: { product: "Noir Director Editorial", where: "the framed executive portraits on the boardroom wall, slide 3" },
    },
  ],

  // Written ahead: the episode that posts by itself when a vote closes on that road.
  drafts: [
    {
      n: 2,
      after: "SPEAK",
      title: "The Empty Safe",
      slides: [
        { kind: "cover", see: "The boardroom from the doorway: Adaeze standing alone at the far end, every man turned toward her, the brass key lying on the open contract. Caption space: top third, dark glass.", say: "" },
        { kind: "time", see: "Wide on the boardroom, chairs pushed back, nobody seated, the lagoon lights smeared by rain on the glass.", say: "9:52 p.m. The quiet finance director has just claimed the company.", scene: "The boardroom. Every chair pushed back." },
        { kind: "line", who: "adaeze", see: "Adaeze at the head of the table now, one hand flat beside the key, voice low; Tunde's smile frozen halfway.", say: "“The trust is mine. Fifty-one percent. You cannot sell without me.”", scene: "She says it once. Quietly." },
        { kind: "beat", who: "damola", see: "Damola slowly folds his rimless glasses and sets them on the table; the buyer's side of the table has gone completely still.", say: "The buyer's lawyer folds his glasses. He does not argue.", scene: "Across the table, Damola goes quiet." },
        { kind: "text", who: "ifeoma", see: "Close on Ifeoma's phone face up on the glass table, a message glowing; her hand hovering, not touching it.", say: "Her assistant's phone: “The trust's lawyer has left. His car is gone.”", scene: "Her phone, face up on the glass." },
        { kind: "beat", who: "guard", see: "The corridor outside: Sunday kneels at an open wall safe, torch in hand; the shelves are bare except for a short scrap of black ribbon. Framed executive portraits line the corridor wall.", say: "The night guard opens the safe. No papers. Only black ribbon.", scene: "The corridor safe. One torch." },
        { kind: "cliff", who: "eze", see: "Chief Eze back in the boardroom doorway, holding the scrap of black ribbon up between two fingers, looking from it to the ribbon at Adaeze's wrist.", say: "“No papers, Ms Okafor. You have lied to this board.”", scene: "The Chairman holds up the ribbon." },
        { kind: "choice", see: "Close on the scrap of black ribbon in Chief Eze's fingers, the brass key still on the contract behind it.", say: "" },
      ],
      cliff: { type: "loss" },
      choice: {
        question: "Does Adaeze fight here or chase the papers?",
        options: [{ word: "STAY", label: "Fight in the room" }, { word: "CHASE", label: "Chase the papers" }],
      },
      branches: {
        STAY: "She sits and makes them wait for the registry to confirm the trust. A message lights Ifeoma's second phone — from Damola: the job offer ends at midnight. Ifeoma confesses she took the papers to keep them from him.",
        CHASE: "She goes down with Sunday to the CCTV room. Last night's footage shows the safe opened at 2:14 a.m. by a slim figure in Chief Eze's red cap — who turns to the camera: braids under the cap.",
      },
      slots: [
        { key: "glasses", object: "the glasses Damola folds onto the table", slide: 4, house: "Noir Director Editorial" },
        { key: "phone", object: "Ifeoma's phone face up on the glass table", slide: 5, house: "Instagram GIF Maker" },
      ],
      alux: { product: "Noir Director Editorial", where: "the framed executive portraits along the corridor beside the safe, slide 6" },
    },
    {
      n: 3,
      after: "SPEAK.STAY",
      title: "Twenty to Midnight",
      slides: [
        { kind: "cover", see: "Adaeze seated alone at the head of the long table; the board standing by the dark windows; a wall clock above the door reads 11:40. Caption space: top third.", say: "" },
        { kind: "time", see: "The wall clock above the boardroom door at 11:40, the men's reflections in the night glass below it.", say: "11:40 p.m. The board is standing. The finance director is not.", scene: "The same room, two hours later." },
        { kind: "line", who: "adaeze", see: "Adaeze, calm, both hands folded over the brass key on the contract; Tunde pacing behind her chair.", say: "“Nobody signs until the registry answers. I can wait all night.”", scene: "She has not moved her key." },
        { kind: "text", who: "damola", see: "Close on Ifeoma's second phone lighting up in her hand under the table: a message from Damola over her lock screen, a portrait of an older woman in a nurse's cap and white uniform.", say: "The buyer's lawyer texts her assistant. His job offer ends at midnight.", scene: "Ifeoma's second phone lights up." },
        { kind: "beat", who: "ifeoma", see: "Ifeoma looking up from the phone at the scrap of black ribbon lying on the table in front of Chief Eze.", say: "The assistant reads it twice. Then she stares at the ribbon.", scene: "The ribbon scrap, on the table." },
        { kind: "line", who: "ifeoma", see: "Behind the glass door in the corridor, Ifeoma close to Adaeze, whispering, one phone pressed face down against her chest.", say: "“I took the papers last night. To keep them from him.”", scene: "A whisper, behind the glass door." },
        { kind: "cliff", see: "Close on Adaeze's own phone in her palm: one new message from the registry, the screen the only light on her face.", say: "Then the registry answers. No trust exists under her name.", scene: "Her own phone. One line." },
        { kind: "choice", see: "Close on the brass key on its black ribbon, Adaeze's fingers half open around it, Ifeoma's hand waiting below.", say: "" },
      ],
      cliff: { type: "message" },
      choice: {
        question: "Does Adaeze hand Ifeoma the brass key?",
        options: [{ word: "TRUST", label: "Hand her the key" }, { word: "HOLD", label: "Keep the key" }],
      },
      branches: {
        TRUST: "Ifeoma takes the key to the bank box the trust deed names. Inside is a newer deed than anyone has seen — witnessed by Damola, years ago, as the trust's first lawyer.",
        HOLD: "Adaeze keeps the key and drives to the bank box herself. Alone in the boardroom, Ifeoma answers Damola's call — and tells him where Adaeze is going.",
      },
      slots: [
        { key: "phone", object: "the second phone lighting up in Ifeoma's hand", slide: 4, house: "Instagram GIF Maker" },
        { key: "clock", object: "the wall clock above the boardroom door", slide: 2, house: "Noir Director Editorial" },
      ],
      alux: {
        product: "Nursing Induction", where: "Ifeoma's lock screen: her mother's nursing induction portrait, slide 4",
        word: "BOOK", line: "Ifeoma keeps her mother's induction portrait where she sees it every day. Comment BOOK and we'll make you one worth keeping.",
      },
    },
    {
      n: 3,
      after: "SPEAK.CHASE",
      title: "Camera Four",
      slides: [
        { kind: "cover", see: "A cramped security room, a wall of grey monitors; Adaeze and Sunday lit only by the screens, his cap in his hands. Caption space: top third.", say: "" },
        { kind: "time", see: "The concrete service stairs going down, one strip light, Adaeze's heels and Sunday's boots on the steps.", say: "10:05 p.m. The night guard takes her down to the cameras.", scene: "Down the service stairs. Monitors hum." },
        { kind: "line", who: "guard", see: "Sunday at the desk rewinding footage, his hands unsteady; a flask of tea and a faded staff photo of him from 1998 pinned above the monitors.", say: "“Last night, madam. Camera four. I saw, but nobody asked me.”", scene: "He rewinds the tape with shaking hands." },
        { kind: "beat", see: "Grey CCTV footage on one monitor: the corridor safe, a timestamp reading 02:14, a figure in a red cap bent at the lock, two phones in one hand.", say: "2:14 a.m. Someone opens the safe. Two phones in one hand.", scene: "Grey footage. The corridor safe." },
        { kind: "line", who: "guard", see: "Sunday leaning close to the screen, pointing at the figure; Adaeze behind him, very still.", say: "“That is the Chairman's cap. It is not his walk.”", scene: "Sunday leans close to the screen." },
        { kind: "beat", who: "adaeze", see: "Adaeze photographing the paused, too-dark frame with her phone and relighting it on the screen: the black shadow under the red cap slowly turning into detail.", say: "The face is too dark to see. So she relights it.", scene: "Her phone. The frame, relit." },
        { kind: "cliff", see: "The relit frame on Adaeze's phone: the figure turned toward the camera, the red cap pushed back, braids gathered in a low bun beneath it.", say: "The face appears. Braids under the red cap. Her assistant.", scene: "The shadow becomes a face." },
        { kind: "choice", see: "Close on Adaeze's face lit grey by the paused screen, her hand closing around the brass key.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Adaeze ask Ifeoma tonight?",
        options: [{ word: "ASK", label: "Ask her tonight" }, { word: "WATCH", label: "Watch her quietly" }],
      },
      branches: {
        ASK: "Adaeze asks. Ifeoma admits she took the papers to hide them from Damola — and that Damola knows exactly where she hid them.",
        WATCH: "Adaeze says nothing and follows Ifeoma to the car park, where Ifeoma passes a thick envelope through the window of Damola's car.",
      },
      slots: [
        { key: "screens", object: "the CCTV monitors in the security room", slide: 1, house: "The Gear Equalizer — Pro Studio Upgrade" },
        { key: "tea", object: "the flask of tea on Sunday's desk", slide: 3, house: "Noir Director Editorial" },
      ],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Adaeze relights the dark security-camera frame on her phone, slide 6",
        word: "LIGHT", line: "Saw how Adaeze lit up that frame? Comment LIGHT and we'll relight one of your photos too.",
      },
    },

    // ── Episode 4 (Cost): one per road. Mrs Funke Adebayo, the guest, enters in all four.
    {
      n: 4,
      after: "SPEAK.STAY.TRUST",
      title: "The Bank Box",
      slides: [
        { kind: "cover", see: "A bank vault at morning: Ifeoma alone at a steel table, an open safe-deposit box, the brass key still in its lock. Caption space: top third.", say: "" },
        { kind: "time", see: "Broad Street on Lagos Island at eight in the morning, the bank's bronze doors opening, a guard unlocking them.", say: "8 a.m. Her assistant carries the brass key into the bank.", scene: "Bronze doors. A guard with keys." },
        { kind: "beat", who: "ifeoma", see: "Ifeoma turning the brass key in the box; the lid lifting on papers; a restored photo of an old man taped inside the lid.", say: "The key opens a box. Inside is a newer trust deed.", scene: "The vault. One box. One key." },
        { kind: "text", see: "Close on the deed in Ifeoma's hands: a signature line reading 'Witness: Damola Adeyemi', dated 2014.", say: "The deed has a witness. The buyer's lawyer, in 2014.", scene: "The deed, flat on steel." },
        { kind: "line", who: "ifeoma", see: "Ifeoma on her phone in the vault, whispering, the deed pressed flat on the table.", say: "“He wrote it, madam. He has always known it was you.”", scene: "A phone call, in a whisper." },
        { kind: "beat", who: "funke", see: "By the bank's bronze doors, a small older woman in white lace and a blue wrapper, cloth handbag in both hands, waiting.", say: "An old woman in white lace has waited since dawn.", scene: "By the door, a cloth handbag." },
        { kind: "cliff", who: "funke", see: "The woman stepping close to Ifeoma, reading glasses on their cord, speaking low; Ifeoma frozen with the deed.", say: "“I witnessed the second will. Chief Eze told me to forget.”", scene: "She speaks before anyone asks." },
        { kind: "choice", see: "Close on Funke's hands on her handbag clasp, the deed on the steel table beside them.", say: "" },
      ],
      cliff: { type: "arrival" },
      choice: {
        question: "Does Adaeze bring Funke to the board?",
        options: [{ word: "BOARD", label: "Bring her to them" }, { word: "HIDE", label: "Keep her hidden" }],
      },
      branches: {
        BOARD: "Adaeze walks Funke into the boardroom. Chief Eze's stick stops tapping; he asks for one minute alone with her.",
        HIDE: "Adaeze hides Funke at Ifeoma's flat in Yaba. By evening a note is under the door: we know where she is.",
      },
      slots: [
        { key: "box", object: "the safe-deposit box on the steel table", slide: 3, house: "Noir Director Editorial" },
        { key: "handbag", object: "Funke's cloth handbag", slide: 6, house: "Regal Burgundy & Gold Tapestry Ensemble" },
      ],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "the restored photo of the late mentor taped inside the box lid, slide 3" },
    },
    {
      n: 4,
      after: "SPEAK.STAY.HOLD",
      title: "Broad Street",
      slides: [
        { kind: "cover", see: "Adaeze on the Broad Street pavement at morning, the brass key on its ribbon at her wrist, a grey car blurred across the road. Caption space: top third.", say: "" },
        { kind: "time", see: "The bank's bronze doors at dawn, Adaeze alone in the queue, the street still empty.", say: "7:55 a.m. She kept the key. She is first in line.", scene: "The bank doors. One woman waiting." },
        { kind: "beat", who: "damola", see: "Across the road, a grey car parked; behind the wheel, a man in rimless glasses watching the bank.", say: "Across the road, the buyer's lawyer is waiting in a grey car.", scene: "Across the road, a grey car." },
        { kind: "text", who: "ifeoma", see: "Close on Adaeze's phone: a message from Ifeoma, sent at 6:12 a.m.", say: "Her assistant texts: “Forgive me. I told him where you are.”", scene: "Her phone. A message from Ifeoma." },
        { kind: "beat", who: "adaeze", see: "Inside the vault, Adaeze reading a deed from the box; the witness line names Damola Adeyemi. Framed portraits of the bank's founders in the banking hall behind the glass.", say: "Inside the box: a newer deed. The lawyer's name is on it.", scene: "The vault. The deed. His name." },
        { kind: "beat", who: "funke", see: "Outside on the pavement, a small woman in white lace steps between Adaeze and the grey car, handbag held up like a shield.", say: "Outside, an old woman in white lace blocks the car.", scene: "On the pavement, white lace." },
        { kind: "cliff", who: "funke", see: "Funke facing the grey car's open window, chin raised; Damola half out of the car, a hand on the door.", say: "“Not this time, Damola. I saw the second will.”", scene: "She faces the car. He stops." },
        { kind: "choice", see: "Close on Adaeze's phone, Ifeoma's message still on the screen, the deed folded in her other hand.", say: "" },
      ],
      cliff: { type: "arrival" },
      choice: {
        question: "Does Adaeze forgive Ifeoma?",
        options: [{ word: "FORGIVE", label: "Let her back in" }, { word: "CUT", label: "Cut her off" }],
      },
      branches: {
        FORGIVE: "Adaeze calls Ifeoma back to the tower. Ifeoma brings the job contract Damola gave her, and the clause that names the real buyer.",
        CUT: "Adaeze walks into the board meeting alone with Funke. Ifeoma's chair is empty; her lanyard lies on it.",
      },
      slots: [
        { key: "car", object: "the grey car parked across Broad Street", slide: 3, house: "Penthouse Dusk Paparazzi" },
        { key: "phone", object: "Adaeze's phone showing Ifeoma's message", slide: 4, house: "Instagram GIF Maker" },
      ],
      alux: { product: "Noir Director Editorial", where: "the framed portraits of the bank's founders in the banking hall, slide 5" },
    },
    {
      n: 4,
      after: "SPEAK.CHASE.ASK",
      title: "Where She Hid Them",
      slides: [
        { kind: "cover", see: "A small Yaba flat at night: a bed pushed aside, one floorboard lifted, Adaeze and Ifeoma in the doorway. Caption space: top third.", say: "" },
        { kind: "time", see: "A Yaba street at night, a block of flats, one window lit on the second floor.", say: "11:20 p.m. Her assistant's flat. The light is already on.", scene: "One window lit. Second floor." },
        { kind: "beat", who: "ifeoma", see: "Ifeoma at her own front door, key in hand, staring at the light under it; Adaeze one step behind.", say: "She left it locked. She left the light off.", scene: "Her own door. Her own key." },
        { kind: "beat", see: "Inside, the bed pulled away from the wall; one floorboard lifted; the space beneath it empty.", say: "The floorboard under the bed is lifted. The envelope is gone.", scene: "Under the bed, one loose board." },
        { kind: "beat", who: "funke", see: "In the tiny kitchen, a small older woman in white lace sits upright on a stool, cloth handbag on her knees, a nursing induction photo of a young woman tucked in its outer pocket, a kettle steaming.", say: "A stranger sits in her kitchen. An old woman, perfectly calm.", scene: "The kitchen. A stranger, perfectly calm." },
        { kind: "line", who: "funke", see: "Funke looking up at both women, unhurried, reading glasses on their cord.", say: "“I took them before he came. I am Funke. I was there.”", scene: "She does not stand up." },
        { kind: "cliff", who: "funke", see: "Funke opening the handbag: the trust papers and a second sealed envelope.", say: "“And this is the second will. Chief Eze signed it too.”", scene: "The handbag opens. Two envelopes." },
        { kind: "choice", see: "Close on the sealed envelope on the kitchen table under a bare bulb.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Adaeze open the will tonight?",
        options: [{ word: "READ", label: "Open it now" }, { word: "KEEP", label: "Keep it sealed" }],
      },
      branches: {
        READ: "The will leaves the company to Adaeze — and leaves Chief Eze a debt he has hidden for ten years.",
        KEEP: "Adaeze takes the sealed will to the board unopened, and dares Chief Eze to open it in front of everyone.",
      },
      slots: [
        { key: "kettle", object: "the kettle on Ifeoma's stove", slide: 5, house: "Noir Director Editorial" },
        { key: "handbag", object: "Funke's cloth handbag", slide: 7, house: "Regal Burgundy & Gold Tapestry Ensemble" },
      ],
      alux: { product: "Nursing Induction", where: "the nursing induction portrait of Funke's granddaughter in her handbag pocket, slide 5" },
    },
    {
      n: 4,
      after: "SPEAK.CHASE.WATCH",
      title: "The Car Park",
      slides: [
        { kind: "cover", see: "A concrete car park under the Marina tower at night, one lamp out, a grey car's tail lights, Adaeze half hidden behind a pillar. Caption space: top third.", say: "" },
        { kind: "time", see: "Rows of parked cars under strip lights, one lamp dead, puddles on the concrete.", say: "11:05 p.m. She follows her assistant down to the car park.", scene: "Concrete, puddles, one dead lamp." },
        { kind: "beat", who: "ifeoma", see: "Ifeoma at the window of a grey car, passing a thick envelope inside; Adaeze watching from behind a pillar.", say: "Her assistant hands an envelope into a grey car.", scene: "Between pillars, Adaeze watches, unseen." },
        { kind: "line", who: "damola", see: "Inside the car, Damola taking the envelope without looking at it, speaking up to Ifeoma.", say: "“Thank you, Ifeoma. Your new office is ready on Monday.”", scene: "He does not open it." },
        { kind: "beat", who: "ifeoma", see: "The car pulling away; Ifeoma alone under the broken lamp, wiping her face.", say: "The car drives off. Her assistant stands alone, wiping her face.", scene: "Ifeoma, alone under the broken lamp." },
        { kind: "beat", who: "funke", see: "From behind the next pillar, a small woman in white lace and a blue wrapper touches Adaeze's arm; on her phone, an old photo of her with the late mentor, brought back to life.", say: "Then an old woman in white lace touches her arm.", scene: "Behind a pillar, white lace." },
        { kind: "cliff", who: "funke", see: "Funke holding her cloth handbag open just enough to show a bundle of papers tied with black ribbon.", say: "“That envelope was empty. The real papers are with me.”", scene: "Black ribbon, inside a handbag." },
        { kind: "choice", see: "Close on the black ribbon around the papers in Funke's handbag, Adaeze's hand reaching toward it.", say: "" },
      ],
      cliff: { type: "reveal" },
      choice: {
        question: "Does Adaeze trust the old woman?",
        options: [{ word: "TRUST", label: "Go with her" }, { word: "DOUBT", label: "Test her first" }],
      },
      branches: {
        TRUST: "Funke takes Adaeze to the late mentor's house in Ikoyi, where the papers lie inside his piano, beside a second will.",
        DOUBT: "Adaeze asks one question only the old man's household could answer. Funke answers it, and names Chief Eze.",
      },
      slots: [
        { key: "car", object: "the grey car in the Marina car park", slide: 3, house: "Penthouse Dusk Paparazzi" },
        { key: "handbag", object: "Funke's cloth handbag", slide: 7, house: "Regal Burgundy & Gold Tapestry Ensemble" },
      ],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "the old photo of Funke with the late mentor on her phone, brought back to life, slide 6" },
    },

    // ── Episode 5 (Storm): one per road. Each opens on its own night and ends in the same boardroom.
    {
      n: 5,
      after: "SPEAK.STAY.TRUST.BOARD",
      title: "One Minute Alone",
      slides: [
        { kind: "cover", see: "The boardroom's glass door from the corridor: inside, Chief Eze and a small woman in white lace face each other; Adaeze outside, one hand flat on the glass. Caption space: top third.", say: "" },
        { kind: "time", see: "The Marina tower boardroom at nine in the morning, hard light on the lagoon, the board filing in with coffee.", say: "9 a.m. The Chairman asks for one minute alone with the witness.", scene: "Morning light on the lagoon." },
        { kind: "beat", who: "adaeze", see: "Adaeze outside the glass door, watching two silhouettes inside; the corridor clock above her.", say: "One minute, he said. It has been eleven.", scene: "Outside the glass. Two silhouettes." },
        { kind: "line", who: "eze", see: "The door opening; Chief Eze coming out grey-faced, reading glasses in his hand, looking at no one; the old woman still seated inside, upright.", say: "“She will not forget. Bring the board in.”", scene: "The door opens. He looks older." },
        { kind: "beat", see: "The second will laid on the boardroom table, its last page signed twice; Tunde reading over a director's shoulder, his smile gone. Executive portraits on the wall behind.", say: "The second will is on the table. The Chairman signed it.", scene: "The will, in the light." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "coffee", object: "the coffee cups the board carries in", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Noir Director Editorial", where: "the executive portraits on the boardroom wall, slide 5" },
    },
    {
      n: 5,
      after: "SPEAK.STAY.TRUST.HIDE",
      title: "We Know Where",
      slides: [
        { kind: "cover", see: "Ifeoma's small Yaba flat at dawn: a folded note on the floor inside the door, Adaeze crouched over it, the old woman watching from a chair. Caption space: top third.", say: "" },
        { kind: "time", see: "Ifeoma's flat in Yaba at dawn, a folded note on the floor inside the door, a nursing induction portrait on the fridge.", say: "6:40 a.m. They hid the witness. Someone found her anyway.", scene: "A folded note. A cold kettle." },
        { kind: "text", see: "Close on the note in block capitals, no name, no signature.", say: "Note: “We know where she is. Bring nothing to the board.”", scene: "Block letters, no name." },
        { kind: "line", who: "guard", see: "Sunday in his navy uniform at the flat door, car keys in hand, out of breath from the stairs.", say: "“I finished my shift, madam. I will drive you myself.”", scene: "Sunday at the door, keys out." },
        { kind: "beat", who: "adaeze", see: "Adaeze walking into the morning boardroom with the second will held against her chest; the board already seated; Chief Eze at the head.", say: "At nine, she brings the will. Not the witness.", scene: "She walks in. Every chair turns." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [
        { key: "kettle", object: "the kettle on Ifeoma's stove", slide: 2, house: "Noir Director Editorial" },
        { key: "car", object: "Sunday's car waiting outside the flat", slide: 4, house: "Penthouse Dusk Paparazzi" },
      ],
      alux: { product: "Nursing Induction", where: "the nursing induction portrait on the fridge door in Ifeoma's flat, slide 2" },
    },
    {
      n: 5,
      after: "SPEAK.STAY.HOLD.FORGIVE",
      title: "Clause Fourteen",
      slides: [
        { kind: "cover", see: "The empty boardroom before the meeting: Adaeze and Ifeoma at the far end, a contract between them on the glass, the lagoon pale behind. Caption space: top third.", say: "" },
        { kind: "time", see: "The boardroom at ten to nine, empty but for the two women, the chairs still pushed in.", say: "8:50 a.m. She forgives her assistant. Ten minutes to the board.", scene: "Two women. One contract." },
        { kind: "line", who: "ifeoma", see: "Ifeoma sliding the job contract across the glass, her hand shaking, one page folded down.", say: "“I signed nothing, madam. But read clause fourteen.”", scene: "Her hand, still shaking." },
        { kind: "text", see: "Close on the contract page: clause 14 naming the employer, Lagoon Holdings Ltd, a stamp half over it.", say: "Clause 14 names her new employer: Lagoon Holdings.", scene: "Page six. Clause fourteen." },
        { kind: "beat", who: "adaeze", see: "Adaeze at the window with the second will in one hand and the contract in the other, the lift doors opening behind her on the arriving board.", say: "The buyer and the job offer. They are the same company.", scene: "The lift doors open behind her." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "pen", object: "the pen Ifeoma lays on the contract", slide: 3, house: "Noir Director Editorial" }],
      alux: { product: "Noir Director Editorial", where: "the executive portraits on the boardroom wall, slide 2" },
    },
    {
      n: 5,
      after: "SPEAK.STAY.HOLD.CUT",
      title: "The Empty Chair",
      slides: [
        { kind: "cover", see: "The boardroom at nine: every chair filled but one, a lanyard lying on it; Adaeze sitting down beside it. Caption space: top third.", say: "" },
        { kind: "time", see: "Wide on the full boardroom in morning light, one chair empty with a lanyard on the seat.", say: "9 a.m. She cut her assistant off. One chair is empty.", scene: "One empty chair. A lanyard." },
        { kind: "beat", who: "adaeze", see: "Adaeze taking her seat beside the empty chair and setting the brass key on the table; a small woman in white lace seated by the wall behind her; the board murmuring.", say: "She sits beside it. She does not look down.", scene: "She sits. The lanyard waits." },
        { kind: "beat", who: "tunde", see: "Tunde leaning back, the gold pen spinning between his fingers, grinning at the empty chair.", say: "The CEO smiles at the empty chair. He thinks she is alone.", scene: "The gold pen spins." },
        { kind: "beat", see: "Adaeze's hand laying the second will on the table, its last page signed twice, the Chairman's name visible. Executive portraits on the wall beyond.", say: "She lays down the second will. The Chairman's name is on it.", scene: "The will, face up." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "pen", object: "Tunde's gold pen", slide: 4, house: "Noir Director Editorial" }],
      alux: { product: "Noir Director Editorial", where: "the executive portraits on the boardroom wall, slide 5" },
    },
    {
      n: 5,
      after: "SPEAK.CHASE.ASK.READ",
      title: "Ten Years Owing",
      slides: [
        { kind: "cover", see: "Ifeoma's kitchen past midnight: the will unfolded under a bare bulb, Adaeze reading, Ifeoma's hand over her mouth. Caption space: top third.", say: "" },
        { kind: "time", see: "The kitchen table in Yaba past midnight, three cups of tea gone cold, a nursing induction portrait pinned above the stove.", say: "12:30 a.m. They open the will. The tea goes cold.", scene: "The kitchen table. A bare bulb." },
        { kind: "text", see: "Close on the will's last page: a schedule of debts, one line underlined twice in old ink.", say: "The will says the Chairman owes the company ₦2.1 billion.", scene: "One line, underlined twice." },
        { kind: "line", who: "ifeoma", see: "Ifeoma reading over Adaeze's shoulder, one hand over her mouth.", say: "“Ten years, madam. And he wants to sell before anyone counts.”", scene: "Ifeoma reads it twice." },
        { kind: "beat", who: "adaeze", see: "Morning: Adaeze walking into the boardroom with the will folded in her jacket, Chief Eze at the head of the table looking up.", say: "Nine a.m. She walks in knowing the number.", scene: "Morning. The boardroom. Every chair turns." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "tea", object: "the cups of tea on the kitchen table", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Nursing Induction", where: "the nursing induction portrait pinned above Ifeoma's stove, slide 2" },
    },
    {
      n: 5,
      after: "SPEAK.CHASE.ASK.KEEP",
      title: "Open It Yourself",
      slides: [
        { kind: "cover", see: "The boardroom at nine: a sealed envelope in the centre of the glass table, seven men around it, Adaeze standing. Caption space: top third.", say: "" },
        { kind: "time", see: "Wide on the seated board in morning light, the sealed envelope alone in the middle of the table.", say: "9 a.m. The sealed will sits in the middle of the table.", scene: "One sealed envelope. Seven men." },
        { kind: "line", who: "adaeze", see: "Adaeze sliding the sealed envelope down the table to Chief Eze, the way Tunde once slid the contract to her. Executive portraits on the wall behind.", say: "“You knew what it says, Chief. Open it yourself.”", scene: "She slides it down the table." },
        { kind: "beat", who: "eze", see: "Chief Eze's hands resting on the envelope, reading glasses on, the seal unbroken; the room holding its breath.", say: "The Chairman's hands rest on it. He will not open it.", scene: "His hands. The seal. Silence." },
        { kind: "beat", who: "tunde", see: "Tunde snatching the envelope, tearing it open and reading the last page; the colour leaving his face.", say: "The CEO tears it open. Then he stops smiling.", scene: "Paper tears. Tunde reads." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "envelope", object: "the sealed envelope on the glass table", slide: 2, house: "Noir Director Editorial" }],
      alux: { product: "Noir Director Editorial", where: "the executive portraits on the boardroom wall, slide 3" },
    },
    {
      n: 5,
      after: "SPEAK.CHASE.WATCH.TRUST",
      title: "The Piano",
      slides: [
        { kind: "cover", see: "A dark old house in Ikoyi at night: dust sheets over the furniture, a grand piano by the window in moonlight, Adaeze lifting its lid. Caption space: top third.", say: "" },
        { kind: "time", see: "The Ikoyi house at night, dust sheets, moonlight across the floor, a faded portrait of an old man on the piano.", say: "1 a.m. The old housekeeper leads her to her late mentor's house.", scene: "Dust sheets. Moonlight. A piano." },
        { kind: "beat", who: "adaeze", see: "Adaeze lifting the piano lid; inside, papers tied with black ribbon and a second envelope.", say: "Under the piano lid: the papers, and a second will.", scene: "The lid lifts. Black ribbon." },
        { kind: "text", see: "Close on a note in an old man's shaky hand, clipped to the will.", say: "His note: “For my silent partner. Read it in front of Obinna.”", scene: "His handwriting, shaking." },
        { kind: "beat", who: "adaeze", see: "Morning: Adaeze walking into the boardroom with the will and the note, the board turning; Chief Eze at the head.", say: "At nine, she reads it in front of the Chairman.", scene: "Morning. She walks in." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "piano", object: "the grand piano in the Ikoyi house", slide: 3, house: "Noir Director Editorial" }],
      alux: { product: "The Gear Equalizer — Pro Studio Upgrade", where: "the old man's faded portrait on the piano, brought back to life, slide 2" },
    },
    {
      n: 5,
      after: "SPEAK.CHASE.WATCH.DOUBT",
      title: "His Silent Partner",
      slides: [
        { kind: "cover", see: "The car park under the Marina tower at midnight: Adaeze and an old woman in white lace face to face under a flickering lamp. Caption space: top third.", say: "" },
        { kind: "time", see: "The car park under the tower at midnight, the broken lamp flickering over a pillar, puddles on the concrete.", say: "Midnight. She tests the old woman with one question.", scene: "Under the broken lamp." },
        { kind: "line", who: "adaeze", see: "Adaeze close to the old woman, voice low, testing her.", say: "“What did he call me, when I was not there?”", scene: "One question. No second chance." },
        { kind: "beat", see: "The old woman smiling for the first time and answering softly; Adaeze's eyes filling.", say: "She smiles. “His silent partner.” Then she names the Chairman.", scene: "The answer. Then the name." },
        { kind: "beat", who: "adaeze", see: "Morning: Adaeze walking into the boardroom with the papers tied in black ribbon, Chief Eze at the head looking up. Executive portraits on the wall.", say: "At nine, she walks in with the papers. And his name.", scene: "Morning. The boardroom. She walks in." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "lamp", object: "the flickering car park lamp", slide: 2, house: "Luma lux" }],
      alux: { product: "Noir Director Editorial", where: "the executive portraits on the boardroom wall, slide 5" },
    },

    // ── Episode 6 (Crown), the season finale: two versions, whichever road led here.
    {
      n: 6,
      after: "*.EXPOSE",
      title: "Bring the Cheque Book",
      slides: [
        { kind: "cover", see: "The boardroom at noon: Adaeze seated at the head of the table for the first time, the brass key on its ribbon at her wrist, half the chairs empty. Caption space: top third.", say: "" },
        { kind: "time", see: "The Marina tower lobby at ten in the morning, reporters with cameras pressed to the glass doors, Sunday holding them back.", say: "10 a.m. She chose to expose him. The press is waiting.", scene: "Cameras at the glass doors." },
        { kind: "beat", who: "adaeze", see: "Adaeze standing at the head of the table reading the second will aloud, the board silent, Chief Eze looking out at the lagoon.", say: "She reads it aloud. Every word. Nobody interrupts her now.", scene: "She reads. Nobody interrupts." },
        { kind: "beat", who: "eze", see: "Chief Eze rising, leaving his red cap on the table, walking out between the directors without his stick.", say: "The board votes the Chairman out. He leaves his red cap.", scene: "His red cap, left behind." },
        { kind: "beat", who: "tunde", see: "Tunde alone by the window, loosening his agbada, the gold pen on the floor at his feet.", say: "The sale is dead. So is the CEO's bonus.", scene: "The gold pen, on the floor." },
        { kind: "line", who: "adaeze", see: "Adaeze in the Chairman's chair, sliding the cheque book down the table to Tunde with one finger; a new executive portrait of her waiting to be hung on the wall.", say: "“Tunde, bring the cheque book. The grown-ups have decided.”", scene: "She slides it back to him." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [
        { key: "cameras", object: "the press cameras at the lobby doors", slide: 2, house: "Penthouse Dusk Paparazzi" },
        { key: "cheque", object: "the cheque book on the boardroom table", slide: 6, house: "Noir Director Editorial" },
      ],
      alux: {
        product: "Noir Director Editorial", where: "Adaeze's new executive portrait waiting to be hung on the boardroom wall, slide 6",
        word: "BOOK", line: "Every boardroom wall starts with one portrait. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6,
      after: "*.SPARE",
      title: "A Quiet Exit",
      slides: [
        { kind: "cover", see: "The long boardroom table with only two people at it, Adaeze and Chief Eze, a single sheet of paper between them, the board waiting in the corridor beyond the glass. Caption space: top third.", say: "" },
        { kind: "time", see: "The boardroom at twenty past nine, the directors sent out to the corridor, their shapes behind the glass.", say: "9:20 a.m. She spares him. She sends the board out.", scene: "Two chairs. One long table." },
        { kind: "line", who: "adaeze", see: "Adaeze sliding a single sheet across to Chief Eze: a resignation letter and a repayment schedule.", say: "“Repay it. Resign today. The will stays in this room.”", scene: "One sheet of paper." },
        { kind: "beat", who: "eze", see: "Chief Eze reading the letter, reading glasses on their chain, reaching slowly for his pen.", say: "The Chairman reads it twice. He signs. He thanks her.", scene: "He signs. His hand is steady." },
        { kind: "beat", who: "tunde", see: "The board filing back in, Tunde first, stopping when he sees Chief Eze's chair empty and Adaeze in it.", say: "The CEO walks back in. The Chairman's chair is hers now.", scene: "The Chairman's chair, taken." },
        { kind: "line", who: "adaeze", see: "Adaeze at the head of the table, sliding the cheque book down to Tunde with one finger; a new executive portrait of her waiting by the wall.", say: "“Tunde, bring the cheque book. The grown-ups have decided.”", scene: "She slides it back to him." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [
        { key: "pen", object: "the pen Chief Eze signs with", slide: 4, house: "Noir Director Editorial" },
        { key: "cheque", object: "the cheque book on the boardroom table", slide: 6, house: "Noir Director Editorial" },
      ],
      alux: {
        product: "Noir Director Editorial", where: "Adaeze's new executive portrait waiting by the boardroom wall, slide 6",
        word: "BOOK", line: "Every boardroom wall starts with one portrait. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
