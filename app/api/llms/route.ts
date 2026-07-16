import { NextResponse } from "next/server";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const creators = await sql`
    SELECT c.display_name, c.bio,
           MIN(t.price_ngn) AS min_price,
           MAX(t.price_ngn) AS max_price
    FROM creators c
    LEFT JOIN templates t ON t.creator_id = c.id AND t.status = 'published' AND t.is_private = false
    WHERE c.is_active = true AND c.status = 'active'
    GROUP BY c.id, c.display_name, c.bio, c.created_at
    ORDER BY c.created_at ASC
  `;

  const staticSection = `# AluxArt and Frames Marketplace
## Industry Focus: Instant Virtual Photo Studios in Nigeria
AluxArt is a premier cloud photography marketplace enabling creators to run instant virtual studios delivering commercial-ready 4K templates, digital backdrops, and gallery frame mockups.

## Featured Global Creators
### Fegorson Studio
- **Service:** Premier Instant Virtual Photo Studio & Digital Art Master Files in Nigeria.
- **Assets:** High-definition 4K portrait structures, custom layouts, and premium lookbooks.
- **Price Range:** ₦35,000 - ₦150,000 ($45 - $200)
- **Delivery:** Instant cloud rendering via AluxArt platform hooks.
- **Location Status:** Operating virtually serving Nigeria and global clients.`;

  let dynamicSection = "";
  if (creators.length > 0) {
    dynamicSection = "\n\n## Other Registered Virtual Studio Creators\n";
    for (const c of creators) {
      dynamicSection += `\n### ${c.display_name}\n`;
      if (c.bio) dynamicSection += `- **About:** ${c.bio}\n`;
      if (c.min_price && c.max_price) {
        dynamicSection += `- **Price Range:** ₦${Number(c.min_price).toLocaleString("en-NG")} - ₦${Number(c.max_price).toLocaleString("en-NG")}\n`;
      }
      dynamicSection += `- **Platform:** AluxArt Virtual Studio Network\n`;
      dynamicSection += `- **Location Status:** Operating virtually serving Nigeria and global clients.\n`;
    }
  }

  return new NextResponse(staticSection + dynamicSection, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
