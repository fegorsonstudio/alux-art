import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../drama.module.css";
import DramaShell from "../../DramaShell";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { episodeFiles, episodeLinks, sponsorshipForViewer } from "@/lib/drama/sponsor";
import { syncPosted } from "@/lib/drama/episodes";

/**
 * The sponsor's files page (/d/drama/sponsor/<sponsorship id>): every made
 * episode of the season they present, with its slides, caption, cover video
 * and soundtrack to download — one zip per episode — to post on their own
 * page as well as ours. Opens for the Google account that paid, and for admins.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your season — Alux Micro Drama", robots: { index: false } };

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const lagos = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : "");

export default async function SponsorFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  const viewer = user ? { id: user.id, admin: isAdminEmail(user.email) } : null;
  const sp = await sponsorshipForViewer(id, viewer);
  if (!sp) {
    if (!user) {
      return (
        <DramaShell dock={[{ href: "/d/drama", label: "Shelf", icon: "home" }]}>
          <div className={styles.formWrap}>
            <div className={styles.panel}>
              <h2 className={styles.h2}>Sign in to open your files</h2>
              <p className={styles.p}>Use the Google account you paid with.</p>
              <a className={`${styles.btn} ${styles.primary}`} href={`/login?next=${encodeURIComponent(`/d/drama/sponsor/${id}`)}`}>Continue with Google</a>
            </div>
          </div>
        </DramaShell>
      );
    }
    notFound();
  }
  await syncPosted().catch(() => {});
  const episodes = await episodeFiles(sp.story_id);
  const links = await Promise.all(episodes.map(episodeLinks));
  const paid = sp.status === "paid" || sp.status === "producing" || sp.status === "delivered";

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${sp.slug}`, label: "Story", icon: "stories" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${sp.slug}`} className={styles.back}>← {sp.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>{paid ? "Presented by" : "Sponsorship"} · {sp.brand_name}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(28px, 6.5vw, 42px)" }}>{sp.title}, season one</h1>
        <p className={styles.logline}>{sp.tagline}</p>
        <div className={styles.panel}>
          <p className={styles.p} style={{ margin: 0 }}>
            {paid
              ? <>Paid {naira(sp.price_ngn)} on {lagos(sp.paid_at)}. Your name is on the cover, the last slide and the caption of every episode approved since. Each episode’s files appear here the day it is made, and stay here.</>
              : <>This sponsorship is {sp.status.replace("_", " ")}. The files appear here once the payment is confirmed.</>}
          </p>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Episodes</h2>
            <span className={styles.sectionNote}>{episodes.length} made · links last seven days, the page always has fresh ones</span>
          </div>
          {!episodes.length && <p className={styles.p}>No episode is made yet. The first one posts after the story starts; the next ones after each vote.</p>}
          <div className={styles.grid}>
            {episodes.map((e, i) => {
              const l = links[i];
              const ig = e.ig_media_id ? `https://www.instagram.com/${encodeURIComponent(sp.ig_account)}/` : null;
              return (
                <article key={e.id} className={styles.panel} style={{ display: "grid", gap: 10 }}>
                  <div className={styles.roleTop}>
                    <div className={styles.epNum}>{e.n}</div>
                    <div>
                      <p className={styles.roleName}>{e.title}</p>
                      <p className={styles.roleJob}>{e.status === "ready" ? "Made, not yet posted" : `Posted ${lagos(e.posted_at)}`}{e.presentedBy ? ` · presented by ${e.presentedBy}` : " · made before the sponsorship"}</p>
                    </div>
                  </div>
                  {l.slides[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.slides[0]} alt={`Episode ${e.n} cover`} width={540} height={675} style={{ width: "100%", maxWidth: 270, height: "auto", borderRadius: 12 }} />
                  )}
                  <div className={styles.actions}>
                    {paid && <a className={`${styles.btn} ${styles.primary} ${styles.small}`} href={`/api/drama/sponsor/${sp.id}/episode/${e.n}`}>Download everything (zip)</a>}
                    {l.coverVideo && <a className={`${styles.btn} ${styles.quiet} ${styles.small}`} href={l.coverVideo} target="_blank" rel="noopener noreferrer">Cover video</a>}
                    {l.soundtrack && <a className={`${styles.btn} ${styles.quiet} ${styles.small}`} href={l.soundtrack} target="_blank" rel="noopener noreferrer">Soundtrack</a>}
                    {ig && <a className={`${styles.btn} ${styles.quiet} ${styles.small}`} href={ig} target="_blank" rel="noopener noreferrer">On @{sp.ig_account}</a>}
                  </div>
                  <details>
                    <summary className={styles.small}>Caption and slides</summary>
                    <pre className={styles.p} style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0" }}>{e.caption}</pre>
                    <p className={styles.small} style={{ margin: 0 }}>
                      {l.slides.map((u, j) => <span key={u}><a href={u} target="_blank" rel="noopener noreferrer">Slide {j + 1}</a>{j < l.slides.length - 1 ? " · " : ""}</span>)}
                    </p>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
        <p className={styles.foot}>
          Post the slides as a carousel on your own page (the cover video can be the first item), or let it run on ours. The story and the vote stay on our page, so keep the caption’s two words if you post it: that is how your audience joins in.
        </p>
      </div>
    </DramaShell>
  );
}
