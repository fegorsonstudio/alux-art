// Buyer-selected pose/mannerism mimicry.
//
// A template creator uploads named "signature pose" reference photos (e.g. a
// specific person's poses and mannerisms). At checkout, the buyer picks any
// number of the offered poses (up to MAX_SELECTED_POSES). Selected pose photos
// ride the shoot as ordinary purpose='pose' shoot_references — this reuses the
// EXISTING Group D pose-extraction pipeline in lib/generate.ts verbatim (the
// same mechanism that already lets a buyer upload their own pose references),
// so no changes to generation are needed. Group D scans every purpose='pose'
// image, extracts the distinct pose/expression, and assigns extracted poses to
// portrait slots in order, cycling if fewer poses than slots — it explicitly
// overrides normal pose-harvesting for those slots while leaving wardrobe,
// background, and identity untouched.
//
// Unlike background/choice options, pose options are photo-only (a pose is a
// physical reference, not something you can describe your way around) and are
// NOT gated to any specific template category — any template can offer them.

export interface PoseOption {
  id: string;                  // server-assigned uuid, stable across edits
  name: string;                // 1-40 chars, e.g. "Power stance"
  description?: string;        // optional creator note, 0-200 chars
  imagePath: string;           // storage_path of the pose reference photo
  imageBucket?: string;        // defaults to "template-images"
}

export const MAX_POSE_OPTIONS = 6;
export const MAX_SELECTED_POSES = 6;

// ── Server-side sanitizer (templates POST/PATCH) ─────────────────────────────
// Returns null for "no options" (stored as SQL NULL). Drops invalid items.
export function sanitizePoseOptions(raw: unknown, userId: string): PoseOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: PoseOption[] = [];
  for (const item of raw.slice(0, MAX_POSE_OPTIONS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!name) continue;
    const imagePath = typeof o.imagePath === "string" ? o.imagePath : "";
    if (!imagePath || !imagePath.startsWith(`${userId}/`)) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
      name,
      description: typeof o.description === "string" && o.description.trim()
        ? o.description.trim().slice(0, 200)
        : undefined,
      imagePath,
      imageBucket: typeof o.imageBucket === "string" && o.imageBucket ? o.imageBucket : "template-images",
    });
  }
  return out.length > 0 ? out : null;
}

// ── Buyer selection resolver (book route) ────────────────────────────────────
// Buyer sends an array of picked option ids; resolves against the template's
// configured pose options. Unknown ids are dropped rather than erroring (a
// stale client after a creator edit shouldn't hard-fail checkout). No forced
// defaults — an untouched/empty selection means no creator poses are used.
export function resolvePoseSelections(
  options: PoseOption[],
  pickedIds: string[] | undefined
): PoseOption[] {
  if (!Array.isArray(options) || options.length === 0 || !Array.isArray(pickedIds)) return [];
  const byId = new Map(options.map((o) => [o.id, o]));
  const out: PoseOption[] = [];
  const seen = new Set<string>();
  for (const id of pickedIds.slice(0, MAX_SELECTED_POSES)) {
    if (typeof id !== "string" || seen.has(id)) continue;
    const found = byId.get(id);
    if (found) { out.push(found); seen.add(id); }
  }
  return out;
}
