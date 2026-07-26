import type { Metadata, Viewport } from "next";
import styles from "../links/links.module.css";

export const metadata: Metadata = {
  title: "Install the Alux Art app",
  description: "Add Alux Art to your home screen so it opens like a real app — one tap to start your shoots.",
  openGraph: {
    title: "Install the Alux Art app",
    description: "Add Alux Art to your home screen in a few taps.",
    url: "https://aluxartandframes.shop/install",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Alux Art" }],
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0f2529" };

// Phone + download arrow
const IconPhone = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v6m0 0 2.2-2.2M12 13l-2.2-2.2" />
  </svg>
);
const IconBack = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

const IOS_STEPS: React.ReactNode[] = [
  <>Open <b>www.aluxartandframes.shop</b> in <b>Safari</b>.</>,
  <>Tap the <b>Share</b> icon — the little box with an arrow pointing up ⬆️ (bottom of the screen).</>,
  <><b>Scroll down</b> the menu that opens.</>,
  <>Tap <b>&quot;Add to Home Screen&quot;</b>, then <b>Add</b>.</>,
];

const ANDROID_STEPS: React.ReactNode[] = [
  <>Open <b>www.aluxartandframes.shop</b> in <b>Chrome</b>.</>,
  <>Tap the <b>⋮</b> menu (top-right).</>,
  <>Tap <b>&quot;Install app&quot;</b> or <b>&quot;Add to Home screen&quot;</b>.</>,
  <>Confirm — the Alux Art icon lands on your home screen.</>,
];

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <div className={styles.steps}>
      {steps.map((s, i) => (
        <div key={i} className={styles.step}>
          <span className={styles.stepNum}>{i + 1}</span>
          <span className={styles.stepBody}>{s}</span>
        </div>
      ))}
    </div>
  );
}

export default function InstallPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.card}>
        <div className={styles.avatarRing}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="Alux Art" className={styles.avatar} />
        </div>
        <h1 className={styles.brand}>Install Alux Art</h1>
        <p className={styles.tagline}>Add it to your home screen — it opens like a real app. 🚀</p>

        <h2 className={styles.sectionTitle}>{IconPhone} iPhone <span className={styles.platformTag}>Safari</span></h2>
        <Steps steps={IOS_STEPS} />

        <h2 className={`${styles.sectionTitle} ${styles.blockGap}`}>{IconPhone} Android <span className={styles.platformTag}>Chrome</span></h2>
        <Steps steps={ANDROID_STEPS} />

        <div className={`${styles.links} ${styles.blockGap}`}>
          <a href="https://aluxartandframes.shop/marketplace" className={`${styles.link} ${styles.primary}`}>
            <span className={styles.icon}>{IconPhone}</span>
            <span className={styles.linkText}>
              <span className={styles.linkLabel}>Open Alux Art</span>
              <span className={styles.linkSub}>Then follow the steps above</span>
            </span>
            <span className={styles.chevron} aria-hidden>›</span>
          </a>
          <a href="/links" className={`${styles.link} ${styles.backLink}`}>
            <span className={styles.icon}>{IconBack}</span>
            <span className={styles.linkText}>
              <span className={styles.linkLabel}>Back to all links</span>
            </span>
          </a>
        </div>

        <p className={styles.footer}>© {new Date().getFullYear()} Alux Art &amp; Frames</p>
      </div>
    </div>
  );
}
