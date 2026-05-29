"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import styles from "./success.module.css";
import { Analytics } from "@/lib/analytics";

export default function BookSuccessPage() {
  const searchParams = useSearchParams();
  const shootId = searchParams.get("shoot_id");

  useEffect(() => {
    Analytics.paymentCompleted(shootId ?? "unknown", 0);
  }, [shootId]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.heading}>Payment received</h1>
        <p className={styles.body}>
          These are high-quality editorial portraits — generation takes up to 60 minutes.
          Head to your studio to track progress. If your network drops, just refresh the page.
        </p>
        {shootId && (
          <p className={styles.ref}>Ref: {shootId.slice(0, 8).toUpperCase()}</p>
        )}
        <Link href="/marketplace" className={styles.btn}>Browse more styles</Link>
        <Link href="/studio" className={styles.secondaryLink}>Track progress in Studio</Link>
      </div>
    </div>
  );
}
