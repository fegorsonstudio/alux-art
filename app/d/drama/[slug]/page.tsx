import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../drama.module.css";
import DramaShell from "../DramaShell";
import { badgeFor, dramaPrices, houseProducts, igLinks, soldSlots, storyBySlug, takenRoles } from "@/lib/drama/data";

/**
 * One story (/d/drama/<slug>): the poster, the cast and which roles are open,
 * the episodes, the brand slots, and the Alux work that appears in it. No
 * spoilers — an episode's pictures and choice appear on Instagram first.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const story = await storyBySlug((await params).slug);
  if (!story) return { title: "Alux Micro Drama" };
  return {
    title: `${story.title} — Alux Micro Drama`,
    description: story.tagline,
    openGraph: { title: story.title, description: story.tagline, images: [`/api/drama/cover/${story.slug}?w=720`] },
  };
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const initials = (name: string) => name.replace(/[“”"]/g, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
const genreName = (g: string) => (g === "romcom" ? "Romcom" : g[0].toUpperCase() + g.slice(1));
const tierName = { lead: "Lead", main: "Main role", cameo: "Cameo" } as const;
const TITLES = /^(Alhaji|Hajiya|Chief|Barrister|Inspector|Director|Madam|Mama|Malam|Baba|Mrs|Mr|Ms|Dr|Prof)\.?$/i;
/** The name a button can say: "Play Kabiru", not "Play Alhaji". */
const callName = (name: string) => {
  const w = name.replace(/[“”"]/g, "").split(/\s+/).filter(Boolean);
  return w.find((x) => !TITLES.test(x)) ?? w[0] ?? "";
};

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const story = await storyBySlug((await params).slug);
  if (!story) notFound();
  const [taken, sold, prices] = await Promise.all([takenRoles([story.id]), soldSlots(story.id), dramaPrices()]);
  const cast = story.content.cast ?? [];
  const episodes = story.content.episodes ?? [];
  const house = await houseProducts(episodes.map((e) => e.alux?.product));
  const ig = igLinks(story.ig_account);
  const cover = `/api/drama/cover/${story.slug}?v=${new Date(story.updated_at).getTime()}`;
  const castOpen = story.status === "upcoming";
  const priceOf = (tier: "lead" | "main" | "cameo") => prices[tier];

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: "#episodes", label: "Episodes", icon: "stories" },
      { href: "#cast", label: "Cast", icon: "cast" },
      { href: "#brands", label: "Brands", icon: "brands" },
    ]}>
      <Link href="/d/drama" className={styles.back}>← All stories</Link>
      <section className={styles.hero} aria-label={story.title}>
        <div className={styles.heroBack} style={{ backgroundImage: `url(${cover}&w=480)` }} />
        <div className={styles.heroInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroPoster} src={`${cover}&w=720`} alt={`${story.title} poster`} width={720} height={1080} />
          <div>
            <div className={styles.eyebrow}>
              {story.status === "live" ? <span className={styles.live}>Now showing</span> : badgeFor(story)} · {story.city}
            </div>
            <h1 className={styles.heroTitle}>{story.title}</h1>
            <p className={styles.tagline}>{story.tagline}</p>
            <p className={styles.logline}>{story.logline}</p>
            <div className={styles.chips}>
              <span className={styles.chip}>{genreName(story.genre)}</span>
              <span className={styles.chip}>{cast.length} characters</span>
              <span className={`${styles.chip} ${styles.chipLive}`}>{story.min_votes} votes decide each episode</span>
            </div>
            <div className={styles.actions}>
              <a className={`${styles.btn} ${styles.primary}`} href={ig.profile} target="_blank" rel="noopener noreferrer">Follow @{story.ig_account}</a>
              {castOpen && <a className={`${styles.btn} ${styles.quiet}`} href="#cast">Play a role</a>}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="episodes">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Episodes</h2>
          <span className={styles.sectionNote}>Eight pictures each · ends on a choice</span>
        </div>
        <div className={styles.grid}>
          {episodes.map((e) => (
            <div key={e.n} className={styles.episode}>
              <div className={styles.epNum}>{e.n}</div>
              <div>
                <p className={styles.epTitle}>{e.title}</p>
                <p className={styles.epNote}>
                  {story.status === "upcoming" ? `Drops on @${story.ig_account}. Comment a word to decide what happens next.` : `On @${story.ig_account}.`}
                </p>
              </div>
            </div>
          ))}
          <div className={styles.episode} style={{ opacity: 0.6 }}>
            <div className={styles.epNum}>{episodes.length + 1}</div>
            <div><p className={styles.epTitle}>Written by your votes</p><p className={styles.epNote}>Two roads are ready. The comments choose one.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="cast">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>The cast</h2>
          <span className={styles.sectionNote}>{castOpen ? "Open until each character first appears" : "Cast locked"}</span>
        </div>
        <div className={styles.grid}>
          {cast.map((r) => {
            const isTaken = taken.get(story.id)?.has(r.key);
            const canJoin = castOpen && r.open && !isTaken;
            return (
              <article key={r.key} className={styles.role}>
                <div className={styles.roleTop}>
                  <div className={styles.avatar} aria-hidden="true">{initials(r.name)}</div>
                  <div>
                    <p className={styles.roleName}>{r.name}{r.age ? `, ${r.age}` : ""}</p>
                    <p className={styles.roleJob}>{r.role}</p>
                  </div>
                </div>
                <p className={styles.roleLook}>{r.want}</p>
                <div className={styles.tags}>
                  <span className={`${styles.tag} ${styles.tagTier}`}>{tierName[r.tier]}</span>
                  <span className={styles.tag}>{r.archetype}</span>
                </div>
                <div className={styles.roleFoot}>
                  {canJoin ? (
                    <>
                      <span className={styles.price}>{naira(priceOf(r.tier))}</span>
                      <a className={`${styles.btn} ${styles.primary} ${styles.small}`} href={ig.dm} target="_blank" rel="noopener noreferrer">Play {callName(r.name)}</a>
                    </>
                  ) : (
                    <span className={styles.taken}>{isTaken ? "Taken" : "Cast"}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {castOpen && (
          <p className={styles.p} style={{ marginTop: 14 }}>
            To play a role, send one clear, well-lit photo of your face. Our engine draws your character sheet — front, side and full length — so you look the same in every episode.
          </p>
        )}
      </section>

      <section className={styles.section} id="brands">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Your brand in this story</h2>
          <span className={styles.sectionNote}>{naira(prices.slot)} an episode</span>
        </div>
        <ul className={styles.slotList}>
          {episodes.flatMap((e) => (e.slots ?? []).map((s) => {
            const isSold = sold.has(`${e.n}:${s.key}`);
            return (
              <li key={`${e.n}-${s.key}`} className={styles.slot}>
                <div>
                  <p className={styles.slotWhat}>{s.object[0].toUpperCase() + s.object.slice(1)}</p>
                  <p className={styles.slotWhen}>Episode {e.n} · {e.title} · picture {s.slide}</p>
                </div>
                {isSold ? <span className={styles.taken}>Taken</span> : (
                  <a className={`${styles.btn} ${styles.quiet} ${styles.small}`} href={ig.dm} target="_blank" rel="noopener noreferrer">Reserve</a>
                )}
              </li>
            );
          }))}
        </ul>
      </section>

      {episodes.some((e) => house.has(e.alux?.product)) && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>In this story, from Alux</h2></div>
          <div className={styles.grid}>
            {episodes.filter((e) => house.has(e.alux?.product)).map((e) => {
              const p = house.get(e.alux.product)!;
              return (
                <div key={e.n} className={`${styles.panel} ${styles.product}`}>
                  <div>
                    <div className={styles.eyebrow}>Episode {e.n}</div>
                    <p className={styles.epTitle} style={{ marginTop: 6 }}>{p.title.split(/[:—]/)[0].trim()}</p>
                    <p className={styles.epNote}>{e.alux.where.replace(/, slide \d+$/, "")[0].toUpperCase() + e.alux.where.replace(/, slide \d+$/, "").slice(1)}.</p>
                  </div>
                  <Link className={`${styles.btn} ${styles.quiet} ${styles.small}`} href={`/marketplace/${p.id}`}>Book it · {naira(p.fromNgn)}</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className={styles.foot}>Fiction. Any resemblance to real people is a coincidence.</p>
    </DramaShell>
  );
}
