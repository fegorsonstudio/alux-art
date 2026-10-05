import "server-only";
import { readFileSync } from "node:fs";

/**
 * Sending into an Instagram DM.
 *
 * Sibling of lib/whatsapp.ts, deliberately separate. The two platforms differ
 * in ways that matter to callers rather than just to the transport:
 *
 *   - Instagram allows ONE reply per comment, but an open conversation once the
 *     person replies. WhatsApp has no such split.
 *   - Instagram closes the conversation 24 hours after the customer's last
 *     message. A shoot that finishes after that window cannot be delivered.
 *   - Instagram silently refuses any message containing a URL while the account
 *     is under a link restriction, and reports it as "Invalid message id".
 */

const GRAPH = "https://graph.instagram.com/v21.0";

export type IgCreds = { accountId: string; token: string };

export type IgSendResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; linkBlocked: boolean; windowClosed: boolean };

/** Instagram's own cap. Longer text is refused outright rather than trimmed. */
export const IG_MAX_TEXT = 1000;

/** Where scripts/instagram-refresh.mjs keeps the tokens it renews every week. */
const TOKEN_STORE = `${process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data"}/tokens.json`;
/** How often each account's working token is re-confirmed with Instagram. */
const RECHECK_MS = 30 * 60_000;

type StoredToken = { id?: string; token?: string };
let store: { at: number; data: Record<string, StoredToken> } | null = null;
/** Per handle: the token Instagram last accepted, and when that was asked. */
const verdicts = new Map<string, { token: string | null; at: number }>();

function storedToken(handle: string, accountId: string): string | null {
  if (!store || Date.now() - store.at > 5 * 60_000) {
    try {
      store = { at: Date.now(), data: JSON.parse(readFileSync(TOKEN_STORE, "utf8")) };
    } catch {
      store = { at: Date.now(), data: {} };
    }
  }
  const s = store.data[handle];
  return s?.token && s.id === accountId ? s.token : null;
}

/** Ask Instagram, read-only, which candidate it accepts; remember the answer. */
async function recheck(handle: string, candidates: string[]): Promise<void> {
  for (const token of candidates) {
    const ok = await fetch(`${GRAPH}/me?fields=id&access_token=${encodeURIComponent(token)}`)
      .then((r) => r.json()).then((j) => Boolean(j?.id)).catch(() => false);
    if (ok) { verdicts.set(handle, { token, at: Date.now() }); return; }
  }
  verdicts.set(handle, { token: null, at: Date.now() });
}

/**
 * Credentials for one of our connected accounts, by its Instagram user id.
 *
 * Two places hold a token for each account. .env.local has whatever was pasted
 * in by hand, which nothing renews and Instagram expires after 60 days. The
 * weekly refresh job keeps a renewed one in tokens.json. This used to read only
 * the first, so the bot was always counting down to a cliff the refresh job
 * was quietly avoiding next door.
 *
 * Neither is trusted blindly: a Facebook password change killed
 * @fegorson_studio's stored token while the pasted one still worked. So the
 * token Instagram last ACCEPTED wins, re-confirmed in the background every
 * half hour, renewed one tried first. This stays synchronous — every caller
 * reads it inline — and before the first check returns it answers as it always
 * did, with the stored token or else the environment's.
 */
