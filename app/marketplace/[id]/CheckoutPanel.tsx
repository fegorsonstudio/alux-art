"use client";

import { useState, useEffect, useRef } from "react";
import { resizeIfNeeded } from "@/lib/resize-image";
import styles from "./checkout-panel.module.css";
import ImagePreview from "@/components/ImagePreview";
import { savePendingCheckout, loadPendingCheckout, clearPendingCheckout, setResumeMarker } from "@/lib/checkout-resume";
import { NURSING_TITLES, INDUCTION_NAME_MAXLEN, INDUCTION_MAX_TITLES, inductionYearRange } from "@/lib/nursing-induction";
import { RECOLOR_PALETTE, RECOLOR_GROUP_TYPES, GROUP_TYPES } from "@/lib/choice-groups";
import { LIGHTING_PRESETS, CAMERA_PRESETS } from "@/lib/gear-equalizer";
import { useT } from "@/lib/useLocale";

// Lighting-style thumbnail. When both a shared "before" original and this style's
// "after" thumbnail exist, it auto-crossfades between them (no tap) so the buyer
// sees what the lighting does. Only "after" → static image. Neither → placeholder.
// The crossfade renders two raw <img> tags, which bypassed the resizing every
// other image in the app goes through: a 56px thumbnail was pulling the full 2K
// original. Measured at 2,198,682 bytes each against 6,212 for the same image at
// thumbnail size — 354x heavier, and this template shows 47 of them at once, so
// the picker was fetching about 103MB to draw 47 postage stamps.
function thumbSrc(url: string, displayWidth: number) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url;
  const sep = url.includes("?") ? "&" : "?";
  // 2x the drawn size for sharpness on high-density screens, capped.
  const w = Math.min(320, Math.round(displayWidth * 2));
  return `${url}${sep}width=${w}&quality=72&format=webp`;
}

/**
 * Big before/after preview, opened by holding a look tile.
 *
 * A drag handle rather than a crossfade: at this size the buyer wants to compare
 * the two states themselves, and a timed fade makes that impossible — you cannot
 * hold both halves in your eye at once. Dragging also works the same with a
 * finger and a mouse.
 */
