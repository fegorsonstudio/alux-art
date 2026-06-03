import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl } from "@/lib/r2";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

async function withSignedPreviewUrls(shoot: Record<string, unknown> | null) {
  if (!shoot) return shoot;
  const images = await Promise.all(
    ((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map(async (img) => {
      const { fal_url: _fal_url, ...safeImg } = img as Record<string, unknown>;
      if (safeImg.status === "COMPLETE") {
        if (safeImg.preview_storage_bucket && safeImg.preview_storage_path) {
          const previewUrl = await r2SignedDownloadUrl(
            safeImg.preview_storage_bucket as string,
            safeImg.preview_storage_path as string,
            3600
          ).catch(() => null);
          return { ...safeImg, previewUrl };
        }
      }
      return safeImg;
    })
  );
  return { ...shoot, shoot_images: images };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [shootOwner] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  if (!shootOwner || (shootOwner.user_id !== user.id && !isAdminEmail(user.email))) {
    return new Response("Not found", { status: 404 });
  }

  let lastEventCreatedAt = "1970-01-01T00:00:00.000Z";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const enqueue = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Send initial snapshot
      const [shootRow] = await sql`SELECT * FROM shoots WHERE id = ${id}`;
      if (shootRow) {
        const shoot_images = await sql`SELECT * FROM shoot_images WHERE shoot_id = ${id} ORDER BY slot`;
        const fullShoot = { ...shootRow, shoot_images };
        const hydratedShoot = await withSignedPreviewUrls(fullShoot);
        enqueue({ type: "snapshot", shoot: hydratedShoot });
      }

      // If shoot is in BASE_REVIEW, replay the last base_review_required event
      if (shootRow?.status === "BASE_REVIEW") {
        const [reviewEvent] = await sql`
          SELECT type, payload FROM generation_events
          WHERE shoot_id = ${id} AND type = 'base_review_required'
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (reviewEvent) {
          enqueue({ type: reviewEvent.type, ...(reviewEvent.payload as Record<string, unknown>) });
        }
      }

      const [latestEvent] = await sql`
        SELECT created_at FROM generation_events
        WHERE shoot_id = ${id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (latestEvent?.created_at) lastEventCreatedAt = latestEvent.created_at;

      // Poll for new events every 2 seconds
      const interval = setInterval(async () => {
        try {
          const events = await sql`
            SELECT type, payload, created_at FROM generation_events
            WHERE shoot_id = ${id} AND created_at > ${lastEventCreatedAt}
            ORDER BY created_at ASC
          `;

          for (const event of events) {
            enqueue({ type: event.type, ...event.payload });
            lastEventCreatedAt = event.created_at;
          }

          const [current] = await sql`SELECT status FROM shoots WHERE id = ${id}`;
          if (current?.status === "COMPLETE" || current?.status === "FAILED") {
            clearInterval(interval);
            close();
          }
        } catch {
          clearInterval(interval);
          close();
        }
      }, 2000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
