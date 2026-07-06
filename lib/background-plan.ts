// Buyer-selected background allocation.
//
// A template creator defines up to 6 background options (photo-backed or
// text-described). At booking, the buyer distributes their package count
// across those options; the resolved snapshot is stored on the shoot as
// background_plan and drives per-slot environment locking in generation.
//
// Follows the lib/call-to-bar.ts pattern: deterministic per-slot mapping
// rendered into one text block for the single brief-builder model call.

export interface BackgroundOption {
  id: string;                  // server-assigned uuid, stable across edits
  name: string;                // 1-40 chars, e.g. "Studio Canvas"
  kind: "photo" | "text";
  description?: string;        // required when kind === "text", 1-300 chars
  imagePath?: string;          // required when kind === "photo" — storage_path of the BACKGROUND template_images row
  imageBucket?: string;        // defaults to "template-images"
}

export interface BackgroundAllocation extends BackgroundOption {
  count: number;               // >= 1 in a resolved plan
}

export interface BackgroundPlan {
  version: 1;
  allocations: BackgroundAllocation[]; // order = slot order (contiguous blocks)
}

// ── Category gate ────────────────────────────────────────────────────────────
// null = background options are available for every template category.
export const BACKGROUND_OPTIONS_CATEGORIES: Set<string> | null = null;

export function categoryAllowsBackgroundOptions(category: string | null | undefined): boolean {
  return !BACKGROUND_OPTIONS_CATEGORIES || BACKGROUND_OPTIONS_CATEGORIES.has(category ?? "");
}

export const MAX_BACKGROUND_OPTIONS = 6;

// ── Server-side sanitizer (templates POST/PATCH) ─────────────────────────────
// Returns null for "no options" (stored as SQL NULL). Drops invalid items.
export function sanitizeBackgroundOptions(raw: unknown, userId: string): BackgroundOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: BackgroundOption[] = [];
  for (const item of raw.slice(0, MAX_BACKGROUND_OPTIONS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!name) continue;
    const kind = o.kind === "photo" || o.kind === "text" ? o.kind : null;
    if (!kind) continue;

    if (kind === "photo") {
      const imagePath = typeof o.imagePath === "string" ? o.imagePath : "";
      if (!imagePath || !imagePath.startsWith(`${userId}/`)) continue;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
        name,
        kind,
        imagePath,
        imageBucket: typeof o.imageBucket === "string" && o.imageBucket ? o.imageBucket : "template-images",
      });
    } else {
      const description = typeof o.description === "string" ? o.description.trim().slice(0, 300) : "";
      if (!description) continue;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
        name,
        kind,
        description,
      });
    }
  }
  return out.length > 0 ? out : null;
}

// ── Slot mapping ─────────────────────────────────────────────────────────────
// Contiguous blocks in allocation order: slots 1..c1 → allocations[0],
// slots c1+1..c1+c2 → allocations[1], etc. slotIndex is 0-based.
export function getBackgroundForSlot(plan: BackgroundPlan, slotIndex: number): BackgroundAllocation | null {
  if (!plan.allocations.length) return null;
  let cursor = 0;
  for (const alloc of plan.allocations) {
    cursor += alloc.count;
    if (slotIndex < cursor) return alloc;
  }
  // Defensive: slot beyond the allocated total (e.g. quote slot) → last allocation
  return plan.allocations[plan.allocations.length - 1];
}

// ── Buyer allocation resolver (book route) ───────────────────────────────────
// Validates buyer input against the template's options and returns a resolved
// snapshot (full option data + counts) or an error message.
export function resolveBackgroundPlan(
  options: BackgroundOption[],
  buyerAllocations: Array<{ optionId: string; count: number }> | undefined,
  packageSize: number
): { plan: BackgroundPlan | null; error?: string } {
  if (!Array.isArray(options) || options.length < 2) return { plan: null };

  // Old clients / gift claims that send nothing: default everything to option 1
  if (!buyerAllocations || buyerAllocations.length === 0) {
    return { plan: { version: 1, allocations: [{ ...options[0], count: packageSize }] } };
  }

  const byId = new Map(options.map((o) => [o.id, o]));
  const counts = new Map<string, number>();
  let total = 0;
  for (const a of buyerAllocations) {
    if (!a || typeof a.optionId !== "string") return { plan: null, error: "Invalid background allocation" };
    const opt = byId.get(a.optionId);
    if (!opt) return { plan: null, error: "Unknown background option" };
    const count = Number(a.count);
    if (!Number.isInteger(count) || count < 0) return { plan: null, error: "Invalid background count" };
    counts.set(a.optionId, (counts.get(a.optionId) ?? 0) + count);
    total += count;
  }
  if (total !== packageSize) {
    return { plan: null, error: `Background allocation must cover all ${packageSize} images (got ${total})` };
  }

  // Order follows the template's option order; zero-count allocations dropped
  const allocations: BackgroundAllocation[] = options
    .filter((o) => (counts.get(o.id) ?? 0) > 0)
    .map((o) => ({ ...o, count: counts.get(o.id)! }));

  return { plan: { version: 1, allocations } };
}

// ── Brief section builder ────────────────────────────────────────────────────
// One text block covering all slots, injected into the brief-builder context.
export function buildBackgroundBriefSection(plan: BackgroundPlan, packageSize: number): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("PER-SLOT BACKGROUND ALLOCATION — SUPERSEDES THE GLOBAL [BACKGROUND] CONSISTENCY LOCK");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(
    `The buyer allocated this ${packageSize}-image package across ${plan.allocations.length} distinct background${plan.allocations.length > 1 ? "s" : ""}. ` +
    "The single-background rule applies PER GROUP below, not across the whole series. " +
    "Never blend backgrounds between groups. Within a group, the environment is identical in every slot."
  );
  lines.push("");

  let cursor = 0;
  for (const alloc of plan.allocations) {
    const start = cursor + 1;
    const end = Math.min(cursor + alloc.count, packageSize);
    cursor += alloc.count;
    const range = start === end ? `SLOT ${start}` : `SLOTS ${start}-${end}`;

    if (alloc.kind === "photo") {
      lines.push(`${range} — BACKGROUND "${alloc.name}" [PHOTO REFERENCE]:`);
      lines.push(
        `The environment for these slots MUST replicate the attached reference image labeled BACKGROUND "${alloc.name}" exactly ` +
        "(surface material, color palette, floor, texture, depth). Do not invent alternatives for these slots. " +
        "Match the reference's perspective exactly: same camera height, same angle, same horizon/floor line — " +
        "the subject must look genuinely photographed within this space, not pasted onto it."
      );
    } else {
      lines.push(`${range} — BACKGROUND "${alloc.name}" [TEXT DESCRIPTION]:`);
      lines.push(
        "Invent a photorealistic environment from this description and keep it IDENTICAL across these slots: " +
        `"${alloc.description}".`
      );
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════");
  return lines.join("\n");
}
