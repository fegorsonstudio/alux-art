import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { LIGHTING_FRAMINGS, MAX_PROMPT_DESCRIPTION, type ChoiceGroup, type ChoiceOption, type LightingFraming } from "@/lib/choice-groups";

/**
 * Single-look edits to a lighting archive.
 *
 * The creator dashboard's template editor sends every option back on every save
 * and rewrites `option_groups` wholesale. That path has destroyed looks twice:
 * 13 sections sliced to 6 (56 looks gone), and every prompt over 2000 characters
 * truncated. This route exists so the lighting workbench never has to use it.
 *
 * The client sends ids and ONE value. The archive stays on the server.
 *
 * Every write:
 *   - refuses unless `option_groups` reads back as an array,
 *   - writes with sql.json() — `JSON.stringify(...)::jsonb` stores a JSON
 *     *string* and replaces the whole archive with one quoted blob,
 *   - re-reads afterwards and asserts the look count moved by exactly the
 *     amount the operation intended, restoring the previous value if not.
 *
 *   GET    ?templateId=…      the lighting sections and their looks
 *   POST   add one look
 *   PATCH  change one field on one look
 *   DELETE remove one look
 */

export const dynamic = "force-dynamic";

const MAX_NAME = 40;   // sanitizeOptionGroups slices names at 40 — match it here
                       // so the workbench refuses rather than silently trimming.

type Groups = ChoiceGroup[];

/** The creator row for the signed-in user, and the template if they own it. */
async function ownedTemplate(templateId: string, userId: string) {
  const [row] = await sql<{ id: string; option_groups: Groups | null }[]>`
    SELECT t.id, t.option_groups
    FROM templates t
    JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND c.user_id = ${userId}`;
  return row ?? null;
}

const promptLooks = (groups: Groups) =>
  groups.filter(g => g.type === "lighting")
    .reduce((n, g) => n + (g.options ?? []).filter(o => o.kind === "prompt").length, 0);

/**
 * Write the archive back and prove it survived.
 *
 * `expectedDelta` is the change in look count this operation intends: 0 for an
 * edit, +1 for an add, -1 for a delete. Anything else means the write went wrong
 * and the previous value is put back before erroring.
 */
