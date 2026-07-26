// Buyer-selected lighting allocation for regular AI templates.
//
// A template creator defines lighting "looks" as a choice group of type
// "lighting" whose options are kind "prompt" (a display name + a hidden recipe
// in `description` + a display-only thumbnail). At booking, if the buyer turns
// on manual lighting and ticks one or more looks, the picks are spread evenly
// across the package and stored on the shoot as `lighting_plan`, driving a
// per-slot lighting lock in generation. When manual lighting is off (no plan),
// the brief-builder describes lighting itself, exactly as before this feature.
//
// Mirrors lib/background-plan.ts: deterministic per-slot mapping rendered into
// one text block for the brief-builder, plus a per-slot lock in generation.

export interface LightingLook {
  id: string;          // the lighting option's id (stable across template edits)
  name: string;        // display name, e.g. "Golden Hour"
  directive: string;   // the hidden recipe (server-snapshotted); NEVER from client
}

export interface LightingAllocation extends LightingLook {
  count: number;       // >= 1 in a resolved plan
}

export interface LightingPlan {
  version: 1;
  allocations: LightingAllocation[]; // order = slot order (contiguous blocks)
}

// ── Slot mapping ─────────────────────────────────────────────────────────────
// Contiguous blocks in allocation order — same mapping as getBackgroundForSlot.
// slotIndex is 0-based.
export function getLightingForSlot(plan: LightingPlan, slotIndex: number): LightingAllocation | null {
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
// `looks` are the template's available lighting looks (with server-side
// directives); `selectedIds` is the buyer's ordered selection. Distributes
// packageSize as evenly as possible across the selected looks (remainder to the
// earliest picks). Returns null when nothing usable (→ AI-described lighting).
export function resolveLightingPlan(
  looks: LightingLook[],
  selectedIds: string[] | undefined,
  packageSize: number
): LightingPlan | null {
  if (!Array.isArray(looks) || looks.length === 0) return null;
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return null;
  if (!Number.isInteger(packageSize) || packageSize < 1) return null;

  const byId = new Map(looks.map((l) => [l.id, l]));
  // Preserve buyer order; drop unknown/duplicate ids.
  const seen = new Set<string>();
  const chosen: LightingLook[] = [];
  for (const id of selectedIds) {
    if (typeof id !== "string" || seen.has(id)) continue;
    const look = byId.get(id);
    if (!look || !look.directive) continue;
    seen.add(id);
    chosen.push(look);
  }
  if (chosen.length === 0) return null;

  // Never more distinct looks than slots.
  const active = chosen.slice(0, packageSize);
  const n = active.length;
  const base = Math.floor(packageSize / n);
  let remainder = packageSize - base * n;
  const allocations: LightingAllocation[] = active.map((look) => {
    const count = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    return { ...look, count };
  });
  return { version: 1, allocations };
}

// ── Brief section builder ────────────────────────────────────────────────────
// One text block covering all slots, injected into the brief-builder context.
export function buildLightingBriefSection(plan: LightingPlan, packageSize: number): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("PER-SLOT LIGHTING ALLOCATION — BUYER-DIRECTED (MANUAL LIGHTING)");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(
    `The buyer chose the lighting for this ${packageSize}-image package: ${plan.allocations.length} distinct lighting look${plan.allocations.length > 1 ? "s" : ""} spread across the series. ` +
    "Apply the assigned lighting look PER GROUP below. Within a group, the lighting setup is identical in every slot. " +
    "This is the buyer's explicit lighting direction — do not substitute or auto-invent a different lighting scheme for these slots."
  );
  lines.push("");

  let cursor = 0;
  for (const alloc of plan.allocations) {
    const start = cursor + 1;
    const end = Math.min(cursor + alloc.count, packageSize);
    cursor += alloc.count;
    const range = start === end ? `SLOT ${start}` : `SLOTS ${start}-${end}`;
    lines.push(`${range} — LIGHTING "${alloc.name}":`);
    lines.push(
      `Light these slots exactly per this direction: "${alloc.directive}". ` +
      "Keep the lighting identical across these slots."
    );
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════");
  return lines.join("\n");
}
