// Written for every road of the votes: each episode exists in two versions — one
// for each way the last vote went — that play the choice out, then meet in the
// same scene and the same next choice. Shared endings first; versions in `drafts`.

const EP2_ENDING = [
  { kind: "beat", who: "sade", see: "Mrs Ogunleye's parlour next morning: Sade, the rival planner in her red gele, seated beside Mrs Ogunleye on the gold sofa, a folder on her lap, morning sun through lace curtains.", say: "Next morning. On Mrs Ogunleye's sofa: Sade, the rival planner.", scene: "A red gele. A gold sofa." },
  { kind: "cliff", who: "iyaoko", see: "Mrs Ogunleye unrolling a bolt of burgundy lace across the parlour table, her fan pointing at it, Tolu and Kayode frozen in the doorway.", say: "“Meet my new planner. And my colour, chosen in March. Burgundy.”", scene: "Burgundy across the table." },
  { kind: "choice", see: "Two bolts side by side on the parlour table: Bimpe's emerald and Mrs Ogunleye's burgundy, the fan resting between them.", say: "" },
];
const EP2_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Whose colour should the wedding wear?", options: [{ word: "EMERALD", label: "Bimpe's emerald" }, { word: "BURGUNDY", label: "Mama's burgundy" }] },
  branches: {
    EMERALD: "Kayode backs the bride's emerald in front of his mother. She cancels her payment on the spot.",
    BURGUNDY: "Tolu gives in to burgundy to keep the job. In the fitting room, Bimpe cries without a sound.",
  },
};

const EP3_ENDING = [
  { kind: "beat", who: "kabiru", see: "Gbagi market at dusk, stalls closing, orange light under the rusted roofs; Alhaji Kabiru waving Tolu back to his stall.", say: "Gbagi, at dusk. Alhaji Kabiru calls Tolu back to his stall.", scene: "Closing stalls. Orange dusk." },
  { kind: "text", see: "Close on a faded 1994 wedding photograph in Alhaji Kabiru's hand: a young bride and her bridesmaid in identical emerald lace.", say: "1994: Mrs Ogunleye's wedding. Her chief bridesmaid: Tolu's mother.", scene: "Two young women. Identical emerald." },
  { kind: "cliff", who: "kabiru", see: "Alhaji Kabiru under a bare bulb at the stall, the photograph between him and Tolu, the market dark behind.", say: "“Same lace, best friends. After that wedding, they never spoke again.”", scene: "A bare bulb. An old photo." },
  { kind: "choice", see: "Close on the 1994 photograph in Tolu's hand, her phone in the other with 'Mummy' on the screen.", say: "" },
];
const EP3_VOTE = {
  cliff: { type: "reveal" },
  choice: { question: "Who does Tolu ask about the photo?", options: [{ word: "ASK", label: "Ask her own mother" }, { word: "SHOW", label: "Show Mrs Ogunleye" }] },
  branches: {
    ASK: "Tolu's mother laughs, then stops laughing. “She tore her own dress dancing on a table, and blamed my stitches.”",
    SHOW: "Mrs Ogunleye goes pale at the photo — then fires Tolu. “Your mother's daughter. Of course.”",
  },
};

const EP4_ENDING = [
  { kind: "beat", who: "sade", see: "Sade at a café table in Bodija typing on her phone, a satisfied smile, a planners' group chat on the screen.", say: "Sade posts to every planner in Ibadan: Tolu owes her two million.", scene: "One message. Every planner." },
  { kind: "cliff", who: "bimpe", see: "Midnight at Tolu's door: Bimpe in her white boubou, braids down, holding her engagement ring in her open palm, a street lamp behind her.", say: "“I can't do six hundred. Make it small, or I don't come.”", scene: "Midnight. A ring in her palm." },
  { kind: "choice", see: "Tolu's office wall: a seating plan for six hundred guests, one hand-drawn table for twenty pinned beside it.", say: "" },
];
const EP4_VOTE = {
  cliff: { type: "arrival" },
  choice: { question: "Big wedding or small?", options: [{ word: "SMALL", label: "Twenty guests, Bimpe's way" }, { word: "BIG", label: "Six hundred, Bimpe's rules" }] },
  branches: {
    SMALL: "Tolu cancels six hundred guests to save her friend — and loses the job that would have saved her business.",
    BIG: "Tolu talks Bimpe into the big wedding on one condition: from today, every choice belongs to the bride.",
  },
};