async function writeGuarded(
  templateId: string,
  before: Groups,
  next: Groups,
  expectedDelta: number,
): Promise<{ ok: true; looks: number } | { ok: false; error: string }> {
  const want = promptLooks(before) + expectedDelta;

  await sql`UPDATE templates SET option_groups = ${sql.json(next as never)}, updated_at = NOW() WHERE id = ${templateId}`;

  const [check] = await sql<{ option_groups: Groups | null }[]>`
    SELECT option_groups FROM templates WHERE id = ${templateId}`;

  if (!Array.isArray(check?.option_groups)) {
    await sql`UPDATE templates SET option_groups = ${sql.json(before as never)} WHERE id = ${templateId}`;
    return { ok: false, error: "The archive did not read back as a list. Nothing was changed." };
  }
  const got = promptLooks(check.option_groups);
  if (got !== want) {
    await sql`UPDATE templates SET option_groups = ${sql.json(before as never)} WHERE id = ${templateId}`;
    return { ok: false, error: `Expected ${want} looks after saving but found ${got}. Nothing was changed.` };
  }
  return { ok: true, looks: got };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templateId = request.nextUrl.searchParams.get("templateId");

  // No template named: list the ones that actually have a lighting archive, so
  // the picker is short instead of every template they have ever made.
  if (!templateId) {
    const rows = await sql<{ id: string; title: string; option_groups: Groups | null }[]>`
      SELECT t.id, t.title, t.option_groups
      FROM templates t JOIN creators c ON c.id = t.creator_id
      WHERE c.user_id = ${user.id} AND t.option_groups IS NOT NULL
      ORDER BY t.updated_at DESC`;
    return NextResponse.json({
      templates: rows
        .filter(r => Array.isArray(r.option_groups) && r.option_groups.some(g => g.type === "lighting"))
        .map(r => ({ id: r.id, title: r.title, looks: promptLooks(r.option_groups as Groups) })),
    });
  }

  const row = await ownedTemplate(templateId, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const groups = Array.isArray(row.option_groups) ? row.option_groups : [];

  return NextResponse.json({
    templateId,
    groups: groups.filter(g => g.type === "lighting").map(g => ({
      id: g.id,
      label: g.label,
      // The shared per-shot-size sources. A look with no "before" of its own is
      // previewed against the one matching its framing — same rule the buyer's
      // crossfade uses, so the workbench shows what the buyer sees.
      beforeImages: g.beforeImages ?? {},
      beforeImagePath: g.beforeImagePath ?? null,
      beforeImageBucket: g.beforeImageBucket ?? "template-images",
      options: (g.options ?? []).filter(o => o.kind === "prompt").map(o => ({
        id: o.id,
        name: o.name,
        description: o.description ?? "",
        framing: o.framing ?? null,
        imagePath: o.imagePath ?? null,
        imageBucket: o.imageBucket ?? "template-images",
        beforeImagePath: o.beforeImagePath ?? null,
        beforeImageBucket: o.beforeImageBucket ?? "template-images",
      })),
    })),
  });
}

// ── Add one look ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    templateId?: string; groupId?: string; name?: string; description?: string;
    framing?: string; imagePath?: string; beforeImagePath?: string;
  };
  const { templateId, groupId } = body;
  if (!templateId || !groupId) return NextResponse.json({ error: "Missing template or section" }, { status: 400 });

  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  if (!name) return NextResponse.json({ error: "Give the look a name." }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Names are limited to ${MAX_NAME} characters (yours is ${name.length}).` }, { status: 400 });
  }
  if (!description) return NextResponse.json({ error: "Paste the prompt for this look." }, { status: 400 });
  if (description.length > MAX_PROMPT_DESCRIPTION) {
    return NextResponse.json({ error: `The prompt is ${description.length} characters; the limit is ${MAX_PROMPT_DESCRIPTION}.` }, { status: 400 });
  }

  const row = await ownedTemplate(templateId, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const before = Array.isArray(row.option_groups) ? row.option_groups : null;
  if (!before) return NextResponse.json({ error: "This template has no sections yet." }, { status: 400 });

  const group = before.find(g => g.id === groupId && g.type === "lighting");
  if (!group) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  if ((group.options ?? []).some(o => o.name.trim().toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: `"${name}" already exists in this section.` }, { status: 409 });
  }

  const badPath = [body.imagePath, body.beforeImagePath]
    .filter(Boolean).find(p => !(p as string).startsWith(`${user.id}/`));
  if (badPath) return NextResponse.json({ error: "Invalid image reference" }, { status: 400 });

  const option: ChoiceOption = {
    id: crypto.randomUUID(),
    name,
    kind: "prompt",
    description,
    ...(LIGHTING_FRAMINGS.includes(body.framing as LightingFraming) ? { framing: body.framing as LightingFraming } : {}),
    ...(body.imagePath ? { imagePath: body.imagePath, imageBucket: "template-images" } : {}),
    ...(body.beforeImagePath ? { beforeImagePath: body.beforeImagePath, beforeImageBucket: "template-images" } : {}),
  };

  const next = before.map(g => g.id === groupId ? { ...g, options: [...(g.options ?? []), option] } : g);
  const res = await writeGuarded(templateId, before, next, +1);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, option, looks: res.looks });
}

// ── Change one field on one look ─────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    templateId?: string; groupId?: string; optionId?: string;
    name?: string; description?: string; framing?: string | null;
    imagePath?: string; beforeImagePath?: string | null;
  };
  const { templateId, groupId, optionId } = body;
  if (!templateId || !groupId || !optionId) {
    return NextResponse.json({ error: "Missing template, section or look" }, { status: 400 });
  }

  const row = await ownedTemplate(templateId, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const before = Array.isArray(row.option_groups) ? row.option_groups : null;
  if (!before) return NextResponse.json({ error: "This template has no sections yet." }, { status: 400 });

  const group = before.find(g => g.id === groupId && g.type === "lighting");
  const current = group?.options?.find(o => o.id === optionId);
  if (!group || !current) return NextResponse.json({ error: "Look not found" }, { status: 404 });

  const patch: Partial<ChoiceOption> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "The name cannot be empty." }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `Names are limited to ${MAX_NAME} characters (yours is ${name.length}).` }, { status: 400 });
    }
    if (group.options.some(o => o.id !== optionId && o.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `"${name}" already exists in this section.` }, { status: 409 });
    }
    patch.name = name;
  }

  if (body.description !== undefined) {
    const description = body.description.trim();
    if (!description) return NextResponse.json({ error: "The prompt cannot be empty." }, { status: 400 });
    if (description.length > MAX_PROMPT_DESCRIPTION) {
      return NextResponse.json({ error: `The prompt is ${description.length} characters; the limit is ${MAX_PROMPT_DESCRIPTION}.` }, { status: 400 });
    }
    patch.description = description;
  }

  if (body.framing !== undefined) {
    patch.framing = LIGHTING_FRAMINGS.includes(body.framing as LightingFraming)
      ? (body.framing as LightingFraming)
      : undefined;
  }

  for (const [key, value] of [["imagePath", body.imagePath], ["beforeImagePath", body.beforeImagePath]] as const) {
    if (value === undefined) continue;
    if (value === null) { (patch as Record<string, unknown>)[key] = undefined; continue; }
    if (!value.startsWith(`${user.id}/`)) return NextResponse.json({ error: "Invalid image reference" }, { status: 400 });
    (patch as Record<string, unknown>)[key] = value;
    (patch as Record<string, unknown>)[key === "imagePath" ? "imageBucket" : "beforeImageBucket"] = "template-images";
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  // Spread then strip: an explicit `undefined` in the patch means "clear this",
  // and a key left sitting as undefined would be written into the JSON as null.
  const merged = { ...current, ...patch } as Record<string, unknown>;
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];

  const next = before.map(g => g.id !== groupId ? g : {
    ...g,
    options: g.options.map(o => o.id === optionId ? (merged as unknown as ChoiceOption) : o),
  });

  const res = await writeGuarded(templateId, before, next, 0);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, option: merged, looks: res.looks });
}

// ── Remove one look ──────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    templateId?: string; groupId?: string; optionId?: string;
  };
  const { templateId, groupId, optionId } = body;
  if (!templateId || !groupId || !optionId) {
    return NextResponse.json({ error: "Missing template, section or look" }, { status: 400 });
  }

  const row = await ownedTemplate(templateId, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const before = Array.isArray(row.option_groups) ? row.option_groups : null;
  if (!before) return NextResponse.json({ error: "This template has no sections yet." }, { status: 400 });

  const group = before.find(g => g.id === groupId && g.type === "lighting");
  if (!group?.options?.some(o => o.id === optionId)) {
    return NextResponse.json({ error: "Look not found" }, { status: 404 });
  }
  // A section that would be emptied is refused: sanitizeOptionGroups drops any
  // group with no options, so deleting the last look would silently take the
  // section with it.
  if (group.options.length === 1) {
    return NextResponse.json({ error: "This is the last look in the section. Delete the section from the template editor instead." }, { status: 400 });
  }

  // The stored images are deliberately NOT deleted from R2 here. They are shared
  // across resold copies of this archive on other creators' templates, and the
  // library route already owns that reference-counted deletion.
  const next = before.map(g => g.id !== groupId ? g : {
    ...g, options: g.options.filter(o => o.id !== optionId),
  });

  const res = await writeGuarded(templateId, before, next, -1);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, looks: res.looks });
}
