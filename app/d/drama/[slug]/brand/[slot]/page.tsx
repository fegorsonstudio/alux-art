import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../../drama.module.css";
import DramaShell from "../../../DramaShell";
import CheckoutForm from "../../../CheckoutForm";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { dramaPrices, soldSlots, storyBySlug } from "@/lib/drama/data";
import sql from "@/lib/db";

/** A brand slot: /d/drama/<slug>/brand/<episode>-<slot key>. Sign in, a product picture, pay. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your brand in the story — Alux Micro Drama", robots: { index: false } };

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default async function BrandPage({ params }: { params: Promise<{ slug: string; slot: string }> }) {
  const { slug, slot: slotParam } = await params;
  const m = /^(\d{1,2})-([a-z0-9_-]{1,40})$/.exec(slotParam);
  const story = await storyBySlug(slug);
  if (!story || !m) notFound();
  const n = Number(m[1]);
  const ep = (story.content.episodes ?? []).find((e) => e.n === n);
  const slot = ep?.slots?.find((s) => s.key === m[2]);
  if (!ep || !slot) notFound();
  const [sold, prices, auth, made] = await Promise.all([
    soldSlots(story.id), dramaPrices(), (await createClient()).auth.getUser(),
    sql`SELECT 1 FROM drama_episodes WHERE story_id = ${story.id} AND n = ${n} AND status IN ('ready', 'posted', 'closed')`,
  ]);
  const user = auth.data.user;
  const open = !sold.has(`${n}:${slot.key}`) && !made.length;
  const here = `/d/drama/${story.slug}/brand/${slotParam}`;
  const label = `Episode ${n} · ${ep.title} · ${slot.object}.`;

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${story.slug}`, label: "Story", icon: "stories" },
      { href: `/d/drama/${story.slug}#cast`, label: "Cast", icon: "cast" },
      { href: `/d/drama/${story.slug}#brands`, label: "Brands", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${story.slug}#brands`} className={styles.back}>← {story.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>Your brand in the scene · Episode {n}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(28px, 6.5vw, 42px)" }}>{slot.object[0].toUpperCase() + slot.object.slice(1)}</h1>
        <p className={styles.logline}>Your product takes this object’s place in {story.title}, episode {n}, and the post credits you as partner. <span className={styles.price}>{naira(prices.slot)}</span>.</p>
        {!open ? (
          <div className={styles.panel}><p className={styles.p} style={{ margin: 0 }}>This slot is taken. <Link href={`/d/drama/${story.slug}#brands`}>See the other slots</Link>.</p></div>
        ) : !user ? (
          <div className={styles.panel}>
            <h2 className={styles.h2}>Sign in to reserve it</h2>
            <p className={styles.p}>So the slot, the picture and the receipt are kept with you.</p>
            <a className={`${styles.btn} ${styles.primary}`} href={`/login?next=${encodeURIComponent(here)}`}>Continue with Google</a>
          </div>
        ) : (
          <CheckoutForm mode="brand" slug={story.slug} episode={n} slot={slot.key} slotLabel={label} priceLabel={naira(prices.slot)}
            admin={isAdminEmail(user.email)} defaultName={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : ""} />
        )}
      </div>
    </DramaShell>
  );
}
