import sql from "@/lib/db";

/**
 * Tell a buyer their retouched images are ready.
 *
 * Retouching is done by hand, hours or days after the shoot finished, so the
 * buyer is not sitting on the page waiting. Without this email the work lands
 * in a gallery nobody is looking at.
 *
 * Reuses the Resend setup from app/api/support/contact/route.ts — same key,
 * same from-address. No new dependency.
 *
 * NEVER throws. It is called at the end of an upload that has already put the
 * files in R2 and the rows in the database; a bounced email must not make that
 * work look failed and tempt anyone into running the upload twice.
 */

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const naira = (n: number) => "₦" + Math.round(Number(n) || 0).toLocaleString();

export interface RetouchReadyEmailInput {
  shootId: string;
  /** How many retouched files were delivered. */
  imageCount: number;
  /** What they owe. Zero when the retouch is comped. */
  priceNgn: number;
  /** Comped work: the mail says "download them now" instead of asking for money. */
  free: boolean;
}

export async function notifyRetouchReady(input: RetouchReadyEmailInput): Promise<boolean> {
  try {
    const [shoot] = await sql<{ owner_email: string | null }[]>`
      SELECT owner_email FROM shoots WHERE id = ${input.shootId}`;
    const to = shoot?.owner_email;
    if (!to) {
      console.error("[retouch-email] no owner_email on shoot", input.shootId);
      return false;
    }

    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";
    if (!key) {
      console.error("[retouch-email] No RESEND_API_KEY configured — nothing sent.");
      return false;
    }

    const firstName = to.split("@")[0].replace(/[._\d]+/g, " ").trim().split(" ")[0] || "there";
    const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    const count = input.imageCount === 1 ? "1 retouched image" : `${input.imageCount} retouched images`;
    const url = "https://aluxartandframes.shop/studio";

    const payLine = input.free
      ? `<p style="font-size:15px">These are on us — nothing to pay. Open your studio and download them.</p>`
      : `<p style="font-size:15px">They are ready to download once the retouch is paid for:
           <strong>${naira(input.priceNgn)}</strong> for ${count.replace(" retouched", "")}.</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Alux Art <${from}>`,
        to: [to],
        // A text/plain alternative. An HTML-only message scores worse with spam
        // filters, and this one had already landed in a buyer's spam folder.
        text:
          `Hi ${name},\n\n`
          + `Your ${count} ${input.imageCount === 1 ? "is" : "are"} finished and waiting in your studio, `
          + `in a new Retouched gallery inside the same shoot.\n\n`
          + (input.free
              ? "These are on us - nothing to pay. Open your studio and download them.\n\n"
              : `They are ready to download once the retouch is paid for.\n\n`)
          + `${url}\n\n`
          + "Retouching is done by hand on the images you generated - skin, stray hairs, "
          + "and the small things a model notices. Your original files are untouched.\n",
        subject: input.free
          ? `Your retouched images are ready`
          : `Your retouched images are ready to download`,
        html: `
          <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#10231b">
            <p style="font-size:15px">Hi ${esc(name)},</p>
            <p style="font-size:15px">Your ${esc(count)} ${input.imageCount === 1 ? "is" : "are"} finished
            and waiting in your studio, in a new <strong>Retouched</strong> gallery inside the same shoot.</p>
            ${payLine}
            <p style="margin:22px 0">
              <a href="${url}" style="background:#1f8f77;color:#fff;text-decoration:none;
                 padding:11px 20px;border-radius:8px;font-size:15px;display:inline-block">Open my studio</a>
            </p>
            <!--
              The address in plain text as well as on the button.
              A buyer opened this on her phone, the button took her into Gmail's
              in-app browser, and Google refuses OAuth sign-in inside an embedded
              webview (disallowed_useragent) — so the button "did not work" and
              she never reached her images. The link cannot force an external
              browser, but a visible address can be copied into one.
            -->
            <p style="font-size:13px;color:#6d7f78;margin:0 0 18px">
              Button not working? Some email apps block sign-in. Copy this into your
              browser instead:<br>
              <span style="color:#10231b">${url}</span>
            </p>
            <p style="font-size:13px;color:#6d7f78">Retouching is done by hand on the images you generated —
            skin, stray hairs, and the small things a model notices. Your original files are untouched and
            still in the same shoot.</p>
          </div>`,
      }),
    });

    if (!res.ok) {
      console.error("[retouch-email] resend rejected:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    console.log(`[retouch-email] sent to ${to} for shoot ${input.shootId}`);
    return true;
  } catch (e) {
    console.error("[retouch-email] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
