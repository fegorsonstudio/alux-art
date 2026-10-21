/**
 * How every picture in Alux Micro Drama is lit and graded (owner, 2026-10-21:
 * "each generated image must carry its lighting prompt … professional studio
 * lighting or professional movie lighting … Hollywood, Netflix").
 *
 * A prompt that does not describe the light gets flat, generic light. So every
 * generated image names its key, fill ratio, rim, colour temperatures,
 * practicals and atmosphere, and its colour grade, in film terms, per genre —
 * and the exact text used is stored with the image (render notes / cover_meta),
 * so we always know how a picture was lit.
 *
 * These are written cinematography recipes for the drama, not captured looks:
 * the Gear Equalizer's 197 lighting looks still come only from the owner's gem.
 */

export type LightRecipe = { lighting: string; grade: string };

const FILM = "Shot like a prestige streaming drama: a large-format cinema camera, a 50mm–85mm prime lens, shallow depth of field, physically motivated light, realistic skin texture.";

export const GENRE_LIGHT: Record<string, LightRecipe> = {
  power: {
    lighting: "Low-key cinematic lighting. A large soft key through diffusion from 45 degrees camera left, slightly above eye line, a 4:1 key-to-fill ratio with negative fill on the shadow side; a cool steel-blue rim light (5600K) from behind separating the subject from a dark background of night glass and city lights; warm practical lamps (3200K) glowing out of focus; a light atmospheric haze.",
    grade: "Modern prestige-drama colour grade: deep inky blacks, restrained teal in the shadows, warm natural skin tones, slightly desaturated midtones, soft filmic highlight roll-off, fine 35mm grain (Kodak Vision3 500T feel).",
  },
  thriller: {
    lighting: "Hard, high-contrast thriller lighting. A sodium-vapour streetlight key (2000K amber) from high camera right, an 8:1 ratio, a cold moonlight backlight (7000K), a single red practical accent in the background, wet reflective surfaces, haze catching the light beams.",
    grade: "Gritty thriller grade: crushed blacks, amber-red highlights against teal-black shadows, heavy contrast, coarse film grain.",
  },
  crime: {
    lighting: "Noir crime lighting. A hard key through window blinds from camera left casting slatted shadows, 8:1 ratio, a dim tungsten practical (2700K) on a desk, a cool edge light from behind, cigarette-smoke haze.",
    grade: "Neo-noir grade: deep blacks, sodium-amber and steel-blue split toning, high contrast, visible grain.",
  },
  romance: {
    lighting: "Warm romantic lighting. A golden-hour key (3000K) through a large window from camera left, soft bounce fill at 2:1, a gentle backlight halo on the hair, candle and fairy-light bokeh behind.",
    grade: "Warm romance grade: champagne and honey tones, soft contrast, creamy skin, gentle highlight halation, delicate grain.",
  },
  romcom: {
    lighting: "Bright, clean comedy lighting. Soft daylight (5600K) from a large window, high-key at a 2:1 ratio, an even fill, colourful practical details in the background, no harsh shadows.",
    grade: "Fresh romcom grade: clean whites, vibrant but natural colour, warm skin, soft pastel saturation, light grain.",
  },
  family: {
    lighting: "Warm family-saga lighting. Soft tungsten practicals (2700K) as the key from table lamps, a 3:1 ratio, warm light reflecting off wood and brass, a soft window backlight for separation.",
    grade: "Heirloom grade: gold and brown tones, rich warm shadows, gentle nostalgic contrast, fine film grain.",
  },
  mystery: {
    lighting: "Moody mystery lighting. A cool moonlight key (6500K) from a high side window, deep shadows at 6:1, drifting mist and haze, a single warm lantern accent (2400K).",
    grade: "Mystery grade: blue-black tones, desaturated colour, silver highlights, soft grain.",
  },
  supernatural: {
    lighting: "Uneasy supernatural lighting. A cold moonlight key (7000K) from above, deep shadows at 8:1, low ground mist, a faint unmotivated green-cyan rim, a flickering warm practical far behind.",
    grade: "Supernatural grade: cold desaturated blues and greens, deep blacks, pale skin highlights, grain.",
  },
  period: {
    lighting: "Classic period lighting. A warm tungsten Fresnel key (3200K) from camera left, a 3:1 ratio, a soft fill, a gentle backlight, painted-backdrop depth behind.",
    grade: "Period grade: warm painted colour with Kodachrome-like saturation, gentle contrast, visible film grain.",
  },
  political: {
    lighting: "Corridors-of-power lighting. Cool overhead fluorescent spill (4500K) on grey walls, a firm key from camera left at 4:1, a red accent (a file, a flag) in the background, haze in the far corridor.",
    grade: "Political-thriller grade: cool greys and muted greens, sharp red accents, controlled contrast, fine grain.",
  },
};

export const lightFor = (genre: string): LightRecipe => GENRE_LIGHT[genre] ?? GENRE_LIGHT.power;

/** The reference sheet is not a scene: even, true-colour studio light so the face can be copied exactly. */
export const SHEET_LIGHT: LightRecipe = {
  lighting: "Professional studio reference lighting: a large octabox key at 45 degrees camera left, slightly above eye level; a white fill card camera right at a 2:1 ratio; a soft strip light behind for separation; 5600K daylight-balanced; the face evenly exposed and sharp in every panel.",
  grade: "Neutral, true-to-life colour with accurate skin tones and no stylised grade — this sheet is the reference every later picture is drawn from.",
};

/** The text that goes into the prompt, and into the record kept with the image. */
export const lightingBlock = (r: LightRecipe, film = true) =>
  `LIGHTING — ${r.lighting}\n\nCOLOUR GRADE — ${r.grade}${film ? `\n\n${FILM}` : ""}`;
