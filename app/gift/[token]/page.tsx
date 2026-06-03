import Link from "next/link";
import sql from "@/lib/db";
import GiftUnboxClient from "./GiftUnboxClient";

interface GiftData {
  id: string;
  senderName: string;
  customMessage: string | null;
  packageSize: number;
  isClaimed: boolean;
  expiresAt: string;
  template: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    shootMode: string;
    aspectRatio: string;
  };
  images: { url: string | null; purpose: string }[];
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d0826 0%, #030712 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "40px 32px",
        maxWidth: 400,
        textAlign: "center",
      }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.95rem", margin: "0 0 16px" }}>{message}</p>
        <Link href="/marketplace" style={{ color: "rgba(196,181,253,0.7)", fontSize: "0.85rem", textDecoration: "none" }}>
          Browse styles →
        </Link>
      </div>
    </div>
  );
}

export default async function GiftPage({ params }: { params: Promise<{ token: string }> }) {
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

  if (!gift) return <ErrorPage message="Gift not found." />;

  if (gift.payment_status !== "paid") {
    return <ErrorPage message="This gift link isn't active yet — payment may still be processing." />;
  }

  const images = await sql`
    SELECT url, purpose
    FROM template_images
    WHERE template_id = ${gift.template_id}
      AND purpose IN ('showcase', 'sample', 'gallery')
    ORDER BY display_order ASC
    LIMIT 12
  `;

  const giftData: GiftData = {
    id: gift.id as string,
    senderName: gift.sender_name as string,
    customMessage: gift.custom_message as string | null,
    packageSize: gift.package_size as number,
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
  };

  return <GiftUnboxClient gift={giftData} token={token} />;
}
