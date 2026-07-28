import type { Metadata } from "next";
import sql from "@/lib/db";
import TemplatePageClient from "./TemplatePageClient";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  const [template] = await sql`
    SELECT title, description, price_ngn, price_1_ngn, package_size, cover_storage_path, cover_bucket
    FROM templates WHERE id = ${id} AND status = 'published'
  `;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aluxartandframes.shop";
  const pageUrl = `${siteUrl}/marketplace/${id}`;

  if (!template) {
    return {
      title: "Template not found — Alux Art",
      openGraph: { url: pageUrl, siteName: "Alux Art" },
    };
  }

  const title = `${template.title} — Alux Art`;
  // Advertise the SINGLE-image entry price, matching the marketplace cards. Quoting
  // the 10-pack here put a ₦25,000 headline on every shared WhatsApp/Facebook link.
  const entryPriceNgn = template.price_1_ngn != null
    ? Number(template.price_1_ngn)
    : Math.round(Number(template.price_ngn) * 0.12);
  const description =
    template.description ||
    `AI-generated professional photos from ₦${entryPriceNgn.toLocaleString("en-NG")}. Choose 1, 5 or 10 images.`;

  // Cover image served via proxy so Meta's scraper always gets a fresh signed URL
  const ogImage = `${siteUrl}/api/marketplace/${id}/cover-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Alux Art",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 1200, alt: template.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    // Facebook / Instagram Shopping product tags
    other: {
      "og:type": "product",
      "product:price:amount": String(entryPriceNgn),
      "product:price:currency": "NGN",
      "product:retailer_item_id": id,
      "og:availability": "in stock",
    },
  };
}

export default function TemplatePage() {
  return <TemplatePageClient />;
}
