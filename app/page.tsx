import Link from "next/link";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";
import styles from "./landing.module.css";
import RotatingStyles from "./RotatingStyles";

export const dynamic = "force-dynamic";

interface FeaturedTemplate {
  id: string;
  title: string;
  coverUrl: string | null;
  category: string;
}

async function getFeaturedTemplates(): Promise<FeaturedTemplate[]> {
  try {
    const rows = await sql`
      SELECT id, title, cover_storage_path, cover_bucket, category
      FROM templates
      WHERE status = 'published'
      ORDER BY purchase_count DESC
    `;

    return await Promise.all(
      rows.map(async (r) => {
        let coverUrl: string | null = null;
        if (r.cover_storage_path) {
          coverUrl = await r2SignedDownloadUrl(
            r.cover_bucket ?? "template-images",
            r.cover_storage_path,
            3600
          ).catch(() => null);
        }
        return { id: r.id, title: r.title, coverUrl, category: r.category };
      })
    );
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const templates = await getFeaturedTemplates();

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <span className={styles.wordmark}>Alux Art</span>
        <div className={styles.navLinks}>
          <Link href="/marketplace" className={styles.navLink}>Browse looks</Link>
          <Link href="/login" className={styles.navCta}>Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Tired of expensive shoots, the planning, and waiting weeks just to get your photos?</p>
        <h1 className={styles.headline}>
          Ready to see yourself<br />in a whole new light?
        </h1>
        <p className={styles.subline}>
          Upload 3 selfies. Choose a style. Get 10 editorial portraits in minutes.
          No photographer. No studio. No prompts.
        </p>
        <div className={styles.heroActions}>
          <Link href="/marketplace" className={styles.primaryBtn}>Browse styles</Link>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <h2 className={styles.sectionHeading}>How it works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>01</span>
            <h3 className={styles.stepTitle}>Upload your photos</h3>
            <p className={styles.stepDesc}>
              Start with 3 clear selfies — these lock your face, skin tone, and features.
              Then add pose references for any angles you want: a back shot, a side profile, a full-body look.
              The AI only knows what you show it, so if you want a pose it has not seen, upload a reference that shows it.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>02</span>
            <h3 className={styles.stepTitle}>Choose a style</h3>
            <p className={styles.stepDesc}>
              Browse our curated collection of editorial styles — from minimal studio looks to bold fashion editorials.
              Each style controls the wardrobe, lighting, and visual direction of your shoot.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>03</span>
            <h3 className={styles.stepTitle}>Get your portraits</h3>
            <p className={styles.stepDesc}>
              Our AI generates high-resolution portraits in minutes. Download individually or as a full set.
              Every image keeps your unique look — same face, same skin tone, same you.
            </p>
          </div>
        </div>
      </section>

      {/* Featured styles */}
      {templates.length > 0 && (
        <section className={styles.featuredSection}>
          <h2 className={styles.sectionHeading}>Featured styles</h2>
          <div className={styles.templateGrid}>
            {templates.map((t) => (
              <Link key={t.id} href={`/marketplace/${t.id}`} className={styles.templateCard}>
                {t.coverUrl && (
                  <div className={styles.templateCardImage}>
                    <img src={t.coverUrl} alt={t.title} />
                  </div>
                )}
                <div className={styles.templateCardInfo}>
                  <span className={styles.templateCategory}>{t.category}</span>
                  <h3 className={styles.templateTitle}>{t.title}</h3>
                </div>
              </Link>
            ))}
          </div>
          <div className={styles.browseMore}>
            <Link href="/marketplace" className={styles.secondaryBtn}>Browse all styles</Link>
          </div>
        </section>
      )}

      {/* RotatingStyles component */}
      <RotatingStyles templates={templates} />

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© 2025 Alux Art. All rights reserved.</p>
      </footer>
    </div>
  );
}
