import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Copy } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";
import { createClient } from "@/lib/supabase-server";

/**
 * A brand's own series (owner, 2026-10-25): POST { brandName, contactName, email, phone?,
 * instagram?, city?, genre?, audience?, message?, products: [{ name, url?, note?, path }] }.
 * The product pictures were uploaded through /api/upload/file (identity-images, purged
 * after 48 h) and are copied here into storage that lasts. The request lands with the
 * owner on Telegram; the writing is run from the command line
 * (tools/drama/brand-series.mjs <id>) and the brand reads the preview before anything posts.
 */
export const dynamic = "force-dynamic";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const recent = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  if (str("website", 200)) return NextResponse.json({ ok: true });
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const now = Date.now();
  const mine = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (mine.length >= 3) return fail(429, "Thanks — we have your request. We'll be in touch.");

  const brand = str("brandName", 80), contact = str("contactName", 80), email = str("email", 120);
  if (brand.length < 2) return fail(400, "Add your brand's name.");
  if (contact.length < 2) return fail(400, "Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "Add an email address we can reply to.");
  const raw = Array.isArray(b.products) ? b.products.slice(0, 12) : [];
  const products = raw.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 80);
    const url = String(o.url ?? "").trim().slice(0, 400);
    const path = String(o.path ?? "").trim().slice(0, 300);
    return { key: `product${i + 1}`, name, url: /^https?:\/\//.test(url) ? url : null, note: String(o.note ?? "").trim().slice(0, 300) || null, path };
  }).filter((p) => p.path && (!user || p.path.startsWith(`${user.id}/`)));
  if (!products.length) return fail(400, "Upload at least one picture of a product.");

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO drama_brand_series (brand_name, contact_name, contact_email, contact_phone, instagram, city, genre, audience, products, message, user_id)
    VALUES (${brand}, ${contact}, ${email}, ${str("phone", 30) || null}, ${str("instagram", 60).replace(/^@/, "") || null}, ${str("city", 40) || null},
            ${str("genre", 20) || null}, ${str("audience", 300) || null}, ${sql.json(products as never)}, ${str("message", 1500) || null}, ${user?.id ?? null})
    RETURNING id`;
  // Keep the pictures with the request (identity-images is purged after 48 h).
  const kept = [];
  for (const p of products) {
    const to = `drama/brands/series/${row.id}/${p.key}.${(/\.(jpe?g|png|webp)$/i.exec(p.path)?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg")}`;
    try { await r2Copy("identity-images", p.path, "generated-4k", to); kept.push({ ...p, bucket: "generated-4k", path: to }); }
    catch { kept.push({ ...p, bucket: "identity-images" }); }
  }
  await sql`UPDATE drama_brand_series SET products = ${sql.json(kept as never)}, updated_at = now() WHERE id = ${row.id}`;
  mine.push(now); recent.set(ip, mine);
  await tellAdmin(
    `🏷️ <b>A brand wants its own series</b> — ${esc(brand)} (${kept.length} product${kept.length === 1 ? "" : "s"})\n` +
    `${esc(contact)} · ${esc(email)}${str("phone", 30) ? ` · ${esc(str("phone", 30))}` : ""}${str("instagram", 60) ? ` · @${esc(str("instagram", 60).replace(/^@/, ""))}` : ""}\n` +
    `${kept.map((p) => `• ${esc(p.name || p.key)}${p.url ? ` — ${esc(p.url)}` : ""}`).join("\n")}\n` +
    (str("message", 1500) ? `\n${esc(str("message", 700))}\n` : "") +
    `\nWrite it: node --env-file=.env.local tools/drama/brand-series.mjs ${row.id}`,
  ).catch(() => false);
  return NextResponse.json({ ok: true, id: row.id });
}
