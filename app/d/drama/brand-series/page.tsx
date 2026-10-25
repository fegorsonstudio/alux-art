import type { Metadata } from "next";
import Link from "next/link";
import styles from "../drama.module.css";
import DramaShell from "../DramaShell";
import BrandSeriesForm from "./BrandSeriesForm";
import { GENRES } from "@/lib/drama/genres";

/**
 * A brand's own series (/d/drama/brand-series): upload pictures of your products,
 * tell us who you want to reach, and the engine writes a micro drama that puts the
 * products into the story. The brand reads the whole season before anything posts.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your brand's own micro drama — Alux Micro Drama",
  description: "Upload pictures of your products and get a Nigerian micro drama series written around them, with your products in the story.",
};

export default function BrandSeriesPage() {
  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: "/d/drama/partner", label: "Partner", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href="/d/drama/partner" className={styles.back}>← Partner with the story</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>For brands</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>A series built around your products</h1>
        <p className={styles.logline}>
          You don’t need a story. Upload pictures of your products, tell us who you want to reach, and we write a micro drama
          series in which your products do something the story needs — not wallpaper, a part of the plot.
        </p>
        <div className={styles.steps}>
          <div className={styles.step}><div className={styles.stepTitle}>1. Your products</div><div className={styles.stepText}>A clear picture of each one, its name, and a link if it has a page. Up to twelve.</div></div>
          <div className={styles.step}><div className={styles.stepTitle}>2. We read them</div><div className={styles.stepText}>The engine works out what each product is and who buys it, then pitches three stories and writes the strongest as a full season — scenes, dialogue, cast, every episode on every vote road.</div></div>
          <div className={styles.step}><div className={styles.stepTitle}>3. You read it first</div><div className={styles.stepText}>You get the whole season to read, with the production budget. Nothing posts until you approve and pay.</div></div>
          <div className={styles.step}><div className={styles.stepTitle}>4. It runs</div><div className={styles.stepText}>On our page or yours. “Presented by” your brand on every episode, a comment word per product that sends viewers a button to buy, your people in the cast if you want, and every episode’s files to download.</div></div>
        </div>
        <BrandSeriesForm genres={GENRES} />
        <p className={styles.foot}>
          The story always comes first: a product that would not belong in the scene is not placed. We don’t write health, slimming or money-making claims.
        </p>
      </div>
    </DramaShell>
  );
}
