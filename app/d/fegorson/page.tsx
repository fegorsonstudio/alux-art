import type { Metadata } from "next";
import DownloadPage from "./DownloadPage";

/**
 * Fegorson Studio for Windows: the download page the owner shares with
 * friends (/d/fegorson). Under /d/ so nobody is sent to a login page. The
 * app itself runs a 7-day trial, then asks for a licence code bought on
 * WhatsApp (lib/fegorson-licence.ts).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Fegorson Studio for Windows",
  description: "Photo retouching on your own laptop. Free for 7 days, then a one-time licence.",
  robots: { index: false, follow: false },
};

export default function FegorsonPage() {
  return <DownloadPage version="0.32.0" sizeMb={369} sha256="fd93d31d57687bd4bd1b2b853b4af862f8f744fd84cc7f3c0e9989e12822a5cb" />;
}
