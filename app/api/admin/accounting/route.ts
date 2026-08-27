import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { accountingSummary } from "@/lib/accounting";

/**
 * The accounting endpoint.
 *
 * GET returns every figure, computed in lib/accounting.ts. POST records an
 * expense, a rate-card price or a fal invoice. Admin-only, checked the same way
 * app/api/admin/overview/route.ts checks it — there is exactly one definition of
 * who counts as an admin and it lives in lib/auth.ts.
 *
 * This route only ever WRITES to the three tables migration 063 created. It
 * never writes to payments, template_purchases or shoots: the accounting reads
 * those, and a reporting tool that can alter the thing it reports is a tool you
 * cannot trust the reports from.
 */

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;

  const [summary, expenses, rateCard, invoices] = await Promise.all([
    accountingSummary({ from, to }),
    sql`SELECT id, incurred_on, category, vendor, description, amount_ngn,
               recurs_monthly, recurs_until
        FROM expenses ORDER BY incurred_on DESC LIMIT 200`.catch(() => []),
    sql`SELECT model, usd_per_image, note FROM fal_rate_card ORDER BY usd_per_image DESC`.catch(() => []),
    sql`SELECT month, usd_actual, ngn_rate, note FROM fal_invoices ORDER BY month DESC`.catch(() => []),
  ]);

  return NextResponse.json({ summary, expenses, rateCard, invoices });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    kind?: "expense" | "rate" | "invoice" | "deleteExpense";
    // expense
    id?: string;
    incurredOn?: string; category?: string; vendor?: string; description?: string;
    amountNgn?: number; recursMonthly?: boolean; recursUntil?: string | null;
    // rate card
    model?: string; usdPerImage?: number; note?: string;
    // invoice
    month?: string; usdActual?: number; ngnRate?: number;
  };

  try {
    switch (body.kind) {
      case "expense": {
        if (!body.incurredOn || !body.category || typeof body.amountNgn !== "number") {
          return NextResponse.json({ error: "A date, a category and an amount are required" }, { status: 400 });
        }
        if (body.amountNgn < 0) {
          return NextResponse.json({ error: "An expense cannot be negative" }, { status: 400 });
        }
        const [row] = await sql`
          INSERT INTO expenses (incurred_on, category, vendor, description, amount_ngn,
                                recurs_monthly, recurs_until)
          VALUES (${body.incurredOn}, ${body.category}, ${body.vendor ?? null},
                  ${body.description ?? null}, ${Math.round(body.amountNgn)},
                  ${!!body.recursMonthly}, ${body.recursUntil || null})
          RETURNING id`;
        return NextResponse.json({ ok: true, id: row.id });
      }

      case "deleteExpense": {
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await sql`DELETE FROM expenses WHERE id = ${body.id}`;
        return NextResponse.json({ ok: true });
      }

      case "rate": {
        if (!body.model || typeof body.usdPerImage !== "number") {
          return NextResponse.json({ error: "A model and a price are required" }, { status: 400 });
        }
        await sql`
          INSERT INTO fal_rate_card (model, usd_per_image, note, updated_at)
          VALUES (${body.model}, ${body.usdPerImage}, ${body.note ?? null}, NOW())
          ON CONFLICT (model) DO UPDATE
            SET usd_per_image = EXCLUDED.usd_per_image,
                note = EXCLUDED.note, updated_at = NOW()`;
        return NextResponse.json({ ok: true });
      }

      case "invoice": {
        if (!body.month || typeof body.usdActual !== "number" || typeof body.ngnRate !== "number") {
          return NextResponse.json({ error: "A month, an amount and a rate are required" }, { status: 400 });
        }
        if (body.ngnRate <= 0) {
          return NextResponse.json({ error: "The exchange rate must be above zero" }, { status: 400 });
        }
        // Normalised to the first of the month so one invoice per month is
        // enforced by the primary key rather than by hoping.
        const month = `${body.month.slice(0, 7)}-01`;
        await sql`
          INSERT INTO fal_invoices (month, usd_actual, ngn_rate, note)
          VALUES (${month}, ${body.usdActual}, ${body.ngnRate}, ${body.note ?? null})
          ON CONFLICT (month) DO UPDATE
            SET usd_actual = EXCLUDED.usd_actual, ngn_rate = EXCLUDED.ngn_rate,
                note = EXCLUDED.note`;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    }
  } catch (e) {
    console.error("[admin/accounting]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not save that" }, { status: 500 });
  }
}
