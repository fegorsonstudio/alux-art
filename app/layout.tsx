import type { Metadata, Viewport } from "next";
import { Outfit, Noto_Sans_Arabic, Noto_Sans_SC } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import ResumeRedirect from "./ResumeRedirect";
import LanguageSelector from "@/components/LanguageSelector";
import InstallAppButton from "@/components/InstallAppButton";
import PwaRegister from "@/components/PwaRegister";
import { LocaleProvider } from "@/lib/useLocale";
import { LOCALE_COOKIE, DEFAULT_LOCALE, dirFor, isLocale, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/dictionaries";

const GA_ID = "G-QQP2424C0W";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "600", "800"],
});

// Script fallbacks so Arabic and Chinese render with proper glyphs (Outfit is
// Latin-only). They join the font-family chain after Outfit via CSS variables.
const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  weight: ["400", "600", "800"],
});
const notoSC = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-sc",
  display: "swap",
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "Alux Art",
  description: "AI-powered autonomous photo studio — 10 professional images, no prompts needed.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Alux Art",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e14",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const dict = await getDictionary(locale);

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className={`${outfit.variable} ${notoArabic.variable} ${notoSC.variable}`}>
        <LocaleProvider initialLocale={locale} initialDict={dict}>
          <ResumeRedirect />
          <PwaRegister />
          <main>{children}</main>
          <LanguageSelector />
          <InstallAppButton />
        </LocaleProvider>
      </body>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}', { page_path: window.location.pathname });
      `}</Script>
      <Script id="ga-errors" strategy="afterInteractive">{`
        function _logError(payload) {
          if (typeof gtag === 'function') {
            gtag('event', 'js_error', {
              error_message: payload.message,
              error_source:  payload.source,
              error_line:    payload.line_number || 0,
              page_path:     payload.page_path,
            });
          }
          fetch('/api/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(function(){});
        }
        window.addEventListener('error', function(e) {
          _logError({
            type:        'js_error',
            message:     (e.message || 'unknown').slice(0, 150),
            source:      (e.filename || '').replace(window.location.origin, '').slice(0, 100),
            line_number: e.lineno || 0,
            page_path:   window.location.pathname,
            user_agent:  navigator.userAgent.slice(0, 200),
          });
        });
        window.addEventListener('unhandledrejection', function(e) {
          var msg = e.reason instanceof Error ? e.reason.message : String(e.reason || 'unhandled rejection');
          _logError({
            type:      'js_error',
            message:   msg.slice(0, 150),
            source:    'promise',
            page_path: window.location.pathname,
            user_agent: navigator.userAgent.slice(0, 200),
          });
        });
      `}</Script>
    </html>
  );
}
