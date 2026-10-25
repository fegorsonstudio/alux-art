import "server-only";
import sharp from "sharp";
import sql from "@/lib/db";
import { nanoBananaEdit } from "@/lib/fal-edit";
import { r2Download, r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { composeSheet, tellApart } from "@/lib/drama/sheet-compose";

/**
 * The `character_sheet` marketplace product (owner, 2026-10-22): a buyer sends
 * several photos of one person and gets back ONE character sheet on a plain grey
 * studio backdrop.
 *
 * Layout (owner, 2026-10-25 — the format from the short-drama tutorial we learnt
 * from, tools/drama/skills/): ONE 16:9 image, three panels on one seamless grey:
 *
 *   | full body, FRONT  | full body, BACK  |  head-and-shoulders PORTRAIT   |
 *   | (face erased)     |                  |  (the only face on the sheet)  |
 *
 * The face on the full-body front view is left as a smooth blank oval on
 * purpose: a video or picture model given two faces at two sizes may take one
 * here and the other there, and the character drifts. One clear face
 * reference — the portrait — keeps them the same person in every scene.
 *
 * Kept out of lib/generate.ts the way the GIF loop is: no identity analysis, no
 * planner, no brief — one deterministic prompt, one paid image. generate.ts
 * hands the shoot over before any of its photo machinery runs.
 *
 * `characterSheetPrompt()` is the layout every character sheet is meant to use,
 * so other sheets (the drama cast) can share it.
 */

type Ref = {
  purpose: string; tag: string | null; note?: string | null;
  storage_bucket: string | null; storage_path: string | null;
};

/** Photos of the person sent to the model, at most; the rest are left out. */
const MAX_PERSON_PHOTOS = 8;
/** Tagged styling references (outfit, hair…) on top of the person's photos. */
const MAX_STYLE_REFS = 2;

/** The tags a sheet takes from the checkout's advanced references, and what each one controls. */
const STYLE_TAGS: Record<string, string> = {
  OUTFIT: "the outfit — clothing, shoes and what is worn on the body",
  HAIRSTYLE: "the hairstyle only",
  MAKEUP: "the makeup only",
  ACCESSORY: "the accessories only (jewellery, bags, glasses, hats)",
};

export const SHEET_LAYOUT =
  "LAYOUT — ONE single landscape image (16:9) containing EXACTLY THREE panels of the same person on ONE continuous " +
  "seamless backdrop: no gutters, no borders, no frames, no dividing lines — the three panels share one backdrop and " +
  "one floor. The two full-length figures stand side by side in the LEFT HALF of the image, evenly spaced, the same " +
  "height and the same scale, both pairs of feet on exactly the same ground line, each running from a little above the " +
  "head to a little below the shoes. The RIGHT HALF holds ONE large head-and-shoulders portrait that fills the full " +
  "height of the image.\n" +
  "Panel 1 (left half, first figure) — FULL BODY, FRONT: facing the camera squarely, weight even on both feet, feet " +
  "hip-width apart, spine straight, shoulders level, arms relaxed at the sides, hands open and empty, every finger and " +
  "both shoes fully in frame. THE FACE IS ERASED: in place of the face leave a smooth, blank, softly blurred oval in a " +
  "muted skin tone — no eyes, no nose, no mouth, no brows. The hair, hairline and ears stay exactly as they are around " +
  "the blank oval, so the hairstyle still reads.\n" +
  "Panel 2 (left half, second figure) — FULL BODY, BACK: the same stance turned 180 degrees, seen from directly behind, " +
  "the same distance and scale as panel 1; the back of the hair, the back of the outfit and the heels of the shoes fully " +
  "visible.\n" +
  "Panel 3 (right half) — PORTRAIT, HEAD AND SHOULDERS: facing the camera squarely, chin level, a calm neutral " +
  "expression, lips relaxed, eyes to the lens, cropped at the upper chest so the full length of the neck shows, the " +
  "face large and sharp in the centre of the panel, the neckline of the outfit visible. THIS IS THE ONLY FACE ON THE " +
  "SHEET and it is the face reference for every later picture of this person.\n" +
  "THE COUNT IS FIXED: three panels, no more and no fewer — two full-length figures on the left, one portrait on the " +
  "right. Do not repeat a view, do not add a view, do not draw a face on the front figure.";

export const SHEET_BACKDROP =
  "BACKDROP — every panel is photographed against the same plain seamless studio paper in a neutral mid-grey (about 18% " +
  "grey, like a photographer's grey card): smooth, no texture, no floor line, no props, no furniture, no other people. The " +
  "grey is identical in all three panels, and the floor blends into the wall with only a soft contact shadow under the shoes.";

// The camera and lens per panel. Long lenses from a distance keep a body's
// proportions true — a short lens close up makes the head big and the legs
// short, which a reference sheet must never do.
export const SHEET_CAMERA =
  "CAMERA — a high-end studio session on a medium-format digital camera on a tripod, ISO 100, 1/160 s with studio flash, " +
  "the camera always level. Full-length panels (1 and 2): an 85mm lens at f/8 from about five metres, the camera at hip " +
  "height, so the proportions stay true — no wide-angle stretch, no oversized head, no shortened legs. Medium shot " +
  "(panel 1): an 85mm lens at f/8, the camera at chest height. Close-ups (panels 4 and 5): a 105mm lens at f/5.6 at eye " +
  "level, focus on the nearest eye. Everything sharp from the hair to the shoes: fabric weave, hair strands and skin pores " +
  "resolved, no motion blur, no noise.";

export const SHEET_LIGHT =
  "LIGHTING — a professional studio set, identical in every panel: a large 150 cm octabox as the key, 45 degrees to one " +
  "side of the camera and a little above eye level, feathered so the light falls evenly from head to shoes; a large white " +
  "V-flat as fill on the other side, one stop under the key (about 2:1); two tall strip softboxes behind the person, one on " +
  "each side, as rim lights that outline the shoulders, arms and hair against the grey; the backdrop lit on its own by two " +
  "lights so the grey is smooth and even from edge to edge — no hotspot, no vignette, no shadow of the person on the paper; " +
  "soft round catchlights in both eyes. The same light, exposure and white balance in all three panels.\n\n" +
  "COLOUR — 5600K daylight, white-balanced on the grey backdrop, true-to-life skin tones and undertones, a gentle contrast " +
  "curve with open shadows and clean, unclipped highlights, no stylised grade, no colour cast, no haze. A clean high-end " +
  "studio finish — even exposure and clean grey — with the skin's real texture kept, never smoothed: this sheet is the " +
  "reference that later pictures of this person are drawn from.";

const LIKENESS =
  "THE SAME PERSON — all the photographs of the person attached are of one real individual. Face shape, eye shape and " +
  "spacing, nose, lips, jawline, brows, skin tone and undertone, freckles, moles and scars, hairline, hair colour and " +
  "texture, body build and height come from those photographs and must not change. It is the same individual in all three " +
  "panels, not a similar-looking person — the front figure shows their body and hair, the portrait shows their face. Do not slim, smooth, lighten, symmetrise or beautify; keep real skin texture and " +
  "their real age.";

const SAME_LOOK =
  "CONSISTENCY — the same hairstyle, the same outfit, the same shoes and the same accessories in every panel, so the front, " +
  "the back and the portrait clearly show one person dressed one way.";

const REAL_PHOTO =
  "A real studio photograph: realistic skin texture, natural asymmetry, realistic fabric folds, physically plausible light, " +
  "the polish of a professional photographer's studio session. No illustration, no painting, no 3D render, no plastic " +
  "sheen, no beauty filter.";

const NO_TEXT =
  "PRINT NO TEXT ANYWHERE: no panel labels, captions, names, numbers, arrows, measurement scale, colour swatches, logos or " +
  "watermark. The sheet contains the three panels and nothing else — no studio equipment, no props, no other people.";

/**
 * The character-sheet prompt, in the house structure (Scene / Subject /
 * Important Details / Use Case / Constraints).
 *
 * `personImages` is how many of the attached images show the person (they come
 * first); `styles` lists the tagged references that follow them, in order.
 * `wardrobe` overrides where the outfit comes from (the drama cast's costume).
 */
export function characterSheetPrompt(opts: {
  personImages: number;
  styles?: Array<{ tag: string; note?: string | null }>;
  wardrobe?: string;
}): string {
  const styles = opts.styles ?? [];
  const n = opts.personImages;
  const personWord = n === 1 ? "Image 1 shows the person" : `Images 1 to ${n} all show the person`;
  const styleLines = styles.map((s, i) => {
    const at = n + i + 1;
    const note = s.note?.trim() ? ` Buyer's note: "${s.note.trim().replace(/"/g, "'").slice(0, 200)}".` : "";
    return `Image ${at} is the ${s.tag} reference. From it take ${STYLE_TAGS[s.tag] ?? "its styling only"}, reproduced ` +
      `element for element — nothing else: not its face, body, background or light.${note}`;
  });
  const outfit = opts.wardrobe
    ? opts.wardrobe
    : styles.some((s) => s.tag === "OUTFIT")
      ? "WARDROBE — the outfit comes from the OUTFIT reference, reproduced element for element: the same prints, patterns, " +
        "seams, neckline, sleeves, hemline, buttons, zips, belts and trims, the same colours, nothing added, removed or " +
        "redesigned, fitted to this person's real body."
      : "WARDROBE — dress the person in the outfit they wear in the attached photograph that shows the most of their " +
        "clothing (prefer a full-length photograph), reproduced element for element: the same garments, colours, prints, " +
        "neckline, sleeves, hemline, belts, jewellery and shoes, nothing added, removed or redesigned. If no photograph " +
        "shows their shoes, give them plain, simple shoes that suit that outfit.";
  // Subject first (owner, 2026-10-22): with the layout leading, the first test
  // sheet did not look exactly like the person — the likeness is read first now.
  return [
    `Subject: ${personWord}. ${LIKENESS}${styleLines.length ? `\n\n${styleLines.join("\n")}` : ""}`,
    `Scene: a professional character reference sheet shot in a photography studio.\n\n${SHEET_LAYOUT}\n\n${SHEET_BACKDROP}\n\n${SHEET_CAMERA}\n\n${SHEET_LIGHT}`,
    `Important Details: ${outfit}\n\n${SAME_LOOK}\n\n${REAL_PHOTO}`,
    "Use Case: a character model sheet — the reference used to keep this person identical in every later picture.",
    "Constraints: preserve the person's identity exactly and the outfit exactly; change only the pose and camera angle " +
      "each panel asks for. Never draw a face on the full-body front figure — a smooth blank oval only. Never cut off " +
      "hands or shoes on the full-length figures. Never change the outfit between panels. Never use any background but " +
      `the plain grey. ${NO_TEXT}`,
  ].join("\n\n");
}

export type SheetResult = { done: true; completed: number; failed: number; remaining: number; total: number };

const fail = async (shootId: string, slotId: string | null, why: string): Promise<SheetResult> => {
  const msg = why.slice(0, 300);
  console.error(`[character-sheet] ${shootId.slice(0, 8)} failed: ${msg}`);
  if (slotId) {
    await sql`UPDATE shoot_images SET status = 'FAILED', stage = ${`Sheet failed: ${msg}`.slice(0, 200)},
        provider_error = ${msg}, updated_at = NOW() WHERE id = ${slotId}`;
  }
  return { done: true, completed: 0, failed: 1, remaining: 0, total: 1 };
};

/**
 * Make the sheet for one shoot and complete its single slot. Called from
 * lib/generate.ts with the shoot's references; returns the same shape that
 * function does. Never throws for a model or storage problem — the slot is
 * marked FAILED with the reason, and the caller settles the shoot.
 */
export async function runCharacterSheet(shootId: string, userId: string, refs: Ref[]): Promise<SheetResult> {
  const logEvent = (type: string, payload: Record<string, unknown>) =>
    sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
        VALUES (${crypto.randomUUID()}, ${shootId}, ${userId}, ${type}, ${sql.json(payload as never)}, NOW())`.catch(() => {});

  const [slot] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM shoot_images WHERE shoot_id = ${shootId} ORDER BY slot ASC LIMIT 1`;
  if (!slot) return fail(shootId, null, "no slot was booked");
  if (slot.status === "COMPLETE") return { done: true, completed: 1, failed: 0, remaining: 0, total: 1 };

  const claimed = await sql`UPDATE shoot_images SET status = 'GENERATING', stage = 'Drawing the character sheet', updated_at = NOW()
    WHERE id = ${slot.id} AND status = ANY(${["QUEUED", "PENDING", "FAILED", "GENERATING"]}) RETURNING id`;
  if (!claimed.length) return { done: true, completed: 0, failed: 0, remaining: 1, total: 1 };
  await sql`UPDATE shoots SET pipeline_stage = 'Drawing the character sheet', progress = 30, updated_at = NOW() WHERE id = ${shootId}`;
  logEvent("slot_update", { image: { id: slot.id, slot: 1, status: "GENERATING" } });
  logEvent("stage", { stage: "Drawing the character sheet", progress: 30 });

  const sign = (r: Ref) => r.storage_bucket && r.storage_path
    ? r2SignedDownloadUrl(r.storage_bucket, r.storage_path, 3600).catch(() => "")
    : Promise.resolve("");
  const styleRefs = refs.filter((r) => r.purpose === "tagged" && r.tag && r.tag in STYLE_TAGS).slice(0, MAX_STYLE_REFS);
  const personRefs = refs.filter((r) => r.purpose === "identity").slice(0, MAX_PERSON_PHOTOS - styleRefs.length);
  const personUrls = (await Promise.all(personRefs.map(sign))).filter(Boolean);
  if (!personUrls.length) return fail(shootId, slot.id, "none of the photos could be opened");
  const styled = (await Promise.all(styleRefs.map(async (r) => ({ r, url: await sign(r) })))).filter((x) => x.url);

  // "Character Sheet — from your photos" (owner, 2026-10-25): the buyer's own
  // front full-body photo and front portrait ARE the sheet; only the back view
  // is generated (lib/drama/sheet-compose.ts). The template says so with
  // worker_options.sheet = 'real'.
  const [tpl] = await sql<{ worker_options: { sheet?: string } | null }[]>`
    SELECT t.worker_options FROM shoots s JOIN templates t ON t.id = s.template_id WHERE s.id = ${shootId}`;
  const real = tpl?.worker_options?.sheet === "real";

  let url: string | undefined, model: string;
  let bytes: Buffer | undefined;
  if (real) {
    if (personRefs.length !== 2) return fail(shootId, slot.id, `this sheet needs exactly two photos — your whole body from the front, and your face from the front — not ${personRefs.length}`);
    try {
      const [a, b] = await Promise.all(personRefs.map((r) => r2Download(r.storage_bucket as string, r.storage_path as string).then((x) => x.buffer)));
      const pair = await tellApart(a, b);
      if (!pair) return fail(shootId, slot.id, "we could not tell which photo is your whole body and which is your face — send one full-length photo and one portrait");
      const urls = pair.body === a ? { body: personUrls[0], face: personUrls[1] } : { body: personUrls[1], face: personUrls[0] };
      const made = await composeSheet({ body: pair.body, face: pair.face, urls });
      bytes = made.sheet;
      model = made.model;
      url = "";
      await sql`UPDATE shoot_images SET prompt = ${`real-photo sheet: front and portrait as shot, back view generated (${made.model})`}, updated_at = NOW() WHERE id = ${slot.id}`;
    } catch (e) {
      const err = e as { message?: string; body?: unknown };
      return fail(shootId, slot.id, `${err?.message ?? String(e)}${err?.body ? " — " + JSON.stringify(err.body).slice(0, 200) : ""}`);
    }
  } else {
    const prompt = characterSheetPrompt({
      personImages: personUrls.length,
      styles: styled.map(({ r }) => ({ tag: r.tag as string, note: r.note ?? null })),
    });
    await sql`UPDATE shoot_images SET prompt = ${prompt}, updated_at = NOW() WHERE id = ${slot.id}`;
    try {
      const out = await nanoBananaEdit({
        prompt,
        image_urls: [...personUrls, ...styled.map((x) => x.url)],
        num_images: 1, aspect_ratio: "16:9", resolution: "4K", output_format: "jpeg",
        safety_tolerance: "6", limit_generations: false,
      });
      url = out.data.images?.[0]?.url;
      model = out.model;
    } catch (e) {
      const err = e as { message?: string; body?: unknown };
      return fail(shootId, slot.id, `${err?.message ?? String(e)}${err?.body ? " — " + JSON.stringify(err.body).slice(0, 200) : ""}`);
    }
    if (!url) return fail(shootId, slot.id, "the model returned no image");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      return fail(shootId, slot.id, (e as Error).message);
    }
  }
  if (!bytes) return fail(shootId, slot.id, "no sheet was made");
  const meta = await sharp(bytes).metadata().catch(() => ({ width: undefined, height: undefined }));
  const path = `${userId}/${shootId}/slot-1.jpg`;
  try {
    await r2Upload("generated-4k", path, bytes, "image/jpeg");
  } catch (e) {
    return fail(shootId, slot.id, `upload failed: ${(e as Error).message}`);
  }

  await sql`UPDATE shoot_images SET
      status = 'COMPLETE',
      width = ${meta.width ?? null}, height = ${meta.height ?? null},
      file_size = ${bytes.byteLength}, download_file_size = ${bytes.byteLength},
      stage = 'Character sheet ready',
      provider = 'vercel-fal', configured_model = ${model},
      preview_storage_bucket = 'generated-4k', preview_storage_path = ${path},
      download_storage_bucket = 'generated-4k', download_storage_path = ${path},
      fal_url = ${url || null}, provider_error = NULL,
      updated_at = NOW()
    WHERE id = ${slot.id}`;
  logEvent("slot_complete", { image: { id: slot.id, slot: 1, status: "COMPLETE" } });
  console.log(`[character-sheet] ${shootId.slice(0, 8)} ${meta.width ?? "?"}x${meta.height ?? "?"} via ${model} from ${personUrls.length} photo(s)` +
    (styled.length ? ` + ${styled.map((x) => x.r.tag).join(", ")}` : ""));
  return { done: true, completed: 1, failed: 0, remaining: 0, total: 1 };
}

