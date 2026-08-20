import "server-only";

/**
 * Telegram, used as the studio's own back channel.
 *
 * Not a customer surface. This is how the app reaches the person who does the
 * retouching: a buyer asks for a retouch in WhatsApp, and the images plus the
 * order id arrive in the owner's Telegram so the work can start without anybody
 * watching a dashboard.
 *
 * NEVER throws. Every call site is a side effect of something that has already
 * succeeded — a delivered shoot, a paid order — and a failed notification must
 * not roll back work the customer has already been told about.
 */

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

function adminChat(): string | null {
  const id = process.env.TELEGRAM_ADMIN_CHAT_ID;
  return id && id.trim() ? id.trim() : null;
}

async function call(method: string, payload: Record<string, unknown>): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — nothing sent");
    return false;
  }
  try {
    const res = await fetch(API(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) {
      console.error(`[telegram] ${method} failed:`, JSON.stringify(j).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[telegram] ${method} threw:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** A note to the studio owner. */
export async function tellAdmin(text: string): Promise<boolean> {
  const chat = adminChat();
  if (!chat) { console.warn("[telegram] no TELEGRAM_ADMIN_CHAT_ID — nothing sent"); return false; }
  return call("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true });
}

/** Telegram will download a URL for you, but only up to 20MB. */
const URL_FETCH_LIMIT = 20 * 1024 * 1024;
/** Uploading the bytes yourself raises the ceiling to 50MB. */
const UPLOAD_LIMIT = 50 * 1024 * 1024;

/**
 * A photo to the studio owner.
 *
 * sendDocument rather than sendPhoto: Telegram recompresses photos, and the
 * whole point of sending these is that they are about to be retouched. A
 * squeezed copy is not something anybody can work on.
 *
 * The bytes are uploaded rather than handed over as a link. Telegram only
 * downloads a URL up to 20MB and a 4K render lands either side of that — the
 * first one tried was 20.25MB and arrived unusable. Uploading directly allows
 * 50MB and lets the file carry a real name instead of whatever Telegram infers
 * from a signed url.
 */
export async function sendAdminImage(url: string, caption?: string, filename?: string): Promise<boolean> {
  const chat = adminChat();
  if (!chat) return false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — nothing sent");
    return false;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[telegram] could not read the file to send: ${res.status}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // Past what a bot may upload. Hand over the link instead of failing mutely,
    // so the work can still be done.
    if (buf.byteLength > UPLOAD_LIMIT) {
      console.warn(`[telegram] ${buf.byteLength} bytes is over the 50MB upload limit — sending a link`);
      return tellAdmin(
        `${caption ?? "File"}\n\nToo big to send through Telegram ` +
        `(${(buf.byteLength / 1024 / 1024).toFixed(1)}MB). Download it here:\n${url}`
      );
    }

    const name = filename ?? decodeURIComponent(new URL(url).pathname.split("/").pop() || "image.jpg");
    const form = new FormData();
    form.append("chat_id", chat);
    form.append("document", new Blob([new Uint8Array(buf)], {
      type: res.headers.get("content-type") ?? "application/octet-stream",
    }), name);
    if (caption) {
      form.append("caption", caption.slice(0, 1000));
      form.append("parse_mode", "HTML");
    }

    const send = await fetch(API("sendDocument"), { method: "POST", body: form });
    const j = await send.json().catch(() => ({}));
    if (!j?.ok) {
      console.error("[telegram] sendDocument failed:", JSON.stringify(j).slice(0, 200),
        `| ${buf.byteLength} bytes`,
        buf.byteLength > URL_FETCH_LIMIT ? "(over the 20MB url limit, which is why this is uploaded)" : "");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] sendAdminImage threw:", e instanceof Error ? e.message : e);
    return false;
  }
}
