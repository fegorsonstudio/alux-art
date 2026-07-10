// Preserves an in-progress marketplace checkout across the Google sign-in redirect.
//
// Google OAuth is a full-page redirect, so React state (selections + the buyer's
// picked photos) is wiped. Before sending a signed-out buyer to sign in we stash
// their config + photo blobs here (IndexedDB — handles multi-MB images and works on
// iOS Safari), then restore + auto-upload them when they return authenticated.

const DB_NAME = "aluxart_checkout";
const STORE = "pending";
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Resume marker ────────────────────────────────────────────────────────────
// Set before sign-in so we can bring the buyer back to their checkout. Written to
// BOTH localStorage and a first-party cookie: iOS Safari can wipe localStorage
// across the cross-site OAuth round-trip, but a SameSite=Lax cookie survives it.
const MARKER = "aluxart_resume_tid";

export function setResumeMarker(templateId: string): void {
  try { localStorage.setItem(MARKER, templateId); } catch { /* ignore */ }
  try { document.cookie = `${MARKER}=${encodeURIComponent(templateId)}; path=/; max-age=1800; SameSite=Lax`; } catch { /* ignore */ }
}

export function getResumeMarker(): string | null {
  try { const v = localStorage.getItem(MARKER); if (v) return v; } catch { /* ignore */ }
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)aluxart_resume_tid=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

export function clearResumeMarker(): void {
  try { localStorage.removeItem(MARKER); } catch { /* ignore */ }
  try { document.cookie = `${MARKER}=; path=/; max-age=0; SameSite=Lax`; } catch { /* ignore */ }
}

export interface PendingConfig {
  selectedPkg: 1 | 5 | 10;
  shotType: string;
  flagShotOn: boolean;
  flagText: string;
  groupPicks: Record<string, string>;
  multiPicks?: Record<string, string[]>;
  bgAlloc: Record<string, number>;
  bgSplitMode?: boolean;
  rolePrompt: string;
  brandPlacement: string;
  // Trend slots (Trending category)
  mugshotOn?: boolean;
  mugshotName?: string;
  mugshotOffense?: string;
  mugshotDate?: string;
  bowlOn?: boolean;
  bowlMode?: "product" | "logo";
}

export interface PendingFile {
  name: string;
  type: string;
  blob: Blob;
}

interface PendingRecord {
  templateId: string;
  config: PendingConfig;
  files: PendingFile[];
  bowlFile?: PendingFile | null;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "templateId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingCheckout(
  templateId: string,
  config: PendingConfig,
  files: PendingFile[],
  bowlFile?: PendingFile | null
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ templateId, config, files, bowlFile: bowlFile ?? null, savedAt: Date.now() } as PendingRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* storage unavailable — non-fatal, buyer just re-enters after sign-in */ }
}

export async function loadPendingCheckout(
  templateId: string
): Promise<{ config: PendingConfig; files: PendingFile[]; bowlFile?: PendingFile | null } | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<PendingRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(templateId);
      r.onsuccess = () => resolve(r.result as PendingRecord | undefined);
      r.onerror = () => reject(r.error);
    });
    db.close();
    if (!rec) return null;
    if (Date.now() - rec.savedAt > TTL_MS) {
      await clearPendingCheckout(templateId);
      return null;
    }
    return { config: rec.config, files: rec.files, bowlFile: rec.bowlFile ?? null };
  } catch {
    return null;
  }
}

export async function clearPendingCheckout(templateId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(templateId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch { /* ignore */ }
}
