import Link from "next/link";
import { createServiceClient } from "@/lib/supabase-server";
import styles from "./landing.module.css";
import RotatingStyles from "./RotatingStyles";

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
      .order("purchase_count", { ascending: false });
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
        <RotatingStyles templates={templates} />
        <div className={styles.looksFooter}>
          <Link href="/marketplace" className={styles.ghostBtn}>Browse all styles →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Alux Art</span>
        <div className={styles.footerLinks}>
          <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
          <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
        </div>
        <span className={styles.footerNote}>© 2026 Alux Art and Frames. All rights reserved.</span>
      </footer>
    </div>
  );
}
