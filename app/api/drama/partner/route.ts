import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { tellAdmin } from "@/lib/telegram";

/**
 * A company that wants more than one product in a scene: an episode sponsor, a
 * story partner, or a drama of its own. The request is kept and sent to the
 * owner on Telegram, who replies with a price. Open to anyone (businesses are
 * not signed in); a hidden field and a per-address limit keep the bots out.
 */
export const dynamic = "force-dynamic";

const PACKAGES = { season_funder: "Fund a season", episode_sponsor: "Episode sponsor", story_partner: "Story partner", own_drama: "A drama of our own", other: "Something else" } as const;
const recent = new Map<string, number[]>();
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  if (str("website", 200)) return NextResponse.json({ ok: true }); // the hidden field: only a bot fills it

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const now = Date.now();
  const mine = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (mine.length >= 5) return fail(429, "Thanks — we have your messages. We'll be in touch.");

  const company = str("company", 80), contactName = str("contactName", 80), email = str("email", 120);
  const phone = str("phone", 30), budget = str("budget", 80), message = str("message", 1500), story = str("story", 60);
  const pkg = str("package", 30) as keyof typeof PACKAGES;
  if (company.length < 2) return fail(400, "Add your company's name.");
  if (contactName.length < 2) return fail(400, "Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "Add an email address we can reply to.");
  if (!(pkg in PACKAGES)) return fail(400, "Choose what you have in mind.");
  const slug = /^[a-z0-9][a-z0-9-]{2,59}$/.test(story) ? story : null;

  await sql`INSERT INTO drama_partner_requests (company, contact_name, email, phone, package, story_slug, budget, message)
            VALUES (${company}, ${contactName}, ${email}, ${phone || null}, ${pkg}, ${slug}, ${budget || null}, ${message || null})`;
  mine.push(now);
  recent.set(ip, mine);
  await tellAdmin(
    `🤝 <b>Partnership request</b> — ${esc(company)}\n` +
    `Wants: <b>${PACKAGES[pkg]}</b>${slug ? ` (story: ${esc(slug)})` : ""}${budget ? ` · budget ${esc(budget)}` : ""}\n` +
    `${esc(contactName)} · ${esc(email)}${phone ? ` · ${esc(phone)}` : ""}` +
    (message ? `\n\n${esc(message.slice(0, 700))}` : "") +
    `\n\nReply to them with a price.`,
  ).catch(() => false);
  return NextResponse.json({ ok: true });
}
