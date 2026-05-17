import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

async function withSignedPreviewUrls(
  service: ReturnType<typeof createServiceClient>,
  shoot: Record<string, unknown> | null
) {
  if (!shoot) return shoot;
  const images = await Promise.all(((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map(async (img) => {
    if (img.status === "COMPLETE" && img.preview_storage_bucket && img.preview_storage_path) {
      const { data } = await service.storage
        .from(img.preview_storage_bucket as string)
        .createSignedUrl(img.preview_storage_path as string, 3600);
      return { ...img, previewUrl: data?.signedUrl };
    }
    return img;
  }));
  return { ...shoot, shoot_images: images };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const service = createServiceClient();
  const { data: shoot } = await service.from("shoots").select("user_id").eq("id", id).single();
  if (!shoot || (shoot.user_id !== user.id && user.email !== process.env.ADMIN_EMAIL)) {
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
      const { data: fullShoot } = await service
        .from("shoots")
        .select("*, shoot_images(*)")
        .eq("id", id)
        .single();

      const hydratedShoot = await withSignedPreviewUrls(service, fullShoot);
      enqueue({ type: "snapshot", shoot: hydratedShoot });

      // If shoot is already in BASE_REVIEW, replay the last base_review_required event
      // so the frontend gets the base_url even when connecting after the live event fired
      if (fullShoot?.status === "BASE_REVIEW") {
        const { data: reviewEvent } = await service
          .from("generation_events")
          .select("*")
          .eq("shoot_id", id)
          .eq("type", "base_review_required")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reviewEvent) {
          enqueue({ type: reviewEvent.type, ...(reviewEvent.payload as Record<string, unknown>) });
        }
      }

      const { data: latestEvent } = await service
        .from("generation_events")
        .select("created_at")
        .eq("shoot_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestEvent?.created_at) lastEventCreatedAt = latestEvent.created_at;

      // Poll for new events every 2 seconds
      const interval = setInterval(async () => {
        try {
          const { data: events } = await service
            .from("generation_events")
            .select("*")
            .eq("shoot_id", id)
            .gt("created_at", lastEventCreatedAt)
            .order("created_at", { ascending: true });

          for (const event of events ?? []) {
            enqueue({ type: event.type, ...event.payload });
            lastEventCreatedAt = event.created_at;
          }

          // Stop if shoot is complete or failed
          const { data: current } = await service
            .from("shoots")
            .select("status")
            .eq("id", id)
            .single();

          if (current?.status === "COMPLETE" || current?.status === "FAILED") {
            clearInterval(interval);
            close();
          }
        } catch {
          clearInterval(interval);
          close();
        }
      }, 2000);

      // Clean up on client disconnect
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
