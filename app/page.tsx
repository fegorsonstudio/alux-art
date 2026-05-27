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

      {/* 4K feature callout strip */}
      <section className={styles.featuresStrip}>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>4K</span>
          <span className={styles.featuresBadgeText}>4K resolution portraits</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>10</span>
          <span className={styles.featuresBadgeText}>10 images per shoot</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>1h</span>
          <span className={styles.featuresBadgeText}>Ready in about an hour</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>AI</span>
          <span className={styles.featuresBadgeText}>No photographer needed</span>
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

      {/* Creator earning section */}
      <section className={styles.creatorSection}>
        <div className={styles.creatorInner}>
          <p className={styles.creatorEyebrow}>For photographers &amp; stylists</p>
          <h2 className={styles.creatorHeading}>Earn every time someone books your style</h2>
          <p className={styles.creatorSub}>Build a template once. Set your price. Collect earnings on every shoot it powers.</p>
          <div className={styles.creatorSteps}>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>01</span>
              <h3 className={styles.creatorStepTitle}>Build a style template</h3>
              <p className={styles.creatorStepDesc}>Upload outfit references, set the mood, define the visual direction. Your template becomes the blueprint every shoot follows.</p>
            </div>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>02</span>
              <h3 className={styles.creatorStepTitle}>Set your price</h3>
              <p className={styles.creatorStepDesc}>You decide what your style is worth. Your payout is transferred directly to your bank account through Paystack after every successful booking.</p>
            </div>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>03</span>
              <h3 className={styles.creatorStepTitle}>Earn on every booking</h3>
              <p className={styles.creatorStepDesc}>Customers discover your style in the marketplace and book it. No client management, no scheduling — just passive income from your creative work.</p>
            </div>
          </div>
          <Link href="/become-creator" className={styles.creatorCta}>Apply to become a creator →</Link>
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
