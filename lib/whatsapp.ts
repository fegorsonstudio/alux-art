// WhatsApp Business Cloud API helpers

export interface WhatsAppTextMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string; preview_url?: boolean };
}

export interface WhatsAppImageMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "image";
  image: { link: string; caption?: string };
}

async function sendMessage(
  phoneNumberId: string,
  accessToken: string,
  body: WhatsAppTextMessage | WhatsAppImageMessage
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    console.error("[whatsapp] sendMessage failed:", res.status, err);
  }
}

export async function sendWhatsAppMessage(
  to: string,
  phoneNumberId: string,
  accessToken: string,
  message: string
): Promise<void> {
  await sendMessage(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: message },
  });
}

export async function sendWhatsAppImage(
  to: string,
  phoneNumberId: string,
  accessToken: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  await sendMessage(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, caption },
  });
}

export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<Buffer> {
  // Step 1: get the download URL from Graph API
  const urlRes = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!urlRes.ok) throw new Error(`Media URL fetch failed: ${urlRes.status}`);
  const { url } = await urlRes.json() as { url: string };

  // Step 2: download the actual media bytes
  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);

  const arrayBuffer = await mediaRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
