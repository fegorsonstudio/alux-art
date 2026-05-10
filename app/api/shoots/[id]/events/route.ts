import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
      // Send initial snapshot
      const { data: fullShoot } = await service
        .from("shoots")
        .select("*, shoot_images(*)")
        .eq("id", id)
        .single();

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "snapshot", shoot: fullShoot })}\n\n`));

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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: event.type, ...event.payload })}\n\n`));
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
            controller.close();
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
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
