import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../../drama.module.css";
import DramaShell from "../../../DramaShell";
import CheckoutForm from "../../../CheckoutForm";
import sql from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { TIER_PACKAGE, dramaPrices, lastMadeEpisode, roleIsOpen, storyBySlug, takenRoles } from "@/lib/drama/data";

/** Play a role: /d/drama/<slug>/join/<role>. Sign in, three photos, pay. */
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
  const [taken, prices, auth, made] = await Promise.all([takenRoles([story.id]), dramaPrices(), (await createClient()).auth.getUser(), lastMadeEpisode(story.id)]);
  const user = auth.data.user;
  const [mine] = user
    ? await sql<{ id: string }[]>`SELECT id FROM drama_cast WHERE story_id = ${story.id} AND role_key = ${role.key} AND user_id = ${user.id}
                                    AND status NOT IN ('pending_payment', 'rejected', 'withdrawn') LIMIT 1`
    : [];
  const open = roleIsOpen(story, role, made) && !taken.get(story.id)?.has(role.key);
  const here = `/d/drama/${story.slug}/join/${role.key}`;
  const pkg = TIER_PACKAGE[role.tier];
  const first = role.name.replace(/^(Mrs|Mr|Ms|Miss|Chief|Dr|Barrister)\.?\s+/, "").split(" ")[0];
  const includes = `${pkg.episodes}, with your character portrait`;

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${story.slug}`, label: "Story", icon: "stories" },
      { href: `/d/drama/${story.slug}#cast`, label: "Cast", icon: "cast" },
      { href: `/d/drama/${story.slug}#brands`, label: "Brands", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${story.slug}#cast`} className={styles.back}>← {story.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>Play {tierName[role.tier]}{role.guest && role.enters ? ` · joins in Episode ${role.enters}` : ""}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>{role.name}</h1>
        <p className={styles.tagline}>{role.role}{role.age ? `, ${role.age}` : ""}</p>
        <p className={styles.logline}>{role.want}</p>
        {mine ? (
          <div className={styles.panel}>
            <h2 className={styles.h2}>This role is yours</h2>
            <p className={styles.p}>See your character, or send a new photo if we asked for one.</p>
            <a className={`${styles.btn} ${styles.primary}`} href={`/d/drama/cast/${mine.id}`}>Open your character</a>
          </div>
        ) : !open ? (
          <div className={styles.panel}><p className={styles.p} style={{ margin: 0 }}>This role is not open any more. <Link href={`/d/drama/${story.slug}#cast`}>See the other roles</Link>.</p></div>
        ) : (
          <>
            <div className={styles.panel} style={{ marginBottom: 14 }}>
              <h2 className={styles.h2}>What you get — {naira(prices[role.tier])}</h2>
              <ul className={styles.p} style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
                <li>Your character portrait: you, dressed as {first}, made from your photos — yours to keep and share.</li>
                <li>Your character sheet (front, side and full length), so {first} looks like you, the same way, every time.</li>
                <li>Your name in the credits of every episode {first} is in — {pkg.episodes}.</li>
                <li>When the episodes get pictures, your face plays {first} in up to {pkg.pictures} of them.</li>
                <li>You see your character before anyone else, and can ask for it to be made again once.</li>
              </ul>
            </div>
            {!user ? (
              <div className={styles.panel}>
                <h2 className={styles.h2}>Sign in to join the cast</h2>
                <p className={styles.p}>So your photos and your payment are kept with you, and only you.</p>
                <a className={`${styles.btn} ${styles.primary}`} href={`/login?next=${encodeURIComponent(here)}`}>Continue with Google</a>
              </div>
            ) : (
              <CheckoutForm mode="cast" slug={story.slug} role={role.key} roleName={role.name} priceLabel={naira(prices[role.tier])} includes={includes}
                admin={isAdminEmail(user.email)} defaultName={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : ""} />
            )}
          </>
        )}
      </div>
    </DramaShell>
  );
}
