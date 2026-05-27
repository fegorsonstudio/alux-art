// WhatsApp booking bot — conversation state machine

import sql from "@/lib/db";
import { sendWhatsAppMessage, sendWhatsAppImage, downloadWhatsAppMedia } from "@/lib/whatsapp";
import { r2Upload, r2SignedDownloadUrl } from "@/lib/r2";

export type BotState =
  | "IDLE"
  | "CHOOSING_TEMPLATE"
  | "UPLOADING_SELFIES"
  | "SELFIES_RECEIVED"
  | "READY_TO_PAY"
  | "AWAITING_PAYMENT"
  | "GENERATING"
  | "COMPLETE";

interface Session {
  id: string;
  creator_id: string;
  customer_phone: string;
  state: BotState;
  template_id: string | null;
  shoot_id: string | null;
  selfie_count: number;
  selfie_paths: string[];
  inspiration_path: string | null;
}

interface Creator {
  id: string;
  whatsapp_phone_number_id: string;
  whatsapp_access_token: string;
}

interface Template {
  id: string;
  title: string;
  description: string | null;
  price_ngn: number;
}

async function getOrCreateSession(
  creatorId: string,
  customerPhone: string
): Promise<Session> {
  const [existing] = await sql<Session[]>`
    SELECT * FROM whatsapp_sessions
    WHERE creator_id = ${creatorId} AND customer_phone = ${customerPhone}
    LIMIT 1
  `;
  if (existing) return existing;

  const [created] = await sql<Session[]>`
    INSERT INTO whatsapp_sessions (creator_id, customer_phone, state)
    VALUES (${creatorId}, ${customerPhone}, 'IDLE')
    RETURNING *
  `;
  return created;
}

async function updateSession(
  sessionId: string,
  patch: Partial<Omit<Session, "id">>
): Promise<void> {
  const fields = Object.keys(patch) as Array<keyof typeof patch>;
  if (fields.length === 0) return;

  // Build update using tagged template — iterate known safe fields
  await sql`
    UPDATE whatsapp_sessions SET
      state = COALESCE(${patch.state ?? null}::text, state),
      template_id = COALESCE(${patch.template_id ?? null}::uuid, template_id),
      shoot_id = COALESCE(${patch.shoot_id ?? null}::uuid, shoot_id),
      selfie_count = COALESCE(${patch.selfie_count ?? null}::int, selfie_count),
      selfie_paths = COALESCE(${patch.selfie_paths ?? null}::text[], selfie_paths),
      inspiration_path = COALESCE(${patch.inspiration_path ?? null}::text, inspiration_path),
      updated_at = NOW()
    WHERE id = ${sessionId}
  `;
}

async function getPublishedTemplates(creatorId: string): Promise<Template[]> {
  return sql<Template[]>`
    SELECT id, title, description, price_ngn
    FROM templates
    WHERE creator_id = ${creatorId} AND status = 'published'
    ORDER BY purchase_count DESC
    LIMIT 10
  `;
}

function templateListMessage(templates: Template[]): string {
  if (templates.length === 0) {
    return "This creator doesn't have any styles available yet. Check back soon!";
  }
  const list = templates
    .map((t, i) => `${i + 1}. *${t.title}* — ₦${t.price_ngn.toLocaleString()}`)
    .join("\n");
  return `👋 Welcome! Here are the available styles:\n\n${list}\n\nReply with the *number* of the style you want.`;
}

