import "server-only";
import sql from "@/lib/db";
import { initializePaystackPayment, verifyPaystackPayment } from "@/lib/paystack";
import { paidEnough, reportPaymentMismatch } from "@/lib/payment-checks";
import { r2Copy, r2SignedDownloadUrl } from "@/lib/r2";
import { SITE_URL } from "@/lib/site-url";
import { sendAdminImage, tellAdmin } from "@/lib/telegram";
import { dramaPrices, lastMadeEpisode, roleIsOpen, storyBySlug } from "@/lib/drama/data";
import { PHOTO_KINDS, keepCastPhotos, runCastSoon } from "@/lib/drama/character";

/**
 * Paying to play a role, and paying for a brand slot. Both start here (a row
 * in pending_payment + a Paystack checkout) and finish in fulfilDramaPayment,
 * which the Paystack webhook calls after its signature check and the return
 * page calls through Paystack's verify API — whichever comes first; the
 * second finds nothing left to do. Nothing is released unless the amount and
 * currency match the order (lib/payment-checks.ts).
 *
 * The photo or product picture is copied out of identity-images (purged 48 h
 * after use) into generated-4k/drama/... the moment it is paid for, because it
 * has to last the whole story.
 */

const KEEP_BUCKET = "generated-4k";
const PENDING_MINUTES = 30;
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const ext = (p: string) => (/\.(jpe?g|png|webp|heic)$/i.exec(p)?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");

export class DramaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Who = { id: string; email: string; admin: boolean };

// ── Play a role ──────────────────────────────────────────────────────────────
export async function startCastPayment(input: { slug: string; roleKey: string; displayName: string; photos: { kind: string; path: string }[]; who: Who }) {
  const story = await storyBySlug(input.slug);
  if (!story) throw new DramaError("No such story.", 404);
  const role = (story.content.cast ?? []).find((r) => r.key === input.roleKey);
  if (!role) throw new DramaError("That role is not open.");
  if (!roleIsOpen(story, role, await lastMadeEpisode(story.id))) {
    throw new DramaError(story.status === "upcoming" ? "That role is not open." : "This character has already appeared, so the role is locked. Look for a guest role, or a story that is coming soon.");
  }
  const name = input.displayName.trim().slice(0, 60);
  if (name.length < 2) throw new DramaError("Tell us the name to credit you by.");
  // Exactly the three photos the character sheet is drawn from, each the member's own upload.
  const photos = PHOTO_KINDS.map(({ kind }) => input.photos.find((p) => p.kind === kind));
  if (photos.some((p) => !p || !p.path.startsWith(`${input.who.id}/`))) throw new DramaError("Add all three photos, then try again.");
  const kept = photos.map((p) => ({ kind: p!.kind, bucket: "identity-images", path: p!.path }));
  const price = (await dramaPrices())[role.tier];

  // Someone who opened checkout and walked away does not hold a role for ever.
  await sql`UPDATE drama_cast SET status = 'withdrawn', updated_at = now()
            WHERE story_id = ${story.id} AND role_key = ${role.key} AND status = 'pending_payment'
              AND created_at < now() - make_interval(mins => ${PENDING_MINUTES})`;
  let row: { id: string } | undefined;
  try {
    [row] = await sql<{ id: string }[]>`
      INSERT INTO drama_cast (story_id, role_key, user_id, display_name, email, photo_bucket, photo_path, photos, price_ngn, status)
      VALUES (${story.id}, ${role.key}, ${input.who.id}, ${name}, ${input.who.email}, 'identity-images', ${kept[0].path}, ${sql.json(kept)},
              ${input.who.admin ? 0 : price}, ${input.who.admin ? "submitted" : "pending_payment"})
      RETURNING id`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new DramaError("Someone has just taken this role. Pick another one.", 409);
    throw e;
  }

  // The owner tests for free: no checkout, straight to the photo check.
  if (input.who.admin || price === 0) {
    await keepCastPhotos(row.id);
    await announceCast(row.id, "free (admin)");
    runCastSoon(row.id);
    return { done: true as const, castId: row.id };
  }
  const pay = await initializePaystackPayment({
    email: input.who.email, amountNgn: price, currency: "NGN",
    metadata: { type: "drama_cast", cast_id: row.id, user_id: input.who.id, story: story.slug, role: role.key },
    callbackUrl: `${SITE_URL.replace(/\/$/, "")}/d/drama/${story.slug}?paid=cast`,
  });
  await sql`UPDATE drama_cast SET payment_reference = ${pay.reference}, updated_at = now() WHERE id = ${row.id}`;
  return { done: false as const, url: pay.authorizationUrl };
}

async function announceCast(castId: string, paid: string) {
  const [r] = await sql<{ display_name: string; role_key: string; title: string; content: { cast: { key: string; name: string }[] }; photo_bucket: string; photo_path: string }[]>`
    SELECT c.display_name, c.role_key, s.title, s.content, c.photo_bucket, c.photo_path
    FROM drama_cast c JOIN drama_stories s ON s.id = c.story_id WHERE c.id = ${castId}`;
  if (!r) return;
  const role = r.content.cast.find((x) => x.key === r.role_key)?.name ?? r.role_key;
  // For the owner's information only: the photo check and the character run by themselves (lib/drama/character.ts).
  await tellAdmin(`🎭 <b>New cast member</b> — ${esc(r.display_name)} plays <b>${esc(role)}</b> in ${esc(r.title)} (${esc(paid)}).\nTheir photos are checked and their character is made by itself; the portrait comes to you when it is ready.`).catch(() => false);
  const url = await r2SignedDownloadUrl(r.photo_bucket, r.photo_path, 3600).catch(() => null);
  if (url) await sendAdminImage(url, `${r.display_name} as ${role}`).catch(() => false);
}

// ── A brand slot ─────────────────────────────────────────────────────────────
export async function startPlacementPayment(input: {
  slug: string; episodeN: number; slotKey: string; brandName: string; contactName: string; phone: string;
  productPath: string; note: string; who: Who;
}) {
  const story = await storyBySlug(input.slug);
  if (!story) throw new DramaError("No such story.", 404);
  const ep = (story.content.episodes ?? []).find((e) => e.n === input.episodeN);
  const slot = ep?.slots?.find((s) => s.key === input.slotKey);
  if (!ep || !slot) throw new DramaError("That slot does not exist.");
  const [posted] = await sql`SELECT 1 FROM drama_episodes WHERE story_id = ${story.id} AND n = ${ep.n} AND status IN ('ready', 'posted', 'closed')`;
  if (posted) throw new DramaError("That episode is already made. Choose a slot in a later episode or another story.");
  const [sold] = await sql`SELECT 1 FROM drama_placements WHERE story_id = ${story.id} AND episode_n = ${ep.n} AND slot_key = ${slot.key} AND status IN ('paid', 'approved', 'placed')`;
  if (sold) throw new DramaError("Another brand has this slot.", 409);
  const brand = input.brandName.trim().slice(0, 60);
  if (brand.length < 2) throw new DramaError("Add your brand name.");
  if (!input.productPath.startsWith(`${input.who.id}/`)) throw new DramaError("Upload your product picture again.");
  const price = (await dramaPrices()).slot;

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO drama_placements (story_id, episode_n, slot_key, brand_name, contact_name, contact_email, contact_phone,
                                  product_bucket, product_path, note, price_ngn, status, user_id)
    VALUES (${story.id}, ${ep.n}, ${slot.key}, ${brand}, ${input.contactName.trim().slice(0, 60) || null}, ${input.who.email},
            ${input.phone.trim().slice(0, 30) || null}, 'identity-images', ${input.productPath}, ${input.note.trim().slice(0, 500) || null},
            ${input.who.admin ? 0 : price}, 'pending_payment', ${input.who.id})
    RETURNING id`;
  if (input.who.admin || price === 0) {
    await markPlacementPaid(row.id, null);
    return { done: true as const };
  }
  const pay = await initializePaystackPayment({
    email: input.who.email, amountNgn: price, currency: "NGN",
    metadata: { type: "drama_placement", placement_id: row.id, user_id: input.who.id, story: story.slug, slot: `${ep.n}:${slot.key}` },
    callbackUrl: `${SITE_URL.replace(/\/$/, "")}/d/drama/${story.slug}?paid=brand`,
  });
  await sql`UPDATE drama_placements SET payment_reference = ${pay.reference}, updated_at = now() WHERE id = ${row.id}`;
  return { done: false as const, url: pay.authorizationUrl };
}

async function markPlacementPaid(id: string, reference: string | null): Promise<boolean> {
  try {
    const rows = await sql`UPDATE drama_placements SET status = 'paid', payment_reference = COALESCE(${reference}, payment_reference), updated_at = now()
                           WHERE id = ${id} AND status = 'pending_payment' RETURNING id`;
    if (!rows.length) return false;
  } catch (e) {
    if ((e as { code?: string }).code !== "23505") throw e;
    // Two brands paid for one slot within seconds of each other: this one keeps its money owed.
    await tellAdmin(`⚠️ <b>Brand slot paid twice</b> — placement ${id} was paid but another brand already has the slot. Refund it in Paystack (reference ${esc(reference ?? "?")}).`).catch(() => false);
    return false;
  }
  const [r] = await sql<{ product_bucket: string; product_path: string; brand_name: string; title: string; episode_n: number; slot_key: string }[]>`
    SELECT p.product_bucket, p.product_path, p.brand_name, s.title, p.episode_n, p.slot_key
    FROM drama_placements p JOIN drama_stories s ON s.id = p.story_id WHERE p.id = ${id}`;
  if (r && r.product_bucket !== KEEP_BUCKET) {
    const to = `drama/brands/${id}/product.${ext(r.product_path)}`;
    await r2Copy(r.product_bucket, r.product_path, KEEP_BUCKET, to);
    await sql`UPDATE drama_placements SET product_bucket = ${KEEP_BUCKET}, product_path = ${to} WHERE id = ${id}`;
  }
  if (r) {
    await tellAdmin(`🏷️ <b>Brand slot sold</b> — ${esc(r.brand_name)} in ${esc(r.title)}, episode ${r.episode_n} (${esc(r.slot_key)}).\nApprove it in /admin/drama.`).catch(() => false);
    const url = await r2SignedDownloadUrl(KEEP_BUCKET, `drama/brands/${id}/product.${ext(r.product_path)}`, 3600).catch(() => null);
    if (url) await sendAdminImage(url, r.brand_name).catch(() => false);
  }
  return true;
}

// ── Finishing a payment ──────────────────────────────────────────────────────
/** Never throws: a problem after the money is taken goes to the owner. */
export async function fulfilDramaPayment(opts: { reference: string; amountKobo: number; currency: string; via: string }): Promise<"done" | "nothing" | "mismatch"> {
  try {
    const paid = Number(opts.amountKobo) / 100;
    const [cast] = await sql<{ id: string; price_ngn: number; status: string }[]>`
      SELECT id, price_ngn, status FROM drama_cast WHERE payment_reference = ${opts.reference}`;
    if (cast) {
      if (cast.status !== "pending_payment") return "nothing";
      if (!paidEnough(paid, opts.currency, cast.price_ngn, "NGN")) {
        await reportPaymentMismatch({ where: `drama cast (${opts.via})`, reference: opts.reference, paidMajor: paid, paidCurrency: opts.currency, expectedMajor: cast.price_ngn, expectedCurrency: "NGN", order: `drama_cast ${cast.id}` });
        return "mismatch";
      }
      const moved = await sql`UPDATE drama_cast SET status = 'submitted', updated_at = now() WHERE id = ${cast.id} AND status = 'pending_payment' RETURNING id`;
      if (!moved.length) return "nothing";
      await keepCastPhotos(cast.id);
      await announceCast(cast.id, `₦${cast.price_ngn.toLocaleString("en-NG")} paid`);
      runCastSoon(cast.id);
      return "done";
    }
    const [pl] = await sql<{ id: string; price_ngn: number; status: string }[]>`
      SELECT id, price_ngn, status FROM drama_placements WHERE payment_reference = ${opts.reference}`;
    if (pl) {
      if (pl.status !== "pending_payment") return "nothing";
      if (!paidEnough(paid, opts.currency, pl.price_ngn, "NGN")) {
        await reportPaymentMismatch({ where: `drama brand slot (${opts.via})`, reference: opts.reference, paidMajor: paid, paidCurrency: opts.currency, expectedMajor: pl.price_ngn, expectedCurrency: "NGN", order: `drama_placement ${pl.id}` });
        return "mismatch";
      }
      return (await markPlacementPaid(pl.id, opts.reference)) ? "done" : "nothing";
    }
    return "nothing";
  } catch (e) {
    console.error("[drama payment] fulfil failed:", (e as Error).message);
    await tellAdmin(`⚠️ <b>Drama payment needs a look</b> — reference <code>${esc(opts.reference)}</code> was paid but could not be finished: ${esc((e as Error).message.slice(0, 200))}`).catch(() => false);
    return "nothing";
  }
}

/** The cast member a payment reference belongs to, so the return page can link to their character. */
export async function castIdForReference(reference: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return null;
  const [r] = await sql<{ id: string }[]>`SELECT id FROM drama_cast WHERE payment_reference = ${reference}`;
  return r?.id ?? null;
}

/** The return page's check: ask Paystack directly, then finish if the webhook has not. */
export async function verifyDramaPayment(reference: string): Promise<"done" | "nothing" | "mismatch" | "unpaid"> {
  if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(reference)) return "nothing";
  const mine = await sql`SELECT 1 FROM drama_cast WHERE payment_reference = ${reference} UNION ALL SELECT 1 FROM drama_placements WHERE payment_reference = ${reference}`;
  if (!mine.length) return "nothing";
  const v = await verifyPaystackPayment(reference).catch(() => null);
  if (!v?.status || v.data?.status !== "success") return "unpaid";
  return fulfilDramaPayment({ reference, amountKobo: Number(v.data.amount), currency: String(v.data.currency ?? "NGN"), via: "return page" });
}
