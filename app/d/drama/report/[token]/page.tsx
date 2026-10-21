import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../drama.module.css";
import DramaShell from "../../DramaShell";
import sql from "@/lib/db";

/** A brand's private report: where its product is, its comment word, and how many asked and tapped. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your report — Alux Micro Drama", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const [r] = await sql<{ brand_name: string; keyword: string | null; product_url: string | null; status: string; episode_n: number; asks: number; taps: number; title: string; slug: string; ig_account: string; ep_status: string | null; posted_at: string | null }[]>`
    SELECT p.brand_name, p.keyword, p.product_url, p.status, p.episode_n, p.asks, p.taps, s.title, s.slug, s.ig_account,
           e.status AS ep_status, e.posted_at
    FROM drama_placements p JOIN drama_stories s ON s.id = p.story_id
    LEFT JOIN drama_episodes e ON e.story_id = p.story_id AND e.n = p.episode_n
    WHERE p.report_token = ${token}`;
  if (!r) notFound();
  const where = r.status === "placed" && (r.ep_status === "posted" || r.ep_status === "closed")
    ? `On Instagram since ${new Date(r.posted_at ?? Date.now()).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long" })}`
    : r.status === "placed" ? "In the episode — it posts at 7 p.m."
    : r.status === "approved" ? "Waiting for its episode to be made"
    : r.status === "rejected" || r.status === "refunded" ? "Withdrawn" : "Waiting for payment";

  return (
    <DramaShell dock={[{ href: "/d/drama", label: "Shelf", icon: "home" }, { href: `/d/drama/${r.slug}`, label: "Story", icon: "stories" }]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${r.slug}`} className={styles.back}>← {r.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>Partner report · Episode {r.episode_n}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>{r.brand_name}</h1>
        <p className={styles.tagline}>{where}</p>
        <div className={styles.grid} style={{ marginTop: 16 }}>
          <div className={styles.panel}><div className={styles.eyebrow}>Asked for it</div><p className={styles.heroTitle} style={{ fontSize: 40, margin: "6px 0 0" }}>{r.asks}</p><p className={styles.sectionNote}>people commented {r.keyword ?? "your word"}</p></div>
          <div className={styles.panel}><div className={styles.eyebrow}>Tapped through</div><p className={styles.heroTitle} style={{ fontSize: 40, margin: "6px 0 0" }}>{r.taps}</p><p className={styles.sectionNote}>opened your product page</p></div>
        </div>
        <div className={styles.panel} style={{ marginTop: 14 }}>
          <p className={styles.p} style={{ margin: 0 }}>
            Your word: <strong>{r.keyword ?? "—"}</strong>. Viewers who comment it under the episode on @{r.ig_account} get a button to{" "}
            {r.product_url ? <a href={r.product_url} target="_blank" rel="noopener noreferrer">your product page</a> : "your product page"}.
            The caption credits you as partner.
          </p>
        </div>
        <p className={styles.foot}>Keep this page private — anyone with the link can see it.</p>
      </div>
    </DramaShell>
  );
}
