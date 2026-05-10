import type { Metadata, Viewport } from "next";

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
      <body>{children}</body>
    </html>
  );
}
