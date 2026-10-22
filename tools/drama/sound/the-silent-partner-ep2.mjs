// Sound script — The Silent Partner, Episode 2 "The Empty Safe" (first sound test,
// owner 2026-10-22). Owner's choices: the sound plays on the COVER (slide 1 is
// posted as a 30-second video), Google's standard voices, 30 seconds with few
// words — a trailer for the episode, not a reading of every slide.
//
// Every time is in seconds from 0. tools/drama/sound/make.mjs makes, checks and
// mixes it. The first three seconds must hook: people swipe on fast.

export default {
  story: "the-silent-partner",
  episode: 2,
  title: "The Empty Safe",
  length: 30,
  picture: "cover", // the soundtrack plays over slide 1 for the whole length

  voices: {
    narrator: { voice: "algenib", who: "Narrator" },
    adaeze: { voice: "kore", who: "Adaeze Okafor, 36, finance director" },
    ifeoma: { voice: "leda", who: "Ifeoma Nnaji, 28, her assistant" },
    eze: { voice: "alnilam", who: "Chief Obinna Eze, 69, board chairman" },
  },

  // `at` = when the line starts; it must be finished by `by`.
  lines: [
    { who: "narrator", at: 0.8, by: 4.6, text: "Marina. Nine fifty-two p.m.",
      style: "Low, unhurried film-trailer narration, close to the microphone." },
    { who: "adaeze", at: 4.9, by: 11.5, text: "The trust is mine. You cannot sell without me.",
      style: "Quiet, controlled and absolutely certain; she never raises her voice." },
    { who: "ifeoma", at: 13.0, by: 16.8, text: "The trust's lawyer has left.",
      style: "Urgent and hushed, frightened, but every word clear." },
    { who: "eze", at: 17.6, by: 24.9, text: "No papers, Ms Okafor. You have lied to this board.",
      style: "An old chairman, slow, cold and final, a judge passing sentence." },
    { who: "narrator", at: 26.8, by: 29.4, text: "Stay... or chase?",
      style: "A low, intimate question straight to the listener, left hanging." },
  ],

  // Lyria 3 Pro: the score, timed to the same clock.
  score:
    "Instrumental only, no vocals, no singing, no choir words. A dark cinematic thriller underscore for a Nigerian corporate drama " +
    "set in a Lagos boardroom at night, in the style of a prestige streaming series trailer. Total length exactly 30 seconds. " +
    "Low strings, a soft felt piano, a deep sub pulse, with a subtle Nigerian talking drum used sparingly as tension.\n" +
    "[0:00 - 0:04] A low cello drone swells in at once under distant thunder, with one piano note.\n" +
    "[0:04 - 0:10.5] Almost silence: only a slow heartbeat-like sub pulse, so a quiet voice carries.\n" +
    "[0:10.5 - 0:13] Strings swell, one soft talking-drum hit.\n" +
    "[0:13 - 0:16.5] Nervous, quiet pizzicato strings.\n" +
    "[0:16.5 - 0:17.5] Everything drops out for one beat.\n" +
    "[0:17.5 - 0:25] A slow, dark string crescendo under a voice, held back, then at 0:25 one massive low cinematic impact.\n" +
    "[0:25 - 0:30] A single hanging dissonant string note that decays, ending in near silence.",

  // Lyria 3 Pro: the room and the sound effects, on their own layer.
  effects:
    "Sound design only. No music, no melody, no instruments, no vocals. A realistic film sound-effects track, 30 seconds, recorded in " +
    "a glass-walled office tower at night during heavy rain.\n" +
    "[0:00 - 0:30] Steady heavy rain against large glass windows and the low hum of air conditioning; a thunder roll at 0:01.\n" +
    "[0:11] A phone vibrating twice on a glass table.\n" +
    "[0:15.8 - 0:16.6] Two slow footsteps on a marble corridor.\n" +
    "[0:16.8] A heavy metal safe door unlocks with a clunk and swings open with a creak.\n" +
    "[0:25] A deep sub-bass impact.\n" +
    "[0:28 - 0:30] The rain fades out.",
};
