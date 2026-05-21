import Link from "next/link";
import { createServiceClient } from "@/lib/supabase-server";
import styles from "./landing.module.css";

interface FeaturedTemplate {
  id: string;
  title: string;
  coverUrl: string | null;
  category: string;
}

async function getFeaturedTemplates(): Promise<FeaturedTemplate[]> {
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("templates")
      .select("id, title, cover_url, category")
      .eq("is_published", true)
      .order("purchase_count", { ascending: false })
      .limit(3);
    return (data ?? []).map(r => ({
      id: r.id,
      title: r.title,
      coverUrl: r.cover_url ?? null,
      category: r.category,
    }));
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
        <p className={styles.eyebrow}>AI Photo Studio</p>
        <h1 className={styles.headline}>
          Your face.<br />Styled like a magazine.
        </h1>
        <p className={styles.subline}>
          Upload 3 selfies. Choose a style. Get 10 editorial portraits in minutes.
          No photographer. No studio. No prompts.
        </p>
        <div className={styles.heroActions}>
          <Link href="/marketplace" className={styles.primaryBtn}>Browse styles</Link>
          <span className={styles.pricingNote}>Shoots from ₦15,000 · Results in minutes</span>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <h2 className={styles.sectionHeading}>How it works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>01</span>
            <h3 className={styles.stepTitle}>Upload 3 photos</h3>
            <p className={styles.stepDesc}>Clear, front-facing selfies. Our system locks your face, features, and skin tone.</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>02</span>
            <h3 className={styles.stepTitle}>Choose a style</h3>
            <p className={styles.stepDesc}>Pick from editorial, fashion, corporate, or creative looks designed by photographers.</p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>03</span>
            <h3 className={styles.stepTitle}>Download your portraits</h3>
            <p className={styles.stepDesc}>10 images delivered to your studio. Every shot is you — same face, different look.</p>
          </div>
        </div>
      </section>

      {/* Sample looks */}
      <section className={styles.looksSection}>
        <h2 className={styles.sectionHeading}>Current styles</h2>
        <div className={styles.looksGrid}>
          {templates.length > 0 ? templates.map(t => (
            <Link key={t.id} href={`/marketplace/${t.id}`} className={styles.lookCard}>
              {t.coverUrl
                ? <img src={t.coverUrl} alt={t.title} className={styles.lookImg} />
                : <div className={styles.lookPlaceholder} />
              }
              <div className={styles.lookMeta}>
                <span className={styles.lookTitle}>{t.title}</span>
                <span className={styles.lookCategory}>{t.category}</span>
              </div>
            </Link>
          )) : (
            <>
              <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
              <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
              <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
            </>
          )}
        </div>
        <div className={styles.looksFooter}>
          <Link href="/marketplace" className={styles.ghostBtn}>Browse all styles →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Alux Art</span>
        <span className={styles.footerNote}>Built for creators, professionals, and anyone who wants to look like the cover.</span>
      </footer>
    </div>
  );
}
