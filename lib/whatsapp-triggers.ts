import "server-only";
import sql from "@/lib/db";

/**
 * Trigger words — the shortcut past the menu.
 *
 * Somebody who already knows what they want should not have to walk a catalogue
 * to get it. A friend says "use 197", or an Instagram comment earns a DM with a
 * pre-filled link, and one word should land them on the right template with the
 * right look, ready to send photos.
 *
 * Two kinds resolve here:
 *
 *   TEMPLATE — "gear equalizer", "nursing", "asset extractor". Derived from the
 *   title first so most work with no data entry at all, plus an optional
 *   trigger_words column for aliases a title does not contain.
 *
 *   LOOK — "197", "g7x", "paparazzi". The archive was numbered for exactly this;
 *   197 looks cannot go in a chat menu but a number fits in a sentence. A look
 *   trigger also carries its template, because picking a lighting look for a
 *   template the buyer has not chosen is meaningless.
 *
 * PRIVACY: every query here filters is_private. A trigger must not become a back
 * door into link-only client work that the menu correctly refuses to list.
 */

export type TriggerHit =
  | { kind: "template"; templateId: string; title: string }
  | { kind: "look"; templateId: string; title: string; lookId: string; lookName: string };

/** Lowercase, strip punctuation, collapse spaces. "G7X!" and "g 7 x" differ — deliberately. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Words too generic to be a trigger on their own. "the pro studio" must not match a template. */
const STOP = new Set(["the", "a", "an", "and", "or", "for", "pro", "studio", "upgrade", "template", "shoot", "photo", "photos", "look", "looks"]);

/** The distinctive words of a title: "The Gear Equalizer — Pro Studio Upgrade" -> gear, equalizer. */
function titleTokens(title: string): string[] {
  return normalise(title).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
}

type Row = {
  id: string;
  title: string;
  category: string | null;
  trigger_words: string[] | null;
  option_groups: unknown;
};

async function candidates(creatorId: string): Promise<Row[]> {
  return sql<Row[]>`
    SELECT id, title, category, trigger_words, option_groups
    FROM templates
    WHERE creator_id = ${creatorId} AND status = 'published' AND is_private = false`;
}

/** "197 · S Night Paparazzi G7X" -> { n: 197, bare: "night paparazzi g7x" } */
function parseLookName(name: string): { n: number | null; bare: string } {
  const m = /^(\d+)\s+·\s+(.*)$/.exec(name);
  const rest = (m ? m[2] : name).replace(/^[CS]\s+/, "");
  return { n: m ? Number(m[1]) : null, bare: normalise(rest) };
}

function lightingOptions(optionGroups: unknown): Array<{ id: string; name: string }> {
  const groups = (Array.isArray(optionGroups) ? optionGroups : []) as Array<{
    type?: string; options?: Array<{ id: string; name: string; kind?: string }>;
  }>;
  return groups
    .filter((g) => g.type === "lighting")
    .flatMap((g) => g.options ?? [])
    .filter((o) => o.kind === "prompt");
}

/**
 * Resolve one message to a template, and a look where the buyer named one.
 *
 * Order matters and is deliberate: a bare number is checked first (it can only
 * ever mean a look), then explicit trigger words, then exact titles, then look
 * names, and only then loose title words. Cheapest and least ambiguous first, so
 * a vague word can never outrank a precise one.
 *
 * Returns null when nothing matches, which must leave the conversation exactly
 * as it was — a stray word is not a command.
 */
export async function resolveTrigger(creatorId: string, message: string): Promise<TriggerHit | null> {
  const text = normalise(message);
  if (!text || text.length > 60) return null;

  const rows = await candidates(creatorId);
  if (!rows.length) return null;

  // 1. A bare number — "197". Only ever a look.
  const asNumber = /^\d{1,3}$/.test(text) ? Number(text) : null;
  if (asNumber !== null) {
    for (const r of rows) {
      for (const o of lightingOptions(r.option_groups)) {
        if (parseLookName(o.name).n === asNumber) {
          return { kind: "look", templateId: r.id, title: r.title, lookId: o.id, lookName: o.name };
        }
      }
    }
    return null;
  }

  // 2. Explicit trigger words the creator set.
  for (const r of rows) {
    for (const w of r.trigger_words ?? []) {
      if (normalise(w) === text) return { kind: "template", templateId: r.id, title: r.title };
    }
  }

  // 3. Exact title.
  for (const r of rows) {
    if (normalise(r.title) === text) return { kind: "template", templateId: r.id, title: r.title };
  }

  // 4. A look by name — "g7x", "paparazzi", "wine dark". Carries its template.
  for (const r of rows) {
    for (const o of lightingOptions(r.option_groups)) {
      const { bare } = parseLookName(o.name);
      if (bare === text || (text.length >= 3 && bare.includes(text))) {
        return { kind: "look", templateId: r.id, title: r.title, lookId: o.id, lookName: o.name };
      }
    }
  }

  // 5. Loose title words — "gear equalizer", "nursing". Every word the buyer
  //    typed must appear in the title, so "gear" hits and "pro studio" does not.
  const asked = text.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (asked.length) {
    const matches = rows.filter((r) => {
      const toks = titleTokens(r.title);
      return asked.every((w) => toks.some((t) => t.startsWith(w) || w.startsWith(t)));
    });
    // Exactly one, or it is a guess. Two matches means the buyer must choose.
    if (matches.length === 1) {
      return { kind: "template", templateId: matches[0].id, title: matches[0].title };
    }
  }

  return null;
}
