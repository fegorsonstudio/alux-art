import "server-only";
import sql from "@/lib/db";

/**
 * What a shoot is actually doing, in one place.
 *
 * Written once and read by two callers that must never disagree: the `support`
 * reply a customer sees in the chat, and the alert the studio sees on Telegram.
 * If those two ever described the same shoot differently, whoever answered the
 * customer would be working from a different set of facts than the customer.
 */

export type ShootFacts = {
  shootId: string | null;
  status: string | null;
  packageSize: number | null;
  imagesDone: number;
  imagesTotal: number;
  paid: boolean;
  paymentRef: string | null;
  /** Finished, but the chat was never told. The failure this whole file exists for. */
  undelivered: boolean;
  deliveredAt: Date | null;
  createdAt: Date | null;
  templateTitle: string | null;
  /** Hours since the customer last wrote. Past 24 WhatsApp refuses free-form replies. */
  hoursSinceInbound: number | null;
};

export async function shootFacts(shootId: string | null): Promise<ShootFacts | null> {
  if (!shootId) return null;
  const [row] = await sql<{
    id: string; status: string; package_size: number | null;
    wa_delivered_at: Date | null; created_at: Date;
    title: string | null; done: number; total: number;
    paid_ref: string | null;
  }[]>`
    SELECT sh.id, sh.status, sh.package_size, sh.wa_delivered_at, sh.created_at,
           t.title,
           (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = sh.id AND i.status = 'COMPLETE') AS done,
           (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = sh.id) AS total,
           -- Two tables, two products. A marketplace booking — which is every
           -- WhatsApp shoot — records its money in template_purchases, because
           -- that is the only table carrying the creator payout split. Only
           -- direct studio shoots, showcases and retouches land in payments.
           -- Reading just one of them reports a paying customer as unpaid.
           COALESCE(
             (SELECT tp.paystack_reference FROM template_purchases tp
               WHERE tp.shoot_id = sh.id AND tp.status = 'success'
               ORDER BY tp.created_at DESC LIMIT 1),
             (SELECT p.provider_reference FROM payments p
               WHERE p.shoot_id = sh.id AND p.status = 'success'
               ORDER BY p.created_at DESC LIMIT 1)
           ) AS paid_ref
    FROM shoots sh
    LEFT JOIN templates t ON t.id = sh.template_id
    WHERE sh.id = ${shootId}`.catch(() => []);
  if (!row) return null;

  // PENDING_PAYMENT is the one status that means money never arrived. Every
  // other status is downstream of a payment or an admin comp.
  const paid = Boolean(row.paid_ref) || row.status !== "PENDING_PAYMENT";

  return {
    shootId: row.id,
    status: row.status,
    packageSize: row.package_size,
    imagesDone: Number(row.done),
    imagesTotal: Number(row.total),
    paid,
    paymentRef: row.paid_ref,
    undelivered: row.status === "COMPLETE" && !row.wa_delivered_at,
    deliveredAt: row.wa_delivered_at,
    createdAt: row.created_at,
    templateTitle: row.title,
    hoursSinceInbound: null,
  };
}

/** Plain-English status for the customer. Never mentions internals. */
export function customerStatusLine(f: ShootFacts | null): string {
  if (!f) return "I don't have a shoot for you yet.";
  switch (f.status) {
    case "PENDING_PAYMENT":
      return "Your photos are ready to go, but the payment hasn't reached us yet.";
    case "QUEUED":
    case "BASE_LOCKING":
      return "Payment received ✅ Your photos are in the queue and starting now.";
    case "PROCESSING":
      return `Payment received ✅ I'm making them now — ${f.imagesDone} of ${f.imagesTotal || f.packageSize || 1} done.`;
    case "COMPLETE":
      return f.undelivered
        ? "Good news — your photos are finished. Sending them now."
        : "Your photos are finished and were sent to this chat.";
    case "FAILED":
      return "I'm sorry — your shoot didn't come out. You have not lost your money.";
    default:
      return "Your shoot is in progress.";
  }
}

/** The studio's view: everything needed to act, without opening a dashboard. */
export function adminStatusBlock(phone: string, sessionState: string | null, f: ShootFacts | null): string {
  if (!f) {
    return `Customer: <code>+${phone}</code>\nChat state: ${sessionState ?? "IDLE"}\nNo shoot booked yet.`;
  }
  const money = f.paid
    ? `Paid ✅${f.paymentRef ? ` (<code>${f.paymentRef}</code>)` : ""}`
    : "NOT PAID ❌";
  const flag = f.undelivered ? "\n⚠ <b>Finished but never delivered to the chat.</b>" : "";
  return (
    `Customer: <code>+${phone}</code>\n` +
    `Chat state: ${sessionState ?? "IDLE"}\n` +
    `Shoot: <code>${f.shootId}</code>\n` +
    `Style: ${f.templateTitle ?? "studio shoot"}\n` +
    `Status: ${f.status} — ${f.imagesDone}/${f.imagesTotal || f.packageSize || 1} images\n` +
    `${money}${flag}`
  );
}
