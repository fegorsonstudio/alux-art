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

/**
 * A photo to the studio owner.
 *
 * sendDocument rather than sendPhoto: Telegram recompresses photos, and the
 * whole point of sending these is that they are about to be retouched. A
 * squeezed copy is not something anybody can work on.
 */
export async function sendAdminImage(url: string, caption?: string): Promise<boolean> {
  const chat = adminChat();
  if (!chat) return false;
  return call("sendDocument", {
    chat_id: chat,
    document: url,
    ...(caption ? { caption: caption.slice(0, 1000), parse_mode: "HTML" } : {}),
  });
}
