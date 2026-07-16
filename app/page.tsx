import Link from "next/link";
import { cookies } from "next/headers";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";
import styles from "./landing.module.css";
import RotatingStyles from "./RotatingStyles";
import { LOCALE_COOKIE, DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/dictionaries";

// Reading the locale cookie makes this page per-request (the hourly ISR cache is
// gone) — the featured-templates query is a single indexed SELECT, fine on the VPS.

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
      WHERE status = 'published' AND is_private = false
      ORDER BY purchase_count DESC
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      coverUrl: r.cover_storage_path
        ? r2ProxyUrl(r.cover_bucket ?? "template-images", r.cover_storage_path)
        : null,
      category: r.category,
    }));
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const templates = await getFeaturedTemplates();
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const dict = await getDictionary(locale);
  const h = dict.home;
  const c = dict.common;

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <span className={styles.wordmark}>Alux Art</span>
        <div className={styles.navLinks}>
          <Link href="/marketplace" className={styles.navLink}>{c.browseLooks}</Link>
          <Link href="/login" className={styles.navCta}>{c.signIn}</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <p className={styles.eyebrow}>{h.eyebrow}</p>
        <h1 className={styles.headline}>
          {h.headline1}<br />{h.headline2}
        </h1>
        <p className={styles.subline}>{h.subline}</p>
        <div className={styles.heroActions}>
          <Link href="/marketplace" className={styles.primaryBtn}>{h.browseStyles}</Link>
        </div>
      </section>

      {/* 4K feature callout strip */}
      <section className={styles.featuresStrip}>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>4K</span>
          <span className={styles.featuresBadgeText}>{h.feat4k}</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>10</span>
          <span className={styles.featuresBadgeText}>{h.feat10}</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>1h</span>
          <span className={styles.featuresBadgeText}>{h.feat1h}</span>
        </div>
        <div className={styles.featuresBadge}>
          <span className={styles.featuresBadgeIcon}>AI</span>
          <span className={styles.featuresBadgeText}>{h.featAI}</span>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <h2 className={styles.sectionHeading}>{h.howItWorks}</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>01</span>
            <h3 className={styles.stepTitle}>{h.step1Title}</h3>
            <p className={styles.stepDesc}>{h.step1Desc}</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>02</span>
            <h3 className={styles.stepTitle}>{h.step2Title}</h3>
            <p className={styles.stepDesc}>{h.step2Desc}</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>03</span>
            <h3 className={styles.stepTitle}>{h.step3Title}</h3>
            <p className={styles.stepDesc}>{h.step3Desc}</p>
          </div>
        </div>
      </section>

      {/* Creator earning section */}
      <section className={styles.creatorSection}>
        <div className={styles.creatorInner}>
          <p className={styles.creatorEyebrow}>{h.creatorEyebrow}</p>
          <h2 className={styles.creatorHeading}>{h.creatorHeading}</h2>
          <p className={styles.creatorSub}>{h.creatorSub}</p>
          <div className={styles.creatorSteps}>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>01</span>
              <h3 className={styles.creatorStepTitle}>{h.cStep1Title}</h3>
              <p className={styles.creatorStepDesc}>{h.cStep1Desc}</p>
            </div>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>02</span>
              <h3 className={styles.creatorStepTitle}>{h.cStep2Title}</h3>
              <p className={styles.creatorStepDesc}>{h.cStep2Desc}</p>
            </div>
            <div className={styles.creatorStep}>
              <span className={styles.creatorStepNum}>03</span>
              <h3 className={styles.creatorStepTitle}>{h.cStep3Title}</h3>
              <p className={styles.creatorStepDesc}>{h.cStep3Desc}</p>
            </div>
          </div>
          <Link href="/become-creator" className={styles.creatorCta}>{h.creatorCta}</Link>
        </div>
      </section>

      {/* Featured styles */}
      <section className={styles.looksSection}>
        <h2 className={styles.sectionHeading}>{h.featuredStyles}</h2>
        <RotatingStyles templates={templates} />
        <div className={styles.looksFooter}>
          <Link href="/marketplace" className={styles.ghostBtn}>{h.browseAllStyles}</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Alux Art</span>
        <div className={styles.footerLinks}>
          <Link href="/privacy" className={styles.footerLink}>{c.privacy}</Link>
          <Link href="/terms" className={styles.footerLink}>{c.terms}</Link>
          <Link href="/support" className={styles.footerLink}>{c.support}</Link>
        </div>
        <span className={styles.footerNote}>{c.footerNote}</span>
      </footer>
    </div>
  );
}