const EP5_ENDING = [
  { kind: "beat", who: "bimpe", see: "A corridor behind the venue: Bimpe in her emerald gown walking toward the doors, her train catching on a nail in a wooden crate.", say: "Ten minutes to the aisle. Bimpe's train catches on a nail.", scene: "A wooden crate. One nail." },
  { kind: "cliff", see: "Close on the torn gown: a split from knee to floor, the beading scattered on the concrete, Bimpe's hands over her mouth.", say: "A tear from knee to floor. Exactly like 1994.", scene: "Beads on the concrete." },
  { kind: "choice", see: "Close on a needle and emerald thread on a sewing tin, two hands reaching for it — an older woman's and Kayode's.", say: "" },
];
const EP5_VOTE = {
  cliff: { type: "loss" },
  choice: { question: "Who mends the bride's gown?", options: [{ word: "TAILOR", label: "Tolu's mother, the tailor" }, { word: "KAYODE", label: "Kayode, who can sew" }] },
  branches: {
    TAILOR: "Tolu's mother kneels at the bride's hem in front of Mrs Ogunleye, for the first time in thirty years.",
    KAYODE: "Kayode rolls up his sleeves. His grandmother taught him to sew, and he never told anyone.",
  },
};

const EP6_ENDING = [
  { kind: "cliff", who: "kayode", see: "Late at the reception, fairy lights, the dance floor emptying; Kayode holding out a small square of beige lace to Tolu.", say: "Kayode, with beige lace: “For ours. If you'll plan it.”", scene: "Fairy lights. Beige lace." },
  { kind: "choice", see: "Close on the beige lace between Kayode's hand and Tolu's, a gold hoop catching the light.", say: "" },
];
const EP6_VOTE = {
  finale: true, // the last episode of the season: its vote decides how season two begins
  cliff: { type: "mirror" },
  choice: { question: "Does Tolu say yes to Kayode?", options: [{ word: "YES", label: "Yes" }, { word: "WAIT", label: "Not yet" }] },
  branches: {
    YES: "Season two: Tolu plans her own wedding — and Mrs Ogunleye has already chosen the colour.",
    WAIT: "Season two: Tolu says not yet. Kayode hires Sade to plan the perfect proposal.",
  },
};

