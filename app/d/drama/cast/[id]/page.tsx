import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../drama.module.css";
import DramaShell from "../../DramaShell";
import CastView from "./CastView";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { castView } from "@/lib/drama/character";

/** A cast member's own page: their photos, the check, their character, "this is me". */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your character — Alux Micro Drama", robots: { index: false } };

export default async function CastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  const here = `/d/drama/cast/${id}`;
  if (!user) {
    return (
      <DramaShell dock={[{ href: "/d/drama", label: "Shelf", icon: "home" }]}>
        <div className={styles.formWrap}>
          <div className={styles.panel} style={{ marginTop: 24 }}>
            <h2 className={styles.h2}>Sign in to see your character</h2>
            <p className={styles.p}>Use the same Google account you joined with.</p>
            <a className={`${styles.btn} ${styles.primary}`} href={`/login?next=${encodeURIComponent(here)}`}>Continue with Google</a>
          </div>
        </div>
      </DramaShell>
    );
  }
  const view = await castView(id, { id: user.id, admin: isAdminEmail(user.email) });
  if (!view) notFound();
  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${view.story.slug}`, label: "Story", icon: "stories" },
      { href: `/d/drama/${view.story.slug}#cast`, label: "Cast", icon: "cast" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${view.story.slug}`} className={styles.back}>← {view.story.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>Your character{view.role.enters ? ` · joins in Episode ${view.role.enters}` : ""}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>{view.role.name}</h1>
        <p className={styles.tagline}>{view.role.job} — played by {view.displayName}</p>
        <CastView initial={view} />
      </div>
    </DramaShell>
  );
}
