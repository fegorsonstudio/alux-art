import sql from "@/lib/db";
import CreatorPageClient from "./CreatorPageClient";

type Props = { params: Promise<{ id: string }> };

export default async function CreatorPage({ params }: Props) {
  const { id } = await params;

  const [row] = await sql`
    SELECT c.display_name, c.bio,
           MIN(t.price_ngn) AS min_price,
           MAX(t.price_ngn) AS max_price
    FROM creators c
    LEFT JOIN templates t ON t.creator_id = c.id AND t.status = 'published'
    WHERE (c.id::text = ${id} OR c.username = ${id}) AND c.is_active = true
    GROUP BY c.id, c.display_name, c.bio
  `;

  const priceRange =
    row?.min_price && row?.max_price
      ? `₦${Number(row.min_price).toLocaleString("en-NG")}-₦${Number(row.max_price).toLocaleString("en-NG")}`
      : "₦35000-₦150000";

  const jsonLd = row
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        additionalType: "http://www.productontology.org/doc/Photography_studio",
        name: row.display_name,
        description: "Instant Virtual Photo Studio rendering on the AluxArt network",
        areaServed: "Nigeria",
        priceRange,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CreatorPageClient />
    </>
  );
}
