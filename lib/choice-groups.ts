// Buyer choice groups.
//
// A template creator defines groups of styling options (outfits, hairstyles,
// makeup, nails, shoes, accessories, color grades). At booking, the buyer picks
// ONE option per group; the pick applies to the whole shoot. Photo options
// become ordinary tagged shoot_references (the generation pipeline's existing
// per-tag consistency locks do the rest); text options are enforced through a
// brief text section.
//
// Sibling of lib/background-plan.ts — backgrounds split counts across the
// package, choice groups are single-pick.

export type ChoiceGroupType =
  | "outfit" | "hairstyle" | "makeup" | "nails" | "shoes" | "accessory" | "color_grade" | "props" | "scrubs";

export interface ChoiceOption {
  id: string;
  name: string;                // 1-40 chars, e.g. "Emerald Gown"
  kind: "photo" | "text";
  description?: string;        // required for text, optional creator note for photo
  imagePath?: string;          // required for photo
  imageBucket?: string;        // defaults to "template-images"
}

// Optional garment recolor for single-select outfit/scrubs picks: the buyer keeps
// the garment's cut/fabric but ticks a different fabric color. Fixed palette so
// the value is safe to inject into prompts.
export const RECOLOR_GROUP_TYPES = new Set<ChoiceGroupType>(["outfit", "scrubs"]);
export const RECOLOR_PALETTE = [
  "Maroon", "Teal", "Navy", "Emerald", "Burgundy", "Light Grey",
  "Black", "White", "Gold", "Pink",
] as const;

export interface ChoiceGroup {
  id: string;
  type: ChoiceGroupType;
  label: string;               // shown to buyers, e.g. "Outfit", "Shoes"
  options: ChoiceOption[];
}

export interface ChoiceSelection extends ChoiceOption {
  groupId: string;
  groupType: ChoiceGroupType;
  tag: string;                 // the reference tag this selection fills
  label: string;               // group label
  colorOverride?: string;      // RECOLOR_PALETTE value — outfit/scrubs picks only
}

export interface ChoiceSelections {
  version: 1;
  selections: ChoiceSelection[];
}

// Group type → reference tag + default label. Shoes map to ACCESSORY with a
// name prefix so multiple accessory-tag groups stay distinguishable downstream.
// Props are multi-select: buyers can pick ANY number (including none) — they ride
// the ACCESSORY tag, the only tag whose refs coexist in the generation pipeline.
export const GROUP_TYPES: Record<ChoiceGroupType, { tag: string; defaultLabel: string; namePrefix?: string; multiSelect?: boolean }> = {
  outfit:      { tag: "OUTFIT",      defaultLabel: "Outfit" },
  hairstyle:   { tag: "HAIRSTYLE",   defaultLabel: "Hairstyle" },
  makeup:      { tag: "MAKEUP",      defaultLabel: "Makeup" },
  nails:       { tag: "NAIL_DESIGN", defaultLabel: "Nails" },
  shoes:       { tag: "ACCESSORY",   defaultLabel: "Shoes", namePrefix: "Shoes — " },
  accessory:   { tag: "ACCESSORY",   defaultLabel: "Accessory" },
  color_grade: { tag: "COLOR_GRADE", defaultLabel: "Color grade" },
  props:       { tag: "ACCESSORY",   defaultLabel: "Props", namePrefix: "Prop — ", multiSelect: true },
  scrubs:      { tag: "SCRUBS",      defaultLabel: "Scrubs color" },
};

export const MAX_CHOICE_GROUPS = 6;
export const MAX_OPTIONS_PER_GROUP = 6;

// ── Server-side sanitizer (templates POST/PATCH) ─────────────────────────────
export function sanitizeOptionGroups(raw: unknown, userId: string): ChoiceGroup[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ChoiceGroup[] = [];
  for (const g of raw.slice(0, MAX_CHOICE_GROUPS)) {
    if (!g || typeof g !== "object") continue;
    const group = g as Record<string, unknown>;
    const type = typeof group.type === "string" && group.type in GROUP_TYPES
      ? (group.type as ChoiceGroupType)
      : null;
    if (!type) continue;
    const label = typeof group.label === "string" && group.label.trim()
      ? group.label.trim().slice(0, 40)
      : GROUP_TYPES[type].defaultLabel;

    const options: ChoiceOption[] = [];
    for (const item of (Array.isArray(group.options) ? group.options : []).slice(0, MAX_OPTIONS_PER_GROUP)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
      if (!name) continue;
      const kind = o.kind === "photo" || o.kind === "text" ? o.kind : null;
      if (!kind) continue;
      if (kind === "photo") {
        const imagePath = typeof o.imagePath === "string" ? o.imagePath : "";
        if (!imagePath || !imagePath.startsWith(`${userId}/`)) continue;
        options.push({
          id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
          name,
          kind,
          description: typeof o.description === "string" && o.description.trim()
            ? o.description.trim().slice(0, 300)
            : undefined,
          imagePath,
          imageBucket: typeof o.imageBucket === "string" && o.imageBucket ? o.imageBucket : "template-images",
        });
      } else {
        const description = typeof o.description === "string" ? o.description.trim().slice(0, 300) : "";
        if (!description) continue;
        options.push({
          id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
          name,
          kind,
          description,
        });
      }
    }
    if (options.length === 0) continue;
    out.push({
      id: typeof group.id === "string" && group.id ? group.id : crypto.randomUUID(),
      type,
      label,
      options,
    });
  }
  return out.length > 0 ? out : null;
}

