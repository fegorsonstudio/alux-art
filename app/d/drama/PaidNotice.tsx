"use client";

import { useEffect, useState } from "react";
import styles from "./drama.module.css";

/** After Paystack sends the buyer back (?paid=cast|brand&reference=…): confirm, in plain words. */
export default function PaidNotice({ kind, reference }: { kind: "cast" | "brand"; reference: string }) {
  const [state, setState] = useState<"checking" | "done" | "unpaid" | "mismatch" | "nothing">("checking");
  const [castId, setCastId] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async (tries: number) => {
      const r = await fetch(`/api/drama/payment?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
        .then((x) => x.json()).catch(() => ({ state: "nothing" }));
      if (stop) return;
      if (typeof r.castId === "string") setCastId(r.castId);
      // "nothing" right after paying usually means the webhook got there first — that is a success.
      if (r.state === "unpaid" && tries < 4) { setTimeout(() => check(tries + 1), 3000); return; }
      setState(r.state === "nothing" ? "done" : r.state);
    };
    void check(0);
    return () => { stop = true; };
  }, [reference]);

  const text = {
    checking: "Checking your payment…",
    done: kind === "cast" ? "Payment received — you're in the cast. We're checking your photos and making your character now." : "Payment received — your slot is held. We'll check your picture and place it in the scene.",
    unpaid: "Paystack has not confirmed this payment yet. If money left your account, it will show here within a few minutes.",
    mismatch: "The amount paid did not match the price, so nothing was released. We have been told and will sort it out with you.",
    nothing: "",
  }[state];
  if (!text) return null;
  return (
    <p className={styles.notice} role="status">
      {text}
      {state === "done" && kind === "cast" && castId && <> <a href={`/d/drama/cast/${castId}`}>See your character →</a></>}
    </p>
  );
}
