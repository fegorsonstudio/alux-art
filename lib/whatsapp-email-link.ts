import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * Join a WhatsApp chat to a website account, so the two share one wallet.
 *
 * A typed address proves nothing. If `email you@theirs.com` were enough, anyone
 * who knew a customer's address could attach their own phone to that account and
 * spend the balance. So a six-digit code goes to the address itself, and only a
 * code that comes back through the chat joins anything.
 *
 * Nothing here creates an account. The address has to already exist on the
 * website, which keeps this a *link* rather than a second, unverified signup
 * path into `profiles`.
 */

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export type LinkRequest =
  | { ok: true; email: string }
  | { ok: false; reason: "no-account" | "already-linked" | "send-failed" };

/** Step one: check the account exists, then email it a code. */
export async function requestEmailLink(phone: string, rawEmail: string): Promise<LinkRequest> {
  const email = rawEmail.trim().toLowerCase();

  const [profile] = await sql<{ id: string; phone: string | null }[]>`
    SELECT id, phone FROM profiles WHERE lower(email) = ${email} LIMIT 1`;
  if (!profile) return { ok: false, reason: "no-account" };

  // Already this chat's account: say so rather than sending a pointless code.
  if (profile.phone && profile.phone === phone) return { ok: false, reason: "already-linked" };

  // randomInt, not Math.random: this is the only thing standing between a
  // stranger and somebody else's balance.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  await sql`
    INSERT INTO whatsapp_email_links (phone, email, code, attempts, expires_at)
    VALUES (${phone}, ${email}, ${code}, 0, NOW() + ${`${CODE_TTL_MINUTES} minutes`}::interval)
    ON CONFLICT (phone) DO UPDATE
      SET email = EXCLUDED.email, code = EXCLUDED.code,
          attempts = 0, expires_at = EXCLUDED.expires_at, created_at = NOW()`;

  const sent = await sendCode(email, code, phone);
  if (!sent) return { ok: false, reason: "send-failed" };
  return { ok: true, email };
}

export type LinkResult =
  | { ok: true; userId: string; email: string; moved: number }
  | { ok: false; reason: "no-request" | "expired" | "wrong-code" | "too-many" };

/**
 * Step two: the code comes back, and the chat moves onto the real account.
 *
 * Any balance sitting on the chat's throwaway profile moves with it. Leaving it
 * behind would be the worst outcome of the whole feature: money paid in, still
 * owed, and no longer visible from either side.
 */
export async function confirmEmailLink(
  phone: string, code: string, sessionId: string
): Promise<LinkResult> {
  const [row] = await sql<{
    email: string; code: string; attempts: number; expired: boolean;
  }[]>`
    SELECT email, code, attempts, (expires_at < NOW()) AS expired
    FROM whatsapp_email_links WHERE phone = ${phone}`;

  if (!row) return { ok: false, reason: "no-request" };
  if (row.expired) {
    await sql`DELETE FROM whatsapp_email_links WHERE phone = ${phone}`;
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await sql`DELETE FROM whatsapp_email_links WHERE phone = ${phone}`;
    return { ok: false, reason: "too-many" };
  }
  if (row.code !== code.trim()) {
    await sql`UPDATE whatsapp_email_links SET attempts = attempts + 1 WHERE phone = ${phone}`;
    return { ok: false, reason: "wrong-code" };
  }

  const [profile] = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE lower(email) = ${row.email} LIMIT 1`;
  if (!profile) {
    await sql`DELETE FROM whatsapp_email_links WHERE phone = ${phone}`;
    return { ok: false, reason: "no-request" };
  }

  const moved = await sql.begin(async (trx) => {
    const [session] = await trx<{ user_id: string | null }[]>`
      SELECT user_id FROM whatsapp_sessions WHERE id = ${sessionId} FOR UPDATE`;
    const old = session?.user_id ?? null;

    let carried = 0;
    if (old && old !== profile.id) {
      const rows = await trx<{ id: string }[]>`
        UPDATE wallet_entries SET user_id = ${profile.id}
        WHERE user_id = ${old} RETURNING id`;
      carried = rows.length;
    }

    await trx`
      UPDATE whatsapp_sessions SET user_id = ${profile.id}, updated_at = NOW()
      WHERE id = ${sessionId}`;
    // The phone on the profile is what lets a later top-up find this chat.
    await trx`UPDATE profiles SET phone = ${phone}, updated_at = NOW() WHERE id = ${profile.id}`;
    await trx`DELETE FROM whatsapp_email_links WHERE phone = ${phone}`;
    return carried;
  });

  return { ok: true, userId: profile.id, email: row.email, moved };
}

/** Is this chat waiting on a code right now? Decides how a bare 6 digits reads. */
export async function hasPendingLink(phone: string): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM whatsapp_email_links
    WHERE phone = ${phone} AND expires_at > NOW()`.catch(() => []);
  return (row?.n ?? 0) > 0;
}

async function sendCode(email: string, code: string, phone: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";
  if (!key) {
    console.error("[email-link] no RESEND_API_KEY — code not sent");
    return false;
  }

  const masked = `+${phone.slice(0, 4)}…${phone.slice(-3)}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
      <p style="margin:0 0 20px;font-size:16px">Someone asked to join the WhatsApp number
        <strong>${masked}</strong> to this Alux Art account.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#555">Your code:</p>
      <p style="margin:0 0 24px;font-size:34px;letter-spacing:8px;font-weight:700">${code}</p>
      <p style="margin:0 0 20px;font-size:15px">Send it back in that WhatsApp chat within
        ${CODE_TTL_MINUTES} minutes. Once joined, your wallet works in both places.</p>
      <p style="margin:0;font-size:14px;color:#777">If this wasn't you, ignore this email —
        nothing has changed, and no one can join without this code.</p>
      <p style="margin:24px 0 0;font-size:13px;color:#999">${SITE_URL}</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `Alux Art <${from}>`,
      to: [email],
      subject: `${code} is your Alux Art code`,
      html,
    }),
  }).catch((e) => {
    console.error("[email-link] resend threw:", e instanceof Error ? e.message : e);
    return null;
  });

  if (!res || !res.ok) {
    console.error("[email-link] resend rejected:", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
    return false;
  }
  return true;
}