export async function handleIncomingMessage(
  creatorId: string,
  creator: Creator,
  customerPhone: string,
  messageType: string,
  messageText: string | null,
  mediaId: string | null
): Promise<void> {
  const session = await getOrCreateSession(creatorId, customerPhone);
  const { state } = session;

  const reply = (msg: string) =>
    sendWhatsAppMessage(
      customerPhone,
      creator.whatsapp_phone_number_id,
      creator.whatsapp_access_token,
      msg
    );

  // ── IDLE / any message → greet + show templates ──────────────────────────
  if (state === "IDLE" || state === "CHOOSING_TEMPLATE") {
    const templates = await getPublishedTemplates(creatorId);

    if (state === "IDLE") {
      await updateSession(session.id, { state: "CHOOSING_TEMPLATE" });
    }

    // If they sent a number, try to pick that template
    if (messageType === "text" && messageText && /^\d+$/.test(messageText.trim())) {
      const idx = parseInt(messageText.trim(), 10) - 1;
      if (idx >= 0 && idx < templates.length) {
        const chosen = templates[idx];
        await updateSession(session.id, {
          state: "UPLOADING_SELFIES",
          template_id: chosen.id,
          selfie_count: 0,
          selfie_paths: [],
        });
        await reply(
          `Great choice! You selected *${chosen.title}* (₦${chosen.price_ngn.toLocaleString()}).\n\nNow send me *3 clear selfies* of your face — front-facing, good lighting, no sunglasses. Send them one at a time.`
        );
        return;
      }
    }

    // Default: show the template list
    await reply(templateListMessage(templates));
    return;
  }

  // ── UPLOADING_SELFIES → collect 3 selfies ────────────────────────────────
  if (state === "UPLOADING_SELFIES") {
    if (messageType !== "image" || !mediaId) {
      const remaining = 3 - session.selfie_count;
      await reply(`Please send a photo. I need ${remaining} more selfie${remaining !== 1 ? "s" : ""}.`);
      return;
    }

    // Download from WhatsApp and upload to R2
    try {
      const buffer = await downloadWhatsAppMedia(mediaId, creator.whatsapp_access_token);
      const storagePath = `whatsapp/${creatorId}/${customerPhone}/selfie_${session.selfie_count + 1}_${Date.now()}.jpg`;
      await r2Upload("template-images", storagePath, buffer, "image/jpeg");

      const newPaths = [...(session.selfie_paths ?? []), storagePath];
      const newCount = session.selfie_count + 1;

      if (newCount >= 3) {
        await updateSession(session.id, {
          state: "SELFIES_RECEIVED",
          selfie_count: newCount,
          selfie_paths: newPaths,
        });
        await reply(
          `✅ Got all 3 selfies! Now send me one *inspiration photo* — a style or mood reference that shows the vibe you want. This is optional but helps a lot.`
        );
      } else {
        await updateSession(session.id, {
          selfie_count: newCount,
          selfie_paths: newPaths,
        });
        await reply(`Got it (${newCount}/3). Send me ${3 - newCount} more selfie${3 - newCount !== 1 ? "s" : ""}.`);
      }
    } catch (err) {
      console.error("[whatsapp-bot] selfie upload error:", err);
      await reply("Sorry, I couldn't process that photo. Please try again.");
    }
    return;
  }

  // ── SELFIES_RECEIVED → waiting for inspiration image ─────────────────────
  if (state === "SELFIES_RECEIVED") {
    let inspirationPath: string | null = null;

    if (messageType === "image" && mediaId) {
      try {
        const buffer = await downloadWhatsAppMedia(mediaId, creator.whatsapp_access_token);
        const storagePath = `whatsapp/${creatorId}/${customerPhone}/inspiration_${Date.now()}.jpg`;
        await r2Upload("template-images", storagePath, buffer, "image/jpeg");
        inspirationPath = storagePath;
      } catch (err) {
        console.error("[whatsapp-bot] inspiration upload error:", err);
        await reply("Sorry, I had trouble receiving that photo. Proceeding without inspiration image.");
      }
    }

    // Whether or not they sent an inspiration, move to payment
    await updateSession(session.id, {
      state: "READY_TO_PAY",
      inspiration_path: inspirationPath,
    });

    // Fetch template price
    const [template] = await sql<Template[]>`
      SELECT id, title, price_ngn FROM templates WHERE id = ${session.template_id}
    `;

    if (!template) {
      await updateSession(session.id, { state: "IDLE" });
      await reply("Something went wrong with your template selection. Please start over by sending any message.");
      return;
    }

    // Create the shoot via internal WhatsApp endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aluxartandframes.shop";
    const shootRes = await fetch(`${baseUrl}/api/internal/whatsapp-shoot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({
        templateId: template.id,
        creatorId,
        customerPhone,
        mode: "fast",
        packageSize: 5,
        identityStoragePaths: session.selfie_paths,
        inspirationStoragePath: inspirationPath ?? null,
      }),
    });

    if (!shootRes.ok) {
      const errBody = await shootRes.text().catch(() => "");
      console.error("[whatsapp-bot] shoot creation failed:", shootRes.status, errBody);
      await reply("Sorry, I had trouble setting up your shoot. Please try again.");
      return;
    }

    const { shoot, paymentUrl } = await shootRes.json() as { shoot: { id: string }; paymentUrl: string };

    await updateSession(session.id, {
      state: "AWAITING_PAYMENT",
      shoot_id: shoot.id,
    });

    await reply(
      `🎉 Almost there! Pay ₦${template.price_ngn.toLocaleString()} to start your shoot:\n\n${paymentUrl}\n\nOnce payment is confirmed your portraits will start generating. I'll message you when they're ready!`
    );
    return;
  }

  // ── AWAITING_PAYMENT → remind them ───────────────────────────────────────
  if (state === "AWAITING_PAYMENT") {
    await reply(
      "Your shoot is waiting for payment. Once payment is confirmed, generation starts automatically. Reply *restart* to start over."
    );
    if (messageText?.toLowerCase().trim() === "restart") {
      await updateSession(session.id, { state: "IDLE", template_id: null, shoot_id: null, selfie_count: 0, selfie_paths: [], inspiration_path: null });
    }
    return;
  }

  // ── GENERATING → tell them to wait ───────────────────────────────────────
  if (state === "GENERATING") {
    await reply("Your portraits are being generated. This usually takes around 1 hour. I'll message you when they're done!");
    return;
  }

  // ── COMPLETE → send download link or restart ─────────────────────────────
  if (state === "COMPLETE") {
    if (session.shoot_id) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aluxartandframes.shop";
      await reply(
        `Your portraits are ready! 🎨\n\nView and download them here:\n${baseUrl}/studio?shoot=${session.shoot_id}\n\nReply *new* to book another style.`
      );
    }
    if (messageText?.toLowerCase().trim() === "new") {
      await updateSession(session.id, { state: "IDLE", template_id: null, shoot_id: null, selfie_count: 0, selfie_paths: [], inspiration_path: null });
    }
    return;
  }

  // Fallback
  await updateSession(session.id, { state: "IDLE" });
  await reply("Hi! Send any message to browse styles and book your shoot.");
}

export async function markShootGenerating(shootId: string): Promise<void> {
  await sql`
    UPDATE whatsapp_sessions SET state = 'GENERATING', updated_at = NOW()
    WHERE shoot_id = ${shootId}
  `;
}

export async function markShootComplete(
  shootId: string,
  creator: Creator,
  baseUrl: string
): Promise<void> {
  const [session] = await sql<Session[]>`
    SELECT * FROM whatsapp_sessions WHERE shoot_id = ${shootId} LIMIT 1
  `;
  if (!session) return;

  await sql`
    UPDATE whatsapp_sessions SET state = 'COMPLETE', updated_at = NOW()
    WHERE id = ${session.id}
  `;

  // Fetch the completed image storage paths
  const images = await sql`
    SELECT preview_storage_bucket, preview_storage_path FROM shoot_images
    WHERE shoot_id = ${shootId} AND status = 'COMPLETE' AND preview_storage_path IS NOT NULL
    ORDER BY slot ASC
    LIMIT 10
  `;

  await sendWhatsAppMessage(
    session.customer_phone,
    creator.whatsapp_phone_number_id,
    creator.whatsapp_access_token,
    `✅ Your portraits are ready! Sending ${images.length} image${images.length !== 1 ? "s" : ""} now:`
  );

  // Send each image via WhatsApp using short-lived R2 signed URLs
  // (WhatsApp downloads the image immediately; 2-hour TTL is more than enough)
  for (const img of images) {
    const bucket = (img.preview_storage_bucket as string) ?? "generated-4k";
    const path = img.preview_storage_path as string;
    try {
      const signedUrl = await r2SignedDownloadUrl(bucket, path, 7200);
      await sendWhatsAppImage(
        session.customer_phone,
        creator.whatsapp_phone_number_id,
        creator.whatsapp_access_token,
        signedUrl,
      );
    } catch (err) {
      console.error("[markShootComplete] image send error:", err);
    }
  }
}
