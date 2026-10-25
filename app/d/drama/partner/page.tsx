import type { Metadata } from "next";
import Link from "next/link";
import styles from "../drama.module.css";
import DramaShell from "../DramaShell";
import PartnerForm from "./PartnerForm";
import { dramaPrices, shelfStories } from "@/lib/drama/data";
import { NOT_PLACED, NO_CLAIMS } from "@/lib/drama/brands";

/** For companies that want more than one product in a scene. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Partner with Alux Micro Drama",
  description: "Put your brand inside a Nigerian picture drama on Instagram: an episode sponsor, a story partner, or a drama of your own.",
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default async function PartnerPage({ searchParams }: { searchParams: Promise<{ story?: string }> }) {
  const [prices, stories, sp] = await Promise.all([dramaPrices(), shelfStories(), searchParams]);
  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: "/d/drama/partner", label: "Partner", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href="/d/drama" className={styles.back}>← All stories</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>For brands</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>Partner with the story</h1>
        <p className={styles.logline}>
          A product in one scene is {naira(prices.slot)}, and you can reserve it straight from any story page. For something bigger, tell us
          what you have in mind and we’ll reply with a plan and a price.
        </p>
        <PartnerForm
          defaultStory={typeof sp.story === "string" ? sp.story : ""}
          stories={stories.map((s) => ({ slug: s.slug, title: s.title }))}
          packages={[
            { key: "episode_sponsor", name: "Episode sponsor", note: `“Presented by” your brand on the cover and in the caption, both product spots in the episode, your logo on the last picture. ${naira(prices.sponsor)} an episode.` },
            { key: "story_partner", name: "Story partner", note: "Your brand written into the plot for a whole season — a character works there, or a scene happens at your place — your logo on every cover, and one episode built around you. From ₦500,000." },
            { key: "own_drama", name: "A drama of our own", note: "A story made for your brand, for your own Instagram page. Have products but no story? Upload the pictures at /d/drama/brand-series and we write the series around them." },
            { key: "other", name: "Something else", note: "Tell us below." },
          ]}
        />
        <p className={styles.foot}>
          Every partner is credited in the caption. The story always comes first: your brand has to belong in the scene. We don’t place {NOT_PLACED.join("; ")}. {NO_CLAIMS}
        </p>
      </div>
    </DramaShell>
  );
}