export function credsForAccount(igAccountId: string): IgCreds | null {
  for (const handle of (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const key = handle.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (process.env[`IG_${key}_ID`] === igAccountId) {
      const candidates = [storedToken(handle, igAccountId), process.env[`IG_${key}_TOKEN`] ?? null]
        .filter((t, i, all): t is string => !!t && all.indexOf(t) === i);
      if (candidates.length === 0) return null;

      const verdict = verdicts.get(handle);
      if (!verdict || Date.now() - verdict.at > RECHECK_MS) {
        // Claimed before the call so a burst of messages starts one check, not fifty.
        verdicts.set(handle, { token: verdict?.token ?? null, at: Date.now() });
        void recheck(handle, candidates);
      }
      const token = verdict?.token && candidates.includes(verdict.token) ? verdict.token : candidates[0];
      return { accountId: igAccountId, token };
    }
  }
  return null;
}

/** The handle behind an account id, for logs that a human has to read. */
export function handleForAccount(igAccountId: string): string {
  for (const handle of (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const key = handle.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (process.env[`IG_${key}_ID`] === igAccountId) return handle;
  }
  return igAccountId;
}

/**
 * Is this failure the link restriction?
 *
 * Instagram reports it as error 100 "Invalid message id", which points at the
 * wrong thing entirely — the real reason is only in error_subcode 2534122 or
 * the user-facing title. The comment webhook already learned this the hard way;
 * the same detection lives here so every send path benefits.
 */
function isLinkBlocked(err: Record<string, unknown> | undefined): boolean {
  if (!err) return false;
  const text = `${err.error_user_title ?? ""} ${err.error_user_msg ?? ""} ${err.message ?? ""}`;
  return err.error_subcode === 2534122 || /link can'?t be shared|share links/i.test(text);
}

/**
 * Has the 24-hour window closed?
 *
 * Distinguished from other failures because the answer is different: a closed
 * window is not retryable and not fixable by rewording, so the caller has to
 * reach the customer another way rather than queue and hope.
 */
function isWindowClosed(err: Record<string, unknown> | undefined): boolean {
  if (!err) return false;
  const text = `${err.error_user_title ?? ""} ${err.error_user_msg ?? ""} ${err.message ?? ""}`;
  return err.code === 10 && /outside.*(allowed window|24)|messaging window/i.test(text)
    || /outside of allowed window/i.test(text);
}

async function post(creds: IgCreds, body: Record<string, unknown>): Promise<IgSendResult> {
  try {
    const res = await fetch(`${GRAPH}/${creds.accountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: creds.token }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      const err = data.error as Record<string, unknown>;
      return {
        ok: false,
        error: JSON.stringify(err).slice(0, 300),
        linkBlocked: isLinkBlocked(err),
        windowClosed: isWindowClosed(err),
      };
    }
    return { ok: true, messageId: data.message_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message, linkBlocked: false, windowClosed: false };
  }
}

/** A plain text message to an open conversation. */
export function sendText(creds: IgCreds, to: string, text: string): Promise<IgSendResult> {
  const body = text.length > IG_MAX_TEXT ? text.slice(0, IG_MAX_TEXT - 1) + "…" : text;
  return post(creds, { recipient: { id: to }, message: { text: body } });
}

/**
 * One image, by public URL.
 *
 * Instagram fetches the URL from its own servers, so it must be reachable
 * without a session — the same constraint that broke the retouch delivery when
 * it was pointed at /api/media, which requires a logged-in browser.
 */
export function sendImage(creds: IgCreds, to: string, url: string): Promise<IgSendResult> {
  return post(creds, {
    recipient: { id: to },
    message: { attachment: { type: "image", payload: { url, is_reusable: false } } },
  });
}

/** The single private reply Instagram allows in answer to a comment. */
export function replyToComment(creds: IgCreds, commentId: string, text: string): Promise<IgSendResult> {
  const body = text.length > IG_MAX_TEXT ? text.slice(0, IG_MAX_TEXT - 1) + "…" : text;
  return post(creds, { recipient: { comment_id: commentId }, message: { text: body } });
}

/**
 * Pull a photo the customer sent.
 *
 * The webhook carries a CDN url rather than the bytes, and that url is
 * short-lived — it must be fetched while handling the message, never stored and
 * fetched later.
 */
export async function downloadAttachment(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

/**
 * Is this conversation still open?
 *
 * Instagram allows a reply only within 24 hours of the customer's last message.
 * The poller checks this before delivering rather than discovering it as a send
 * failure, so a customer whose window has closed can be routed somewhere else
 * instead of silently receiving nothing.
 */
export function windowOpen(lastInboundAt: Date | string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const at = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  return Date.now() - at.getTime() < 24 * 60 * 60 * 1000;
}

/**
 * Who is this scoped id?
 *
 * The DM webhook carries `sender.id` and no username, so there is nothing in
 * the payload to compare against our own accounts. Without this lookup the bot
 * cannot tell a customer from another one of our bots — which is exactly how
 * @aluxartandframes and @fegorson_studio ended up answering each other until
 * one had to block the other.
 *
 * Returns null when Instagram will not say, which is treated as "not ours".
 */
export async function usernameForScopedId(creds: IgCreds, scopedId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${scopedId}?fields=username&access_token=${encodeURIComponent(creds.token)}`
    );
    const data = await res.json().catch(() => ({}));
    return typeof data.username === "string" ? data.username : null;
  } catch {
    return null;
  }
}

/** Every handle in IG_ACCOUNTS, lowercased — the accounts we must never answer. */
export function ourHandles(): Set<string> {
  return new Set(
    (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  );
}
