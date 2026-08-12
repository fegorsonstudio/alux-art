import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import {
  RESALE_COST_NGN, RESALE_MAX_PRICE_NGN, checkResalePrice,
} from "@/lib/resale";

/**
 * Import the studio's lighting product into a creator's own store.
 *
 * GET  — what the offer is, and whether this creator has already imported it.
 * POST — create their copy at a price they choose between ₦800 and ₦1,000.
 *
 * The copy is a real template they own: their own id, so their own shareable
 * link, and their own price. What it does NOT copy is the 195 lighting looks —
 * it stores `source_template_id` and resolves them at read time, so every look
 * the studio adds later reaches every creator's store immediately.
 *
 * Money: `platform_fee_override_ngn` = ₦800 per image to the studio, and the
 * creator keeps whatever they priced above it. The booking route already pays
 * creators through their Paystack subaccount, so nothing new is needed to get
 * them their share — but a creator with no subaccount would be paid nothing,
 * which is why that is checked before an import is allowed.
 */

/** The product being resold. */
const SOURCE_TEMPLATE_ID = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";

async function creatorFor(userId: string) {
  const [creator] = await sql`
    SELECT id, display_name, username, status, paystack_subaccount_code, flutterwave_subaccount_id
    FROM creators WHERE user_id = ${userId}`;
  return creator ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creator = await creatorFor(user.id);
  if (!creator) return NextResponse.json({ error: "You are not a creator yet" }, { status: 403 });

  const [source] = await sql`
    SELECT id, title, description, category, aspect_ratio, shoot_mode, package_size,
           cover_storage_path, cover_bucket
    FROM templates WHERE id = ${SOURCE_TEMPLATE_ID} AND status = 'published'`;
  if (!source) return NextResponse.json({ error: "Nothing available to import right now" }, { status: 404 });

  const [existing] = await sql`
    SELECT id, price_1_ngn, status, created_at FROM templates
    WHERE creator_id = ${creator.id} AND source_template_id = ${SOURCE_TEMPLATE_ID}`;

  const [looks] = await sql`
    SELECT COALESCE(SUM(jsonb_array_length(g->'options')), 0)::int AS n
    FROM templates t, jsonb_array_elements(t.option_groups) g
    WHERE t.id = ${SOURCE_TEMPLATE_ID} AND g->>'type' = 'lighting'`;

  return NextResponse.json({
    offer: {
      title: source.title,
      lookCount: looks?.n ?? 0,
      costNgn: RESALE_COST_NGN,
      maxPriceNgn: RESALE_MAX_PRICE_NGN,
      // Spelled out so the dashboard never has to do this arithmetic itself.
      marginAtMaxNgn: RESALE_MAX_PRICE_NGN - RESALE_COST_NGN,
    },
    // Paid through the same subaccount split as every other sale.
    payoutReady: !!(creator.paystack_subaccount_code || creator.flutterwave_subaccount_id),
    imported: existing
      ? { templateId: existing.id, priceNgn: existing.price_1_ngn, status: existing.status,
          link: `/marketplace/${existing.id}` }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creator = await creatorFor(user.id);
  if (!creator) return NextResponse.json({ error: "You are not a creator yet" }, { status: 403 });
  if (creator.status !== "approved") {
    return NextResponse.json({ error: "Your creator account is still being reviewed" }, { status: 403 });
  }

  // Without a payout account the split would send the creator nothing and the
  // whole amount to the studio. Refuse rather than quietly keep their margin.
  if (!creator.paystack_subaccount_code && !creator.flutterwave_subaccount_id) {
    return NextResponse.json(
      { error: "Add your bank details first so we can pay you on every sale." },
      { status: 422 },
    );
  }

  const body = await request.json().catch(() => ({})) as { priceNgn?: number };
  const price = checkResalePrice(body.priceNgn);
  if (!price.ok) return NextResponse.json({ error: price.error }, { status: 422 });

  const [source] = await sql`
    SELECT * FROM templates WHERE id = ${SOURCE_TEMPLATE_ID} AND status = 'published'`;
  if (!source) return NextResponse.json({ error: "Nothing available to import right now" }, { status: 404 });

  const [existing] = await sql`
    SELECT id FROM templates
    WHERE creator_id = ${creator.id} AND source_template_id = ${SOURCE_TEMPLATE_ID}`;

  // Re-importing is really "change my price". A second row would split their
  // earnings across two links, so the unique index forbids it and this updates.
  if (existing) {
    const [updated] = await sql`
      UPDATE templates
      SET price_1_ngn = ${price.priceNgn},
          price_5_ngn = ${price.priceNgn * 5},
          price_ngn   = ${price.priceNgn * 10},
          updated_at  = NOW()
      WHERE id = ${existing.id} RETURNING id`;
    return NextResponse.json({
      templateId: updated.id, link: `/marketplace/${updated.id}`,
      priceNgn: price.priceNgn, marginNgn: price.marginNgn, updated: true,
    });
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO templates (
      id, creator_id, title, description, category, status,
      price_1_ngn, price_5_ngn, price_ngn,
      aspect_ratio, shoot_mode, package_size,
      cover_storage_path, cover_bucket,
      source_template_id, platform_fee_override_ngn, marketplace_hidden, is_private,
      created_at, updated_at
    ) VALUES (
      ${id}, ${creator.id},
      ${source.title}, ${source.description}, ${source.category}, 'published',
      ${price.priceNgn}, ${price.priceNgn * 5}, ${price.priceNgn * 10},
      ${source.aspect_ratio}, ${source.shoot_mode}, ${source.package_size},
      ${source.cover_storage_path}, ${source.cover_bucket},
      ${SOURCE_TEMPLATE_ID}, ${RESALE_COST_NGN},
      -- hidden from OUR marketplace, visible in THEIR store
      true, false,
      NOW(), NOW()
    )`;

  return NextResponse.json({
    templateId: id, link: `/marketplace/${id}`,
    priceNgn: price.priceNgn, marginNgn: price.marginNgn, updated: false,
  });
}
