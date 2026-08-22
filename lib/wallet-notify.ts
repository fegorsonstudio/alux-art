import "server-only";
import sql from "@/lib/db";
import { sendText, type WaCreds } from "@/lib/whatsapp";
import { walletBalance, naira } from "@/lib/wallet";

/**
 * Tell a buyer in WhatsApp that their top-up landed.
 *
 * Paystack's own receipt goes to the email on the transaction, and for a chat
 * customer that address is synthetic (wa-<phone>@whatsapp.aluxartandframes.shop),
 * so it bounces. Without this, money leaves their account and nothing they can
 * see acknowledges it.
 *
 * Never throws. It is called from the payment webhook, where an exception would
 * turn a successful payment into a Paystack retry.
 */
export async function notifyWalletTopUp(userId: string, amountNgn: number): Promise<void> {
  const [row] = await sql<{
    customer_phone: string; phone_number_id: string; access_token: string;
  }[]>`
    SELECT s.customer_phone,
           c.whatsapp_phone_number_id AS phone_number_id,
           c.whatsapp_access_token    AS access_token
    FROM whatsapp_sessions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.user_id = ${userId} AND c.whatsapp_access_token IS NOT NULL
    ORDER BY s.updated_at DESC LIMIT 1`.catch(() => []);

  if (!row) return;   // a website customer — Paystack's own receipt reaches them

  const creds: WaCreds = { phoneNumberId: row.phone_number_id, token: row.access_token };
  const balance = await walletBalance(userId);

  await sendText(creds, row.customer_phone,
    `Payment received ✅ ${naira(amountNgn)} added to your wallet.\n\n` +
    `Balance: *${naira(balance)}*\n\n` +
    `Your next shoots come straight out of this — no card needed. ` +
    `Send *balance* any time to check it.`);
}