// ── Buyer pick resolver (book route) ─────────────────────────────────────────
// ALL groups are opt-in: an untouched group resolves to NOTHING (no forced
// defaults — a man can skip Hair/Nails on a unisex template). Exceptions:
// a group with exactly ONE option is a creator-forced constant and applies
// automatically. Multi-select groups (props) keep every pick.
export function resolveChoiceSelections(
  groups: ChoiceGroup[],
  buyerPicks: Array<{ groupId: string; optionId: string; colorOverride?: string }> | undefined
): { selections: ChoiceSelections | null; error?: string } {
  if (!Array.isArray(groups) || groups.length === 0) return { selections: null };

  const validColors = new Set<string>(RECOLOR_PALETTE);
  const picksByGroup = new Map<string, string[]>();
  const colorByGroup = new Map<string, string>();
  for (const p of buyerPicks ?? []) {
    if (!p || typeof p.groupId !== "string" || typeof p.optionId !== "string") {
      return { selections: null, error: "Invalid style selection" };
    }
    const list = picksByGroup.get(p.groupId) ?? [];
    if (!list.includes(p.optionId)) list.push(p.optionId);
    picksByGroup.set(p.groupId, list);
    if (typeof p.colorOverride === "string" && validColors.has(p.colorOverride)) {
      colorByGroup.set(p.groupId, p.colorOverride);
    }
  }

  const selections: ChoiceSelection[] = [];
  for (const group of groups) {
    if (!group.options.length) continue;
    const meta = GROUP_TYPES[group.type];
    const picked = picksByGroup.get(group.id);

    let chosen: ChoiceOption[];
    if (meta.multiSelect) {
      // Opt-in: nothing picked → nothing selected for this group.
      if (!picked || picked.length === 0) continue;
      chosen = [];
      for (const id of picked) {
        const found = group.options.find((o) => o.id === id);
        if (!found) return { selections: null, error: `Unknown option for ${group.label}` };
        chosen.push(found);
      }
    } else if (group.options.length === 1 && (!picked || picked.length === 0)) {
      // A single-option group is a creator-forced constant — applies automatically.
      chosen = [group.options[0]];
    } else if (picked && picked.length > 0) {
      // Single-select: last pick wins.
      const pickedId = picked[picked.length - 1];
      const found = group.options.find((o) => o.id === pickedId);
      if (!found) return { selections: null, error: `Unknown option for ${group.label}` };
      chosen = [found];
    } else {
      // Opt-in: the buyer skipped this group (e.g. a man skipping Hair/Nails on a
      // unisex template) — nothing is selected, no forced default.
      continue;
    }

    // Recolor override applies only to single-select garment groups.
    const colorOverride = RECOLOR_GROUP_TYPES.has(group.type) && !meta.multiSelect
      ? colorByGroup.get(group.id)
      : undefined;

    for (const option of chosen) {
      selections.push({
        ...option,
        groupId: group.id,
        groupType: group.type,
        tag: meta.tag,
        label: group.label,
        name: meta.namePrefix ? `${meta.namePrefix}${option.name}` : option.name,
        ...(colorOverride ? { colorOverride } : {}),
      });
    }
  }

  return selections.length > 0 ? { selections: { version: 1, selections } } : { selections: null };
}

// ── Brief section builder ────────────────────────────────────────────────────
export function buildChoiceBriefSection(choices: ChoiceSelections): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("BUYER STYLE SELECTIONS — locked for ALL images in this shoot");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push(
    "The buyer chose these styling options. Each one is fixed across the entire series — " +
    "never substitute, vary, or invent alternatives for a selected category."
  );
  lines.push("");
  for (const sel of choices.selections) {
    if (sel.groupType === "props" && sel.kind === "photo") {
      lines.push(
        `${sel.tag} — "${sel.name}" [PROP PHOTO REFERENCE]: include this exact prop naturally in the ` +
        `scene with the subject in every image (held, worn, or placed believably), replicating its ` +
        `design, colors, and materials from the attached reference image labeled ${sel.tag} "${sel.name}".` +
        (sel.description ? ` Creator note: ${sel.description}.` : "")
      );
    } else if (sel.kind === "photo") {
      const recolor = sel.colorOverride
        ? ` RECOLOR: render this exact garment in ${sel.colorOverride} — same cut, fabric, trim, ` +
          `and construction as the reference; ONLY the fabric color changes to ${sel.colorOverride}, ` +
          `identically in every image.`
        : "";
      const shapeGuard = (sel.groupType === "outfit" || sel.groupType === "scrubs")
        ? ` GARMENT FIT: the reference is a ghost-mannequin product shot — extract only the garment ` +
          `and fit it naturally to the subject's real body shape and proportions from the identity ` +
          `references, never the mannequin's hollow form.`
        : "";
      lines.push(
        `${sel.tag} — "${sel.name}" [PHOTO REFERENCE]: replicate the attached reference image ` +
        `labeled ${sel.tag} "${sel.name}" exactly in every image.` +
        (sel.description ? ` Creator note: ${sel.description}.` : "") +
        recolor + shapeGuard
      );
    } else {
      lines.push(
        `${sel.tag} — "${sel.name}" [TEXT]: render from this description, identical in every image: ` +
        `"${sel.description}".`
      );
    }
  }
  lines.push("═══════════════════════════════════════════════════════");
  return lines.join("\n");
}
