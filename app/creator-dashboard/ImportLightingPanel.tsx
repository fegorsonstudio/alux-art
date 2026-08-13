"use client";

import { useEffect, useState } from "react";

/**
 * "Sell our lighting looks from your own store."
 *
 * The whole offer in one panel: the creator picks a price between the studio's
 * cost and the ceiling, taps once, and gets a link that is theirs. There is no
 * upload, no template to build, and nothing to maintain — which is the point of
 * the offer and so it is what the copy leads with.
 *
 * Two things the panel refuses to hide:
 *   - it will not let them import without bank details, because the payment
 *     split would send them nothing and the studio everything;
 *   - the margin is shown in naira at the price they actually chose, not as a
 *     percentage, so there is no ambiguity about what lands in their account.
 */

interface Offer {
  title: string;
  lookCount: number;
  costNgn: number;
  maxPriceNgn: number;
  marginAtMaxNgn: number;
}
interface Imported { templateId: string; priceNgn: number; status: string; link: string }
interface State { offer: Offer; payoutReady: boolean; imported: Imported | null }

const naira = (n: number) => "₦" + Number(n || 0).toLocaleString();

export default function ImportLightingPanel({ onImported }: { onImported?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [price, setPrice] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // "" = still loading, "none" = not a creator (stay silent), anything else = show it.
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);

  // Why this reports instead of vanishing: the panel used to render null on any
  // failed fetch. The API route then went missing from a deploy for weeks, the
  // fetch 404'd, and every creator saw an empty space where the offer should be
  // — no error, nothing in a console anyone was watching, and no way to tell it
  // apart from "you are not a creator". A feature that fails invisibly is worse
  // than one that fails loudly.
  //
  // 403 is the exception and stays silent: it means the viewer is not a creator,
  // and there is nothing wrong for them to see.
  useEffect(() => {
    let alive = true;
    fetch("/api/creator-dashboard/import-lighting")
      .then(async r => {
        if (!alive) return;
        if (r.status === 403) { setLoadError("none"); return; }
        if (!r.ok) { setLoadError(`The lighting offer could not be loaded (error ${r.status}).`); return; }
        const d = await r.json().catch(() => null);
        if (!d?.offer) { setLoadError("The lighting offer could not be loaded."); return; }
        setState(d);
        setPrice(d.imported?.priceNgn ?? d.offer.maxPriceNgn);
      })
      .catch(() => { if (alive) setLoadError("The lighting offer could not be loaded. Check your connection."); });
    return () => { alive = false; };
  }, []);

  if (!state) {
    if (!loadError || loadError === "none") return null;
    return (
      <section style={{
        border: "1px solid rgba(229,72,77,.4)", borderRadius: 14, padding: "16px 18px",
        margin: "18px 0", fontSize: ".9rem", lineHeight: 1.45,
      }}>
        <strong>Sell our lighting looks from your own store</strong>
        <p style={{ margin: "6px 0 0", opacity: .8 }}>
          {loadError} Nothing is wrong with your account — reload the page, and tell us if it keeps happening.
        </p>
      </section>
    );
  }
  const { offer, payoutReady, imported } = state;
  const margin = Math.max(0, price - offer.costNgn);
  const shareUrl = imported ? `${typeof window !== "undefined" ? window.location.origin : ""}${imported.link}` : "";

  async function submit() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/creator-dashboard/import-lighting", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceNgn: price }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "That didn't work. Try again."); return; }
      setState(s => s ? { ...s, imported: { templateId: d.templateId, priceNgn: d.priceNgn, status: "published", link: d.link } } : s);
      onImported?.();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return (
    <section style={{
      border: "1px solid rgba(67,204,178,.35)", borderRadius: 14, padding: "20px 22px",
      marginBottom: 26, background: "rgba(67,204,178,.06)",
    }}>
      <div style={{ fontSize: ".72rem", letterSpacing: ".16em", textTransform: "uppercase", color: "#43ccb2", fontWeight: 700 }}>
        Earn without shooting
      </div>
      <h3 style={{ margin: "8px 0 6px", fontSize: "1.15rem", fontWeight: 700 }}>
        Sell our {offer.lookCount} lighting looks from your own store.
      </h3>
      <p style={{ margin: 0, opacity: .82, fontSize: ".92rem", lineHeight: 1.5 }}>
        Your customers upload a photo they already took and get it back relit. You do no work:
        no shoot, no editing, no delivery. You keep {naira(offer.marginAtMaxNgn)} on every image.
      </p>

      {!payoutReady && (
        <p style={{
          marginTop: 14, padding: "10px 12px", borderRadius: 9, fontSize: ".88rem",
          background: "rgba(213,122,103,.14)", border: "1px solid rgba(213,122,103,.4)",
        }}>
          Add your bank details above first — that is how we pay you on every sale.
        </p>
      )}

      <div style={{ marginTop: 18 }}>
        <label style={{ display: "block", fontSize: ".84rem", opacity: .8, marginBottom: 8 }}>
          Your price per image
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <input
            type="range" min={offer.costNgn} max={offer.maxPriceNgn} step={50}
            value={price} onChange={e => setPrice(Number(e.target.value))}
            disabled={!payoutReady || busy}
            style={{ flex: "1 1 220px", accentColor: "#43ccb2" }}
          />
          <div style={{ fontSize: "1.35rem", fontWeight: 800, minWidth: 110, fontVariantNumeric: "tabular-nums" }}>
            {naira(price)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 12, fontSize: ".88rem", flexWrap: "wrap" }}>
          <span style={{ opacity: .75 }}>Our cost: <b>{naira(offer.costNgn)}</b></span>
          <span style={{ color: "#43ccb2" }}>You keep: <b>{naira(margin)}</b> per image</span>
        </div>
      </div>

      {error && <p style={{ marginTop: 12, color: "#d57a67", fontSize: ".88rem" }}>{error}</p>}

      <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button" onClick={submit} disabled={!payoutReady || busy}
          style={{
            padding: "11px 20px", borderRadius: 10, border: "none", cursor: payoutReady ? "pointer" : "not-allowed",
            background: payoutReady ? "#43ccb2" : "rgba(127,127,127,.3)", color: "#06150f", fontWeight: 700,
          }}
        >
          {busy ? "Saving…" : imported ? "Update my price" : "Add to my store"}
        </button>
        {imported && <span style={{ fontSize: ".85rem", opacity: .8 }}>Live in your store</span>}
      </div>

      {imported && (
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: ".84rem", opacity: .8, marginBottom: 6 }}>
            Your link — share this anywhere
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              readOnly value={shareUrl}
              onFocus={e => e.currentTarget.select()}
              style={{
                flex: "1 1 260px", padding: "10px 12px", borderRadius: 9, fontSize: ".86rem",
                border: "1px solid rgba(127,127,127,.35)", background: "rgba(0,0,0,.15)", color: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
              style={{
                padding: "10px 16px", borderRadius: 9, cursor: "pointer", fontWeight: 600,
                border: "1px solid rgba(67,204,178,.5)", background: "transparent", color: "inherit",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ marginTop: 8, fontSize: ".82rem", opacity: .7 }}>
            This does not appear in the Alux Art marketplace. It sells only through your link and your store page.
          </p>
        </div>
      )}
    </section>
  );
}
