import type { Metadata } from "next";
import { cookies } from "next/headers";
import sql from "@/lib/db";
import { resolveUploadToken, UPLOAD_MAX_PHOTOS, UPLOAD_MAX_BYTES } from "@/lib/chat-upload-links";
import { whatsappUploadOpen } from "@/lib/whatsapp-upload";
import { handleForAccount } from "@/lib/instagram";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale, dirFor, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import UploadForm from "./UploadForm";

/**
 * The full-quality upload page a chat bot links to (/d/up/<token>).
 *
 * Under /d/ so middleware never sends a chat customer, who has no password, to
 * the login page. The token names one WhatsApp or Instagram conversation; the
 * photos go into that conversation's order through /api/up/<token>.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Upload your photos — Alux Art",
  robots: { index: false, follow: false },
};

/** wa.me link back to the WhatsApp number this chat is on, read from Meta once. */
const waLinks = new Map<string, string>();
async function whatsappChatLink(creatorId: string | null): Promise<string | null> {
  if (!creatorId) return null;
  if (waLinks.has(creatorId)) return waLinks.get(creatorId)!;
  const [c] = await sql<{ pid: string; tok: string }[]>`
    SELECT whatsapp_phone_number_id AS pid, whatsapp_access_token AS tok
    FROM creators WHERE id = ${creatorId} AND whatsapp_access_token IS NOT NULL`;
  if (!c) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${c.pid}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${c.tok}` },
    }).then((x) => x.json());
    const digits = String(r?.display_phone_number ?? "").replace(/\D/g, "");
    if (!digits) return null;
    waLinks.set(creatorId, `https://wa.me/${digits}`);
    return `https://wa.me/${digits}`;
  } catch {
    return null;
  }
}

export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveUploadToken(token);

  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  let status: "open" | "expired" | "closed" = "expired";
  let backUrl: string | null = null;

  if (link?.channel === "whatsapp") {
    const [s] = await sql<{ locale: string | null; creator_id: string | null }[]>`
      SELECT locale, creator_id FROM whatsapp_sessions WHERE id = ${link.sessionId}`;
    // The language they chose in the chat beats the browser's.
    if (isLocale(s?.locale)) locale = s.locale;
    status = s && await whatsappUploadOpen(link.sessionId) ? "open" : "closed";
    backUrl = await whatsappChatLink(s?.creator_id ?? null);
  } else if (link?.channel === "instagram") {
    const [s] = await sql<{ ig_account_id: string }[]>`
      SELECT ig_account_id FROM instagram_sessions WHERE id = ${link.sessionId}`;
    status = s ? "open" : "closed";
    const handle = s ? handleForAccount(s.ig_account_id) : "";
    backUrl = handle && handle !== s?.ig_account_id && /^[A-Za-z0-9._]+$/.test(handle) ? `https://ig.me/m/${handle}` : null;
  }

  const dict = await getDictionary(locale);
  return (
    <UploadForm
      token={token}
      channel={link?.channel ?? "instagram"}
      status={status}
      backUrl={backUrl}
      strings={dict.chatUpload}
      themeLabels={{ light: dict.common.light, dark: dict.common.dark }}
      maxPhotos={UPLOAD_MAX_PHOTOS}
      maxMb={Math.floor(UPLOAD_MAX_BYTES / 1048576)}
      dir={dirFor(locale)}
    />
  );
}