function LookPreview({ name, beforeUrl, afterUrl, onClose }: {
  name: string; beforeUrl: string | null; afterUrl: string | null; onClose: () => void;
}) {
  const [split, setSplit] = useState(50);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setFromClientX = (clientX: number) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setSplit(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  };

  // 1200px covers the full width of any phone at 2x, and these are 1K originals.
  const big = (u: string | null) => (!u ? null : `${u}${u.includes("?") ? "&" : "?"}width=1200&quality=82&format=webp`);
  const beforeBig = big(beforeUrl), afterBig = big(afterUrl);

  return (
    <div
      role="dialog"
      aria-label={`${name} before and after`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.88)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16,
      }}
    >
      <div
        ref={frameRef}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => { dragging.current = true; setFromClientX(e.clientX); }}
        onPointerMove={e => { if (dragging.current) setFromClientX(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
        style={{
          position: "relative", width: "min(88vw, 460px)", aspectRatio: "3 / 4",
          borderRadius: 12, overflow: "hidden", touchAction: "none", cursor: "ew-resize",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {beforeBig && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beforeBig} alt="before" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {afterBig && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={afterBig}
            alt={name}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
              clipPath: `inset(0 0 0 ${split}%)`,
            }}
          />
        )}
        {beforeBig && afterBig && (
          <>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${split}%`, width: 2, background: "rgba(255,255,255,0.9)", pointerEvents: "none" }} />
            <div style={{
              position: "absolute", top: "50%", left: `${split}%`, transform: "translate(-50%, -50%)",
              width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.95)", color: "#111",
              display: "grid", placeItems: "center", fontSize: "0.8rem", pointerEvents: "none",
            }}>◂▸</div>
            <span style={{ position: "absolute", left: 10, bottom: 10, fontSize: "0.68rem", letterSpacing: "0.08em", color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 7px", borderRadius: 4, pointerEvents: "none" }}>BEFORE</span>
            <span style={{ position: "absolute", right: 10, bottom: 10, fontSize: "0.68rem", letterSpacing: "0.08em", color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 7px", borderRadius: 4, pointerEvents: "none" }}>AFTER</span>
          </>
        )}
      </div>
      <p style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 600, margin: 0, textAlign: "center" }}>{name}</p>
      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.75rem", margin: 0, textAlign: "center" }}>
        Drag to compare · tap anywhere to close
      </p>
    </div>
  );
}

function LightingThumb({ beforeUrl, afterUrl, name, size = 64 }: {
  beforeUrl?: string | null; afterUrl?: string | null; name: string; size?: number;
}) {
  const w = size, h = Math.round(size * 1.25);
  if (afterUrl && beforeUrl) {
    return (
      <span className={styles.laThumb} style={{ width: w, height: h }} title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbSrc(beforeUrl, w)} alt="" className={styles.laBefore} loading="lazy" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbSrc(afterUrl, w)} alt={name} className={styles.laAfter} loading="lazy" decoding="async" />
        <span className={styles.laBadge} aria-hidden>BEFORE / AFTER</span>
      </span>
    );
  }
  if (afterUrl) {
    return <ImagePreview src={afterUrl} alt={name} className={styles.savedImg} preferredWidth={w} />;
  }
  return (
    <span style={{ width: Math.round(w * 0.62), height: Math.round(h * 0.62), display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.55rem", letterSpacing: "0.04em" }}>LIGHT</span>
  );
}

interface TemplateImage {
  id: string;
  url: string | null;
  purpose: string;
  tag?: string;
  customName?: string | null;
  note?: string | null;
  noteHidden?: boolean;
  storagePath: string;
  storageBucket: string;
}

interface TemplateDetail {
  id: string;
  title: string;
  category?: string;
  priceNgn: number;
  price1Ngn?: number | null;
  price5Ngn?: number | null;
  shootMode: string;
  aspectRatio: string;
  images: TemplateImage[];
  // Story fields
  isStory?: boolean;
  storyType?: string | null;
  requiresCostar?: boolean;
  requiresGroup?: boolean;
  requiresBrand?: boolean;
  defaultRole?: string | null;
  roleChips?: string[];
  backgroundOptions?: Array<{
    id: string;
    name: string;
    kind: "photo" | "text";
    description?: string;
    imagePath?: string | null;
    imageUrl?: string | null;
  }>;
  optionGroups?: Array<{
    id: string;
    type: string;
    label: string;
    beforeImageUrl?: string | null;
    beforeImageUrls?: Record<string, string> | null;
    options: Array<{
      id: string;
      name: string;
      kind: "photo" | "text" | "prompt";
      description?: string;
      imagePath?: string | null;
      imageUrl?: string | null;
      framing?: string | null;
    }>;
  }>;
  flagShot?: { enabled: boolean; imageUrl?: string | null } | null;
  trendSlots?: {
    mugshot?: { enabled: boolean; imageUrl?: string | null } | null;
    bowl?: { enabled: boolean; imageUrl?: string | null } | null;
    viral?: { enabled: boolean; imageUrl?: string | null } | null;
    news?: { enabled: boolean; imageUrl?: string | null } | null;
  } | null;
  poseOptions?: Array<{ id: string; name: string; description?: string; imageUrl: string }>;
}

interface CouponResult {
  valid: boolean;
  discountNgn?: number;
  discountDescription?: string;
}

interface SavedIdentityRef {
  id: string;
  name: string;
  storagePath: string;
  storageBucket: string;
  url: string;
}

interface NewIdentityUpload {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  storageBucket: string;
  uploading: boolean;
  error?: string;
}

interface TaggedRefState {
  id: string;
  tag: string;
  customName: string;
  storagePath: string;
  storageBucket: string;
  url: string;
  isReplaced: boolean;
  note: string;
  noteHidden: boolean;
}

interface PoseUpload {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  storageBucket: string;
  uploading: boolean;
  error?: string;
}

interface Props {
  templateId: string;
  template: TemplateDetail;
  initialPkg: 1 | 5 | 10;
  pkgOptions: Array<{ n: 1 | 5 | 10; price: number }>;
  currency: "NGN" | "USD";
  formatPrice: (ngn: number) => string;
  couponCode: string;
  couponResult: CouponResult | null;
  loggedIn: boolean;
  resume?: boolean;
  onClose: () => void;
}

// Collapsible checkout section — keeps the booking page clean: closed sections
// show a one-line summary of what's picked; tap to open and configure.
function Collapse({ icon, title, status, warn, defaultOpen, children }: {
  icon?: string;
  title: string;
  status?: string;
  warn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    // flexShrink 0 is load-bearing: the mobile bottom sheet is a flex column, and
    // without it sections compress to fit the sheet and overflow:hidden CLIPS the
    // content (upload buttons vanished mid-sentence on iPhones).
    <div style={{ border: "1px solid rgba(127,127,127,0.22)", borderRadius: 12, overflow: "hidden", marginBottom: 10, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
          padding: "12px 14px", background: "rgba(127,127,127,0.07)", cursor: "pointer",
          border: "none", textAlign: "left", gap: 8, color: "inherit", font: "inherit",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{icon ? `${icon} ` : ""}{title}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {status && (
            <span style={{ fontSize: "0.72rem", fontWeight: warn ? 700 : 500, opacity: warn ? 1 : 0.65, color: warn ? "#c0392b" : undefined, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status}
            </span>
          )}
          <span style={{ fontSize: "0.75rem", opacity: 0.55 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && <div style={{ padding: "12px 14px 14px" }}>{children}</div>}
    </div>
  );
}

export default function CheckoutPanel({
  templateId,
  template,
  initialPkg,
  pkgOptions,
  currency,
  formatPrice,
  couponCode,
  couponResult,
  loggedIn,
  resume,
  onClose,
}: Props) {
  const [selectedPkg, setSelectedPkg] = useState<1 | 5 | 10>(initialPkg);
  const [shotType, setShotType] = useState<"headshot" | "close_up" | "medium" | "full_body">("close_up");

  // Viral flag shot — offered when the template enables it. Replaces the last image in the package.
  const flagShotAvailable = !!template.flagShot?.enabled;
  const [flagShotOn, setFlagShotOn] = useState(false);
  const [flagText, setFlagText] = useState("");
  const FLAG_TEXT_MAX = 60;

  // Trend slots (Trending category) — optional viral shots, each replaces one image.
  const mugshotAvailable = !!template.trendSlots?.mugshot?.enabled;
  const bowlAvailable = !!template.trendSlots?.bowl?.enabled;
  // Viral chair pose: NOT optional — every booking of this template includes it.
  const viralIncluded = !!template.trendSlots?.viral?.enabled;
  // News broadcast: NOT optional either — the whole image is the news shot. The buyer
  // must type the three lines (headline + caption required; ticker optional).
  const newsIncluded = !!template.trendSlots?.news?.enabled;
  const [mugshotOn, setMugshotOn] = useState(false);
  const [mugshotName, setMugshotName] = useState("");
  const [mugshotOffense, setMugshotOffense] = useState("");
  const [mugshotDate, setMugshotDate] = useState(() =>
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  );
  const [bowlOn, setBowlOn] = useState(false);
  const [bowlMode, setBowlMode] = useState<"product" | "logo">("product");
  const [bowlUpload, setBowlUpload] = useState<NewIdentityUpload | null>(null);
  const [newsHeadline, setNewsHeadline] = useState("");
  const [newsSubtitle, setNewsSubtitle] = useState("");
  const [newsCaption, setNewsCaption] = useState("");

  // Buyer background allocation — active when the template offers 2+ options.
  // Custom slots (flag, mugshot, bowl) don't take part in the backdrop distribution:
  // buyers only place their NORMAL portraits across backdrops.
  const bgOptions = template.backgroundOptions ?? [];
  const bgExemptCount = (flagShotAvailable && flagShotOn ? 1 : 0)
    + (mugshotAvailable && mugshotOn ? 1 : 0)
    + (bowlAvailable && bowlOn ? 1 : 0)
    + (viralIncluded ? 1 : 0)
    + (newsIncluded ? 1 : 0);
  const bgTarget = Math.max(0, selectedPkg - bgExemptCount);
  // photo_upgrade uses its own single-pick backdrop-swap UI, not the allocation picker.
  const bgActive = bgOptions.length >= 2 && bgTarget >= 1 && template.category !== "photo_upgrade";
  const [bgAlloc, setBgAlloc] = useState<Record<string, number>>({});
  // Default UX: one backdrop for the whole shoot. Buyers opt into splitting across backdrops.
  const [bgSplitMode, setBgSplitMode] = useState(false);

  // Buyer choice groups. Single-select groups: pick one, shown at 2+ options.
  // Multi-select groups (props, accessories): pick any number, shown from 1 option.
  // Derived from the shared GROUP_TYPES map so this never drifts from the server flag.
  const MULTI_SELECT_TYPES = new Set(
    Object.entries(GROUP_TYPES).filter(([, m]) => m.multiSelect).map(([k]) => k)
  );
  const choiceGroups = template.optionGroups ?? [];
  // Lighting looks get their own manual-lighting toggle below — never the generic
  // styling pickers — so exclude them from pickable/multi groups.
  const lightingGroups = choiceGroups.filter(g => g.type === "lighting");
  const lightingLooks = lightingGroups.flatMap(g => g.options ?? []).filter(o => o.kind === "prompt");
  // The archive is sold in sections (Lighting, Atmosphere, Dark Romantic...) and
  // each is its own group with its own label. Keep that structure for rendering:
  // a flat list of 69+ looks is a scroll, a labelled one is a shop. lightingLooks
  // above stays flat because the selection logic works on individual looks.
  const lightingSections = lightingGroups
    .map(g => ({ id: g.id, label: g.label, looks: (g.options ?? []).filter(o => o.kind === "prompt") }))
    .filter(s => s.looks.length > 0);
  // Only worth showing headings once there is more than one section.
  const showLightingHeadings = lightingSections.length > 1;
  // Which lighting sections are expanded. Collapsed by default: 193 looks across
  // 13 sections is a very long scroll to get past on a phone, and a buyer should
  // be able to read the section titles and open only the one they want.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (id: string) => setOpenSections(p => ({ ...p, [id]: !p[id] }));
  // A single section needs no disclosure — it is the whole list.
  const sectionOpen = (id: string) => !showLightingHeadings || openSections[id] === true;
  const SectionToggle = ({ id, label, count }: { id: string; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      aria-expanded={sectionOpen(id)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        gap: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", textAlign: "left",
        background: "rgba(127,127,127,0.08)", border: "1px solid rgba(127,127,127,0.22)", borderRadius: 8,
      }}
    >
      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
        {label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({count})</span>
      </span>
      <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>{sectionOpen(id) ? "▲" : "▼"}</span>
    </button>
  );
  // Shared "before" original for the crossfade preview (one per lighting group in
  // practice; take the first that has one).
  const lightingBeforeUrl = lightingGroups.map(g => g.beforeImageUrl).find(Boolean) ?? null;
  // Per-shot-size "before" originals. Each style was previewed on a source of its
  // own framing, so a beauty clamshell crossfades against the head-and-shoulders
  // original and a floor gobo against the full-length one. Without this every
  // style compares against one framing and half the previews look like a mistake.
  const lightingBeforeByFraming = lightingGroups
    .map(g => g.beforeImageUrls)
    .find(m => m && Object.keys(m).length > 0) ?? null;
  const beforeUrlFor = (framing?: string | null) =>
    (framing && lightingBeforeByFraming?.[framing]) || lightingBeforeUrl;

  // Hold a look to see it big. At 56px a thumbnail cannot show whether a look is
  // worth buying, and the crossfade at that size is easy to miss entirely.
  const [lookPreview, setLookPreview] = useState<{ name: string; beforeUrl: string | null; afterUrl: string | null } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const clearPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  /** Press-and-hold props for a look tile. Spread onto the tile's button. */
  const holdToPreview = (o: { id: string; name: string; imageUrl?: string | null; framing?: string | null }) => ({
    onPointerDown: () => {
      longPressFired.current = false;
      clearPress();
      pressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        setLookPreview({ name: o.name, beforeUrl: beforeUrlFor(o.framing) ?? null, afterUrl: o.imageUrl ?? null });
      }, 420);
    },
    onPointerUp: clearPress,
    onPointerLeave: clearPress,
    onPointerCancel: clearPress,
    // Stop iOS showing its own "save image" menu on a long press.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  /** True when the tap was really a hold, so the tile must not also select. */
  const consumedByHold = () => {
    if (!longPressFired.current) return false;
    longPressFired.current = false;
    return true;
  };
  const pickableGroups = choiceGroups.filter(g => g.type !== "lighting" && !MULTI_SELECT_TYPES.has(g.type) && (g.options?.length ?? 0) >= 2);
  const multiGroups = choiceGroups.filter(g => g.type !== "lighting" && MULTI_SELECT_TYPES.has(g.type) && (g.options?.length ?? 0) >= 1);
  const [groupPicks, setGroupPicks] = useState<Record<string, string>>({});
  const [multiPicks, setMultiPicks] = useState<Record<string, string[]>>({});
  // Manual lighting toggle: off by default. Regular templates → AI describes
  // lighting (on = buyer ticks looks, spread across images). photo_upgrade → the
  // existing single rig (on = a creator lighting look assigned per source photo).
  const [manualLighting, setManualLighting] = useState(false);
  const [lightingPicks, setLightingPicks] = useState<string[]>([]);
  // photo_upgrade per-photo lighting: source photo storagePath → lighting optionId.
  const [lightingByPhoto, setLightingByPhoto] = useState<Record<string, string>>({});
  // A look chosen before any photo is uploaded, applied to every photo as it
  // arrives. Without this the picker showed 193 dimmed, unclickable thumbnails
  // until photos existed, which reads as broken rather than as "upload first" —
  // and it forced the buyer to assign every photo one at a time even when they
  // wanted the same look on all of them.
  const [defaultLighting, setDefaultLighting] = useState<string | null>(null);
  // Photo upgrades act on the buyer's own photograph, so the output shape is
  // theirs: forcing the template ratio re-crops a picture they already framed.
  const [upgradeAspect, setUpgradeAspect] = useState<string>(template.aspectRatio ?? "4:5");
  // Optional garment recolor per outfit/scrubs group (fixed palette, validated server-side).
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});

  // Nursing induction personalization — name (the only typed field), credential
  // titles (tap-to-toggle, order preserved), and a dynamic CLASS OF year.
  const inductionActive = template.category === "nursing_induction";
  const [inductionName, setInductionName] = useState("");
  const [inductionTitles, setInductionTitles] = useState<string[]>([]);
  const [inductionYear, setInductionYear] = useState<number>(() => new Date().getFullYear());
  // Graduation cap opt-out — defaults ON to match the template's existing
  // designed look; buyers who never touch this get identical behavior to
  // before this control existed.
  const [inductionCap, setInductionCap] = useState<"grad" | "none">("grad");
  const inductionYears = inductionYearRange();

  // Gear Equalizer (photo_upgrade) — the buyer's uploads ARE the photos to upgrade;
  // they tap one lighting rig + one camera look, and optionally swap the background.
  const photoUpgradeActive = template.category === "photo_upgrade";
  const t = useT("checkout");
  const tc = useT("common");
  // Plural-aware "image(s)" word used inside interpolated sentences.
  const imagesWord = (n: number) => (n === 1 ? t("imageOne") : t("imageMany"));
  const [enhanceLighting, setEnhanceLighting] = useState<string | null>(null);
  const [enhanceCamera, setEnhanceCamera] = useState<string | null>(null);
  const [enhanceBackdrop, setEnhanceBackdrop] = useState<string | null>(null); // null = keep own background

  // Buyer opt-out of smile slots — the planner keeps every photo closed-lips.
  const [noSmile, setNoSmile] = useState(false);

  // Signature poses (creator-uploaded pose mimicry) — NOT buyer-chosen. The
  // planner randomly picks a distinct pose per portrait slot server-side at
  // booking time (lib/pose-options.ts pickRandomPoseOptions); nothing to
  // render or send here.

  const [savedRefs, setSavedRefs] = useState<SavedIdentityRef[]>([]);
  const [selectedSaved, setSelectedSaved] = useState<Set<string>>(new Set());
  const [newUploads, setNewUploads] = useState<NewIdentityUpload[]>([]);
  const [clearing, setClearing] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const didRestore = useRef(false);
  // Return to this template in resume mode after Google sign-in. Belt-and-suspenders:
  // ?resume=1 rides the OAuth `next` (works when next survives), and a cookie+localStorage
  // marker (set in goSignIn) covers the case where next is dropped to the home page.
  const loginUrl = `/login?next=${encodeURIComponent(`/marketplace/${templateId}?resume=1`)}`;
  const signedOut = !loggedIn || needsLogin;

  const [poseUploads, setPoseUploads] = useState<PoseUpload[]>([]);
  const [taggedRefs, setTaggedRefs] = useState<TaggedRefState[]>([]);
  const [replacingTag, setReplacingTag] = useState<string | null>(null);
  const [addingRef, setAddingRef] = useState(false);
  const [addRefTag, setAddRefTag] = useState("OUTFIT");
  const [addRefNote, setAddRefNote] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  // Story state
  const [rolePrompt, setRolePrompt] = useState("");
  const [costarUploads, setCostarUploads] = useState<NewIdentityUpload[]>([]);
  const [costarConsent, setCostarConsent] = useState(false);
  const [groupPhotoUpload, setGroupPhotoUpload] = useState<NewIdentityUpload | null>(null);
  const [brandUploads, setBrandUploads] = useState<NewIdentityUpload[]>([]);
  const [brandPlacement, setBrandPlacement] = useState<"everywhere" | "background" | "subtle">("everywhere");

  const identityInputRef = useRef<HTMLInputElement>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addRefInputRef = useRef<HTMLInputElement>(null);
  const costarInputRef = useRef<HTMLInputElement>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);


  // Load saved identity refs + init tagged refs from template
  useEffect(() => {
    fetch("/api/user/identity-refs")
      .then(r => {
        if (r.status === 401) { setNeedsLogin(true); return { refs: [] }; }
        setNeedsLogin(false);
        return r.ok ? r.json() : { refs: [] };
      })
      .then(d => {
        if (d.refs?.length) {
          setSavedRefs(d.refs);
        }
      })
      .catch(() => {});

    // Background-option and choice-group images travel via their selections,
    // not as tagged refs — exclude them from the customizable reference list.
    const bgOptionPaths = new Set([
      ...((template.backgroundOptions ?? []).length >= 2
        ? (template.backgroundOptions ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)
        : []),
      ...(template.optionGroups ?? []).flatMap(g => (g.options ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)),
    ]);
    // CO_STAR photos are template-locked (the story's second character) — attached
    // server-side at booking, never shown as a replaceable buyer reference.
    const tagged = (template.images ?? []).filter(img => img.purpose === "tagged" && img.tag && img.tag !== "FLAG_SCENE" && img.tag !== "CO_STAR" && !bgOptionPaths.has(img.storagePath));
    setTaggedRefs(tagged.map(img => ({
      id: img.id,
      tag: img.tag!,
      customName: img.customName || img.tag!,
      storagePath: img.storagePath,
      storageBucket: img.storageBucket,
      url: img.url ?? "",
      isReplaced: false,
      note: img.noteHidden ? "" : (img.note ?? ""),
      noteHidden: img.noteHidden ?? false,
    })));
  }, [template]);

  // Default allocation: everything on the first background option.
  // Held until a resume restore (if any) resolves, and skipped when we restored a saved config.
  useEffect(() => {
    if (!defaultsReady) return;
    if (!bgActive) return;
    // In single-backdrop mode, keep ALL images on the currently chosen backdrop (or the
    // first) and follow bgTarget as it changes (flag toggle / package change). This also
    // runs after a resume restore to reconcile the restored selection with bgTarget.
    if (!bgSplitMode) {
      setBgAlloc(prev => {
        const selectedId = Object.keys(prev).find(id => (prev[id] ?? 0) > 0) ?? bgOptions[0]?.id;
        if (!selectedId) return prev;
        return { [selectedId]: bgTarget };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgActive, selectedPkg, template, defaultsReady, bgTarget, bgSplitMode]);

  // No default group picks — every group is opt-in so buyers only get what fits
  // them (e.g. a man skips Hair/Nails on a unisex template).

  // Resume an in-progress checkout after Google sign-in: restore choices + re-upload
  // the photos the buyer had picked, then continue straight to payment.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!loggedIn || !resume) { setDefaultsReady(true); return; }
      const pending = await loadPendingCheckout(templateId);
      if (cancelled) return;
      if (!pending) { setDefaultsReady(true); return; }
      didRestore.current = true;
      const c = pending.config;
      if ([1, 5, 10].includes(c.selectedPkg)) setSelectedPkg(c.selectedPkg);
      if (c.shotType) setShotType(c.shotType as typeof shotType);
      setFlagShotOn(!!c.flagShotOn);
      setFlagText(c.flagText ?? "");
      if (c.groupPicks) setGroupPicks(c.groupPicks);
      if (c.multiPicks) setMultiPicks(c.multiPicks);
      if (typeof c.bgSplitMode === "boolean") setBgSplitMode(c.bgSplitMode);
      if (c.bgAlloc) setBgAlloc(c.bgAlloc);
      setRolePrompt(c.rolePrompt ?? "");
      if (c.brandPlacement) setBrandPlacement(c.brandPlacement as typeof brandPlacement);
      // Trend slots
      setMugshotOn(!!c.mugshotOn);
      if (c.mugshotName) setMugshotName(c.mugshotName);
      if (c.mugshotOffense) setMugshotOffense(c.mugshotOffense);
      if (c.mugshotDate) setMugshotDate(c.mugshotDate);
      if (c.newsHeadline) setNewsHeadline(c.newsHeadline);
      if (c.newsSubtitle) setNewsSubtitle(c.newsSubtitle);
      if (c.newsCaption) setNewsCaption(c.newsCaption);
      setBowlOn(!!c.bowlOn);
      if (c.bowlMode === "product" || c.bowlMode === "logo") setBowlMode(c.bowlMode);
      if (c.groupColors) setGroupColors(c.groupColors);
      if (c.inductionName) setInductionName(c.inductionName);
      if (Array.isArray(c.inductionTitles)) setInductionTitles(c.inductionTitles);
      if (typeof c.inductionYear === "number") setInductionYear(c.inductionYear);
      if (c.inductionCap === "none" || c.inductionCap === "grad") setInductionCap(c.inductionCap);
      if (c.enhanceLighting) setEnhanceLighting(c.enhanceLighting);
      if (c.enhanceCamera) setEnhanceCamera(c.enhanceCamera);
      if (c.enhanceBackdrop) setEnhanceBackdrop(c.enhanceBackdrop);
      if (c.manualLighting) setManualLighting(true);
      if (Array.isArray(c.lightingPicks)) setLightingPicks(c.lightingPicks);
      if (c.lightingByPhoto) setLightingByPhoto(c.lightingByPhoto);
      setNoSmile(!!c.noSmile);
      if (pending.files?.length) {
        const items: NewIdentityUpload[] = pending.files.map(f => {
          const file = new File([f.blob], f.name, { type: f.type || "image/jpeg" });
          return { localId: crypto.randomUUID(), file, preview: URL.createObjectURL(f.blob), storagePath: "", storageBucket: "identity-images", uploading: true };
        });
        setNewUploads(prev => [...prev, ...items]);
        items.forEach(u => uploadIdentityFile(u.file, u.localId));
      }
      if (pending.bowlFile) {
        const bf = pending.bowlFile;
        const file = new File([bf.blob], bf.name, { type: bf.type || "image/jpeg" });
        const item: NewIdentityUpload = { localId: crypto.randomUUID(), file, preview: URL.createObjectURL(bf.blob), storagePath: "", storageBucket: "identity-images", uploading: true };
        setBowlUpload(item);
        uploadBowlFile(file, item.localId);
      }
      await clearPendingCheckout(templateId);
      setDefaultsReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, resume, templateId]);

  // Background allocation stays fully placed (sums to the package size) at all times.
  // Clicking + on a background pulls one image from whichever OTHER background currently
  // has the most — so "click + five times on the one I like" just moves them all there,
  // without the buyer having to first click − on the default background.
  const addImageToBg = (optionId: string) => {
    setBgAlloc(prev => {
      const cur = prev[optionId] ?? 0;
      if (cur >= bgTarget) return prev; // already holds every image
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      const next = { ...prev, [optionId]: cur + 1 };
      if (total >= bgTarget) {
        // Pull one from the largest other background
        let donor: string | null = null;
        let max = 0;
        for (const [id, c] of Object.entries(prev)) {
          if (id === optionId) continue;
          if ((c ?? 0) > max) { max = c ?? 0; donor = id; }
        }
        if (!donor) return prev;
        next[donor] = (next[donor] ?? 0) - 1;
      }
      return next;
    });
  };
  const removeImageFromBg = (optionId: string) => {
    setBgAlloc(prev => {
      const cur = prev[optionId] ?? 0;
      if (cur <= 0) return prev;
      return { ...prev, [optionId]: cur - 1 };
    });
  };

  // ── Identity uploads ──────────────────────────────────────────────────────

  const uploadIdentityFile = async (file: File, localId: string) => {
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      if (res.status === 401) setNeedsLogin(true);
      const msg = res.status === 401 ? tc("signInFirst") : tc("uploadFailed");
      setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: msg } : u));
      return;
    }
    const { storagePath } = await res.json();
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addIdentityFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 10 - newUploads.length);
    const items: NewIdentityUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      storagePath: "",
      storageBucket: "identity-images",
      uploading: false,
    }));
    setNewUploads(prev => [...prev, ...items]);
    // Signed out: keep the photos staged locally (no upload yet). They're preserved
    // across sign-in and uploaded automatically on return. Signed in: upload now.
    if (!signedOut) items.forEach(u => uploadIdentityFile(u.file, u.localId));
  };

  const clearIdentityImages = async () => {
    if (!confirm(tc("confirmDeleteSaved"))) return;
    setClearing(true);
    await fetch("/api/user/identity-refs", { method: "DELETE" });
    setSavedRefs([]);
    setSelectedSaved(new Set());
    setClearing(false);
  };

  // ── Pose uploads ──────────────────────────────────────────────────────────

  const uploadPoseFile = async (file: File, localId: string) => {
    setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: tc("uploadFailed") } : u));
      return;
    }
    const { storagePath } = await res.json();
    setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addPoseFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 10 - poseUploads.length);
    const items: PoseUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      storagePath: "",
      storageBucket: "identity-images",
      uploading: false,
    }));
    setPoseUploads(prev => [...prev, ...items]);
    items.forEach(u => uploadPoseFile(u.file, u.localId));
  };

  // ── Tagged ref replace ────────────────────────────────────────────────────

  const startReplace = (tagId: string) => {
    setReplacingTag(tagId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (file: File) => {
    if (!replacingTag) return;
    const localPreview = URL.createObjectURL(file);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) { setReplacingTag(null); return; }
    const { storagePath } = await res.json();
    setTaggedRefs(prev => prev.map(r => r.id === replacingTag
      ? { ...r, storagePath, storageBucket: "identity-images", url: localPreview, isReplaced: true }
      : r
    ));
    setReplacingTag(null);
  };

  // ── Story: co-star uploads ────────────────────────────────────────────────

  const uploadCostarFile = async (file: File, localId: string) => {
    setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: tc("uploadFailed") } : u));
      return;
    }
    const { storagePath } = await res.json();
    setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addCostarFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 5 - costarUploads.length);
    const items: NewIdentityUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    }));
    setCostarUploads(prev => [...prev, ...items]);
    items.forEach(u => uploadCostarFile(u.file, u.localId));
  };

  // ── Story: group photo ────────────────────────────────────────────────────

  const uploadGroupPhotoFile = async (file: File, localId: string) => {
    setGroupPhotoUpload(prev => prev ? { ...prev, uploading: true } : prev);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, error: tc("uploadFailed") } : prev);
      return;
    }
    const { storagePath } = await res.json();
    setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, storagePath, storageBucket: "identity-images" } : prev);
  };

  const setGroupPhotoFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setGroupPhotoUpload(item);
    uploadGroupPhotoFile(file, item.localId);
  };

  // ── Trend slot: bowl content (product photo or logo) ─────────────────────────
  const uploadBowlFile = async (file: File, localId: string) => {
    setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: true } : prev);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      if (res.status === 401) setNeedsLogin(true);
      setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: false, error: res.status === 401 ? tc("signInFirst") : tc("uploadFailed") } : prev);
      return;
    }
    const { storagePath } = await res.json();
    setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: false, storagePath, storageBucket: "identity-images" } : prev);
  };

  const setBowlFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setBowlUpload(item);
    // Signed out: stage locally (preserved across sign-in). Signed in: upload now.
    if (!signedOut) uploadBowlFile(file, item.localId);
  };

  // ── Story: brand / logo upload ────────────────────────────────────────────

  const uploadBrandFile = async (file: File, localId: string) => {
    setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: tc("uploadFailed") } : u));
      return;
    }
    const { storagePath } = await res.json();
    setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addBrandFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setBrandUploads([item]);
    uploadBrandFile(file, item.localId);
  };

  // ── Add custom reference ──────────────────────────────────────────────────

  const handleAddRefFile = async (file: File) => {
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) { setAddingRef(false); return; }
    const { storagePath } = await res.json();
    setTaggedRefs(prev => [...prev, {
      id: crypto.randomUUID(),
      tag: addRefTag,
      customName: addRefTag,
      storagePath,
      storageBucket: "identity-images",
      url: URL.createObjectURL(file),
      isReplaced: true,
      note: addRefNote.trim(),
      noteHidden: false,
    }]);
    setAddingRef(false);
    setAddRefNote("");
  };

  // ── Pay ───────────────────────────────────────────────────────────────────

  const allIdentityRefs = [
    ...Array.from(selectedSaved).map(sid => {
      const ref = savedRefs.find(r => r.id === sid)!;
      return { name: ref.name, storageBucket: ref.storageBucket, storagePath: ref.storagePath };
    }),
    ...newUploads.filter(u => u.storagePath).map(u => ({
      name: u.file.name, type: u.file.type, size: u.file.size,
      storageBucket: u.storageBucket, storagePath: u.storagePath,
    })),
  ];

  // photo_upgrade: the buyer's uploaded source photos (storagePath + a preview to
  // show beside each per-photo lighting picker). Same order/paths as allIdentityRefs.
  const sourcePhotos: Array<{ storagePath: string; preview: string }> = photoUpgradeActive
    ? [
        ...Array.from(selectedSaved).map(sid => {
          const r = savedRefs.find(x => x.id === sid)!;
          return { storagePath: r.storagePath, preview: r.url };
        }),
        ...newUploads.filter(u => u.storagePath).map(u => ({ storagePath: u.storagePath, preview: u.preview })),
      ]
    : [];

  // Apply the look chosen before uploading to every photo that has no look of
  // its own, including photos added later. A per-photo choice always wins, so
  // picking one look for everything and then changing a single photo works.
  const photoPathsKey = sourcePhotos.map(p => p.storagePath).join("|");
  useEffect(() => {
    if (!defaultLighting || !photoPathsKey) return;
    setLightingByPhoto(prev => {
      let changed = false;
      const next = { ...prev };
      for (const path of photoPathsKey.split("|")) {
        if (path && !next[path]) { next[path] = defaultLighting; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [defaultLighting, photoPathsKey]);

  const anyUploading = newUploads.some(u => u.uploading) || poseUploads.some(u => u.uploading)
    || costarUploads.some(u => u.uploading) || !!groupPhotoUpload?.uploading || brandUploads.some(u => u.uploading);
  const bgAllocTotal = Object.values(bgAlloc).reduce((a, b) => a + b, 0);
  const bgValid = !bgActive || bgAllocTotal === bgTarget;
  const flagValid = !flagShotOn || flagText.trim().length > 0;
  const mugshotValid = !mugshotOn || (mugshotName.trim().length > 0 && mugshotOffense.trim().length > 0);
  const bowlValid = !bowlOn || (signedOut ? !!bowlUpload : !!bowlUpload?.storagePath);
  // News shot is forced-on: the headline and caption are required (ticker optional).
  const newsValid = !newsIncluded || (newsHeadline.trim().length > 0 && newsCaption.trim().length > 0);
  const inductionValid = !inductionActive || inductionName.trim().length > 0;
  // photo_upgrade manual lighting on = a creator look must be assigned to EVERY
  // uploaded photo; off = the single hardcoded rig must be picked (today's rule).
  const perPhotoLightingActive = photoUpgradeActive && manualLighting && lightingLooks.length > 0;
  const enhanceLightingValid = perPhotoLightingActive
    ? sourcePhotos.length > 0 && sourcePhotos.every(p => !!lightingByPhoto[p.storagePath])
    : !!enhanceLighting;
  // Photo upgrades are priced per image: the buyer brings however many photos
  // they have (1-10) and pays the single-image price for each, rather than being
  // forced into a 1/5/10 package and made to upload exactly that many.
  const perImagePricing = photoUpgradeActive;
  const unitPriceNgn = pkgOptions.find(o => o.n === 1)?.price ?? 0;
  const uploadedCount = Math.min(10, allIdentityRefs.length);
  const effectivePkg = perImagePricing ? Math.max(1, uploadedCount) : selectedPkg;
  // In per-image mode any count from 1 to 10 is correct, so the counter must not
  // read as an error just because it does not equal a package size.
  const uploadCountBad = perImagePricing
    ? (allIdentityRefs.length < 1 || allIdentityRefs.length > 10)
    : (photoUpgradeActive ? allIdentityRefs.length !== selectedPkg : allIdentityRefs.length === 0);
  const enhanceValid = !photoUpgradeActive
    || (enhanceLightingValid && !!enhanceCamera && uploadedCount >= 1 && uploadedCount <= 10);
  const canPay = allIdentityRefs.length > 0
    && !anyUploading
    && !newUploads.some(u => u.error)
    && !buying
    && bgValid
    && flagValid
    && mugshotValid
    && bowlValid
    && newsValid
    && inductionValid
    && enhanceValid
    && !bowlUpload?.uploading
    && (!template.requiresCostar || (costarUploads.some(u => u.storagePath) && costarConsent))
    && (!template.requiresGroup || !!groupPhotoUpload?.storagePath)
    && (!template.requiresBrand || brandUploads.some(u => u.storagePath));

  // Signed-out buyer: stash their config + picked photos, then go to Google sign-in.
  // They return to this same checkout (resume mode) with everything restored.
  const goSignIn = async () => {
    setResuming(true);
    const config = {
      selectedPkg, shotType, flagShotOn, flagText, groupPicks, multiPicks, bgAlloc, bgSplitMode, rolePrompt, brandPlacement,
      mugshotOn, mugshotName, mugshotOffense, mugshotDate, bowlOn, bowlMode,
      newsHeadline, newsSubtitle, newsCaption,
      groupColors, inductionName, inductionTitles, inductionYear, inductionCap,
      enhanceLighting: enhanceLighting ?? undefined,
      enhanceCamera: enhanceCamera ?? undefined,
      enhanceBackdrop: enhanceBackdrop ?? undefined,
      manualLighting: manualLighting || undefined,
      lightingPicks: lightingPicks.length > 0 ? lightingPicks : undefined,
      lightingByPhoto: Object.keys(lightingByPhoto).length > 0 ? lightingByPhoto : undefined,
      noSmile: noSmile || undefined,
    };
    const files = newUploads
      .filter(u => u.file)
      .map(u => ({ name: u.file.name, type: u.file.type || "image/jpeg", blob: u.file as Blob }));
    const bowlFile = bowlUpload?.file
      ? { name: bowlUpload.file.name, type: bowlUpload.file.type || "image/jpeg", blob: bowlUpload.file as Blob }
      : null;
    await savePendingCheckout(templateId, config, files, bowlFile);
    // Marker (cookie + localStorage) drives the post-login redirect back here even if the
    // OAuth `next` is dropped to the home page.
    setResumeMarker(templateId);
    window.location.href = loginUrl;
  };

  const book = async () => {
    if (!canPay) return;
    setBuying(true);
    setError("");
    const storyAssets = template.isStory ? {
      costarRefs: costarUploads.filter(u => u.storagePath).map(u => ({
        name: u.file.name, storageBucket: u.storageBucket, storagePath: u.storagePath,
      })),
      groupPhotoRef: groupPhotoUpload?.storagePath ? {
        name: groupPhotoUpload.file.name, storageBucket: groupPhotoUpload.storageBucket, storagePath: groupPhotoUpload.storagePath,
      } : undefined,
      brandRefs: brandUploads.filter(u => u.storagePath).map(u => ({
        name: u.file.name, storageBucket: u.storageBucket, storagePath: u.storagePath, placement: brandPlacement,
      })),
    } : undefined;

    const res = await fetch(`/api/marketplace/${templateId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityRefs: allIdentityRefs,
        taggedRefs: taggedRefs.map(r => ({ tag: r.tag, storagePath: r.storagePath, storageBucket: r.storageBucket, note: r.note.trim() || undefined })),
        poseRefs: poseUploads.filter(u => u.storagePath).map(u => ({
          name: u.file.name, type: u.file.type, size: u.file.size,
          storageBucket: u.storageBucket, storagePath: u.storagePath,
        })),
        shotType: selectedPkg === 1 ? shotType : undefined,
        couponCode: couponResult?.valid ? couponCode : undefined,
        packageSize: effectivePkg,
        ...(perImagePricing ? { aspectRatio: upgradeAspect } : {}),
        currency,
        rolePrompt: template.isStory && rolePrompt.trim() ? rolePrompt.trim() : undefined,
        storyAssets,
        backgroundAllocations: bgActive
          ? Object.entries(bgAlloc).filter(([, c]) => c > 0).map(([optionId, count]) => ({ optionId, count }))
          : undefined,
        choiceSelections: (pickableGroups.length > 0 || multiGroups.length > 0)
          ? [
              ...Object.entries(groupPicks).map(([groupId, optionId]) => ({ groupId, optionId, colorOverride: groupColors[groupId] || undefined })),
              ...Object.entries(multiPicks).flatMap(([groupId, ids]) => ids.map(optionId => ({ groupId, optionId }))),
            ]
          : undefined,
        // Manual lighting (regular templates): only sent when the buyer turned it on
        // and picked at least one look. Off/empty → server plants no plan → AI lighting.
        manualLighting: !photoUpgradeActive && manualLighting && lightingPicks.length > 0 ? true : undefined,
        lightingOptionIds: !photoUpgradeActive && manualLighting && lightingPicks.length > 0 ? lightingPicks : undefined,
        induction: inductionActive
          ? { name: inductionName.trim(), titles: inductionTitles, year: inductionYear, cap: inductionCap }
          : undefined,
        enhance: photoUpgradeActive && enhanceCamera && (perPhotoLightingActive || enhanceLighting)
          ? {
              lighting: enhanceLighting ?? undefined,
              camera: enhanceCamera,
              backdropOptionId: enhanceBackdrop,
              // Per-photo creator lighting (manual on) — { storagePath: optionId }.
              lightingByPath: perPhotoLightingActive ? lightingByPhoto : undefined,
            }
          : undefined,
        noSmile: noSmile || undefined,
        flagShot: flagShotAvailable && flagShotOn
          ? { enabled: true, text: flagText.trim() }
          : undefined,
        trendSlots: (mugshotAvailable && mugshotOn) || (bowlAvailable && bowlOn) || newsIncluded
          ? {
              mugshot: mugshotAvailable && mugshotOn
                ? { enabled: true, name: mugshotName.trim(), offense: mugshotOffense.trim(), date: mugshotDate.trim() }
                : undefined,
              bowl: bowlAvailable && bowlOn
                ? { enabled: true, mode: bowlMode }
                : undefined,
              news: newsIncluded
                ? { headline: newsHeadline.trim(), subtitle: newsSubtitle.trim(), caption: newsCaption.trim() }
                : undefined,
            }
          : undefined,
        bowlContentRef: bowlAvailable && bowlOn && bowlUpload?.storagePath
          ? { storagePath: bowlUpload.storagePath, storageBucket: bowlUpload.storageBucket }
          : undefined,
      }),
    });

    if (res.status === 401) {
      // Session expired at the last step — preserve everything and route through sign-in.
      await goSignIn();
      return;
    }

    const data = await res.json();
    if (data.bypass && data.callbackUrl) {
      window.location.href = data.callbackUrl;
      return;
    }
    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
    } else {
      setError(data.error ?? t("paymentInitFailed"));
      setBuying(false);
    }
  };

  // ── Derived price ─────────────────────────────────────────────────────────

  const activePkg = pkgOptions.find(o => o.n === selectedPkg) ?? pkgOptions[pkgOptions.length - 1];
  const pkgPrice = perImagePricing
    ? unitPriceNgn * Math.max(1, uploadedCount)
    : (activePkg?.price ?? 0);
  const displayedPrice = couponResult?.valid && couponResult.discountNgn
    ? pkgPrice - couponResult.discountNgn
    : pkgPrice;

  return (
    <>
      {/* Hold a look to compare it big. Sits above the checkout panel. */}
      {lookPreview && (
        <LookPreview
          name={lookPreview.name}
          beforeUrl={lookPreview.beforeUrl}
          afterUrl={lookPreview.afterUrl}
          onClose={() => setLookPreview(null)}
        />
      )}

      {/* Backdrop */}
      <div className={styles.overlay} onClick={onClose} />

      {/* Panel */}
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Checkout">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.headerTitle}>{t("bookThisLook")}</p>
            <p className={styles.headerSub}>{template.title}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body}>
          {signedOut && (
            <button
              type="button"
              onClick={goSignIn}
              disabled={resuming}
              style={{
                display: "block", width: "100%", margin: "0 0 14px", padding: "14px 16px", borderRadius: 12,
                background: "#2f8e9a", color: "#ffffff", border: "none", fontWeight: 700, fontSize: "0.9rem",
                textAlign: "center", cursor: "pointer", boxShadow: "0 2px 10px rgba(47,142,154,0.28)",
              }}
            >
              {t("signedOutSetup")}
            </button>
          )}
          {/* Photo upgrades: no packages, just a price per photo. */}
          {perImagePricing && unitPriceNgn > 0 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("images")}</span>
              <p className={styles.sectionHint} style={{ margin: 0 }}>
                {formatPrice(unitPriceNgn)} {t("perPhotoPrice")}{" "}
                {uploadedCount > 0
                  ? `— ${uploadedCount} ${imagesWord(uploadedCount)} = ${formatPrice(unitPriceNgn * uploadedCount)}`
                  : ""}
              </p>
            </div>
          )}
          {/* Output size — upgrades only. */}
          {perImagePricing && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("outputSize")}</span>
              <div className={styles.pkgPills}>
                {(["4:5", "3:4", "1:1", "16:9", "9:16"] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.pkgPill} ${upgradeAspect === r ? styles.pkgPillActive : ""}`}
                    onClick={() => setUpgradeAspect(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Package picker */}
          {!perImagePricing && pkgOptions.length > 1 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("images")}</span>
              <div className={styles.pkgPills}>
                {pkgOptions.map(o => (
                  <button
                    key={o.n}
                    type="button"
                    className={`${styles.pkgPill} ${selectedPkg === o.n ? styles.pkgPillActive : ""}`}
                    onClick={() => setSelectedPkg(o.n)}
                  >
                    {o.n} {imagesWord(o.n)}
                    <span className={styles.pkgPillPrice}>{formatPrice(o.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shot type (1-image package only) */}
          {!perImagePricing && selectedPkg === 1 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("shotType")}</span>
              <div className={styles.shotTypeRow}>
                {(["headshot", "close_up", "medium", "full_body"] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    className={`${styles.pkgPill} ${shotType === st ? styles.pkgPillActive : ""}`}
                    onClick={() => setShotType(st)}
                  >
                    {st === "headshot" ? t("headshot") : st === "close_up" ? t("closeUp") : st === "medium" ? t("medium") : t("fullBody")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Buyer backdrop — one backdrop for the whole shoot by default; splitting is optional */}
          {bgActive && (
            <Collapse
              icon="🖼"
              title={t("backdrop")}
              status={bgOptions.filter(o => (bgAlloc[o.id] ?? 0) > 0).map(o => o.name).join(", ") || t("tapToChoose")}
              warn={!bgValid}
              defaultOpen={false}
            >
            <div className={styles.pkgRow}>
              {!bgSplitMode ? (
                <>
                  <span className={styles.pkgLabel}>{t("chooseBackdrop")}</span>
                  <p className={styles.sectionHint}>
                    {bgTarget === 1 ? t("backdropSingle") : t("backdropWhole")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {bgOptions.map(o => {
                      const picked = (bgAlloc[o.id] ?? 0) > 0;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          title={o.kind === "text" ? o.description : o.name}
                          onClick={() => setBgAlloc({ [o.id]: bgTarget })}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            background: "none", cursor: "pointer", padding: 4,
                            border: picked ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                            borderRadius: 8, minWidth: 64,
                          }}
                        >
                          {o.imageUrl ? (
                            <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                          ) : (
                            <span style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>
                              TEXT
                            </span>
                          )}
                          <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                          {picked && <span style={{ fontSize: "0.65rem" }}>{t("selectedTick")}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {bgTarget >= 2 && (
                    <button
                      type="button"
                      onClick={() => setBgSplitMode(true)}
                      style={{ marginTop: 10, background: "none", border: "none", padding: 0, color: "#2f8e9a", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {t("splitBackdrops")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className={styles.pkgLabel}>{t("splitHeading")}</span>
                  <p className={styles.sectionHint}>
                    {bgExemptCount > 0
                      ? t("splitPlace", { n: bgTarget, m: bgExemptCount })
                      : t("splitPackage", { n: selectedPkg })}{" "}
                    {t("splitTapHint")}
                  </p>
                  {/* Prominent running total */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderRadius: 8, marginBottom: 8,
                      background: bgAllocTotal === bgTarget ? "rgba(23,119,103,0.12)" : "rgba(229,72,77,0.10)",
                      fontSize: "0.85rem", fontWeight: 600,
                    }}
                  >
                    <span>{bgAllocTotal === bgTarget ? t("allPlaced") : t("leftToPlace")}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {bgAllocTotal === bgTarget ? `${bgTarget} / ${bgTarget}` : t("nLeft", { n: bgTarget - bgAllocTotal })}
                    </span>
                  </div>
                  {bgOptions.map(o => {
                    const count = bgAlloc[o.id] ?? 0;
                    return (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                        {o.imageUrl ? (
                          <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                        ) : (
                          <span
                            title={o.description}
                            style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em", flexShrink: 0 }}
                          >
                            TEXT
                          </span>
                        )}
                        <span style={{ flex: 1, fontSize: "0.85rem" }}>
                          {o.name}
                          <span style={{ display: "block", fontSize: "0.72rem", opacity: 0.7 }}>
                            {count === 0 ? t("notUsed") : count === 1 ? t("imageCount1") : t("imageCountN", { n: count })}
                          </span>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            aria-label={`One fewer image on ${o.name}`}
                            className={styles.pkgPill}
                            disabled={count <= 0}
                            onClick={() => removeImageFromBg(o.id)}
                          >−</button>
                          <span style={{ minWidth: 20, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                          <button
                            type="button"
                            aria-label={`One more image on ${o.name}`}
                            className={styles.pkgPill}
                            disabled={count >= bgTarget}
                            onClick={() => addImageToBg(o.id)}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                  {bgAllocTotal !== bgTarget && (
                    <p className={styles.sectionHint} style={{ color: "#e5484d" }}>
                      {t("placeAll", { n: bgTarget })}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setBgSplitMode(false)}
                    style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#2f8e9a", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                  >
                    {t("oneBackdrop")}
                  </button>
                </>
              )}
            </div>
            </Collapse>
          )}

          {/* Gear Equalizer — lighting rig, camera look, optional backdrop swap */}
          {photoUpgradeActive && (
            <>
              <Collapse
                icon="💡"
                title={t("lightingRig")}
                status={perPhotoLightingActive
                  ? t("nPicked", { n: Object.keys(lightingByPhoto).length })
                  : (LIGHTING_PRESETS.find(p => p.id === enhanceLighting)?.name ?? t("pickOneRequired"))}
                warn={!enhanceLightingValid}
                defaultOpen
              >
              {/* Manual per-photo lighting is only offered when the creator attached
                  their own lighting looks. Otherwise the single hardcoded rig stands. */}
              {lightingLooks.length > 0 && (
                <div className={styles.pkgRow}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={manualLighting}
                      onChange={e => { setManualLighting(e.target.checked); if (!e.target.checked) setLightingByPhoto({}); }}
                    />
                    <span className={styles.pkgLabel} style={{ margin: 0 }}>{t("setLightingMyself")}</span>
                  </label>
                  <p className={styles.sectionHint}>{t("perPhotoLightingHint")}</p>
                </div>
              )}
              {perPhotoLightingActive ? (
                <div className={styles.pkgRow}>
                  {/* Before any photo is uploaded the per-photo rows below have
                      nothing to render, so ticking the box appeared to do nothing
                      at all. Show the looks themselves: the buyer can see what
                      they are buying, and it is obvious why they cannot pick yet. */}
                  {sourcePhotos.length === 0 && (
                    <>
                      <p className={styles.sectionHint}>
                        {defaultLighting
                          ? t("lightingPickedForAll")
                          : t("pickLookThenUpload")}
                      </p>
                      <div>
                        {lightingSections.map(section => (
                          <div key={section.id} style={{ marginBottom: 10 }}>
                            {showLightingHeadings && (
                              <SectionToggle id={section.id} label={section.label} count={section.looks.length} />
                            )}
                            <div style={{ display: sectionOpen(section.id) ? "flex" : "none", flexWrap: "wrap", gap: 8 }}>
                              {section.looks.map(o => {
                                const on = defaultLighting === o.id;
                                return (
                                  <button
                                    key={o.id}
                                    type="button"
                                    title={o.name}
                                    onClick={() => { if (consumedByHold()) return; setDefaultLighting(on ? null : o.id); }}
                                    {...holdToPreview(o)}
                                    style={{
                                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                      background: "none", cursor: "pointer", padding: 4,
                                      border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                                      borderRadius: 8, minWidth: 58,
                                    }}
                                  >
                                    <LightingThumb beforeUrl={beforeUrlFor(o.framing)} afterUrl={o.imageUrl} name={o.name} size={56} />
                                    <span style={{ fontSize: "0.68rem", maxWidth: 80, textAlign: "center" }}>{o.name}</span>
                                    {on && <span style={{ fontSize: "0.6rem" }}>✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {sourcePhotos.map((sp, i) => (
                    <div key={sp.storagePath} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: i > 0 ? "1px solid rgba(127,127,127,0.15)" : "none" }}>
                      {/* Fixed box. Without it the uploaded photo contributes its
                          natural width to the flex row, takes almost all of it,
                          and squeezes the looks into an unusable strip at the
                          right edge — which is exactly what a 3-photo booking
                          looked like on a phone. */}
                      <span style={{ flex: "0 0 72px", width: 72, height: 90, borderRadius: 6, overflow: "hidden", display: "block" }}>
                        <ImagePreview src={sp.preview} alt={`Photo ${i + 1}`} className={styles.savedImg} preferredWidth={72}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </span>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        {lightingSections.map(section => (
                          <div key={section.id} style={{ marginBottom: 10 }}>
                            {showLightingHeadings && (
                              <SectionToggle id={section.id} label={section.label} count={section.looks.length} />
                            )}
                            <div style={{ display: sectionOpen(section.id) ? "flex" : "none", flexWrap: "wrap", gap: 8 }}>
                              {section.looks.map(o => {
                                const on = lightingByPhoto[sp.storagePath] === o.id;
                                return (
                                  <button
                                    key={o.id}
                                    type="button"
                                    title={o.name}
                                    onClick={() => { if (consumedByHold()) return; setLightingByPhoto(prev => ({ ...prev, [sp.storagePath]: o.id })); }}
                                    {...holdToPreview(o)}
                                    style={{
                                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                      background: "none", cursor: "pointer", padding: 4,
                                      border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                                      borderRadius: 8, minWidth: 58,
                                    }}
                                  >
                                    <LightingThumb beforeUrl={beforeUrlFor(o.framing)} afterUrl={o.imageUrl} name={o.name} size={56} />
                                    <span style={{ fontSize: "0.68rem", maxWidth: 80, textAlign: "center" }}>{o.name}</span>
                                    {on && <span style={{ fontSize: "0.6rem" }}>✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!enhanceLightingValid && sourcePhotos.length > 0 && (
                    <p className={styles.sectionHint} style={{ color: "#c0392b" }}>{t("assignEachPhoto")}</p>
                  )}
                </div>
              ) : (
                <div className={styles.pkgRow}>
                  <p className={styles.sectionHint}>{t("lightingHint")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {LIGHTING_PRESETS.map(p => {
                      const on = enhanceLighting === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setEnhanceLighting(on ? null : p.id)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
                            background: on ? "rgba(127,127,127,0.12)" : "none", cursor: "pointer",
                            padding: "10px 12px", borderRadius: 10, width: 168, textAlign: "left",
                            border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                          }}
                        >
                          <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{on ? "✓ " : ""}{p.name}</span>
                          <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>{p.blurb}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!enhanceLighting && <p className={styles.sectionHint} style={{ color: "#c0392b" }}>{t("pickLighting")}</p>}
                </div>
              )}
              </Collapse>
              <Collapse
                icon="📷"
                title={t("yourCamera")}
                status={CAMERA_PRESETS.find(p => p.id === enhanceCamera)?.name ?? t("pickOneRequired")}
                warn={!enhanceCamera}
                defaultOpen
              >
              <div className={styles.pkgRow}>
                <p className={styles.sectionHint}>{t("cameraHint")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {CAMERA_PRESETS.map(p => {
                    const on = enhanceCamera === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setEnhanceCamera(on ? null : p.id)}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
                          background: on ? "rgba(127,127,127,0.12)" : "none", cursor: "pointer",
                          padding: "10px 12px", borderRadius: 10, width: 168, textAlign: "left",
                          border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{on ? "✓ " : ""}{p.name}</span>
                        <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>{p.blurb}</span>
                      </button>
                    );
                  })}
                </div>
                {!enhanceCamera && <p className={styles.sectionHint} style={{ color: "#c0392b" }}>{t("pickCamera")}</p>}
              </div>
              </Collapse>
              {bgOptions.length > 0 && (
                <Collapse
                  icon="🖼"
                  title={t("background")}
                  status={enhanceBackdrop === null ? t("keepingYours") : (bgOptions.find(o => o.id === enhanceBackdrop)?.name ?? t("swap"))}
                  defaultOpen={false}
                >
                <div className={styles.pkgRow}>
                  <p className={styles.sectionHint}>{t("backgroundHint")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setEnhanceBackdrop(null)}
                      style={{
                        padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: "0.78rem",
                        border: enhanceBackdrop === null ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.3)",
                        background: enhanceBackdrop === null ? "rgba(127,127,127,0.12)" : "none",
                        fontWeight: enhanceBackdrop === null ? 700 : 400,
                      }}
                    >
                      {enhanceBackdrop === null ? "✓ " : ""}{t("keepMyBackground")}
                    </button>
                    {bgOptions.filter(o => o.imageUrl).map(o => {
                      const on = enhanceBackdrop === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setEnhanceBackdrop(on ? null : o.id)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            background: "none", cursor: "pointer", padding: 4,
                            border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                            borderRadius: 8, minWidth: 64,
                          }}
                        >
                          <ImagePreview src={o.imageUrl!} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                          <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                          {on && <span style={{ fontSize: "0.65rem" }}>{t("swapToThis")}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                </Collapse>
              )}
            </>
          )}

          {/* Nursing induction — personalized sash (name is the only typing in the flow) */}
          {inductionActive && (
            <Collapse
              icon="🎓"
              title={t("yourSash")}
              status={inductionName.trim()
                ? `${inductionName.trim().toUpperCase()} · ${inductionYear}`
                : t("typeNameRequired")}
              warn={!inductionName.trim()}
              defaultOpen
            >
            <div className={styles.pkgRow}>
              <p className={styles.sectionHint}>{t("sashHint")}</p>
              <input
                type="text"
                className={styles.flagInput}
                placeholder={t("sashNamePlaceholder")}
                value={inductionName}
                maxLength={INDUCTION_NAME_MAXLEN}
                onChange={e => setInductionName(e.target.value)}
              />
              {inductionName.trim().length === 0 && (
                <p className={styles.sectionHint} style={{ color: "#c0392b" }}>{t("sashNameWarn")}</p>
              )}
              <p className={styles.sectionHint} style={{ marginTop: 8 }}>{t("sashTitles")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {NURSING_TITLES.map(title => {
                  const idx = inductionTitles.indexOf(title);
                  const on = idx >= 0;
                  return (
                    <button
                      key={title}
                      type="button"
                      onClick={() => setInductionTitles(prev =>
                        on ? prev.filter(x => x !== title)
                           : prev.length >= INDUCTION_MAX_TITLES ? prev : [...prev, title]
                      )}
                      style={{
                        padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: "0.78rem",
                        border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.3)",
                        background: on ? "rgba(127,127,127,0.12)" : "none", fontWeight: on ? 700 : 400,
                      }}
                    >
                      {on ? `${idx + 1}. ` : ""}{title}
                    </button>
                  );
                })}
              </div>
              <p className={styles.sectionHint} style={{ marginTop: 8 }}>{t("classOf")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {inductionYears.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setInductionYear(y)}
                    style={{
                      padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: "0.78rem",
                      border: inductionYear === y ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.3)",
                      background: inductionYear === y ? "rgba(127,127,127,0.12)" : "none", fontWeight: inductionYear === y ? 700 : 400,
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer", fontSize: "0.85rem", lineHeight: 1.4 }}>
                <input
                  type="checkbox"
                  checked={inductionCap === "grad"}
                  onChange={e => setInductionCap(e.target.checked ? "grad" : "none")}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>{t("capToggleLabel")}</strong>
                  <span style={{ display: "block", opacity: 0.75 }}>{t("capToggleHint")}</span>
                </span>
              </label>
              <p className={styles.sectionHint} style={{ marginTop: 10, fontWeight: 600 }}>
                {t("sashPreview", { year: inductionYear, name: (inductionName.trim() || "YOUR NAME").toUpperCase() })}
                {inductionTitles.length > 0 ? ` · ${inductionTitles.map(title => title.replace(/\s*\(.*\)$/, "")).join(", ")}` : ""}
              </p>
            </div>
            </Collapse>
          )}

          {/* Manual lighting — off by default (AI decides the lighting per image);
              on lets the buyer tick one or more looks, spread across the images. */}
          {!photoUpgradeActive && lightingLooks.length > 0 && (
            <Collapse
              icon="💡"
              title={t("lightingSection")}
              status={manualLighting ? (lightingPicks.length > 0 ? t("nPicked", { n: lightingPicks.length }) : t("pickLooks")) : t("aiDecides")}
              defaultOpen={false}
            >
              <div className={styles.pkgRow}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={manualLighting}
                    onChange={e => { setManualLighting(e.target.checked); if (!e.target.checked) setLightingPicks([]); }}
                  />
                  <span className={styles.pkgLabel} style={{ margin: 0 }}>{t("setLightingMyself")}</span>
                </label>
                <p className={styles.sectionHint}>{t("manualLightingHint")}</p>
              </div>
              {manualLighting && (
                <div className={styles.pkgRow}>
                  {lightingSections.map(section => (
                    <div key={section.id} style={{ marginBottom: 12 }}>
                      {showLightingHeadings && (
                        <SectionToggle id={section.id} label={section.label} count={section.looks.length} />
                      )}
                      <div style={{ display: sectionOpen(section.id) ? "flex" : "none", flexWrap: "wrap", gap: 10 }}>
                        {section.looks.map(o => {
                          const isOn = lightingPicks.includes(o.id);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              title={o.name}
                              onClick={() => { if (consumedByHold()) return; setLightingPicks(prev => isOn ? prev.filter(id => id !== o.id) : [...prev, o.id]); }}
                              {...holdToPreview(o)}
                              style={{
                                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                background: "none", cursor: "pointer", padding: 4,
                                border: isOn ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                                borderRadius: 8, minWidth: 64,
                              }}
                            >
                              <LightingThumb beforeUrl={beforeUrlFor(o.framing)} afterUrl={o.imageUrl} name={o.name} size={72} />
                              <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                              {isOn && <span style={{ fontSize: "0.65rem" }}>✓ selected</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {lightingPicks.length === 0 && (
                    <p className={styles.sectionHint} style={{ color: "#c0392b" }}>{t("pickLightingOrOff")}</p>
                  )}
                </div>
              )}
            </Collapse>
          )}

          {/* Buyer choice groups — optional, pick what fits you; used for the whole shoot */}
          {(pickableGroups.length > 0 || multiGroups.length > 0) && (
            <Collapse
              icon="👗"
              title={t("yourStyling")}
              status={(() => {
                const n = Object.keys(groupPicks).length + Object.values(multiPicks).reduce((a, ids) => a + ids.length, 0);
                return n > 0 ? t("nPicked", { n }) : t("optionalTap");
              })()}
              defaultOpen={false}
            >
          {pickableGroups.length > 0 && (
            <div className={styles.pkgRow}>
              <p className={styles.sectionHint}>{t("stylingHint")}</p>
            </div>
          )}
          {pickableGroups.map(group => (
            <div key={group.id} className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{group.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.78rem" }}>{t("optionalPickOne")}</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {group.options.map(o => {
                  const picked = groupPicks[group.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      title={o.kind === "text" ? o.description : o.name}
                      onClick={() => setGroupPicks(prev => {
                        if (prev[group.id] === o.id) {
                          const next = { ...prev };
                          delete next[group.id];
                          // Unpicking a garment also drops its recolor choice.
                          setGroupColors(pc => { const n = { ...pc }; delete n[group.id]; return n; });
                          return next;
                        }
                        return { ...prev, [group.id]: o.id };
                      })}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        background: "none", cursor: "pointer", padding: 4,
                        border: picked ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                        borderRadius: 8, minWidth: 64,
                      }}
                    >
                      {o.imageUrl ? (
                        <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                      ) : (
                        <span style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>
                          TEXT
                        </span>
                      )}
                      <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                      {picked && <span style={{ fontSize: "0.65rem" }}>✓ selected</span>}
                    </button>
                  );
                })}
              </div>
              {/* Optional recolor for garment groups — same cut and fabric, new color */}
              {RECOLOR_GROUP_TYPES.has(group.type as never) && groupPicks[group.id] && (
                <div style={{ marginTop: 8 }}>
                  <p className={styles.sectionHint}>{t("recolorHint")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setGroupColors(prev => { const n = { ...prev }; delete n[group.id]; return n; })}
                      style={{
                        padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: "0.75rem",
                        border: !groupColors[group.id] ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.3)",
                        background: "none", fontWeight: !groupColors[group.id] ? 700 : 400,
                      }}
                    >
                      {t("keepOriginal")}
                    </button>
                    {RECOLOR_PALETTE.map(color => {
                      const on = groupColors[group.id] === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setGroupColors(prev => ({ ...prev, [group.id]: color }))}
                          style={{
                            padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: "0.75rem",
                            border: on ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.3)",
                            background: on ? "rgba(127,127,127,0.12)" : "none", fontWeight: on ? 700 : 400,
                          }}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {group.type === "outfit" && (
                <p className={styles.sectionHint} style={{ marginTop: 6 }}>{t("ownOutfitHint")}</p>
              )}
            </div>
          ))}

          {/* Multi-select groups (props) — pick as many as you want */}
          {multiGroups.map(group => {
            const picked = multiPicks[group.id] ?? [];
            return (
              <div key={group.id} className={styles.pkgRow}>
                <span className={styles.pkgLabel}>{group.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.78rem" }}>{t("chooseAny")}</span></span>
                <p className={styles.sectionHint}>{t("multiHint", { label: group.label.toLowerCase() })}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {group.options.map(o => {
                    const isOn = picked.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        title={o.kind === "text" ? o.description : o.name}
                        onClick={() => setMultiPicks(prev => {
                          const cur = prev[group.id] ?? [];
                          return { ...prev, [group.id]: isOn ? cur.filter(id => id !== o.id) : [...cur, o.id] };
                        })}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                          background: "none", cursor: "pointer", padding: 4,
                          border: isOn ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                          borderRadius: 8, minWidth: 64,
                        }}
                      >
                        {o.imageUrl ? (
                          <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                        ) : (
                          <span style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>
                            TEXT
                          </span>
                        )}
                        <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                        {isOn && <span style={{ fontSize: "0.65rem" }}>{t("added")}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          </Collapse>
          )}

          {/* Signature poses — informational only; the planner picks randomly, no repeats */}
          {(template.poseOptions?.length ?? 0) > 0 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("posesIncluded")}</span>
              <p className={styles.sectionHint}>{t("posesHint")}</p>
            </div>
          )}

          {/* News broadcast — always included when the template has it; the buyer must
              type the three on-screen lines. Their photo becomes the on-camera eyewitness. */}
          {newsIncluded && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>📺 News broadcast details</span>
              <p className={styles.sectionHint}>
                Your photo becomes the on-camera eyewitness inside the news frame. Type the three
                on-screen lines below.
              </p>
              {template.trendSlots?.news?.imageUrl && (
                <ImagePreview src={template.trendSlots.news.imageUrl} alt="News frame" className={styles.flagScenePreview} preferredWidth={420} />
              )}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className={styles.flagField}>
                  <label className={styles.flagFieldLabel}>Headline banner (shown in CAPS)</label>
                  <input type="text" className={styles.flagInput} placeholder="e.g. TRAGEDY" value={newsHeadline} maxLength={25} onChange={e => setNewsHeadline(e.target.value)} />
                </div>
                <div className={styles.flagField}>
                  <label className={styles.flagFieldLabel}>Ticker line (keep it short)</label>
                  <input type="text" className={styles.flagInput} placeholder="e.g. Enugu Air Crash-Lands At Benin Airport" value={newsSubtitle} maxLength={70} onChange={e => setNewsSubtitle(e.target.value)} />
                </div>
                <div className={styles.flagField}>
                  <label className={styles.flagFieldLabel}>Top caption</label>
                  <input type="text" className={styles.flagInput} placeholder="e.g. Eye witness recounts the incident" value={newsCaption} maxLength={110} onChange={e => setNewsCaption(e.target.value)} />
                </div>
                {(!newsHeadline.trim() || !newsCaption.trim()) && (
                  <p className={styles.identityWarn}>Add a headline and a caption to continue.</p>
                )}
              </div>
            </div>
          )}

          {/* Viral add-ons — flag shot / mugshot / bowl, folded into one clean section */}
          {(flagShotAvailable || mugshotAvailable || bowlAvailable) && (
            <Collapse
              icon="🔥"
              title={t("viralAddons")}
              status={(() => {
                const n = (flagShotOn ? 1 : 0) + (mugshotOn ? 1 : 0) + (bowlOn ? 1 : 0);
                return n > 0 ? t("nAdded", { n }) : t("optionalTap");
              })()}
              warn={!flagValid || !mugshotValid || !bowlValid}
              defaultOpen={false}
            >
          {/* Viral skyscraper flag shot */}
          {flagShotAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={flagShotOn}
                  onChange={e => setFlagShotOn(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span className={styles.pkgLabel}>{t("addFlagShot")}</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    {t("flagShotDesc", {
                      n: selectedPkg,
                      imagesWord: imagesWord(selectedPkg),
                      outfit: template.category === "call_to_bar" ? t("flagOutfitBar") : t("flagOutfitShoot"),
                    })}
                  </span>
                </span>
              </label>

              {flagShotOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.flagShot?.imageUrl && (
                    <ImagePreview src={template.flagShot.imageUrl} alt="Flag scene" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>{t("flagTextLabel")}</label>
                    <input
                      type="text"
                      className={styles.flagInput}
                      placeholder={t("flagPlaceholder")}
                      value={flagText}
                      maxLength={FLAG_TEXT_MAX}
                      onChange={e => setFlagText(e.target.value)}
                    />
                    <p className={styles.sectionHint} style={{ marginTop: 6 }}>
                      {t("flagHint")} {flagText.length}/{FLAG_TEXT_MAX}
                    </p>
                    {flagShotOn && flagText.trim().length === 0 && (
                      <p className={styles.identityWarn}>{t("flagWarn")}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trend slot: viral chair pose — always included, informational only */}
          {viralIncluded && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{t("viralChairTitle")}</span>
              <p className={styles.sectionHint}>
                {t("viralChairDesc", { n: selectedPkg, imagesWord: imagesWord(selectedPkg) })}
              </p>
              {template.trendSlots?.viral?.imageUrl && (
                <ImagePreview src={template.trendSlots.viral.imageUrl} alt="The viral chair pose" className={styles.flagScenePreview} preferredWidth={420} />
              )}
            </div>
          )}

          {/* Trend slot: viral mugshot */}
          {mugshotAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={mugshotOn} onChange={e => setMugshotOn(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span className={styles.pkgLabel}>{t("addMugshot")}</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    {t("mugshotDesc", { n: selectedPkg, imagesWord: imagesWord(selectedPkg) })}
                  </span>
                </span>
              </label>
              {mugshotOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.trendSlots?.mugshot?.imageUrl && (
                    <ImagePreview src={template.trendSlots.mugshot.imageUrl} alt="Mugshot board" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>{t("mugshotNameLabel")}</label>
                    <input type="text" className={styles.flagInput} placeholder={t("mugshotNamePlaceholder")} value={mugshotName} maxLength={30} onChange={e => setMugshotName(e.target.value)} />
                  </div>
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>{t("offenseLabel")}</label>
                    <input type="text" className={styles.flagInput} placeholder={t("offensePlaceholder")} value={mugshotOffense} maxLength={100} onChange={e => setMugshotOffense(e.target.value)} />
                    <p className={styles.sectionHint} style={{ marginTop: 4 }}>
                      {t("offenseHint")} {mugshotOffense.length}/100
                    </p>
                  </div>
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>{t("dateLabel")}</label>
                    <input type="text" className={styles.flagInput} value={mugshotDate} maxLength={20} onChange={e => setMugshotDate(e.target.value)} />
                  </div>
                  {mugshotOn && (!mugshotName.trim() || !mugshotOffense.trim()) && (
                    <p className={styles.identityWarn}>{t("mugshotWarn")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trend slot: business on my head (bowl) */}
          {bowlAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={bowlOn} onChange={e => setBowlOn(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span className={styles.pkgLabel}>{t("addBowl")}</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    {t("bowlDesc", { n: selectedPkg, imagesWord: imagesWord(selectedPkg) })}
                  </span>
                </span>
              </label>
              {bowlOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.trendSlots?.bowl?.imageUrl && (
                    <ImagePreview src={template.trendSlots.bowl.imageUrl} alt="Bowl" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.shotTypeRow}>
                    {(["product", "logo"] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.pkgPill} ${bowlMode === m ? styles.pkgPillActive : ""}`}
                        onClick={() => setBowlMode(m)}
                      >
                        {m === "product" ? t("bowlModeProduct") : t("bowlModeLogo")}
                      </button>
                    ))}
                  </div>
                  <p className={styles.sectionHint}>
                    {bowlMode === "product" ? t("bowlHintProduct") : t("bowlHintLogo")}
                  </p>
                  {bowlUpload ? (
                    <div className={styles.uploadGrid}>
                      <div className={styles.uploadItem}>
                        <ImagePreview src={bowlUpload.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                        {bowlUpload.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                        {bowlUpload.error && <div className={styles.uploadError}>{bowlUpload.error}</div>}
                        <button type="button" className={styles.removeBtn} onClick={() => setBowlUpload(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <label className={styles.uploadBtn} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                      {bowlMode === "product" ? t("uploadProduct") : t("uploadLogo")}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) setBowlFile(f); e.target.value = ""; }}
                      />
                    </label>
                  )}
                  {bowlOn && !bowlUpload && (
                    <p className={styles.identityWarn}>{bowlMode === "product" ? t("bowlWarnProduct") : t("bowlWarnLogo")}</p>
                  )}
                </div>
              )}
            </div>
          )}
          </Collapse>
          )}

          <div className={styles.divider} />

          {/* Identity photos — deliberately NOT collapsible: this is the one step
              every buyer must complete, so the upload button is always on screen. */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                📷 {photoUpgradeActive ? t("photosToUpgrade") : t("yourIdentityPhotos")}
              </span>
              <span style={{
                fontSize: "0.72rem",
                fontWeight: uploadCountBad ? 700 : 500,
                color: uploadCountBad ? "#c0392b" : undefined,
                opacity: uploadCountBad ? 1 : 0.65,
              }}>
                {allIdentityRefs.length > 0 ? t("nSelected", { n: allIdentityRefs.length }) : t("required")}
              </span>
            </div>
            {photoUpgradeActive ? (
              <>
                <p className={styles.sectionHint}>{t("upgradeHintAny")}</p>
                {uploadCountBad && (
                  <p className={styles.sectionHint} style={{ fontWeight: 600, color: "#c0392b" }}>
                    {t("uploadOneToTen")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className={styles.sectionHint}>{t("identityHint1")}</p>
                <p className={styles.sectionHint}>{t("identityHint2")}</p>
              </>
            )}

            {savedRefs.length > 0 && (
              <>
                <div className={styles.savedGrid}>
                  {savedRefs.map(ref => (
                    <button
                      key={ref.id}
                      type="button"
                      className={`${styles.savedThumb} ${selectedSaved.has(ref.id) ? styles.savedThumbSelected : ""}`}
                      onClick={() => setSelectedSaved(prev => {
                        const next = new Set(prev);
                        if (next.has(ref.id)) next.delete(ref.id); else next.add(ref.id);
                        return next;
                      })}
                    >
                      <ImagePreview src={ref.url} alt={ref.name} className={styles.savedImg} preferredWidth={120} />
                      {selectedSaved.has(ref.id) && <div className={styles.selectedTick}>✓</div>}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={clearIdentityImages}
                  disabled={clearing}
                >
                  {clearing ? t("clearing") : t("clearSaved")}
                </button>
              </>
            )}

            <div className={styles.uploadRow}>
              <button type="button" className={styles.uploadBtn} onClick={() => identityInputRef.current?.click()}>
                {t("uploadNew")}
              </button>
              <input
                type="file"
                accept="image/*"
                multiple
                ref={identityInputRef}
                className={styles.hidden}
                onChange={e => { if (e.target.files) addIdentityFiles(e.target.files); e.target.value = ""; }}
              />
            </div>

            {newUploads.length > 0 && (
              <div className={styles.uploadGrid}>
                {newUploads.map(u => (
                  <div key={u.localId} className={styles.uploadItem}>
                    <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                    {u.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                    {u.error && <div className={styles.uploadError}>{u.error}</div>}
                    <button type="button" className={styles.removeBtn} onClick={() => setNewUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {!photoUpgradeActive && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer", fontSize: "0.85rem", lineHeight: 1.4 }}>
                <input
                  type="checkbox"
                  checked={noSmile}
                  onChange={e => setNoSmile(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>{t("noSmiles")}</strong> {t("noSmilesDesc")}
                  {noSmile && <span style={{ display: "block", opacity: 0.75 }}>{t("noSmilesNote")}</span>}
                </span>
              </label>
            )}

            {allIdentityRefs.length === 0 && !(signedOut && newUploads.length > 0) && (
              <p className={styles.identityWarn}>{t("identityWarn")}</p>
            )}
            {signedOut && newUploads.length > 0 && (
              <p className={styles.sectionHint} style={{ color: "#2f8e9a", fontWeight: 600 }}>
                {newUploads.length === 1 ? t("photosReadyOne") : t("photosReadyMany", { n: newUploads.length })}
              </p>
            )}
          </div>

          <div className={styles.divider} />

          {/* Story: role prompt */}
          {template.isStory && (
            <div>
              <p className={styles.sectionTitle}>{t("yourAngle")} <span className={styles.optionalTag}>{t("optionalParen")}</span></p>
              <p className={styles.sectionHint}>
                {t("angleHint")}{" "}
                {template.defaultRole ? t("angleDefault", { role: template.defaultRole }) : ""}
              </p>
              {template.roleChips && template.roleChips.length > 0 && (
                <div className={styles.roleChips}>
                  {template.roleChips.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      className={`${styles.roleChip} ${rolePrompt === chip ? styles.roleChipActive : ""}`}
                      onClick={() => setRolePrompt(prev => prev === chip ? "" : chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                className={styles.roleInput}
                placeholder={template.defaultRole ? `"${template.defaultRole}"` : t("anglePlaceholder")}
                value={rolePrompt}
                maxLength={100}
                onChange={e => setRolePrompt(e.target.value)}
              />
            </div>
          )}

          {template.isStory && <div className={styles.divider} />}

          {/* Story: co-star photos */}
          {template.requiresCostar && (
            <div>
              <p className={styles.sectionTitle}>{t("yourCostar")} <span className={styles.requiredTag}>{t("requiredParen")}</span></p>
              <p className={styles.sectionHint}>{t("costarHint")}</p>
              {costarUploads.length > 0 && (
                <div className={styles.uploadGrid}>
                  {costarUploads.map(u => (
                    <div key={u.localId} className={styles.uploadItem}>
                      <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                      {u.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                      {u.error && <div className={styles.uploadError}>{u.error}</div>}
                      <button type="button" className={styles.removeBtn} onClick={() => setCostarUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {costarUploads.length < 5 && (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => costarInputRef.current?.click()}>
                    {t("uploadCostar")}
                  </button>
                  <input type="file" accept="image/*" multiple ref={costarInputRef} className={styles.hidden}
                    onChange={e => { if (e.target.files) addCostarFiles(e.target.files); e.target.value = ""; }} />
                </div>
              )}
              <label className={styles.consentRow}>
                <input type="checkbox" checked={costarConsent} onChange={e => setCostarConsent(e.target.checked)} />
                <span className={styles.consentText}>{t("costarConsent")}</span>
              </label>
              {!costarUploads.some(u => u.storagePath) && (
                <p className={styles.identityWarn}>{t("costarWarn")}</p>
              )}
            </div>
          )}

          {template.requiresCostar && <div className={styles.divider} />}

          {/* Story: group photo */}
          {template.requiresGroup && (
            <div>
              <p className={styles.sectionTitle}>{t("yourGroupPhoto")} <span className={styles.requiredTag}>{t("requiredParen")}</span></p>
              <p className={styles.sectionHint}>{t("groupHint")}</p>
              {groupPhotoUpload ? (
                <div className={styles.uploadGrid}>
                  <div className={styles.uploadItem}>
                    <ImagePreview src={groupPhotoUpload.preview} alt="" className={styles.uploadImg} preferredWidth={200} />
                    {groupPhotoUpload.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                    {groupPhotoUpload.error && <div className={styles.uploadError}>{groupPhotoUpload.error}</div>}
                    <button type="button" className={styles.removeBtn} onClick={() => setGroupPhotoUpload(null)}>✕</button>
                  </div>
                </div>
              ) : (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => groupPhotoInputRef.current?.click()}>
                    {t("uploadGroup")}
                  </button>
                  <input type="file" accept="image/*" ref={groupPhotoInputRef} className={styles.hidden}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setGroupPhotoFile(f); e.target.value = ""; }} />
                </div>
              )}
              {!groupPhotoUpload?.storagePath && (
                <p className={styles.identityWarn}>{t("groupWarn")}</p>
              )}
            </div>
          )}

          {template.requiresGroup && <div className={styles.divider} />}

          {/* Story: brand / logo */}
          {template.requiresBrand && (
            <div>
              <p className={styles.sectionTitle}>{t("yourBrand")} <span className={styles.requiredTag}>{t("requiredParen")}</span></p>
              <p className={styles.sectionHint}>{t("brandHint")}</p>
              {brandUploads.length > 0 ? (
                <div className={styles.uploadGrid}>
                  {brandUploads.map(u => (
                    <div key={u.localId} className={styles.uploadItem}>
                      <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={200} />
                      {u.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                      {u.error && <div className={styles.uploadError}>{u.error}</div>}
                      <button type="button" className={styles.removeBtn} onClick={() => setBrandUploads([])}>✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => brandInputRef.current?.click()}>
                    {t("uploadBrand")}
                  </button>
                  <input type="file" accept="image/*" ref={brandInputRef} className={styles.hidden}
                    onChange={e => { const f = e.target.files?.[0]; if (f) addBrandFile(f); e.target.value = ""; }} />
                </div>
              )}
              <div className={styles.brandPlacementRow}>
                <span className={styles.pkgLabel}>{t("placementLabel")}</span>
                <div className={styles.pkgPills}>
                  {(["everywhere", "background", "subtle"] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.pkgPill} ${brandPlacement === p ? styles.pkgPillActive : ""}`}
                      onClick={() => setBrandPlacement(p)}
                    >
                      {p === "everywhere" ? t("everywhere") : p === "background" ? t("backgroundOnly") : t("subtle")}
                    </button>
                  ))}
                </div>
              </div>
              {!brandUploads.some(u => u.storagePath) && (
                <p className={styles.identityWarn}>{t("brandWarn")}</p>
              )}
            </div>
          )}

          {template.requiresBrand && <div className={styles.divider} />}

          {/* Advanced options toggle */}
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setAdvancedOpen(v => !v)}
          >
            <span className={`${styles.advancedChevron} ${advancedOpen ? styles.advancedChevronOpen : ""}`}>▼</span>
            {t("advancedOptions")}
          </button>

          {advancedOpen && (
            <div className={styles.advancedBody}>
              {/* Pose direction */}
              <div>
                <p className={styles.sectionTitle}>{t("poseDirection")}</p>
                <p className={styles.sectionHint}>{t("poseHint")}</p>
                {poseUploads.length > 0 && (
                  <div className={styles.uploadGrid}>
                    {poseUploads.map(u => (
                      <div key={u.localId} className={styles.uploadItem}>
                        <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                        {u.uploading && <div className={styles.uploadOverlay}>{t("uploading")}</div>}
                        {u.error && <div className={styles.uploadError}>{u.error}</div>}
                        <button type="button" className={styles.removeBtn} onClick={() => setPoseUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {poseUploads.length < 10 && (
                  <button type="button" className={styles.uploadBtn} onClick={() => poseInputRef.current?.click()}>
                    {t("addPose")}
                  </button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={poseInputRef}
                  className={styles.hidden}
                  onChange={e => { if (e.target.files) addPoseFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {/* Reference customisation */}
              <div>
                <p className={styles.sectionTitle}>{t("referenceImages")}</p>
                <p className={styles.sectionHint}>{t("refHint")}</p>

                {taggedRefs.length > 0 && (
                  <div className={styles.refList}>
                    {taggedRefs.map(ref => (
                      <div key={ref.id} className={`${styles.refRow} ${ref.isReplaced ? styles.refRowReplaced : ""}`}>
                        {ref.isReplaced && ref.url && (
                          <ImagePreview src={ref.url} alt={ref.tag} className={styles.refThumb} preferredWidth={80} />
                        )}
                        <span className={styles.refTag}>{ref.customName}</span>
                        {!ref.noteHidden && (
                          <input
                            type="text"
                            className={styles.refNoteInput}
                            placeholder={t("stylingNote")}
                            value={ref.note}
                            onChange={e => setTaggedRefs(prev => prev.map(r => r.id === ref.id ? { ...r, note: e.target.value } : r))}
                          />
                        )}
                        <div className={styles.refActions}>
                          <button type="button" className={styles.refBtn} onClick={() => startReplace(ref.id)}>
                            {ref.isReplaced ? t("reupload") : t("replaceRef")}
                          </button>
                          <button type="button" className={`${styles.refBtn} ${styles.refBtnRemove}`} onClick={() => setTaggedRefs(prev => prev.filter(r => r.id !== ref.id))}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.addRefRow}>
                  {!addingRef && (
                    <button type="button" className={styles.addRefBtn} onClick={() => setAddingRef(true)}>
                      {t("addOwnRef")}
                    </button>
                  )}
                  {addingRef && (
                    <div className={styles.addRefForm}>
                      <select className={styles.addRefSelect} value={addRefTag} onChange={e => setAddRefTag(e.target.value)}>
                        {["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE"].map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className={styles.addRefNoteInput}
                        placeholder={t("stylingNoteOptional")}
                        value={addRefNote}
                        onChange={e => setAddRefNote(e.target.value)}
                      />
                      <button type="button" className={styles.addRefUploadBtn} onClick={() => addRefInputRef.current?.click()}>
                        {t("uploadImage")}
                      </button>
                      <button type="button" className={styles.addRefCancelBtn} onClick={() => { setAddingRef(false); setAddRefNote(""); }}>
                        {t("cancel")}
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        ref={addRefInputRef}
                        className={styles.hidden}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleAddRefFile(f); e.target.value = ""; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className={styles.footer}>
          <div className={styles.priceBlock}>
            {couponResult?.valid && couponResult.discountNgn ? (
              <>
                <span className={styles.priceOld}>{formatPrice(pkgPrice)}</span>
                <span className={styles.priceFinal}>{formatPrice(displayedPrice)}</span>
              </>
            ) : (
              <span className={styles.priceFinal}>{formatPrice(pkgPrice)}</span>
            )}
          </div>
          {error && <p className={styles.bookError}>{error}</p>}
          {signedOut ? (
            <button type="button" className={styles.payBtn} onClick={goSignIn} disabled={resuming}>
              {resuming ? t("takingToSignIn") : t("signInContinue")}
            </button>
          ) : (
            <button type="button" className={styles.payBtn} onClick={book} disabled={!canPay}>
              {buying ? t("redirecting") : t("payGenerate")}
            </button>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          type="file"
          accept="image/*"
          ref={replaceInputRef}
          className={styles.hidden}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ""; }}
        />
      </div>
    </>
  );
}
