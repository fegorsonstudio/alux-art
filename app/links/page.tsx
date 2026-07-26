import type { Metadata, Viewport } from "next";
import styles from "./links.module.css";

export const metadata: Metadata = {
  title: "Alux Art — All our links",
  description: "Turn your selfies into professional photos. Enter the studio, join the academy, and connect with Alux Art.",
  openGraph: {
    title: "Alux Art",
    description: "Your photos, their vision.",
    url: "https://aluxartandframes.shop/links",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Alux Art" }],
    type: "website",
  },
  twitter: { card: "summary", title: "Alux Art", description: "Your photos, their vision." },
};

export const viewport: Viewport = { themeColor: "#0f2529" };

// Inline brand icons (currentColor tint). Keeps the page self-contained — no icon library.
const IconStudio = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
const IconTelegram = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M21.9 4.3 2.9 11.6c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.5c.2.6 1 .8 1.5.3l2.6-2.4 4.7 3.5c.6.4 1.5.1 1.7-.7l3-14.4c.2-.9-.7-1.6-1.6-1.2Zm-13.4 9.8 9-5.5-7.2 6.6-.3 3.1-1.5-4.2Z" />
  </svg>
);
const IconInstagram = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
const IconWhatsApp = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.9-4.5-4.1-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.1.2-.3.3-.1.6.1.3.7 1.1 1.4 1.7.9.8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.1.1.5-.1 1Z" />
  </svg>
);
const IconTikTok = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3 0-2.5-.4-3.5-1.1v5.9a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.7a2.7 2.7 0 1 0 1.9 2.6V3h2.6Z" />
  </svg>
);
const IconEmail = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

type LinkItem = {
  label: string;
  sub?: string;
  href: string;
  icon: React.ReactNode;
  primary?: boolean;
  external?: boolean;
};

// Edit this list to add/change links. `external` opens in a new tab.
// NOTE: Instagram / WhatsApp / TikTok URLs are placeholders — swap in the real
// handle/number once provided.
const LINKS: LinkItem[] = [
  { label: "Enter the Studio", sub: "Book your AI photoshoot", href: "https://aluxartandframes.shop/marketplace", icon: IconStudio, primary: true },
  { label: "Alux Art Academy", sub: "Free daily tutorials on Telegram", href: "https://t.me/AluxArtAcademy", icon: IconTelegram, external: true },
  { label: "Instagram", sub: "@aluxartandframes", href: "https://instagram.com/aluxartandframes", icon: IconInstagram, external: true },
  { label: "WhatsApp", sub: "Chat with us", href: "https://wa.me/2340000000000", icon: IconWhatsApp, external: true },
  { label: "TikTok", sub: "@aluxartandframes", href: "https://tiktok.com/@aluxartandframes", icon: IconTikTok, external: true },
  { label: "Email us", sub: "aluxartandframes@gmail.com", href: "mailto:aluxartandframes@gmail.com", icon: IconEmail },
];

export default function LinksPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.card}>
        <div className={styles.avatarRing}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="Alux Art" className={styles.avatar} />
        </div>
        <h1 className={styles.brand}>Alux Art</h1>
        <p className={styles.tagline}>Your photos, their vision.</p>

        <nav className={styles.links}>
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={`${styles.link}${l.primary ? " " + styles.primary : ""}`}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <span className={styles.icon}>{l.icon}</span>
              <span className={styles.linkText}>
                <span className={styles.linkLabel}>{l.label}</span>
                {l.sub && <span className={styles.linkSub}>{l.sub}</span>}
              </span>
              <span className={styles.chevron} aria-hidden>›</span>
            </a>
          ))}
        </nav>

        <p className={styles.footer}>© {new Date().getFullYear()} Alux Art &amp; Frames</p>
      </div>
    </div>
  );
}
