import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  const shootId = String(body.shootId ?? "").trim();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message too long (max 2000 characters)." }, { status: 400 });
  }

  // Send email via Resend if API key is configured
  const resendKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.ADMIN_EMAIL ?? "fegorsonphotography@gmail.com";
  const fromDomain = process.env.RESEND_FROM_EMAIL ?? "support@aluxartandframes.shop";

  if (resendKey) {
    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Alux Art Support <${fromDomain}>`,
          to: [toEmail],
          reply_to: email,
          subject: subject ? `[Support] ${subject}` : `[Support] Message from ${name}`,
          html: `
            <p><strong>From:</strong> ${name} (${email})</p>
            ${shootId ? `<p><strong>Shoot ID:</strong> ${shootId}</p>` : ""}
            <p><strong>Subject:</strong> ${subject || "(none)"}</p>
            <hr/>
            <p style="white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          `,
        }),
      });
      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error("[support/contact] Resend error:", errBody);
      }
    } catch (err) {
      console.error("[support/contact] Email send failed:", err);
    }
  } else {
    console.log("[support/contact] No RESEND_API_KEY — email not sent. Message:", { name, email, subject, shootId, message });
  }

  return NextResponse.json({ ok: true });
}
