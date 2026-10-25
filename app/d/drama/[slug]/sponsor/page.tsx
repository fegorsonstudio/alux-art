import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../drama.module.css";
import DramaShell from "../../DramaShell";
import SponsorForm from "./SponsorForm";
import { badgeFor, dramaPrices, storyBySlug, takenRoles } from "@/lib/drama/data";
import { estimateSeason, fmtNgn, fmtUsd, specForStory, type DramaFormat } from "@/lib/drama/budget";
import { budgetRates } from "@/lib/drama/budget-rates";
import { NOT_PLACED, NO_CLAIMS } from "@/lib/drama/brands";

/**
 * Fund a season (/d/drama/<slug>/sponsor): a sponsor sees the cast, the story
 * arc and what it costs to produce the first season — every paid call, the 50 %
 * retake buffer, and the price with our margin on top (lib/drama/budget.ts) —
 * and asks to fund it. The request lands with the owner (drama_partner_requests
 * + Telegram) who confirms and sends the payment link; paying from this page
 * directly is the next step once the owner approves the Paystack branch.
 *
 * No spoilers: the arc shows episode titles and where each road can go, never
 * the slides of an episode that has not posted.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const story = await storyBySlug((await params).slug);
  if (!story) return { title: "Alux Micro Drama" };
  return { title: `Fund ${story.title} — Alux Micro Drama`, description: `The cast, the story arc and the production budget of ${story.title}.` };
}

const FORMATS: { key: DramaFormat; name: string; note: string }[] = [
  { key: "carousel", name: "Designed carousels", note: "Eight designed slides an episode in the story's look, with a 30-second soundtrack on the cover. How every story posts today." },
  { key: "pictures", name: "Carousels with pictures", note: "The same eight slides, each with a generated picture of the cast in the scene, drawn from their character sheets." },
  { key: "video", name: "Video episodes", note: "A one-minute film an episode, cut from generated clips with the cast's voices. Phase three — the per-second rate is an estimate until the first clip is billed." },
];

const tierName = { lead: "Lead", main: "Main role", cameo: "Cameo" } as const;

export default async function SponsorPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ format?: string }> }) {
  const story = await storyBySlug((await params).slug);
  if (!story) notFound();
  const sp = await searchParams;
  const format: DramaFormat = sp.format === "pictures" || sp.format === "video" ? sp.format : "carousel";
  const [rates, taken, prices] = await Promise.all([budgetRates(), takenRoles([story.id]), dramaPrices()]);
  const spec = specForStory(story, format);
  const budget = estimateSeason(spec, rates);
  const cast = story.content.cast ?? [];
  const episodes = story.content.episodes ?? [];
  const drafts = story.content.drafts ?? [];
  // The arc: every episode number that exists on any road, with its titles (one per road written).
  const arc: { n: number; titles: string[]; finale: boolean }[] = [];
  for (const e of [...episodes, ...drafts]) {
    const row = arc.find((a) => a.n === e.n) ?? (arc.push({ n: e.n, titles: [], finale: false }), arc[arc.length - 1]);
    if (!row.titles.includes(e.title)) row.titles.push(e.title);
    if ((e as { finale?: boolean }).finale) row.finale = true;
  }
  arc.sort((a, b) => a.n - b.n);
  const takenHere = taken.get(story.id) ?? new Set<string>();
  const castFunded = cast.filter((r) => !takenHere.has(r.key)).reduce((s, r) => s + prices[r.tier], 0);

  return (
    <DramaShell dock={[
      { href: "/d/drama", label: "Shelf", icon: "home" },
      { href: `/d/drama/${story.slug}`, label: "Story", icon: "stories" },
      { href: "#budget", label: "Budget", icon: "brands" },
    ]}>
      <div className={styles.formWrap}>
        <Link href={`/d/drama/${story.slug}`} className={styles.back}>← {story.title}</Link>
        <div className={styles.eyebrow} style={{ marginTop: 10 }}>For sponsors · {badgeFor(story)} · {story.city}</div>
        <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 7vw, 44px)" }}>Fund season one of {story.title}</h1>
        <p className={styles.logline}>{story.logline}</p>
        <p className={styles.p}>
          A sponsor pays for the whole first season to be produced. In return: “Presented by” your brand on every cover and in every
          caption, both product spots in every episode, your logo on the last picture of each one, and a report of every comment and tap.
          The story always comes first — your brand has to belong in the scene.
        </p>

        <section className={styles.section} id="cast">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>The cast</h2>
            <span className={styles.sectionNote}>{cast.length} characters · {takenHere.size} already played by fans</span>
          </div>
          <div className={styles.grid}>
            {cast.map((r) => (
              <article key={r.key} className={styles.role}>
                <div className={styles.roleTop}>
                  <div className={styles.avatar} aria-hidden="true">{r.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("")}</div>
                  <div>
                    <p className={styles.roleName}>{r.name}{r.age ? `, ${r.age}` : ""}</p>
                    <p className={styles.roleJob}>{r.role}</p>
                  </div>
                </div>
                <p className={styles.roleLook}>{r.look}</p>
                <div className={styles.tags}>
                  <span className={`${styles.tag} ${styles.tagTier}`}>{tierName[r.tier]}</span>
                  <span className={styles.tag}>{takenHere.has(r.key) ? "Played by a fan" : "Open"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="arc">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>The story arc</h2>
            <span className={styles.sectionNote}>{spec.episodes} episodes · the comments choose the road</span>
          </div>
          <div className={styles.grid}>
            {arc.map((a) => (
              <div key={a.n} className={styles.episode}>
                <div className={styles.epNum}>{a.n}</div>
                <div>
                  <p className={styles.epTitle}>{a.titles.length === 1 ? a.titles[0] : `${a.titles[0]} — or ${a.titles.slice(1).join(", or ")}`}</p>
                  <p className={styles.epNote}>
                    {a.n === 1 ? "Opens the story." : a.titles.length > 1 ? `${a.titles.length} versions written — one for each way the vote can go.` : "Every road meets here."}
                    {a.finale ? " The season finale: its vote decides how season two begins." : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} id="budget">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>What it costs to produce</h2>
            <span className={styles.sectionNote}>Every paid step, counted</span>
          </div>
          <div className={styles.pkgList} role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <Link key={f.key} href={`/d/drama/${story.slug}/sponsor?format=${f.key}#budget`} className={styles.pkg} aria-current={f.key === format ? "true" : undefined}
                style={f.key === format ? { outline: "2px solid currentColor" } : undefined}>
                <span><p className={styles.pkgName}>{f.name}{f.key === format ? " ✓" : ""}</p><p className={styles.pkgNote}>{f.note}</p></span>
              </Link>
            ))}
          </div>
          <div className={styles.panel} style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <tbody>
                {budget.lines.map((l) => (
                  <tr key={l.item}>
                    <td className={styles.p} style={{ padding: "6px 0" }}>{l.item}</td>
                    <td className={styles.p} style={{ padding: "6px 8px", whiteSpace: "nowrap", opacity: 0.7 }}>{+l.qty.toFixed(2)} × {fmtUsd(l.unitUsd)}</td>
                    <td className={styles.p} style={{ padding: "6px 0", textAlign: "right", whiteSpace: "nowrap" }}>{fmtUsd(l.usd)}</td>
                  </tr>
                ))}
                <tr><td colSpan={3} style={{ borderTop: "1px solid currentColor", opacity: 0.2 }} /></tr>
                <tr><td className={styles.p} colSpan={2} style={{ padding: "6px 0" }}>Estimated cost of every paid call</td><td className={styles.p} style={{ textAlign: "right" }}>{fmtUsd(budget.costUsd)}</td></tr>
                <tr><td className={styles.p} colSpan={2} style={{ padding: "6px 0" }}>Retake buffer (+{budget.rates.bufferPct} %) — pictures and clips that must be made again</td><td className={styles.p} style={{ textAlign: "right" }}>{fmtUsd(budget.bufferUsd)}</td></tr>
                <tr><td className={styles.p} colSpan={2} style={{ padding: "6px 0", fontWeight: 600 }}>Production cost</td><td className={styles.p} style={{ textAlign: "right", fontWeight: 600 }}>{fmtUsd(budget.productionUsd)}</td></tr>
                <tr><td className={styles.p} colSpan={2} style={{ padding: "6px 0" }}>Writing, direction, design, sound, posting and the vote machine</td><td className={styles.p} style={{ textAlign: "right" }}>{fmtUsd(budget.profitUsd)}</td></tr>
                <tr>
                  <td className={styles.p} colSpan={2} style={{ padding: "10px 0 4px", fontWeight: 700, fontSize: "1.1em" }}>Season one, presented by you</td>
                  <td style={{ textAlign: "right", padding: "10px 0 4px" }}><span className={styles.price}>{fmtNgn(budget.priceNgn)}</span></td>
                </tr>
              </tbody>
            </table>
            <p className={styles.small} style={{ marginTop: 10 }}>
              About {fmtNgn(budget.perEpisodePriceNgn)} an episode. Priced in naira at ₦{budget.rates.usdNgn} to the dollar; US dollar figures are what the
              models bill us. {castFunded > 0 ? `Roles not yet taken by fans (${fmtNgn(castFunded)} in total) can be left open for fans or cast by you.` : ""}
            </p>
          </div>
        </section>

        <section className={styles.section} id="fund">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Fund it</h2>
            <span className={styles.sectionNote}>We confirm and send the payment link</span>
          </div>
          <SponsorForm story={story.slug} storyTitle={story.title} format={format} formatName={FORMATS.find((f) => f.key === format)?.name ?? format} priceNgn={budget.priceNgn} episodes={spec.episodes} />
          <p className={styles.foot}>
            Every sponsor is credited in the caption. We don’t place {NOT_PLACED.join("; ")}. {NO_CLAIMS}
          </p>
        </section>
      </div>
    </DramaShell>
  );
}
