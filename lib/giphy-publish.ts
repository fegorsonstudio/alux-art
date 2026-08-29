import "server-only";
import sql from "@/lib/db";
import { r2Download } from "@/lib/r2";
import { publishLoop } from "@/lib/giphy";

/**
 * Publishing a finished loop to the Alux Art GIPHY channel.
 *
 * Lives here rather than in the API route because two doors reach it: the
 * studio panel on the website, and the Instagram bot, where somebody who made
 * their loop in a chat says "post it" without ever opening a browser. Both must
 * apply the same rules — a loop is published once, only when finished, only
 * when asked — so there is one implementation and no second copy to drift.
 *
 * Never throws for an expected failure. A GIPHY problem must not take down a
 * chat reply or a page; the customer still has the files they paid for, and
 * only the sticker is missing.
 */

export type PublishOutcome =
  | { ok: true; id: string; url: string; tag: string; already: boolean }
  | { ok: false; error: string; reason: "not_found" | "unfinished" | "upload_failed" | "read_failed" };

type Row = {
  enhance: Record<string, unknown> | null;
  status: string;
  bucket: string | null;
  path: string | null;
};

/**
 * Tags the customer chose, cleaned.
 *
 * GIPHY matches loosely and punctuation is a good way to make a sticker
 * unfindable, so these are flattened to letters, digits and single spaces.
 * Commas split, which lets one typed line carry several tags — "lagos, party,
 * glow up" is how a person writes it.
 */
export function cleanTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    for (const part of item.split(",")) {
      const tag = part.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  // GIPHY ignores the long tail anyway, and a wall of tags reads as spam.
  return out.slice(0, 20);
}

/** What is already on the channel for this shoot, if anything. */
export function publishedAlready(enhance: Record<string, unknown> | null) {
  return enhance?.giphyId
    ? {
        id: String(enhance.giphyId),
        url: String(enhance.giphyUrl ?? ""),
        tag: String(enhance.giphyTag ?? ""),
      }
    : null;
}

/**
 * The shoot, and the landscape GIF that would be published.
 *
 * The landscape GIF specifically: it is what the picker previews well, and an
 * MP4 is not something GIPHY accepts as a sticker.
 */
export async function loadPublishable(shootId: string) {
  const [row] = await sql<(Row & { user_id: string })[]>`
    SELECT s.user_id, s.status, s.enhance,
           i.download_storage_bucket AS bucket, i.download_storage_path AS path
    FROM shoots s
    LEFT JOIN shoot_images i
      ON i.shoot_id = s.id AND i.kind = 'landscape-gif' AND i.status = 'COMPLETE'
    WHERE s.id = ${shootId}
    LIMIT 1`;
  return row ?? null;
}

/**
 * Put one finished loop on the channel.
 *
 * A second call for a shoot already published returns the existing sticker with
 * `already: true` rather than posting a duplicate — a double tap on a slow
 * connection, or someone typing "post" twice in a chat, must not put the same
 * loop up twice. There is no way to merge two stickers afterwards.
 */
export async function publishShootLoop(
  shootId: string,
  tags: string[],
): Promise<PublishOutcome> {
  const row = await loadPublishable(shootId);
  if (!row) return { ok: false, error: "Shoot not found.", reason: "not_found" };

  const already = publishedAlready(row.enhance);
  if (already) return { ok: true, ...already, already: true };

  if (row.status !== "COMPLETE" || !row.path) {
    return { ok: false, error: "This loop is not finished yet.", reason: "unfinished" };
  }

  let bytes: Buffer;
  try {
    bytes = (await r2Download(row.bucket ?? "generated-4k", row.path)).buffer;
  } catch {
    return { ok: false, error: "Could not read the file to publish.", reason: "read_failed" };
  }

  const result = await publishLoop(bytes, { shootId, extraTags: tags });
  if (!result.ok) return { ok: false, error: result.error, reason: "upload_failed" };

  // Recorded on the shoot so the studio panel and the chat can both tell the
  // customer their tag, and so a repeat is refused above rather than
  // duplicating the sticker.
  await sql`UPDATE shoots SET enhance = COALESCE(enhance, '{}'::jsonb) || ${sql.json({
    giphyId: result.id, giphyUrl: result.url, giphyTag: result.tag, giphyTags: tags,
  } as never)} WHERE id = ${shootId}`;

  return { ok: true, id: result.id, url: result.url, tag: result.tag, already: false };
}
