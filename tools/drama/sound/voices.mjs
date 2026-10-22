// The voice of every role, fixed per story so a character sounds the same in
// every episode. Owner, 2026-10-22: "a mix of both Nigerian voices and foreign
// voices — it depends on the story."
//
// A role is either
//   "name"                       — a Gemini 3.8 standard voice (they sound American/international), or
//   { nigerian: "…", gender }    — a DESIGNED voice: Gemini 3.8 voice design (type "prompted",
//                                  language en-NG) from that description, made once by
//                                  tools/drama/sound/design-voices.mjs; its id is kept in
//                                  designed-voices.json and reused for every episode.
//   { designed: "…", gender, language } — a designed voice in another English (e.g. the
//                                  international trailer narrator, language en-US).
// The narrator carries every soundtrack (the recap style), so a story's narrator is
// best DESIGNED as a trailer/recap voice rather than a stock one (Gemini TTS docs:
// build a character through voice design, keep the per-line styles short).
// Narrators: international for the corporate, thriller, political and mystery stories;
// Nigerian for family, romance, romcom and the 1962 period story (as each is designed).
//
// Standard voices, by the library's gender and description:
//   female — achernar (soft), laomedeia (upbeat), leda (youthful), zephyr (bright),
//            aoede (breezy), autonoe (bright), callirrhoe (easy-going), despina (smooth),
//            erinome (clear), gacrux (mature), kore (firm), sulafat (warm), vindemiatrix (gentle)
//   male   — achird (warm), algenib (gravelly), algieba (smooth), alnilam (commanding),
//            charon (steady), enceladus (soft-spoken), fenrir (excitable), iapetus (clear),
//            orus (serious), puck (upbeat), sadachbia (lively), schedar (even),
//            umbriel (easy-going), zubenelgenubi (casual), rasalgethi (measured), sadaltager (knowing)
// Every role in a story's cast (guests too) must be here: the sound job checks it.

export default {
  "the-silent-partner": {
    // International film-trailer / drama-recap narrator (was the stock "algenib").
    narrator: { gender: "male", language: "en-US", designed: "A man in his forties with the voice of a premium film-trailer and drama-recap narrator: a deep, rich, slightly gravelly baritone, close to the microphone; gripping, urgent storytelling with controlled intensity and crisp consonants, so every short sentence lands. Neutral international English." },
    adaeze: { gender: "female", nigerian: "A 36-year-old Nigerian woman from Lagos, an Igbo finance director educated in Nigeria: a warm, low, composed voice with a clear Nigerian English accent — Nigerian vowels and rhythm — speaking quietly and precisely." },
    tunde: { gender: "male", nigerian: "A 47-year-old Yoruba man from Lagos, a chief executive: a big, warm, booming baritone with a strong Lagos Nigerian English accent, confident and charming, a laugh never far away." },
    ifeoma: { gender: "female", nigerian: "A 28-year-old Igbo woman from Enugu working in a Lagos office: a bright, quick, slightly breathy young voice with a natural Nigerian English accent, polite and nervous." },
    eze: { gender: "male", nigerian: "A 69-year-old Igbo chief who chairs a company board: a deep, slow, grave voice with an old-school Nigerian English accent, every word weighed and commanding." },
    damola: "algieba", // the buyer's lawyer: polished, British-educated
    guard: { gender: "male", nigerian: "A 52-year-old night security guard in Lagos: a soft, tired, kind voice with a strong everyday Yoruba-influenced Nigerian accent, humble and gentle." },
    funke: { gender: "female", nigerian: "A 63-year-old Yoruba housekeeper from Lagos: a small, firm, dignified older woman's voice with a strong Yoruba Nigerian English accent, careful and honest." },
  },
  "third-mainland": {
    narrator: "enceladus",
    funmi: "erinome", driver: "orus", hauwa: "kore", bisi: "leda", partner: "iapetus", vendor: "puck",
  },
  "garden-city": {
    narrator: "sulafat",
    ibiere: "gacrux", soye: "algieba", tonye: "enceladus", udo: "alnilam", amara: "zephyr", boma: "vindemiatrix",
  },
  "harmattan-letters": {
    narrator: "achernar",
    zainab: "despina", yusuf: "achird", hauwa: "gacrux", garba: "orus", mason: "umbriel",
  },
  "aso-ebi": {
    narrator: "puck",
    tolu: "laomedeia", kayode: "iapetus", bimpe: "achernar", iyaoko: "kore", kabiru: "rasalgethi", sade: "zephyr",
  },
  "the-fourth-floor": {
    narrator: "orus",
    halima: "erinome", coker: "algieba", chuka: "sadachbia", asabe: "gacrux", musa: "achird",
  },
  "what-the-river-keeps": {
    narrator: "vindemiatrix",
    ada: "kore", ebuka: "algenib", chidi: "umbriel", obiora: "alnilam", apprentice: "leda",
  },
  "coal-city-1962": {
    narrator: "rasalgethi",
    nkem: "sulafat", ike: "fenrir", ogbu: "orus", lolo: "gacrux", barman: "zubenelgenubi",
  },
};
