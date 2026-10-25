"use client";

import { useState } from "react";
import styles from "./drama.module.css";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/drama/photo-kinds";

/**
 * The two checkouts of the game: play a role (three photos — face, face turned,
 * whole body — that the character sheet is drawn from) or put a brand in a
 * scene (a product picture). Uploads go through the site's normal upload route
 * into identity-images, originals untouched up to 30 MB; paying copies them
 * somewhere that lasts the whole story (lib/drama/character.ts, payments.ts).
 */
type Props =
  | { mode: "cast"; slug: string; role: string; roleName: string; priceLabel: string; admin: boolean; defaultName: string; includes: string }
  | { mode: "brand"; slug: string; episode: number; slot: string; slotLabel: string; priceLabel: string; admin: boolean; defaultName: string; notPlaced: string[]; noClaims: string };

type Picked = { file: File; preview: string };
const MAX = 30 * 1024 * 1024;

async function upload(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", "identity-images");
  const up = await fetch("/api/upload/file", { method: "POST", body: fd });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.storagePath) throw new Error(j.error ?? "The upload did not go through.");
  return j.storagePath as string;
}

export default function CheckoutForm(p: Props) {
  const [name, setName] = useState(p.defaultName);
  const [brand, setBrand] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rulesOk, setRulesOk] = useState(false);
  const [product, setProduct] = useState<Picked | null>(null);
  // What a brand places (owner, 2026-10-25): a product, their place, their music, a flyer.
  const [kind, setKind] = useState<"product" | "location" | "music" | "flyer">("product");
  const [assets, setAssets] = useState<{ file: File; preview: string | null }[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [brief, setBrief] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoKind, Picked>>>({});
  const [agree, setAgree] = useState(false);
  // Real photos first (owner, 2026-10-25): the sheet is their own front and portrait as shot; only the back view is generated.
  const [sheetMode, setSheetMode] = useState<"real" | "ai">("real");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ castId?: string; report?: string } | null>(null);
  // The brand's comment word: suggested from the brand name until they type their own.
  const suggested = brand.toUpperCase().replace(/[^A-Z ]/g, "").split(" ").filter((w) => w.length >= 3)[0]?.slice(0, 14) ?? "";
  const word = (keyword || suggested).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 14);

  const accept = (f: File | null): Picked | null => {
    setError("");
    if (!f) return null;
    // Windows browsers send an iPhone HEIC with no type; the server turns it into a JPEG.
    const heic = /\.(heic|heif)$/i.test(f.name);
    if ((!f.type.startsWith("image/") && !heic) || /svg/.test(f.type)) { setError("Choose a photo (JPEG, PNG or HEIC)."); return null; }
    if (f.size > MAX) { setError("That photo is over 30 MB. Choose a smaller one."); return null; }
    return { file: f, preview: URL.createObjectURL(f) };
  };

  const submit = async () => {
    setError("");
    if (p.mode === "cast") {
      const missing = PHOTO_KINDS.find((k) => !photos[k.kind]);
      if (missing) { setError(`Add the photo: ${missing.label.toLowerCase()}.`); return; }
    } else if (kind === "product" && !product) { setError("Add a picture of your product or logo."); return; }
    else if (kind === "location" && (!assets.length || !placeName.trim())) { setError("Add at least one photo of your place and its name."); return; }
    else if (kind === "music" && (!assets.some((a) => /^(audio\/|video\/mp4)/.test(a.file.type)) || !musicTitle.trim())) { setError("Add your track and its title."); return; }
    else if (kind === "flyer" && !assets.length) { setError("Add your flyer or design."); return; }
    if (p.mode === "brand" && brand.trim().length < 2) { setError("Add your brand name."); return; }
    if (p.mode === "brand" && !/^https:\/\/[^\s.]+\.[^\s]+$/.test(productUrl.trim())) { setError("Add the full link to your product, starting with https://"); return; }
    if (p.mode === "brand" && !/^[A-Z]{3,14}$/.test(word)) { setError("Choose a comment word of 3 to 14 letters, no spaces."); return; }
    if (p.mode === "brand" && !rulesOk) { setError("Tick the box to confirm your product is not on the list we can't place."); return; }
    if (name.trim().length < 2) { setError(p.mode === "cast" ? "Add the name to credit you by." : "Add a contact name."); return; }
    if (!agree) { setError("Tick the box to confirm."); return; }
    try {
      let body: Record<string, unknown>;
      if (p.mode === "cast") {
        const sent: { kind: PhotoKind; path: string }[] = [];
        for (const [i, k] of PHOTO_KINDS.entries()) {
          setBusy(`Sending photo ${i + 1} of ${PHOTO_KINDS.length}…`);
          sent.push({ kind: k.kind, path: await upload(photos[k.kind]!.file) });
        }
        body = { slug: p.slug, role: p.role, displayName: name, photos: sent, sheetMode };
      } else {
        const sentAssets: { bucket: string; path: string; type: string; name: string }[] = [];
        for (const [i, a] of assets.entries()) {
          setBusy(`Sending file ${i + 1} of ${assets.length}…`);
          const fd = new FormData();
          fd.append("file", a.file);
          fd.append("kind", /^(audio\/|video\/mp4)/.test(a.file.type) ? "audio" : a.file.type === "application/pdf" ? "document" : "image");
          const up = await fetch("/api/drama/asset", { method: "POST", body: fd });
          const j = await up.json().catch(() => ({}));
          if (!up.ok) throw new Error(j.error ?? "A file did not go through.");
          sentAssets.push(j);
        }
        setBusy("Sending your picture…");
        body = { slug: p.slug, episode: p.episode, slot: p.slot, brandName: brand, contactName: name, phone,
          productPath: kind === "product" && product ? await upload(product.file) : "", note, productUrl: productUrl.trim(), keyword: word, rulesOk,
          kind, assets: sentAssets, brief, musicTitle, musicArtist, placeName };
      }
      setBusy("Working…");
      const res = await fetch(p.mode === "cast" ? "/api/drama/join" : "/api/drama/reserve", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Something went wrong.");
      if (out.url) { window.location.href = out.url; return; }
      setDone({ castId: typeof out.castId === "string" ? out.castId : undefined, report: typeof out.report === "string" ? out.report : undefined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (done) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>{p.mode === "cast" ? "You're in the cast" : "Your slot is held"}</h2>
        <p className={styles.p}>{p.mode === "cast"
          ? "We're checking your photos and making your character now — it usually takes a few minutes."
          : "Your product goes into the episode by itself. When it posts, the caption credits you and invites viewers to comment your word."}</p>
        <a className={`${styles.btn} ${styles.primary}`} href={p.mode === "cast" && done.castId ? `/d/drama/cast/${done.castId}` : done.report ?? `/d/drama/${p.slug}`}>
          {p.mode === "cast" && done.castId ? "See your character" : done.report ? "Open your report" : "Back to the story"}
        </a>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16 }}>
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Brand name</span>
          <input className={styles.input} value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} placeholder="As it should appear in the credit" />
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{p.mode === "cast" ? "Your name, as credited" : "Contact name"}</span>
        <input className={styles.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Phone (optional)</span>
          <input className={styles.input} value={phone} maxLength={30} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        </label>
      )}
      {p.mode === "cast" && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Your character sheet</span>
          <div className={styles.pkgList} role="radiogroup">
            <label className={styles.pkg}>
              <input type="radio" name="sheetMode" value="real" checked={sheetMode === "real"} onChange={() => setSheetMode("real")} />
              <span><p className={styles.pkgName}>Made from your photos</p><p className={styles.pkgNote}>Your full-length photo and your portrait are the sheet, as shot. Only the view from behind is generated. Real photos make the best sheets — wear what your character would wear.</p></span>
            </label>
            <label className={styles.pkg}>
              <input type="radio" name="sheetMode" value="ai" checked={sheetMode === "ai"} onChange={() => setSheetMode("ai")} />
              <span><p className={styles.pkgName}>Generated from your photos</p><p className={styles.pkgNote}>All three views are drawn from your photos, in the character’s costume.</p></span>
            </label>
          </div>
        </div>
      )}
      {p.mode === "cast" ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Three photos of you</span>
          <p className={styles.sectionNote} style={{ margin: 0 }}>Send the originals from your camera — no filters, no screenshots. They are kept at full quality.{sheetMode === "real" ? " Your whole-body photo and your face photo go on the sheet exactly as you send them: straight on, good light, a plain background if you can." : ""}</p>
          <div className={styles.photoGrid}>
            {PHOTO_KINDS.map((k) => {
              const got = photos[k.kind];
              return (
                <label key={k.kind} className={`${styles.drop} ${styles.photoTile}`}>
                  {got
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={got.preview} alt="" className={styles.photoImg} />
                    : <span className={styles.photoEmpty}>+</span>}
                  <span className={styles.photoLabel}>{k.label}</span>
                  <span className={styles.photoHint}>{k.hint}</span>
                  <input type="file" accept="image/*" hidden onChange={(e) => {
                    const pk = accept(e.target.files?.[0] ?? null);
                    if (pk) setPhotos((cur) => ({ ...cur, [k.kind]: pk }));
                  }} />
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>What are you placing?</span>
            <div className={styles.pkgList} role="radiogroup">
              {([["product", "A product", "A picture of it; it takes the object's place in the scene."],
                 ["location", "My place", "Photos of your restaurant, shop or venue: the scene is set there, with your real photo as its picture."],
                 ["music", "My music", "Your track plays in the episode's soundtrack and is credited."],
                 ["flyer", "A flyer or design", "Your poster, menu or design appears on a phone, a wall or a table in the scene."]] as const).map(([k, title, note]) => (
                <label key={k} className={styles.pkg}>
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); setAssets([]); }} />
                  <span><p className={styles.pkgName}>{title}</p><p className={styles.pkgNote}>{note}</p></span>
                </label>
              ))}
            </div>
          </div>
          {kind === "product" && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Your product or logo</span>
              <label className={styles.drop}>
                {product
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={product.preview} alt="" className={styles.dropImg} />
                  : <span>A clean photo on a plain background works best</span>}
                <input type="file" accept="image/*" hidden onChange={(e) => { const pk = accept(e.target.files?.[0] ?? null); if (pk) setProduct(pk); }} />
              </label>
            </div>
          )}
          {kind === "location" && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>The name of your place</span>
              <input className={styles.input} value={placeName} maxLength={100} placeholder="For example: Ìtàn Kitchen, Lekki" onChange={(e) => setPlaceName(e.target.value)} />
            </label>
          )}
          {kind === "music" && (
            <div className={styles.split}>
              <label className={styles.field}><span className={styles.fieldLabel}>Track title</span><input className={styles.input} value={musicTitle} maxLength={100} onChange={(e) => setMusicTitle(e.target.value)} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Artist</span><input className={styles.input} value={musicArtist} maxLength={100} onChange={(e) => setMusicArtist(e.target.value)} /></label>
            </div>
          )}
          {kind !== "product" && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{kind === "location" ? "Photos of your place (up to 6)" : kind === "music" ? "Your track, and cover art if you like" : "Your flyer or design (PDF or picture)"}</span>
              <label className={styles.drop}>
                <span>{assets.length ? `${assets.length} file${assets.length === 1 ? "" : "s"} chosen` : kind === "music" ? "MP3, M4A, WAV or OGG — the part you want heard, 30 seconds or more" : "Clear, well-lit, no filters"}</span>
                <input type="file" multiple hidden accept={kind === "music" ? "audio/*,image/*" : kind === "flyer" ? "application/pdf,image/*" : "image/*"}
                  onChange={(e) => {
                    const next = Array.from(e.target.files ?? []).slice(0, 6).map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }));
                    setAssets((cur) => [...cur, ...next].slice(0, 8)); e.target.value = "";
                  }} />
              </label>
              {assets.length > 0 && (
                <div className={styles.photoGrid}>
                  {assets.map((a, i) => (
                    <div key={i} className={`${styles.drop} ${styles.photoTile}`} style={{ cursor: "default" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {a.preview ? <img src={a.preview} alt="" className={styles.photoImg} /> : <span className={styles.photoEmpty}>♪</span>}
                      <span className={styles.photoLabel}>{a.file.name.slice(0, 24)}</span>
                      <button type="button" className={styles.chip} style={{ cursor: "pointer", font: "inherit", fontSize: 11 }} onClick={() => setAssets((cur) => cur.filter((_, j) => j !== i))}>remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>How would you like it used? (optional)</span>
            <input className={styles.input} value={brief} maxLength={600} placeholder={kind === "music" ? "For example: playing in the car on the drive home" : kind === "location" ? "For example: the dinner scene happens in our main hall" : "Anything the writers should know"} onChange={(e) => setBrief(e.target.value)} />
          </label>
        </>
      )}
      {p.mode === "brand" && (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Link to your product</span>
            <input className={styles.input} value={productUrl} maxLength={400} inputMode="url" placeholder="https://yourshop.com/the-product" onChange={(e) => setProductUrl(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Your comment word</span>
            <input className={styles.input} value={keyword || suggested} maxLength={14} onChange={(e) => setKeyword(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, ""))} placeholder="WAIST" />
            <span className={styles.sectionNote}>Viewers comment this word under the episode and get a button to your product.</span>
          </label>
          <div className={styles.notice} style={{ margin: 0 }}>
            <span className={styles.fieldLabel} style={{ display: "block", marginBottom: 6 }}>In the caption</span>
            Partner: {brand.trim() || "Your brand"}. Comment {word || "WORD"} to see it.
          </div>
        </>
      )}
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Anything we should know (optional)</span>
          <textarea className={styles.input} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {p.mode === "brand" && (
        <label className={styles.check}>
          <input type="checkbox" checked={rulesOk} onChange={(e) => setRulesOk(e.target.checked)} />
          <span>My product is not one of these, which we don’t place: {p.notPlaced.join("; ")}. {p.noClaims}</span>
        </label>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{p.mode === "cast"
          ? `I am 18 or older, these are photos of me, and Alux may show my character in this story on Instagram and this site. My photos are kept until the story ends.`
          : `I own this brand or have the right to advertise it, and Alux may show it in this episode with a partner credit.`}</span>
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy} onClick={submit}>
        {busy || (p.admin ? "Add it free (admin test)" : `Pay ${p.priceLabel} and ${p.mode === "cast" ? "join" : "reserve"}`)}
      </button>
      <p className={styles.sectionNote}>{p.mode === "cast" ? `Playing ${p.roleName} — ${p.includes}.` : p.slotLabel} Payment by Paystack — card, bank transfer or USSD.</p>
    </div>
  );
}
