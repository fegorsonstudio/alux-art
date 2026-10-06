/**
 * Story pictures for every Photo Wahala episode, turned into Google Flow
 * prompts from what the writers put beside each story (stories/*.mjs: the
 * cast, and two scenes per episode).
 *
 * Two pictures per episode, shown full-screen between the text slides. The
 * owner makes them in Google Flow for free — the studio only writes the
 * prompts — and drops each finished picture on its own scene card, so a
 * picture can never land in the wrong slot. (The repo learned that the hard
 * way: guessing afterwards which download belonged where cost 45 wrongly
 * labelled files.)
 *
 * Why two: Instagram stops at 10 slides, and an episode is already 8 — the
 * before, the after and six text cards.
 *
 * CONSISTENT FACES. Each story has a cast:
 *   - The MAIN character is a real person — the one in that episode's before
 *     and after. Their own photo is the face reference in Flow, so the story
 *     pictures and the before/after show the same face. They must have agreed
 *     to play the part, including AI-made scenes of them.
 *   - SUPPORTING characters are invented. Each has a portrait prompt: make the
 *     face once in Flow, then attach that portrait to every scene they are in.
 *
 * Every prompt follows the house template in CLAUDE.md — Scene / Subject /
 * Important Details / Use Case / Constraints — with the face rule spelled out,
 * because Flow keeps likeness only when told to.
 *
 * Flow has no 4:5. Pictures are made at 3:4 and trimmed to Instagram's 4:5,
 * which loses a sliver top and bottom — hence "keep heads clear of the edges".
 */

export const FLOW_SETTINGS = "Google Flow · Nano Banana · 3:4 portrait · 2K";

const USE_CASE =
  "Use Case: a cinematic still from a Nigerian drama series, shown full-screen between the text slides of an Instagram carousel.";
const CONSTRAINTS =
  "Constraints: photo-realistic. Every face must match its attached reference exactly — same face shape, eye spacing, " +
  "nose, lips, jawline, skin tone and hairline; change only expression and pose. Realistic skin texture, natural asymmetry, " +
  "realistic fabric folds, subtle film grain, physically plausible light, 35mm lens feel. No text, captions, logos or " +
  "watermarks, and no phone or laptop screen with readable writing. Keep every head well inside the frame, clear of the " +
  "top and bottom tenth — the picture is trimmed to 4:5. No people beyond those described, apart from blurred background guests where stated.";

/** A face reference for an invented character: made once, attached everywhere. */
const portrait = (who) => [
  "Scene: plain light-grey studio backdrop, soft even light from the front-left, gentle fill, no harsh shadows.",
  `Subject: ${who}. Head and shoulders, facing the camera, relaxed neutral expression, mouth closed.`,
  "Important Details: sharp focus on the eyes; natural skin texture; a simple plain top; nothing covering the face.",
  "Use Case: the face reference for a recurring character in a photo-story series — every scene in the story is matched to this face.",
  "Constraints: photo-realistic, an ordinary real-looking person rather than a model, no retouching, no text or logos, head centred and uncropped.",
].join("\n");

/** One scene: which card it follows, whose faces to attach, and the prompt. */
const scene = (after, attach, setting, subject, details) => ({
  after, attach,
  prompt: [`Scene: ${setting}`, `Subject: ${subject}`, `Important Details: ${details}`, USE_CASE, CONSTRAINTS].join("\n"),
});

const real = (name, who) => ({ name, real: true, note: `Use your photo of the person playing ${name}: ${who}` });
const made = (name, who) => ({ name, real: false, prompt: portrait(who) });

/**
 * Everything the studio needs for one episode of a written story: the cast,
 * the two scene prompts and the Flow settings. `season` and `story` are what
 * the calendar calls it (1 and 3 for "S1 · Story 03"; "december" for a special).
 */
export function storyboardOf(s, ep, season, story) {
  const e = s.eps[ep - 1];
  if (!e?.scenes?.length) return null;
  return {
    season, story,
    cast: (s.cast ?? []).map((c) => (c.real ? real(c.name, c.who) : made(c.name, c.who))),
    scenes: e.scenes.map((x) => scene(x.after, x.attach, x.setting, x.subject, x.details)),
    flow: FLOW_SETTINGS,
  };
}
