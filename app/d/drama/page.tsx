import type { Metadata } from "next";
import Link from "next/link";
import styles from "./drama.module.css";
import DramaShell from "./DramaShell";
import { dramaPrices, houseProducts, igLinks, shelfStories, takenRoles, type StoryRow } from "@/lib/drama/data";

/**
 * Alux Micro Drama — the shelf (/d/drama). Under /d/ so anyone arriving from
 * Instagram can browse without signing in. Stories come from drama_stories
 * (tools/drama/stories → scripts/drama-seed.mjs).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Alux Micro Drama",
  description: "Picture dramas set across Nigeria. You decide what happens next — and you can play a role.",
};

const ROWS: { title: string; note: string; genres: string[] }[] = [
  { title: "Power & danger", note: "Boardrooms, bridges, red files", genres: ["power", "political", "thriller", "crime"] },
  { title: "Love & laughter", note: "Weddings, letters, slow burns", genres: ["romance", "romcom"] },
  { title: "Secrets & bloodlines", note: "Wills, rivers, old songs", genres: ["family", "mystery", "supernatural", "period"] },
];
const genreName = (g: string) => (g === "romcom" ? "Romcom" : g[0].toUpperCase() + g.slice(1));
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const coverSrc = (s: StoryRow, w: number) => `/api/drama/cover/${s.slug}?w=${w}&v=${new Date(s.updated_at).getTime()}`;

export default async function DramaShelf() {
  const stories = await shelfStories();
  const taken = await takenRoles(stories.map((s) => s.id));
  const prices = await dramaPrices();
  const openRoles = (s: StoryRow) =>
    s.status === "upcoming" ? (s.content.cast ?? []).filter((r) => r.open && !taken.get(s.id)?.has(r.key)).length : 0;
  const hero = stories[0];
  const upcoming = stories.filter((s) => s.status === "upcoming");
  const house = await houseProducts(stories.flatMap((s) => (s.content.episodes ?? []).map((e) => e.alux?.product)));
  const ig = igLinks(hero?.ig_account ?? "aolivetv");

  const Card = ({ s }: { s: StoryRow }) => {
    const open = openRoles(s);
    return (
      <Link href={`/d/drama/${s.slug}`} className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.cardImg} src={coverSrc(s, 480)} alt={`${s.title} — ${s.tagline}`} loading="lazy" width={480} height={720} />
        <div className={styles.cardMeta}>
          <span>{s.city} · {genreName(s.genre)}</span>
          {open > 0 && <span className={styles.cardOpen}>{open} roles open</span>}
        </div>
      </Link>
    );
  };

  return (
    <DramaShell dock={[
      { href: "#top", label: "Home", icon: "home" },
      { href: "#stories", label: "Stories", icon: "stories" },
      { href: "#play", label: "Play", icon: "join" },
      { href: "#brands", label: "Brands", icon: "brands" },
    ]}>
      {hero && (
        <section className={styles.hero} aria-label="Featured story">
          <div className={styles.heroBack} style={{ backgroundImage: `url(${coverSrc(hero, 480)})` }} />
          <div className={styles.heroInner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.heroPoster} src={coverSrc(hero, 720)} alt={`${hero.title} poster`} width={720} height={1080} />
            <div>
              <div className={styles.eyebrow}>
                {hero.status === "live" ? <span className={styles.live}>Now showing</span> : "Coming soon"} · {hero.city}
              </div>
              <h1 className={styles.heroTitle}>{hero.title}</h1>
              <p className={styles.tagline}>{hero.tagline}</p>
              <p className={styles.logline}>{hero.logline}</p>
              <div className={styles.chips}>
                <span className={styles.chip}>{genreName(hero.genre)}</span>
                <span className={styles.chip}>{(hero.content.cast ?? []).length} characters</span>
                <span className={`${styles.chip} ${styles.chipLive}`}>Your votes decide</span>
              </div>
              <div className={styles.actions}>
                <Link className={`${styles.btn} ${styles.primary}`} href={`/d/drama/${hero.slug}`}>See the story</Link>
                <a className={`${styles.btn} ${styles.quiet}`} href={ig.profile} target="_blank" rel="noopener noreferrer">Follow on Instagram</a>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.section} id="stories">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Coming soon · join the cast</h2>
          <span className={styles.sectionNote}>{upcoming.length} stories</span>
        </div>
        <div className={styles.row}>{upcoming.map((s) => <Card key={s.slug} s={s} />)}</div>
      </section>

      {ROWS.map((r) => {
        const list = stories.filter((s) => r.genres.includes(s.genre));
        if (!list.length) return null;
        return (
          <section className={styles.section} key={r.title}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{r.title}</h2>
              <span className={styles.sectionNote}>{r.note}</span>
            </div>
            <div className={styles.row}>{list.map((s) => <Card key={s.slug} s={s} />)}</div>
          </section>
        );
      })}

      <section className={styles.section} id="play">
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>How it plays</h2></div>
        <div className={styles.panel}>
          <ol className={styles.steps}>
            <li className={styles.step}><div><p className={styles.stepTitle}>Read the episode</p><p className={styles.stepText}>Eight pictures on Instagram, a few words each. It always stops at the worst moment.</p></div></li>
            <li className={styles.step}><div><p className={styles.stepTitle}>Comment one word</p><p className={styles.stepText}>Each episode ends with two choices. Voting closes at 4 p.m. the next day; the word with the most votes decides the next episode.</p></div></li>
            <li className={styles.step}><div><p className={styles.stepTitle}>Play a role</p><p className={styles.stepText}>Send one clear photo and your face plays a character, the same in every episode. From <span className={styles.price}>{naira(prices.cameo)}</span>.</p></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.section} id="brands">
        <div className={styles.split}>
          <div className={styles.panel}>
            <div className={styles.eyebrow}>For brands</div>
            <h2 className={styles.h2} style={{ marginTop: 8 }}>Put your product in the scene</h2>
            <p className={styles.p}>Every episode has a few objects that belong in the story — the water the stranger offers, the phone at one percent, the lace everyone wants. Your product takes that place, and the post credits you as partner. <span className={styles.price}>{naira(prices.slot)}</span> an episode.</p>
            <a className={`${styles.btn} ${styles.primary}`} href="#stories">Choose a story</a>
          </div>
          <div className={styles.panel}>
            <div className={styles.eyebrow}>From Alux</div>
            <h2 className={styles.h2} style={{ marginTop: 8 }}>The looks in these stories</h2>
            <p className={styles.p}>The portraits on the walls and phones in each story are Alux shoots you can book for yourself.</p>
            <div className={styles.chips}>
              {[...house.values()].slice(0, 6).map((p) => (
                <Link key={p.id} href={`/marketplace/${p.id}`} className={styles.chip}>{p.title.split(/[:—]/)[0].trim()} · {naira(p.fromNgn)}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className={styles.foot}>
        Alux Micro Drama · stories set across Nigeria · played on <a href={ig.profile} target="_blank" rel="noopener noreferrer">@{hero?.ig_account ?? "aolivetv"}</a><br />
        Fiction. Any resemblance to real people is a coincidence.
      </p>
    </DramaShell>
  );
}
