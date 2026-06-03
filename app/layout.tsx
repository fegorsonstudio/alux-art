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
