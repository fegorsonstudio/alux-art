import sql from "@/lib/db";

/**
 * Tell a creator, by email, that somebody bought their template.
 *
 * Creators had no idea they had sold anything until they happened to open the
 * dashboard. For a resold lighting template that is worse than it sounds: the
 * whole offer is "earn without doing any work", so the sale is the ONLY moment
 * the product ever speaks to them.
 *
 * Reuses the Resend setup already in app/api/support/contact/route.ts — same
 * key, same from-address convention. No new dependency.
 *
 * NEVER throws. This is called from the payment-confirmation path, and a
 * bounced email must not be able to fail a booking that the buyer has already
 * paid for. Every failure is logged and swallowed.
 */

export interface CreatorSaleEmailInput {
  creatorId: string;
  templateId: string;
  templateTitle: string;
  /** What the buyer paid, in naira. */
  amountNgn: number;
  /** What the creator keeps, in naira. */
  payoutNgn: number;
  imageCount: number;
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const naira = (n: number) => "₦" + Math.round(Number(n) || 0).toLocaleString();

/**
 * Notify the creator behind a completed purchase.
 *
 * Everything is looked up from the purchase row, so the caller only needs the
 * id it already has. Silent no-op when there is nothing to tell them about:
 *
 *   - a template with no creator (the studio's own products);
 *   - a free booking or a zero payout, where "you earned ₦0" is worse than
 *     saying nothing at all.
 */
export async function notifyCreatorOfSale(purchaseId: string): Promise<void> {
  try {
    const [p] = await sql<{
      creator_id: string | null; template_id: string; title: string | null;
      amount_ngn: number | null; creator_payout_ngn: number | null;
      package_size: number | null; is_free: boolean | null;
    }[]>`
      SELECT t.creator_id, tp.template_id, t.title,
             tp.amount_ngn, tp.creator_payout_ngn,
             s.package_size, tp.is_free
      FROM template_purchases tp
      JOIN templates t ON t.id = tp.template_id
      LEFT JOIN shoots s ON s.id = tp.shoot_id
      WHERE tp.id = ${purchaseId}`;

    if (!p?.creator_id) return;
    if (p.is_free) return;
    const payout = Number(p.creator_payout_ngn) || 0;
    if (payout <= 0) return;

    await sendCreatorSaleEmail({
      creatorId: p.creator_id,
      templateId: p.template_id,
      templateTitle: p.title ?? "your template",
      amountNgn: Number(p.amount_ngn) || 0,
      payoutNgn: payout,
      imageCount: Number(p.package_size) || 1,
    });
  } catch (e) {
    console.error("[creator-sale-email] lookup failed:", e instanceof Error ? e.message : String(e));
  }
}

export async function sendCreatorSaleEmail(input: CreatorSaleEmailInput): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error("[creator-sale-email] no RESEND_API_KEY — creator not notified");
      return;
    }

    // The creator's email lives on their profile, not on the creators row.
    const [row] = await sql<{ email: string | null; display_name: string | null }[]>`
      SELECT p.email, c.display_name
      FROM creators c JOIN profiles p ON p.id = c.user_id
      WHERE c.id = ${input.creatorId}`;
    if (!row?.email) {
      console.error(`[creator-sale-email] no email for creator ${input.creatorId}`);
      return;
    }

    const from = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";
    const firstName = (row.display_name || "there").split(" ")[0];
    const images = input.imageCount === 1 ? "1 image" : `${input.imageCount} images`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Alux Art <${from}>`,
        to: [row.email],
        subject: `You just earned ${naira(input.payoutNgn)}`,
        html: `
          <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#10231b">
            <p style="font-size:15px">Hi ${esc(firstName)},</p>
            <p style="font-size:15px">Someone just booked <strong>${esc(input.templateTitle)}</strong>.</p>
            <table style="border-collapse:collapse;margin:18px 0;font-size:15px">
              <tr><td style="padding:6px 18px 6px 0;color:#6d7f78">They paid</td>
                  <td style="padding:6px 0"><strong>${naira(input.amountNgn)}</strong> for ${images}</td></tr>
              <tr><td style="padding:6px 18px 6px 0;color:#6d7f78">You earned</td>
                  <td style="padding:6px 0;color:#1f8f77"><strong>${naira(input.payoutNgn)}</strong></td></tr>
            </table>
            <p style="font-size:15px">Your share is paid straight to your bank account through Paystack —
            you do not need to do anything.</p>
            <p style="font-size:15px">
              <a href="https://aluxartandframes.shop/creator-dashboard"
                 style="color:#1f8f77">See it in your dashboard</a>
            </p>
            <p style="font-size:13px;color:#6d7f78;margin-top:26px">
              Alux Art · aluxartandframes.shop
            </p>
          </div>`,
      }),
    });

    if (!res.ok) {
      console.error(`[creator-sale-email] resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    console.log(`[creator-sale-email] notified creator ${input.creatorId} of ${naira(input.payoutNgn)}`);
  } catch (e) {
    // Swallowed on purpose — see the note at the top of this file.
    console.error("[creator-sale-email] failed:", e instanceof Error ? e.message : String(e));
  }
}
