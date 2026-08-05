import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { matchKeyword } from "@/lib/instagram-keywords";

/**
 * Instagram comment webhook — the "comment STUDIO and I'll send you the link" bot.
 *
 * GET  is Meta's one-time verification handshake when the webhook is saved.
 * POST is a comment event. If the comment contains a keyword, the commenter gets
 *      one private reply carrying the link.
 *
 * Instagram allows exactly ONE private reply per comment, within 7 days, and the
 * conversation only continues if they answer. So the reply has to be complete on
 * its own — there is no follow-up.
 *
 * Two things this deliberately does NOT do:
 *   - reply to our own accounts' comments, which would have the bot talking to
 *     itself every time the studio answers someone
 *   - retry a failed send, because a retry risks a duplicate DM and Instagram
 *     counts a duplicate against the per-hour limit
 */

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.instagram.com/v23.0";

/** Handles come from IG_ACCOUNTS so the bot never answers itself. */
function ourHandles(): Set<string> {
  return new Set(
    (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  );
}

function tokenForAccountId(igUserId: string): string | null {
  for (const handle of (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const key = handle.toUpperCase();
    if (process.env[`IG_${key}_ID`] === igUserId) return process.env[`IG_${key}_TOKEN`] ?? null;
  }
  return null;
}

// ── Meta's verification handshake ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const verify = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (!verify) {
    console.error("[ig webhook] IG_WEBHOOK_VERIFY_TOKEN not set — cannot verify");
    return new NextResponse("misconfigured", { status: 500 });
  }
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verify) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Comment events ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Signature check. Without the app secret we refuse everything rather than
  // trust an unsigned payload — anyone could otherwise make the bot send DMs.
  const secret = process.env.IG_APP_SECRET;
  if (!secret) {
    console.error("[ig webhook] IG_APP_SECRET not set — rejecting");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const sent = request.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const ok = sent.length === expected.length &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    console.warn("[ig webhook] bad signature — ignoring");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: {
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Record<string, unknown> }> }>;
  };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const mine = ourHandles();

  for (const entry of body.entry ?? []) {
    const igUserId = String(entry.id ?? "");
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      const commentId = String(v.id ?? "");
      const text = String(v.text ?? "");
      const from = (v.from ?? {}) as { id?: string; username?: string };

      if (!commentId || !text) continue;
      // Never answer ourselves.
      if (from.username && mine.has(from.username.toLowerCase())) continue;

      const keyword = matchKeyword(text);
      if (!keyword) continue;

      const token = tokenForAccountId(igUserId);
      if (!token) { console.warn("[ig webhook] no token for account", igUserId); continue; }

      try {
        // The private reply: one message, addressed to the comment.
        const r = await fetch(`${GRAPH}/${igUserId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: keyword.reply },
            access_token: token,
          }),
        }).then(x => x.json());

        if (r.error) {
          console.error("[ig webhook] private reply failed:", r.error.message?.slice(0, 160));
        } else {
          console.log(`[ig webhook] sent "${keyword.word}" to @${from.username ?? from.id}`);
          // A public acknowledgement so other readers see it worked. Best effort:
          // the DM is the product, this is decoration.
          if (keyword.publicReply) {
            await fetch(`${GRAPH}/${commentId}/replies`, {
              method: "POST",
              body: new URLSearchParams({ message: keyword.publicReply, access_token: token }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error("[ig webhook] send error:", e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Always 200. Meta retries non-200 responses, and a retry here means a second
  // DM to someone who already got one.
  return NextResponse.json({ ok: true });
}
