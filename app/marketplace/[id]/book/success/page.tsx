"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import styles from "./success.module.css";
import { Analytics } from "@/lib/analytics";

/**
 * Paystack sends the buyer back here. They do not want a receipt — they want
 * their photos, which are already generating.
 *
 * So this page hands them straight to the gallery instead of asking them to
 * find it. The shoot id is carried through, because "most recent shoot" is not
 * good enough: somebody who books twice in a minute would land on the wrong one.
 *
 * The card below still renders. It is what a buyer sees if the redirect is slow
 * or JavaScript never runs, and it is the only screen carrying the support ref —
 * so it stays useful rather than becoming a flash of dead text.
 */
export default function BookSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shootId = searchParams.get("shoot_id");

  useEffect(() => {
    // Fired before the redirect, or it never fires at all.
    Analytics.paymentCompleted(shootId ?? "unknown", 0);
    if (shootId) router.replace(`/studio?shoot_id=${encodeURIComponent(shootId)}`);
  }, [shootId, router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.heading}>Payment received</h1>
        <p className={styles.body}>
          {shootId
            ? "Taking you to your photos now — they're already being made."
            : "These are high-quality editorial portraits — generation takes up to 60 minutes. Head to your studio to track progress. If your network drops, just refresh the page."}
        </p>
        {shootId && (
          <p className={styles.ref}>Ref: {shootId.slice(0, 8).toUpperCase()}</p>
        )}
        <Link
          href={shootId ? `/studio?shoot_id=${encodeURIComponent(shootId)}` : "/studio"}
          className={styles.btn}
        >
          Open my photos
        </Link>
        <Link href="/marketplace" className={styles.secondaryLink}>Browse more styles</Link>
      </div>
    </div>
  );
}
