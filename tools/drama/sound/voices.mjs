// The voice of every role, fixed per story so a character sounds the same in
// every episode (owner, 2026-10-22: Google's standard voices). Gemini 3.8 TTS
// prebuilt voices, by the library's own gender, pitch and description:
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
    narrator: "algenib",
    adaeze: "kore", tunde: "sadachbia", ifeoma: "leda", eze: "alnilam",
    damola: "algieba", guard: "achird", funke: "gacrux",
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
