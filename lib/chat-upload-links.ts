import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * Full-quality upload links for the chat bots (/d/up/<token>).
 *
 * Under /d/ on purpose: middleware.ts skips /d/ (the download links), so a chat
 * customer, who has no password, is never sent to the login page.
 *
 * Instagram shrinks every photo sent in a DM and WhatsApp shrinks photos sent the
 * normal way, so the bots offer a link to a page on our own site where the
 * original file can be sent into the same order. One link per conversation,
 * reused while it is valid; the token is the only authorisation.
 *
 * Kept free of any bot import so both bots can use it without a cycle: the
 * upload route is what calls into a bot.
 */

export type UploadChannel = "instagram" | "whatsapp";

/** Matches the privacy page's 48-hour deletion window. */
const LIFETIME_HOURS = 48;

/** Most photographs one upload page accepts — both bots stop at 10. */
export const UPLOAD_MAX_PHOTOS = 10;
/** fal.ai's per-image limit, which nginx and the other upload routes also use. */
export const UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

export async function uploadLinkFor(channel: UploadChannel, sessionId: string): Promise<string> {
  const [live] = await sql<{ token: string }[]>`
    SELECT token FROM chat_upload_links
    WHERE channel = ${channel} AND session_id = ${sessionId} AND expires_at > now() + interval '2 hours'
    ORDER BY expires_at DESC LIMIT 1`;
  if (live) return `${SITE_URL}/d/up/${live.token}`;

  const token = crypto.randomBytes(18).toString("base64url");
  await sql`
    INSERT INTO chat_upload_links (token, channel, session_id, expires_at)
    VALUES (${token}, ${channel}, ${sessionId}, now() + make_interval(hours => ${LIFETIME_HOURS}))`;
  return `${SITE_URL}/d/up/${token}`;
}

/** Files one link may ever receive (three full batches). */
const MAX_UPLOADS_PER_LINK = 30;

/** Counts one file against the link. False once the link has taken its share. */
export async function claimUploadSlot(token: string): Promise<boolean> {
  const rows = await sql`
    UPDATE chat_upload_links SET uploads = uploads + 1
    WHERE token = ${token} AND expires_at > now() AND uploads < ${MAX_UPLOADS_PER_LINK}
    RETURNING uploads`;
  return rows.length > 0;
}

export async function resolveUploadToken(
  token: string,
): Promise<{ channel: UploadChannel; sessionId: string } | null> {
  if (!token || token.length < 20 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const [row] = await sql<{ channel: UploadChannel; session_id: string }[]>`
    SELECT channel, session_id FROM chat_upload_links
    WHERE token = ${token} AND expires_at > now() LIMIT 1`;
  return row ? { channel: row.channel, sessionId: row.session_id } : null;
}
