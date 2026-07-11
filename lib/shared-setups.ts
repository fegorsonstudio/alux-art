// Cross-creator "community library" for custom slot setups (flag rooftop
// plate, mugshot board, business bowl, viral-look reference). A creator
// publishes a plate they've already configured on one of their own templates;
// any other creator can browse and import it. Importing COPIES the file into
// the importer's own storage prefix (lib/r2.ts r2Copy) — the two creators'
// records never share one object, so deleting the original never breaks an
// importer's template, and every existing ${userId}/-prefix ownership check
// (lib/trend-slots.ts, lib/flag-shot.ts sanitizers) stays untouched.

export type SharedSetupKind = "flag" | "mugshot" | "bowl" | "viral";

export const SHARED_SETUP_KINDS: Record<SharedSetupKind, { label: string }> = {
  flag: { label: "Flag shot" },
  mugshot: { label: "Mugshot board" },
  bowl: { label: "Business bowl" },
  viral: { label: "Viral pose" },
};

export function isSharedSetupKind(v: unknown): v is SharedSetupKind {
  return typeof v === "string" && v in SHARED_SETUP_KINDS;
}

export function sanitizeSetupName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 60) : "";
}
