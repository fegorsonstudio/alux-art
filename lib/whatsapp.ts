import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API client.
 *
 * Every call is scoped to one creator: they connect their own WhatsApp Business
 * number, so the phone number id and access token come from their `creators`
 * row rather than from the environment. The app secret is shared, because all
 * creators' numbers are subscribed to the same Meta app and Meta signs every
 * webhook with that one secret.
 *
 * Kept deliberately small. Anything that is not needed to run a booking
 * conversation does not belong here.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type WaCreds = { phoneNumberId: string; token: string };

/** WhatsApp rejects a text body over 4096 characters with a hard error. */
const MAX_TEXT = 4000;

type SendResult = { ok: true; id?: string } | { ok: false; error: string };

async function post(creds: WaCreds, body: unknown): Promise<SendResult> {
  try {
    const r = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.token}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
    }).then((x) => x.json());

    if (r.error) {
      // error_user_msg carries the human reason (link blocked, outside the
      // 24-hour window, number not opted in). error.message alone is usually
      // a generic headline — the Instagram bot lost a day to exactly that.
      const detail = r.error.error_user_msg || r.error.message || JSON.stringify(r.error);
      return { ok: false, error: `${detail} (code ${r.error.code ?? "?"}/${r.error.error_subcode ?? "-"})` };
    }
    return { ok: true, id: r.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function sendText(creds: WaCreds, to: string, text: string): Promise<SendResult> {
  return post(creds, {
    to,
    type: "text",
    // preview_url off: a link preview turns a tidy reply into a big card, and
    // the customer is being asked to tap, not to read a preview.
    text: { body: text.slice(0, MAX_TEXT), preview_url: false },
  });
}

/**
 * An image by public URL. WhatsApp fetches the link from its own servers, so it
 * must be reachable without a session cookie — a signed R2 URL works, an
 * app-proxied /api/media URL does not.
 */
export function sendImage(creds: WaCreds, to: string, url: string, caption?: string): Promise<SendResult> {
  return post(creds, {
    to,
    type: "image",
    image: { link: url, ...(caption ? { caption: caption.slice(0, 1000) } : {}) },
  });
}

/**
 * An interactive list. Used for choosing a style, because typing a number is
 * where a chat flow usually goes wrong: people reply "the second one", "2)",
 * or the style's name. A list gives back a stable id instead.
 *
 * WhatsApp caps this at 10 rows and 24 characters per row title, and silently
 * fails the whole message if either is exceeded, so both are enforced here.
 */
export function sendList(
  creds: WaCreds,
  to: string,
  opts: { body: string; button: string; rows: Array<{ id: string; title: string; description?: string }> }
): Promise<SendResult> {
  return post(creds, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: opts.body.slice(0, 1024) },
      action: {
        button: opts.button.slice(0, 20),
        sections: [{
          rows: opts.rows.slice(0, 10).map((r) => ({
            id: r.id.slice(0, 200),
            title: r.title.slice(0, 24),
            ...(r.description ? { description: r.description.slice(0, 72) } : {}),
          })),
        }],
      },
    },
  });
}

/** Up to three reply buttons. Used for yes/no confirmations. */
export function sendButtons(
  creds: WaCreds,
  to: string,
  opts: { body: string; buttons: Array<{ id: string; title: string }> }
): Promise<SendResult> {
  return post(creds, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: opts.body.slice(0, 1024) },
      action: {
        buttons: opts.buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Downloads an inbound photo. Two calls: the media id resolves to a short-lived
 * URL, and that URL still needs the access token as a bearer header — fetching
 * it without one returns 401, which is easy to mistake for an expired link.
 */
export async function downloadMedia(
  creds: WaCreds,
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    }).then((x) => x.json());
    if (!meta?.url) return null;

    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${creds.token}` } });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: meta.mime_type || "image/jpeg" };
  } catch {
    return null;
  }
}

/** Marks the customer's message as read, so the chat shows blue ticks. */
export async function markRead(creds: WaCreds, messageId: string): Promise<void> {
  await post(creds, { status: "read", message_id: messageId });
}

/**
 * Meta signs every webhook with the app secret, shared across all creators'
 * numbers. Same scheme as the Instagram webhook.
 */
export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Digits only. WhatsApp gives back E.164 without the plus. */
export function normalisePhone(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "");
}
