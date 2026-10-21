import "server-only";
import { SITE_URL } from "@/lib/site-url";

/**
 * Emails to a cast member when there is something for them to do or see. Same
 * Resend setup as lib/retouch-ready-email.ts. Never throws: a bounced email
 * must not undo the work that has already been done.
 */

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function emailCastMember(input: {
  to: string | null; castId: string; displayName: string; roleName: string; storyTitle: string;
  kind: "photos_needed" | "sheet_ready";
}): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";
    if (!key || !input.to) return false;
    const url = `${SITE_URL.replace(/\/$/, "")}/d/drama/cast/${input.castId}`;
    const first = input.displayName.split(/\s+/)[0] || "there";
    const subject = input.kind === "sheet_ready"
      ? `You as ${input.roleName} — your character is ready`
      : `One of your photos needs changing — ${input.storyTitle}`;
    const body = input.kind === "sheet_ready"
      ? `<p style="font-size:15px">Your character is ready: you, as <strong>${esc(input.roleName)}</strong> in <em>${esc(input.storyTitle)}</em>.</p>
         <p style="font-size:15px">Have a look, and tell us if it is you — you can ask for it to be made again once.</p>`
      : `<p style="font-size:15px">One of the photos you sent for <strong>${esc(input.roleName)}</strong> can't be used — we say which one and why on your page.</p>
         <p style="font-size:15px">Send a new one and we make your character straight away. Your role stays yours.</p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Alux Micro Drama <${from}>`, to: [input.to], subject,
        html: `<div style="font-family:Arial,sans-serif;color:#13201f;max-width:520px">
          <p style="font-size:15px">Hi ${esc(first)},</p>${body}
          <p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open your character</a></p>
          <p style="font-size:12px;color:#5b6b69">Alux Micro Drama · aluxartandframes.shop</p></div>`,
      }),
    });
    if (!res.ok) console.warn("[drama email]", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.warn("[drama email] failed:", (e as Error).message);
    return false;
  }
}

/** To a brand once its spot is paid: what happens next, and its private report page. */
export async function emailBrand(input: { to: string | null; brand: string; storyTitle: string; episode: number; word: string; reportUrl: string }): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";
    if (!key || !input.to) return false;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Alux Micro Drama <${from}>`, to: [input.to],
        subject: `${input.brand} is in ${input.storyTitle}, Episode ${input.episode}`,
        html: `<div style="font-family:Arial,sans-serif;color:#13201f;max-width:520px">
          <p style="font-size:15px">Thank you — <strong>${esc(input.brand)}</strong> has a place in <em>${esc(input.storyTitle)}</em>, Episode ${input.episode}.</p>
          <p style="font-size:15px">When the episode posts, the caption credits you as partner and invites viewers to comment <strong>${esc(input.word)}</strong>. Everyone who does gets a button to your product page.</p>
          <p style="font-size:15px">Your report shows how many people asked and how many tapped through:</p>
          <p><a href="${input.reportUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open your report</a></p>
          <p style="font-size:12px;color:#5b6b69">Keep this link private. Alux Micro Drama · aluxartandframes.shop</p></div>`,
      }),
    });
    if (!res.ok) console.warn("[drama email] brand", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.warn("[drama email] brand failed:", (e as Error).message);
    return false;
  }
}
