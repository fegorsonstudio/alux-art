import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Copy } from "@/lib/r2";
import { isAdminEmail } from "@/lib/auth";

/**
 * The shared lighting library: every lighting section Alux Art has built, ready
 * to drop into a template in one click instead of rebuilding 193 looks by hand.
 *
 * Images are the wrinkle. A template option may only reference storage under its
 * own creator's prefix (see sanitizeOptionGroups), so:
 *   - the owner of the library gets the groups as they are, no copying;
 *   - anyone else gets their own copy of each image, written under their prefix.
 *
 * That copy is deliberate rather than a shared reference: if two creators pointed
 * at one object, either deleting their template could break the other's.
 */

interface LibOption {
  id: string; kind: string; name: string; description?: string;
  framing?: string; imagePath?: string; imageBucket?: string;
}
interface LibGroup {
  id: string; type: string; label: string; options: LibOption[];
  beforeImages?: Record<string, string>; beforeImagePath?: string; beforeImageBucket?: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Source of truth: lighting groups on admin-authored templates.
  const rows = await sql<{ option_groups: LibGroup[] | null; owner: string | null }[]>`
    SELECT t.option_groups, c.user_id AS owner
    FROM templates t
    JOIN creators c ON c.id = t.creator_id
    WHERE t.option_groups IS NOT NULL
    ORDER BY t.updated_at DESC
  `;

  const sections: Array<{ label: string; count: number; ownerId: string }> = [];
  for (const row of rows) {
    for (const g of row.option_groups ?? []) {
      if (g.type !== "lighting" || !(g.options?.length)) continue;
      if (sections.some(s => s.label === g.label)) continue;   // first wins
      sections.push({ label: g.label, count: g.options.length, ownerId: row.owner ?? "" });
    }
  }
  return NextResponse.json({
    sections: sections.map(s => ({ label: s.label, count: s.count })),
    totalLooks: sections.reduce((n, s) => n + s.count, 0),
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ option_groups: LibGroup[] | null; owner: string | null; email: string | null }[]>`
    SELECT t.option_groups, c.user_id AS owner, u.email
    FROM templates t
    JOIN creators c ON c.id = t.creator_id
    LEFT JOIN auth.users u ON u.id = c.user_id
    WHERE t.option_groups IS NOT NULL
    ORDER BY t.updated_at DESC
  `;

  const seen = new Set<string>();
  const groups: LibGroup[] = [];
  for (const row of rows) {
    if (!isAdminEmail(row.email ?? undefined)) continue;   // library = admin-built only
    for (const g of row.option_groups ?? []) {
      if (g.type !== "lighting" || !(g.options?.length) || seen.has(g.label)) continue;
      seen.add(g.label);
      groups.push({ ...g, options: g.options, _owner: row.owner } as LibGroup & { _owner: string | null });
    }
  }
  if (groups.length === 0) return NextResponse.json({ error: "No lighting library found" }, { status: 404 });

  const BUCKET = "template-images";
  // Copy an image into the caller's own prefix, unless they already own it.
  const mine = async (bucket: string | undefined, path: string | undefined): Promise<string | undefined> => {
    if (!path) return undefined;
    if (path.startsWith(`${user.id}/`)) return path;             // already ours
    const dest = `${user.id}/${crypto.randomUUID()}-${path.split("/").pop()}`;
    await r2Copy(bucket ?? BUCKET, path, BUCKET, dest);
    return dest;
  };

  const out = [];
  for (const g of groups) {
    const options = [];
    for (const o of g.options) {
      options.push({
        ...o,
        id: crypto.randomUUID(),
        imagePath: await mine(o.imageBucket, o.imagePath),
        imageBucket: BUCKET,
      });
    }
    const beforeImages: Record<string, string> = {};
    for (const [framing, path] of Object.entries(g.beforeImages ?? {})) {
      const copied = await mine(g.beforeImageBucket, path);
      if (copied) beforeImages[framing] = copied;
    }
    out.push({
      id: crypto.randomUUID(),
      type: "lighting",
      label: g.label,
      options,
      ...(Object.keys(beforeImages).length ? { beforeImages, beforeImageBucket: BUCKET } : {}),
      ...(g.beforeImagePath ? { beforeImagePath: await mine(g.beforeImageBucket, g.beforeImagePath), beforeImageBucket: BUCKET } : {}),
    });
  }

  return NextResponse.json({
    groups: out,
    totalLooks: out.reduce((n, g) => n + g.options.length, 0),
  });
}
