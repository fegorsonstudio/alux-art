"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./success.module.css";

export default function BookSuccessPage() {
  const searchParams = useSearchParams();
  const shootId = searchParams.get("shoot_id");

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1 className={styles.heading}>Payment received</h1>
        <p className={styles.body}>
          Your shoot is being generated. This usually takes a few minutes.
          Head to your workspace to track progress and download your images when ready.
        </p>
        {shootId && (
          <p className={styles.ref}>Ref: {shootId.slice(0, 8).toUpperCase()}</p>
        )}
        <Link href="/" className={styles.btn}>Go to Workspace</Link>
        <Link href="/marketplace" className={styles.secondaryLink}>Browse more styles</Link>
      </div>
    </div>
  );
}
