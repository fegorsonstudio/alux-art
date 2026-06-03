import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [gift] = await sql`
    SELECT g.id, g.sender_name, g.custom_message, g.package_size,
           g.payment_status, g.is_claimed, g.expires_at,
           t.id AS template_id, t.title AS template_title,
           t.description AS template_description,
           t.category, t.shoot_mode, t.aspect_ratio
    FROM gift_links g
    JOIN templates t ON t.id = g.template_id
    WHERE g.id = ${token}
  `;

  if (!gift) return NextResponse.json({ error: "Gift not found" }, { status: 404 });

  if (gift.payment_status !== "paid") {
    return NextResponse.json({
      gift: { id: gift.id, payment_status: gift.payment_status, is_claimed: gift.is_claimed },
    });
  }

  const images = await sql`
    SELECT id, url, purpose, tag, storage_path, storage_bucket
    FROM template_images
    WHERE template_id = ${gift.template_id}
      AND purpose IN ('showcase', 'sample', 'gallery')
    ORDER BY display_order ASC
    LIMIT 12
  `;

  return NextResponse.json({
    gift: {
      id: gift.id,
      senderName: gift.sender_name as string,
      customMessage: gift.custom_message as string | null,
      packageSize: gift.package_size as number,
      paymentStatus: gift.payment_status as string,
      isClaimed: gift.is_claimed as boolean,
      expiresAt: gift.expires_at as string,
      template: {
        id: gift.template_id as string,
        title: gift.template_title as string,
        description: gift.template_description as string | null,
        category: gift.category as string,
        shootMode: gift.shoot_mode as string,
        aspectRatio: gift.aspect_ratio as string,
      },
      images: (images as unknown as { url: string | null; purpose: string }[]).map(img => ({
        url: img.url,
        purpose: img.purpose,
      })),
    },
  });
}
