import "server-only";
import sharp from "sharp";
import sql from "@/lib/db";
import { nanoBananaEdit } from "@/lib/fal-edit";
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";

/**
 * The `character_sheet` marketplace product (owner, 2026-10-22): a buyer sends
 * several photos of one person and gets back ONE character sheet — five views
 * of that person on a plain grey studio backdrop, laid out like the reference
 * the owner chose:
 *
 *   | medium, front | full body, front  | full body, back | close-up, 3/4    |
 *   | (hands IN)    | (head cropped)   | (head to toe)   |------------------|
 *   |               |                  |                 | close-up, profile|
 *
 * The owner's one change to that reference: the medium shot must show both
 * hands (the original cut them off). Every sheet is on grey.
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
  "LAYOUT — ONE single landscape image (16:9) containing EXACTLY FIVE photographs of the same person, arranged in four " +
  "columns from left to right. Columns 1, 2 and 3 are tall panels that run the full height of the image. Column 4 is split " +
  "into two stacked panels of equal height. Thin dark-grey gutters separate the panels; there is nothing else on the sheet.\n" +
  "Panel 1 (column 1, full height) — MEDIUM SHOT, FRONT: from the top of the head down to mid-thigh, facing the camera, " +
  "standing straight, arms relaxed at the sides, eyes to the lens, a calm natural expression. BOTH HANDS ARE FULLY IN THE " +
  "FRAME: every finger visible, a little space between each hand and the panel edge — the frame never cuts through a hand, " +
  "a wrist or a forearm.\n" +
  "Panel 2 (column 2, full height) — FULL BODY, FRONT, THE OUTFIT VIEW: from just below the chin down to the soles of the " +
  "shoes. The head is deliberately cropped off by the top edge of the panel, just under the chin, so the whole outfit fills " +
  "the panel. Standing straight, arms relaxed at the sides, feet slightly apart, both hands and both feet fully in frame.\n" +
  "Panel 3 (column 3, full height) — FULL BODY, BACK: the whole person from the top of the head to the soles of the shoes, " +
  "seen from directly behind, standing straight, arms relaxed at the sides; the back of the hair and the back of the outfit " +
  "fully visible, a small margin above the head and below the feet.\n" +
  "Panel 4 (column 4, top) — CLOSE-UP, THREE-QUARTER: head and shoulders, the face turned slightly to one side, eyes to the " +
  "lens.\n" +
  "Panel 5 (column 4, bottom) — CLOSE-UP, PROFILE: head and shoulders in side profile, looking away from the camera; the " +
  "ear, jawline, nose line and the side of the hair clearly visible.\n" +
  "THE COUNT IS FIXED: five panels, no more and no fewer. Do not repeat a view, do not add a view, do not leave a panel empty.";

export const SHEET_BACKDROP =
  "BACKDROP — every panel is photographed against the same plain mid-grey seamless studio backdrop: flat neutral grey, no " +
  "gradient, no texture, no floor line, no props, no furniture, no other people. The grey is identical in all five panels.";

export const SHEET_LIGHT =
  "LIGHTING — professional studio reference light, identical in every panel: a large soft octabox key at 45 degrees to one " +
  "side and slightly above eye level, a white fill on the other side at about a 2:1 ratio, a soft rim light behind for " +
  "separation from the grey; 5600K daylight balance; the face evenly lit and sharp in every panel, soft natural shadows.\n\n" +
  "COLOUR — neutral, true-to-life colour with accurate skin tones and no stylised grade: this sheet is the reference that " +
  "later pictures of this person are drawn from.";

const LIKENESS =
  "THE SAME PERSON — all the photographs of the person attached are of one real individual. Face shape, eye shape and " +
  "spacing, nose, lips, jawline, brows, skin tone and undertone, freckles, moles and scars, hairline, hair colour and " +
  "texture, body build and height come from those photographs and must not change. It is the same individual in all five " +
  "panels, not a similar-looking person. Do not slim, smooth, lighten, symmetrise or beautify; keep real skin texture and " +
  "their real age.";

const SAME_LOOK =
  "CONSISTENCY — the same hairstyle, the same outfit, the same shoes and the same accessories in every panel, so the front, " +
  "the back and the close-ups clearly show one person dressed one way.";

const REAL_PHOTO =
  "A real studio photograph: realistic skin texture, natural asymmetry, realistic fabric folds, physically plausible light, " +
  "a 50mm lens feel for the full-length panels and an 85mm feel for the close-ups, sharp focus. No illustration, no painting, " +
  "no 3D render, no plastic sheen, no beauty filter.";

const NO_TEXT =
  "PRINT NO TEXT ANYWHERE: no panel labels, captions, names, numbers, arrows, measurement scale, colour swatches, logos or " +
  "watermark. The sheet contains the five photographs and nothing else.";

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
    return `Image ${at} is a ${s.tag} reference: take ${STYLE_TAGS[s.tag] ?? "its styling only"} from it, reproduced ` +
      `element for element, and nothing else — not its face, body, background or light.${note}`;
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
  return [
    `Scene: a professional character reference sheet shot in a photography studio.\n\n${SHEET_LAYOUT}\n\n${SHEET_BACKDROP}\n\n${SHEET_LIGHT}`,
    `Subject: ${personWord}. ${LIKENESS}${styleLines.length ? `\n\n${styleLines.join("\n")}` : ""}`,
    `Important Details: ${outfit}\n\n${SAME_LOOK}\n\n${REAL_PHOTO}`,
    "Use Case: a character model sheet — the reference used to keep this person identical in every later picture.",
    "Constraints: preserve the person's identity exactly and the outfit exactly; change only the pose and camera angle " +
      "each panel asks for. Never cut off the hands in panel 1. Never show the head in panel 2. Never change the outfit " +
      `between panels. Never use any background but the plain grey. ${NO_TEXT}`,
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

  const prompt = characterSheetPrompt({
    personImages: personUrls.length,
    styles: styled.map(({ r }) => ({ tag: r.tag as string, note: r.note ?? null })),
  });
  await sql`UPDATE shoot_images SET prompt = ${prompt}, updated_at = NOW() WHERE id = ${slot.id}`;

  let url: string | undefined, model: string;
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

  let bytes: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return fail(shootId, slot.id, (e as Error).message);
  }
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
      fal_url = ${url}, provider_error = NULL,
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
  const ok = res.completed === 1;
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
