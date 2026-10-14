import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * A login-free link to the full-size files of one order.
 *
 * Every finished photo in the shoot gets its own token, minted on first use and
 * kept, so the same link works if it is sent twice. The link names the first
 * photo; its page (/d/<token>) lists every photo in the same order, so a
 * customer with five photos is not handed one. An Instagram or WhatsApp buyer has
 * a synthetic account with no password, so this is the only way they can reach
 * the full-quality files they paid for.
 */
export async function shootDownloadLink(shootId: string): Promise<string | null> {
  const imgs = await sql<{ id: string; token: string | null }[]>`
    SELECT id, download_token AS token FROM shoot_images
    WHERE shoot_id = ${shootId} AND status = 'COMPLETE'
      AND COALESCE(download_storage_path, preview_storage_path) IS NOT NULL
    ORDER BY slot`.catch(() => []);
  if (!imgs.length) return null;

  let first: string | null = null;
  for (const img of imgs) {
    let token = img.token;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      const ok = await sql`UPDATE shoot_images SET download_token = ${token} WHERE id = ${img.id} AND download_token IS NULL RETURNING id`
        .then((r) => r.length > 0).catch(() => false);
      if (!ok) {
        // Someone else minted it a moment ago — use theirs.
        const [again] = await sql<{ token: string | null }[]>`SELECT download_token AS token FROM shoot_images WHERE id = ${img.id}`.catch(() => []);
        token = again?.token ?? null;
      }
    }
    if (!first && token) first = token;
  }
  return first ? `${SITE_URL}/d/${first}` : null;
}
