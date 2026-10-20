import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../../drama.module.css";
import DramaShell from "../../../DramaShell";
import CheckoutForm from "../../../CheckoutForm";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { dramaPrices, storyBySlug, takenRoles } from "@/lib/drama/data";

/** Play a role: /d/drama/<slug>/join/<role>. Sign in, one photo, pay. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Play a role — Alux Micro Drama", robots: { index: false } };

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const tierName = { lead: "the lead", main: "a main role", cameo: "a cameo" } as const;

export default async function JoinPage({ params }: { params: Promise<{ slug: string; role: string }> }) {
  const { slug, role: roleKey } = await params;
  const story = await storyBySlug(slug);
  if (!story) notFound();
  const role = (story.content.cast ?? []).find((r) => r.key === roleKey);
  if (!role) notFound();
  const [taken, prices, auth] = await Promise.all([takenRoles([story.id]), dramaPrices(), (await createClient()).auth.getUser()]);
  const user = auth.data.user;
  const open = story.status === "upcoming" && role.open && !taken.get(story.id)?.has(role.key);
  const here = `/d/drama/${story.slug}/join/${role.key}`;

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${story.slug}`, label: "Story", icon: "stories" },
      { href: `/d/drama/${story.slug}#cast`, label: "Cast", icon: "cast" },
      { href: `/d/drama/${story.slug}#brands`, label: "Brands", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${story.slug}#cast`} className={styles.back}>← {story.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>Play {tierName[role.tier]}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>{role.name}</h1>
        <p className={styles.tagline}>{role.role}{role.age ? `, ${role.age}` : ""}</p>
        <p className={styles.logline}>{role.want} Your face plays {role.name.split(" ")[0]} in every episode — the same face, every time.</p>
        {!open ? (
          <div className={styles.panel}><p className={styles.p} style={{ margin: 0 }}>This role is not open any more. <Link href={`/d/drama/${story.slug}#cast`}>See the other roles</Link>.</p></div>
        ) : !user ? (
          <div className={styles.panel}>
            <h2 className={styles.h2}>Sign in to join the cast</h2>
            <p className={styles.p}>So your photo and your payment are kept with you, and only you.</p>
            <a className={`${styles.btn} ${styles.primary}`} href={`/login?next=${encodeURIComponent(here)}`}>Continue with Google</a>
          </div>
        ) : (
          <CheckoutForm mode="cast" slug={story.slug} role={role.key} roleName={role.name} priceLabel={naira(prices[role.tier])}
            admin={isAdminEmail(user.email)} defaultName={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : ""} />
        )}
      </div>
    </DramaShell>
  );
}
