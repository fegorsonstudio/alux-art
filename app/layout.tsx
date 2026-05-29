import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const GA_ID = "G-QQP2424C0W";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Alux Art",
  description: "AI-powered autonomous photo studio — 10 professional images, no prompts needed.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={outfit.variable}>{children}</body>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}', { page_path: window.location.pathname });
      `}</Script>
      <Script id="ga-errors" strategy="afterInteractive">{`
        window.addEventListener('error', function(e) {
          if (typeof gtag !== 'function') return;
          gtag('event', 'js_error', {
            error_message: (e.message || 'unknown').slice(0, 150),
            error_source:  (e.filename || '').replace(window.location.origin, '').slice(0, 100),
            error_line:    e.lineno || 0,
            page_path:     window.location.pathname,
          });
        });
        window.addEventListener('unhandledrejection', function(e) {
          if (typeof gtag !== 'function') return;
          var msg = e.reason instanceof Error ? e.reason.message : String(e.reason || 'unhandled rejection');
          gtag('event', 'js_error', {
            error_message: msg.slice(0, 150),
            error_source:  'promise',
            page_path:     window.location.pathname,
          });
        });
      `}</Script>
    </html>
  );
}
