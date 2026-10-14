import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase-server";
import { sendText, type WaCreds } from "@/lib/whatsapp";

/**
 * A photo from the full-quality upload page (/d/up/<token>), into a WhatsApp order.
 *
 * Does what the bot's collectPhoto does after it has downloaded a photo from
 * Meta — store it, add it to the chat's held photos, say the running count —
 * for the per-photo products (the Gear Equalizer relight, the Asset Extractor),
 * where the customer replies *done* in the chat when they have sent them all.
 * Written here rather than imported because collectPhoto lives inside the
 * webhook route file, which Next.js does not let anything import from; the
 * steps are kept identical so the two cannot behave differently.
 *
 * Only while the chat is collecting photos for a per-photo product. A fixed
 * four-selfie shoot moves on by itself at the fourth photo, inside the bot, so
 * its photos still come through the chat.
 */

const MAX_PHOTOS = 10;

type Row = {
  id: string; creator_id: string; customer_phone: string; state: string;
  template_id: string | null; selfie_count: number; user_id: string | null;
};

export type WaUploadResult =
  | { ok: true; held: number }
  | { ok: false; reason: "closed" | "full" };

/** Is this chat in a state where uploaded photos belong? */
export async function whatsappUploadOpen(sessionId: string): Promise<boolean> {
  const s = await load(sessionId);
  return !!s && s.state === "COLLECTING_PHOTOS" && await isPerImage(s.template_id) && s.selfie_count < MAX_PHOTOS;
}

export async function acceptWhatsAppUpload(
  sessionId: string,
  media: { buffer: Buffer; contentType: string },
  opts: { notify: boolean },
): Promise<WaUploadResult> {
  const session = await load(sessionId);
  if (!session || session.state !== "COLLECTING_PHOTOS" || !await isPerImage(session.template_id)) {
    return { ok: false, reason: "closed" };
  }
  if (session.selfie_count >= MAX_PHOTOS) return { ok: false, reason: "full" };

  const [c] = await sql<{ phone_number_id: string; token: string }[]>`
    SELECT whatsapp_phone_number_id AS phone_number_id, whatsapp_access_token AS token
    FROM creators WHERE id = ${session.creator_id} AND whatsapp_access_token IS NOT NULL LIMIT 1`;
  const creds: WaCreds | null = c ? { phoneNumberId: c.phone_number_id, token: c.token } : null;

  const userId = await ensureUser(session);
  const ext = media.contentType.includes("png") ? "png" : media.contentType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  await r2Upload("identity-images", path, media.buffer, media.contentType);

  await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${userId}, ${`WhatsApp upload ${session.selfie_count + 1}`}, ${media.contentType},
            ${media.buffer.byteLength}, 'identity-images', ${path}, NOW(), NOW())`;

  const [updated] = await sql<{ selfie_count: number }[]>`
    UPDATE whatsapp_sessions
    SET selfie_paths = array_append(selfie_paths, ${path}),
        selfie_count = selfie_count + 1, user_id = ${userId}, updated_at = NOW()
    WHERE id = ${session.id}
    RETURNING selfie_count`;
  const have = updated?.selfie_count ?? session.selfie_count + 1;

  if (opts.notify && creds) {
    await sendText(creds, session.customer_phone,
      `Got it — that's ${have} photo${have === 1 ? "" : "s"} in full quality ✅ ` +
      "Send another, or reply *done* when you have finished.");
  }
  return { ok: true, held: have };
}

async function load(sessionId: string): Promise<Row | null> {
  const [s] = await sql<Row[]>`
    SELECT id, creator_id, customer_phone, state, template_id, selfie_count, user_id
    FROM whatsapp_sessions WHERE id = ${sessionId} LIMIT 1`;
  return s ?? null;
}

/** Same rule as the bot's isPerImage. */
async function isPerImage(templateId: string | null): Promise<boolean> {
  if (!templateId) return false;
  const [t] = await sql<{ category: string | null }[]>`SELECT category FROM templates WHERE id = ${templateId}`;
  return t?.category === "photo_upgrade" || t?.category === "asset_extract";
}

/** Same as the bot's ensureUser: one account per phone number, created on first photo. */
async function ensureUser(session: Row): Promise<string> {
  if (session.user_id) return session.user_id;
  const phone = session.customer_phone;
  const email = `wa-${phone}@whatsapp.aluxartandframes.shop`;
  const [existing] = await sql<{ id: string }[]>`SELECT id FROM profiles WHERE email = ${email} LIMIT 1`;
  if (existing) return existing.id;

  const supa = createServiceClient();
  const { data, error } = await supa.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { source: "whatsapp", phone },
  });
  if (error || !data?.user) throw new Error(`could not create user for ${phone}: ${error?.message}`);
  await sql`
    INSERT INTO profiles (id, email, display_name, created_at, updated_at)
    VALUES (${data.user.id}, ${email}, ${`WhatsApp ${phone.slice(-4)}`}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`;
  return data.user.id;
}