/**
 * The whole job as lib/generate.ts hands it over: make the sheet, then close
 * the shoot the way generate.ts closes any shoot — status, the 'complete'
 * event the studio page waits for, and the one remedy a failed paid order is
 * owed (lib/shortfall.ts: the money back in the wallet, or a free redo).
 */
export async function finishCharacterSheet(shootId: string, userId: string, refs: Ref[]): Promise<SheetResult> {
  const res = await runCharacterSheet(shootId, userId, refs);
  if (res.remaining > 0) return res; // another worker holds the slot
  // A sheet kept by "Run again" means the order still has its sheet even when
  // the new take failed: it stays complete and nothing is refunded.
  const [kept] = res.completed === 1 ? [] : await sql`
    SELECT 1 FROM shoot_images WHERE shoot_id = ${shootId} AND kind LIKE 'earlier take%' AND status = 'COMPLETE' LIMIT 1`;
  const ok = res.completed === 1 || !!kept;
  await sql`UPDATE shoots SET status = ${ok ? "COMPLETE" : "FAILED"}, progress = 100,
      pipeline_stage = ${ok ? "Complete" : "No images could be generated"},
      completed_at = NOW(), updated_at = NOW()
    WHERE id = ${shootId}`;
  if (!ok) {
    try {
      const { settleShortfall } = await import("@/lib/shortfall");
      await settleShortfall(shootId, { total: 1, completed: 0 });
    } catch (e) {
      console.error("[character-sheet] shortfall settlement failed:", e instanceof Error ? e.message : e);
    }
  }
  await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (${crypto.randomUUID()}, ${shootId}, ${userId}, 'complete',
              ${sql.json({ progress: 100, stage: ok ? "Complete" : "No images could be generated", completed: res.completed, total: 1 })}, NOW())`
    .catch(() => {});
  return res;
}
