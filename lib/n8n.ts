/**
 * n8n.ts — Post-generation notification helper
 *
 * Strategy B: Vercel does all generation. n8n receives a "shoot_complete"
 * webhook and handles email delivery and any downstream logging.
 */

export async function notifyShootComplete(shootId: string): Promise<void> {
  const url =
    process.env.N8N_WEBHOOK_URL ?? process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
  if (!url) return;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.INTERNAL_API_SECRET
        ? { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` }
        : {}),
    },
    body: JSON.stringify({
      type: "shoot_complete",
      shoot_id: shootId,
    }),
  });
}