export default {
  slug: "aso-ebi",
  title: "Aso Ebi",
  tagline: "Two families. One fabric. No agreement.",
  genre: "romcom",
  city: "Ibadan",
  logline: "Tolu is the bride's best friend. Kayode is the groom's brother. They cannot stand each other — and they have nine days to dress six hundred guests.",
  minVotes: 2,
  cast: [
    { key: "tolu", name: "Toluwani “Tolu” Adeyemi", age: 29, role: "Events planner, the bride's best friend", archetype: "The Jester", side: "light", tier: "lead", open: true,
      look: "Curvy, bold gold hoops, a high puff of natural hair, bright ankara jumpsuit, clipboard and sunglasses.",
      want: "The most talked-about wedding in Ibadan.", secret: "This wedding is her whole business — she is broke if it fails." },
    { key: "kayode", name: "Kayode Ogunleye", age: 32, role: "Accountant, the groom's brother", archetype: "The Sage", side: "too much", tier: "lead", open: true,
      look: "Tall, clean fade, crisp white shirt sleeves rolled, rimless glasses, a tablet with a spreadsheet open.",
      want: "A wedding that comes in under budget.", secret: "He is paying for half of it himself." },
    { key: "bimpe", name: "Bimpe", age: 28, role: "The bride", archetype: "The Innocent", side: "light", tier: "main", open: true,
      look: "Soft-spoken, long braids, white boubou, a ring she keeps turning.",
      want: "Everyone she loves in one colour.", secret: "She is having doubts — not about the groom." },
    { key: "iyaoko", name: "Mrs Ogunleye", age: 58, role: "The groom's mother", archetype: "The Oga", side: "too much", tier: "main", open: true,
      look: "Majestic gele, gold coral beads, a fan she uses like a gavel.",
      want: "Her colour. Her way.", secret: "She chose the fabric months ago and told no one." },
    { key: "kabiru", name: "Alhaji Kabiru", age: 61, role: "Fabric seller at Gbagi market", archetype: "The Companion", side: "light", tier: "cameo", open: true,
      look: "White kaftan, embroidered cap, measuring tape around his neck, a calculator older than Tolu.",
      want: "To sell the last bolt to the right buyer.", secret: "He knows both families' history." },
    // A guest, written in while the story runs: open to play until Episode 2 is made.
    { key: "sade", name: "Sade Bankole", age: 31, role: "The rival planner, Tolu's old business partner", archetype: "The Hustler", side: "too much", tier: "cameo", open: true,
      guest: true, enters: 2,
      look: "Sleek, a red gele tied high, a red silk blouse, gold-rimmed sunglasses, a leather folder held to her chest.",
      want: "Tolu's clients, and her money back.", secret: "She still keeps their old business card in her purse." },
  ],
  episodes: [
    {
      n: 1,
      title: "Nine Days",
      slides: [
        { kind: "cover", see: "Tolu and Kayode back to back in a narrow fabric shop, each holding up a different bolt of lace, colour everywhere around them. Caption space: top third.", say: "" },
        { kind: "time", see: "Gbagi market, Ibadan, at noon: rusted roofs, bolts of lace in every colour, heat shimmer, a radio playing somewhere.", say: "Ibadan. Nine days to the wedding. Forty degrees. No fabric.", scene: "Gbagi at noon. Heat shimmer." },
        { kind: "beat", see: "In an alley of fabric stalls: Tolu with a clipboard and a mood board; Kayode with a spreadsheet glowing on his tablet.", say: "She brought a mood board. He brought a spreadsheet.", scene: "A mood board. A spreadsheet." },
        { kind: "line", see: "Tolu holding up emerald lace; Kayode holding up beige; both certain.", say: "“Beige is timeless.” “Beige is a cry for help.”", scene: "Emerald against beige." },
        { kind: "line", who: "iyaoko", see: "Mrs Ogunleye glaring from a video call on Kayode's tablet. Pinned on the stall wall behind them, Bimpe's pre-wedding portrait in emerald.", say: "“Six hundred guests. One wrong colour, and you both answer to me.”", scene: "Mama, on video. Fan raised." },
        { kind: "beat", see: "Alhaji Kabiru lifting the last bolt of emerald lace; behind Tolu, a rival planner in a red gele reaching for it.", say: "One bolt left. A rival planner reaching for it.", scene: "The last bolt. A red gele." },
        { kind: "cliff", see: "Three hands on one bolt of emerald lace: Tolu's at one end, Kayode's at the other, the rival's in the middle.", say: "Three hands. One fabric. Nobody lets go.", scene: "Three hands on one bolt." },
        { kind: "choice", see: "Tolu and Kayode's eyes meeting over the stretched lace, the first time they have agreed on anything.", say: "" },
      ],
      cliff: { type: "mirror" },
      choice: {
        question: "Do they team up, or does Tolu go it alone?",
        options: [{ word: "TEAM", label: "Team up" }, { word: "SOLO", label: "Tolu goes alone" }],
      },
      branches: {
        TEAM: "His money and her charm outbid the rival. Caught by a sudden downpour, they wait under one tarp — and Kayode tells her he is paying for half the wedding.",
        SOLO: "Tolu wins the bolt alone and leaves him in the market. That evening Kayode learns the rival planner is Tolu's old business partner — and that Tolu owes her money.",
      },
      slots: [
        { key: "fabric", object: "the emerald lace everyone is fighting over", slide: 6, house: "Emerald Empress: Beaded Column Gown with Draped Veil" },
        { key: "drink", object: "the cold drinks in the stall's cooler", slide: 3, house: "Emerald Empress: Beaded Column Gown with Draped Veil" },
      ],
      alux: { product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "Bimpe's emerald pre-wedding portrait pinned on the stall wall, slide 5" },
    },
  ],

  drafts: [
    // ── Episode 2 (Pressure): the save-the-date, and Mama's new planner.
    {
      n: 2, after: "TEAM", title: "Under One Tarp",
      slides: [
        { kind: "cover", see: "Tolu and Kayode squeezed under one blue tarp in heavy rain at Gbagi, the emerald bolt held between them, both soaked and laughing. Caption space: top third.", say: "" },
        { kind: "time", see: "Gbagi in a sudden afternoon downpour, traders pulling tarps over lace, the alley running with water, grey light.", say: "Gbagi. 4 p.m. Rain like a bucket. One tarp.", scene: "Grey rain. Blue tarp." },
        { kind: "line", who: "kayode", see: "Kayode under the tarp, glasses fogged, quietly showing Tolu a bank transfer on his tablet.", say: "“I'm paying half this wedding. My brother doesn't know.”", scene: "Fogged glasses. One transfer." },
        { kind: "line", who: "tolu", see: "Tolu looking at him differently for the first time, rain dripping off the tarp's edge between them.", say: "“So the spreadsheet man has a heart. Who knew?”", scene: "Rain between them." },
        { kind: "beat", who: "tolu", see: "Tolu on her phone turning their rain photo of the emerald lace into a moving save-the-date and sending it to the guest list, the send bar filling.", say: "She makes the lace a moving save-the-date. Six hundred phones buzz.", scene: "A moving card. Six hundred sends." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "tarp", object: "the tarp they shelter under", slide: 2, house: "Emerald Empress: Beaded Column Gown with Draped Veil" }],
      alux: {
        product: "Instagram GIF Maker", where: "Tolu turns the emerald lace photo into a moving save-the-date, slide 5",
        word: "GIF", line: "Six hundred guests, one moving save-the-date. Comment GIF and we'll make yours move.",
      },
    },
    {
      n: 2, after: "SOLO", title: "Old Partner",
      slides: [
        { kind: "cover", see: "Kayode in a Bodija café facing Sade in her red gele, a printed invoice on the table between them. Caption space: top third.", say: "" },
        { kind: "time", see: "A café in Bodija at 7 p.m., warm lamps, a generator humming outside, rain on the window.", say: "Bodija. 7 p.m. The rival planner asked to meet him.", scene: "Warm lamps. Rain on glass." },
        { kind: "line", who: "sade", see: "Sade sliding an old invoice across the table to Kayode, a business card with two names — hers and Tolu's.", say: "“We started together. She left me with two million in debt.”", scene: "One card. Two names." },
        { kind: "beat", who: "kayode", see: "Kayode reading the invoice, his accountant's eyes checking every figure, the café lamp on his glasses.", say: "Kayode checks every figure. They add up.", scene: "Every figure checked." },
        { kind: "beat", who: "tolu", see: "Tolu at home turning her emerald lace photo into a moving save-the-date and sending it to six hundred guests, unaware.", say: "Across town, Tolu sends a moving save-the-date to six hundred guests.", scene: "A moving card. Six hundred sends." },
        ...EP2_ENDING,
      ],
      ...EP2_VOTE,
      slots: [{ key: "coffee", object: "the coffee on the café table", slide: 2, house: "Emerald Empress: Beaded Column Gown with Draped Veil" }],
      alux: {
        product: "Instagram GIF Maker", where: "Tolu turns the emerald lace photo into a moving save-the-date, slide 5",
        word: "GIF", line: "Six hundred guests, one moving save-the-date. Comment GIF and we'll make yours move.",
      },
    },

    // ── Episode 3 (Turn): the colour is chosen, and Alhaji Kabiru's photograph.
    {
      n: 3, after: "*.EMERALD", title: "Half",
      slides: [
        { kind: "cover", see: "Kayode standing between his mother and Bimpe in the parlour, the emerald bolt in his arms, Mrs Ogunleye's fan stopped mid-air. Caption space: top third.", say: "" },
        { kind: "time", see: "Mrs Ogunleye's parlour, seven days to go, the ceiling fan slowing as the power cuts, a still afternoon.", say: "Seven days to go. The power cuts. Nobody moves.", scene: "The fan slows. Silence." },
        { kind: "line", who: "kayode", see: "Kayode holding the emerald lace, facing his mother, rimless glasses steady.", say: "“Bimpe chose emerald, Mummy. So do I.”", scene: "Emerald in his arms." },
        { kind: "line", who: "kayode", see: "Mrs Ogunleye snapping her fan shut; Kayode, calm, turning his tablet to show her months of transfers.", say: "“Then pay for it yourself.” “I already do. Half. Since March.”", scene: "The fan snaps. Months of transfers." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "tablet", object: "Kayode's tablet with the transfers", slide: 5, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: { product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "the emerald lace Kayode holds up, beside Bimpe's emerald portrait on the parlour wall, slide 3" },
    },
    {
      n: 3, after: "*.BURGUNDY", title: "Fitting Room",
      slides: [
        { kind: "cover", see: "Bimpe alone in a tailor's fitting room in a burgundy gown, looking into a long mirror, Tolu's hand on the curtain. Caption space: top third.", say: "" },
        { kind: "time", see: "A tailor's shop in Bodija, seven days to go, six hundred burgundy fabric bags stacked to the ceiling, a hot afternoon.", say: "Seven days to go. Six hundred burgundy bags. One bride.", scene: "Burgundy bags to the ceiling." },
        { kind: "line", who: "bimpe", see: "Bimpe in the mirror in a burgundy and gold gown, one tear she doesn't wipe, turning to Tolu through the half-open curtain.", say: "“It's not the colour. Nothing about this wedding is mine.”", scene: "A half-open curtain." },
        { kind: "beat", who: "kayode", see: "Kayode outside the curtain with two cold drinks, hearing every word, his face falling.", say: "Outside the curtain, Kayode hears every word.", scene: "Two cold drinks. Every word." },
        ...EP3_ENDING,
      ],
      ...EP3_VOTE,
      slots: [{ key: "drink", object: "the cold drinks Kayode brings to the fitting", slide: 5, house: "Regal Burgundy & Gold Tapestry Ensemble" }],
      alux: { product: "Regal Burgundy & Gold Tapestry Ensemble", where: "the burgundy and gold gown Bimpe wears in the fitting room mirror, slide 3" },
    },

    // ── Episode 4 (Cost): the truth about 1994, and the price Tolu pays.
    {
      n: 4, after: "*.ASK", title: "The Tailor's Version",
      slides: [
        { kind: "cover", see: "Tolu and her mother in a small tailoring shop at night, sewing machines covered, the 1994 photograph on the cutting table. Caption space: top third.", say: "" },
        { kind: "time", see: "Tolu's mother's tailoring shop in Bodija at 10 p.m., one bulb, sewing machines under cloth covers, pins in a tin.", say: "Her mother's shop. 10 p.m. The machines asleep.", scene: "One bulb. Covered machines." },
        { kind: "line", see: "Tolu's mother, sixties, glasses on a chain, tapping the photograph with a pin, half laughing.", say: "“She tore it dancing on a table. Then blamed my stitches.”", scene: "A pin on the photograph." },
        { kind: "beat", who: "tolu", see: "Tolu relighting the dark old photo on her phone: in the brighter picture, Mrs Ogunleye's own heel is caught in her hem.", say: "Tolu relights the old photo. Mrs Ogunleye's heel, caught in her hem.", scene: "Relit: a heel in the hem." },
        { kind: "line", who: "tolu", see: "Tolu holding up her phone to her mother, the relit photo glowing, both of them staring.", say: "“Thirty years, Mummy. And the proof was in your drawer.”", scene: "Thirty years of proof." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "phone", object: "the phone Tolu relights the photo on", slide: 4, house: "Penthouse Dusk Paparazzi" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Tolu relights the dark 1994 photograph and finds the heel in the hem, slide 4",
        word: "LIGHT", line: "Thirty years in the dark, the truth in one relit photo. Comment LIGHT and we'll relight yours.",
      },
    },
    {
      n: 4, after: "*.SHOW", title: "Fired",
      slides: [
        { kind: "cover", see: "Tolu walking out of Mrs Ogunleye's gate at night with her clipboard and mood board, Kayode running after her. Caption space: top third.", say: "" },
        { kind: "time", see: "The Ogunleye compound at night, gate lights on, a guard holding the gate open, crickets.", say: "The Ogunleye gate. 9 p.m. Six days to go.", scene: "Gate lights. Crickets." },
        { kind: "line", who: "iyaoko", see: "Mrs Ogunleye on her steps, fan pointed at the gate, the photograph face down at her feet.", say: "“Your mother's daughter. Of course. You're finished here.”", scene: "The photo, face down." },
        { kind: "beat", who: "tolu", see: "Tolu at home relighting the dark 1994 photo on her phone: brighter now, Mrs Ogunleye's own heel caught in her hem.", say: "At home she relights it. Mrs Ogunleye's heel, caught in her hem.", scene: "Relit: a heel in the hem." },
        { kind: "line", who: "kayode", see: "Kayode at Tolu's door, out of breath, tablet under his arm, looking at the relit photo over her shoulder.", say: "“She fired you for her own heel. I'm staying.”", scene: "Out of breath. Staying." },
        ...EP4_ENDING,
      ],
      ...EP4_VOTE,
      slots: [{ key: "phone", object: "the phone Tolu relights the photo on", slide: 4, house: "Penthouse Dusk Paparazzi" }],
      alux: {
        product: "The Gear Equalizer — Pro Studio Upgrade", where: "Tolu relights the dark 1994 photograph and finds the heel in the hem, slide 4",
        word: "LIGHT", line: "Thirty years in the dark, the truth in one relit photo. Comment LIGHT and we'll relight yours.",
      },
    },

    // ── Episode 5 (Storm): the wedding day, and the torn gown.
    {
      n: 5, after: "*.SMALL", title: "Twenty Chairs",
      slides: [
        { kind: "cover", see: "A garden wedding in Jericho, Ibadan: twenty white chairs under a mango tree, emerald ribbons, Tolu setting the last place card. Caption space: top third.", say: "" },
        { kind: "time", see: "A garden in Jericho on the wedding morning, soft sun through mango leaves, twenty chairs, a small string quartet tuning.", say: "Wedding day. A garden in Jericho. Twenty chairs.", scene: "Twenty chairs. Mango shade." },
        { kind: "beat", who: "iyaoko", see: "Mrs Ogunleye sweeping through the garden gate in burgundy, eighty relatives in burgundy behind her.", say: "Mrs Ogunleye arrives anyway. With eighty relatives in burgundy.", scene: "Eighty burgundy cousins." },
        { kind: "line", who: "iyaoko", see: "Mrs Ogunleye surveying the twenty chairs, fan open.", say: "“Twenty? I have twenty cousins in my car.”", scene: "Twenty chairs. Eighty guests." },
        { kind: "beat", who: "kayode", see: "Kayode quietly carrying stacks of plastic chairs in from a van, sleeves rolled, Tolu watching him.", say: "Kayode carries in eighty more chairs. Nobody asked him to.", scene: "Plastic chairs. Rolled sleeves." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "chairs", object: "the chairs Kayode carries in", slide: 5, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "Bimpe's emerald gown on its stand beside the twenty chairs, slide 2" },
    },
    {
      n: 5, after: "*.BIG", title: "Six Hundred",
      slides: [
        { kind: "cover", see: "A grand Ibadan event hall full of six hundred guests in emerald, a block of burgundy relatives on one side, Tolu in the middle with a headset. Caption space: top third.", say: "" },
        { kind: "time", see: "An event hall in Ibadan on the wedding morning, chandeliers, six hundred emerald chairs, a generator rumbling outside.", say: "Wedding day. Six hundred guests. One generator.", scene: "Chandeliers. One generator." },
        { kind: "beat", who: "iyaoko", see: "Mrs Ogunleye and eighty relatives in burgundy filling the front rows of an emerald hall, fans open like a wall.", say: "Five hundred in emerald. Mrs Ogunleye's eighty in burgundy. Front row.", scene: "A burgundy wall of fans." },
        { kind: "line", who: "bimpe", see: "Bimpe in the bridal room in emerald, steady for the first time, holding Tolu's hand.", say: "“Every choice was mine today. I'm ready.”", scene: "Steady, for the first time." },
        { kind: "beat", who: "sade", see: "Sade at the back of the hall in her red gele, phone up, filming, waiting for something to go wrong.", say: "At the back, Sade is filming. Waiting.", scene: "A red gele. A raised phone." },
        ...EP5_ENDING,
      ],
      ...EP5_VOTE,
      slots: [{ key: "headset", object: "Tolu's headset", slide: 2, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: { product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "Bimpe's emerald gown in the bridal room, slide 4" },
    },

    // ── Episode 6 (Crown), the season finale.
    {
      n: 6, after: "*.TAILOR", title: "The Same Needle",
      slides: [
        { kind: "cover", see: "Tolu's mother kneeling at Bimpe's hem with needle and emerald thread, Mrs Ogunleye standing over them, the corridor lit by one warm bulb. Caption space: top third.", say: "" },
        { kind: "time", see: "The corridor behind the venue, a warm bulb, music muffled through the doors, the clock on the wall at 3:52.", say: "3:52 p.m. Eight minutes to the aisle.", scene: "A warm bulb. Muffled music." },
        { kind: "beat", see: "Tolu's mother sewing the hem fast and clean, Mrs Ogunleye watching every stitch, both of them silent.", say: "Her stitches are perfect. Mrs Ogunleye watches every one.", scene: "Fast, clean stitches." },
        { kind: "line", who: "iyaoko", see: "Mrs Ogunleye lowering her fan for the first time, her coral beads still.", say: "“I tore mine dancing. I'm sorry, Kemi. Thirty years sorry.”", scene: "The fan comes down." },
        { kind: "beat", who: "bimpe", see: "Bimpe walking down the aisle in her mended emerald gown, the hall standing, Tolu and Kayode side by side at the back.", say: "Bimpe walks the aisle. Nobody can see the mend.", scene: "The mend, invisible." },
        { kind: "beat", who: "tolu", see: "Bimpe and her groom posing for their wedding portrait in emerald under a softbox, warm key light, Tolu fixing the veil.", say: "The wedding portrait: emerald, perfect, nothing torn.", scene: "A softbox. A perfect veil." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "thread", object: "the emerald thread and needle", slide: 3, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: {
        product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "the wedding portrait in the mended emerald gown and veil, slide 6",
        word: "BOOK", line: "A gown that survived the day, a portrait that lasts. Comment BOOK and we'll make yours.",
      },
    },
    {
      n: 6, after: "*.KAYODE", title: "Steady Hands",
      slides: [
        { kind: "cover", see: "Kayode kneeling at Bimpe's hem with needle and emerald thread, glasses on, Tolu holding her phone light over his hands. Caption space: top third.", say: "" },
        { kind: "time", see: "The corridor behind the venue, a warm bulb, music muffled through the doors, the clock on the wall at 3:52.", say: "3:52 p.m. Eight minutes to the aisle.", scene: "A warm bulb. Muffled music." },
        { kind: "beat", who: "kayode", see: "Kayode sewing small, perfect stitches, Tolu holding her phone torch steady over the hem.", say: "Small, perfect stitches. Tolu holds the light.", scene: "Her light. His stitches." },
        { kind: "line", who: "kayode", see: "Kayode biting off the thread, glancing up at Tolu with a small smile.", say: "“My grandmother. Every Saturday. Don't tell my mother.”", scene: "A bitten thread. A smile." },
        { kind: "beat", who: "iyaoko", see: "Mrs Ogunleye in the corridor doorway, having seen everything, lowering her fan.", say: "Mrs Ogunleye saw everything. She lowers her fan.", scene: "The fan comes down." },
        { kind: "beat", who: "tolu", see: "Bimpe and her groom posing for their wedding portrait in emerald under a softbox, warm key light, Tolu fixing the veil.", say: "The wedding portrait: emerald, perfect, nothing torn.", scene: "A softbox. A perfect veil." },
        ...EP6_ENDING,
      ],
      ...EP6_VOTE,
      slots: [{ key: "thread", object: "the emerald thread and needle", slide: 3, house: "Navy Regal Gele & structured capes (Color-Shift)" }],
      alux: {
        product: "Emerald Empress: Beaded Column Gown with Draped Veil", where: "the wedding portrait in the mended emerald gown and veil, slide 6",
        word: "BOOK", line: "A gown that survived the day, a portrait that lasts. Comment BOOK and we'll make yours.",
      },
    },
  ],
};
