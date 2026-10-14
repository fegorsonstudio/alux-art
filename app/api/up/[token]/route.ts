import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import sql from "@/lib/db";
import { resolveUploadToken, claimUploadSlot, UPLOAD_MAX_BYTES } from "@/lib/chat-upload-links";
import { acceptInstagramPhoto, credsForAccount, type IgSession } from "@/lib/instagram-bot";
import { acceptWhatsAppUpload } from "@/lib/whatsapp-upload";

/**
 * Receives one photo from the full-quality upload page (/d/up/<token>) and hands
 * it to the chat bot the link belongs to, as if it had been sent in the chat.
 *
 * The body is the file itself. `x-last: 1` marks the final file of a batch so
 * the bot says the running count once instead of once per file. The token is
 * the only authorisation; it names one conversation and expires after 48 hours.
 *
 * Errors come back as a short code the page translates:
 *   expired · tooBig · notImage · closed · full · limit · failed
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
const TYPE: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveUploadToken(token);
  if (!link) return fail("expired", 404);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > UPLOAD_MAX_BYTES) return fail("tooBig", 413);

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await req.arrayBuffer());
  } catch {
    return fail("failed", 400);
  }
  if (buffer.byteLength === 0) return fail("notImage", 415);
  if (buffer.byteLength > UPLOAD_MAX_BYTES) return fail("tooBig", 413);

  // A real photograph, read by the same library that will process it.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: 120_000_000 }).metadata();
  } catch {
    return fail("notImage", 415);
  }
  if (!meta.format || !FORMATS.has(meta.format) || !meta.width || !meta.height) return fail("notImage", 415);

  // The original bytes are kept as they are (the 30 MB rule: never shrink an
  // upload). HEIC from iPhones is turned into a full-resolution JPEG at quality
  // 95 where it can be — but this server's sharp build reads a HEIC's header and
  // cannot decode its pixels (checked 14 Oct 2026: "bad seek"). Then the
  // original is kept as it is, exactly as the WhatsApp bot already keeps a HEIC
  // sent as a document, rather than refusing a photo the customer can see.
  // The page asks for image/* so iPhones normally send a JPEG anyway.
  let contentType = TYPE[meta.format] ?? "image/jpeg";
  if (meta.format === "heif") {
    try {
      buffer = await sharp(buffer, { limitInputPixels: 120_000_000 }).rotate().jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
      contentType = "image/jpeg";
    } catch {
      contentType = "image/heic";
    }
  }

  if (!await claimUploadSlot(token)) return fail("limit", 429);
  const last = req.headers.get("x-last") === "1";

  try {
    if (link.channel === "instagram") {
      const [session] = await sql<IgSession[]>`SELECT * FROM instagram_sessions WHERE id = ${link.sessionId} LIMIT 1`;
      if (!session) return fail("closed", 409);
      const creds = credsForAccount(session.ig_account_id);
      if (!creds) return fail("failed", 500);
      const { held } = await acceptInstagramPhoto(creds, session, { buffer, contentType }, { notify: last, viaUpload: true });
      return NextResponse.json({ ok: true, held });
    }

    const r = await acceptWhatsAppUpload(link.sessionId, { buffer, contentType }, { notify: last });
    if (!r.ok) return fail(r.reason, 409);
    return NextResponse.json({ ok: true, held: r.held });
  } catch (e) {
    console.error("[upload page] could not accept photo:", e instanceof Error ? e.message : e);
    return fail("failed", 500);
  }
}
