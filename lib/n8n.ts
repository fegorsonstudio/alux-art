/**
 * n8n.ts — Master Webhook Helper
 *
 * Single-Door rule: ALL photoshoot requests go through ONE n8n webhook.
 * The `type` field is read by an n8n Switch node to route to the correct branch.
 * Never create a separate webhook per photoshoot type.
 */

const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

export type PhotoshootType =
  | "headshot"
  | "fashion"
  | "product"
  | "portrait"
  | "editorial";

export interface StudioRequest {
  type: PhotoshootType;
  referenceImageUrl: string;
  sessionId: string;
  payload?: Record<string, unknown>;
}

export interface StudioResponse {
  success: boolean;
  jobId?: string;
  message?: string;
}

export async function triggerPhotoshoot(
  request: StudioRequest
): Promise<StudioResponse> {
  if (!N8N_WEBHOOK_URL) {
    throw new Error(
      "NEXT_PUBLIC_N8N_WEBHOOK_URL is not configured. Add it to .env.local."
    );
  }

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: request.type,
      referenceImageUrl: request.referenceImageUrl,
      sessionId: request.sessionId,
      payload: request.payload ?? {},
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n webhook returned ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<StudioResponse>;
}
