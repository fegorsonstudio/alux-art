// Planner-randomized pose/mannerism mimicry.
//
// A template creator uploads named "signature pose" reference photos (e.g. a
// specific person's poses and mannerisms) — a variety pool, not a fixed set.
// At booking time the SERVER randomly picks one DISTINCT pose per portrait
// slot (no repeats within a shoot, as long as the pool is at least as large
// as the slot count) — the buyer never sees or chooses poses. Selected pose
// photos ride the shoot as ordinary purpose='pose' shoot_references — this
// reuses the EXISTING Group D pose-extraction pipeline in lib/generate.ts
// verbatim (the same mechanism that already lets a buyer upload their own
// pose references), so no changes to generation are needed. Group D scans
// every purpose='pose' image, extracts the distinct pose/expression, and
// assigns extracted poses to portrait slots in order — feeding it N distinct
// randomly-chosen poses for N portrait slots means every slot gets its own
// pose with no cycling/repetition.
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

// A creator's signature-pose library can be large — it's a variety pool the
// planner draws from, not a per-buyer checklist.
export const MAX_POSE_OPTIONS = 30;

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

// ── Random no-repeat picker (book route) ─────────────────────────────────────
// Picks up to `count` DISTINCT poses at random (Fisher-Yates partial shuffle).
// Call with count = the shoot's portrait-slot count so every slot can get a
// unique pose; if the pool is smaller than the slot count, Group D's existing
// cycling behavior takes over for the leftover slots (unavoidable — there's
// nothing left to pick that hasn't already been used).
export function pickRandomPoseOptions(options: PoseOption[], count: number): PoseOption[] {
  if (!Array.isArray(options) || options.length === 0 || count <= 0) return [];
  const pool = [...options];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
