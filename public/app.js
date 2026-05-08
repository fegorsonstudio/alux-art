const state = {
  user: null,
  config: null,
  pricing: null,
  mode: "fast",
  aspectRatio: "4:5",
  currency: "NGN",
  identityImages: [],
  savedIdentityImages: [],
  saveIdentity: true,
  shoots: [],
  inspirationImages: [],
  taggedReferences: [],
  quote: { text: "Luxury is becoming the best version of yourself.", attribution: "Alux Art" },
  currentShoot: null,
  admin: null,
  toastTimer: null,
  realtimeChannel: null
};
let supabaseClient = null;

const TAGS = ["OUTFIT", "HAIRSTYLE", "MAKEUP", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE"];
const FAL_MODEL_PRIMARY = "fal-ai/nano-banana-2/edit";
const FAL_MODEL_SECONDARY = "fal-ai/flux/dev";
const DEFAULT_IMAGE_MODEL = FAL_MODEL_PRIMARY;
const SECONDARY_IMAGE_MODEL = FAL_MODEL_SECONDARY;
const MODELS = [
  FAL_MODEL_PRIMARY,
  FAL_MODEL_SECONDARY,
  "fal-ai/flux-pro/v1.1",
  "fal-ai/flux/dev",
  "future/custom-model-slot"
];

const $ = (sel) => document.querySelector(sel);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
})[char]);
const normalizeUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return raw;
  } catch {
    return "";
  }
  return "";
};
const safeUrl = (value = "") => escapeHtml(normalizeUrl(value));
const pathPart = (value = "") => encodeURIComponent(String(value || ""));
const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const safePercent = (value) => Math.min(100, Math.max(0, safeNumber(value)));
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
};
const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
};
const money = (amount, currency) => currency === "NGN"
  ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(safeNumber(amount))
  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(safeNumber(amount));
const size = (bytes = 0) => {
  if (!bytes) return "locked";
  const units = ["B", "KB", "MB", "GB"];
  let value = safeNumber(bytes);
  if (!value) return "locked";
  let index = 0;
  while (value > 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
};

async function request(path, options = {}) {
  const token = localStorage.getItem("alux_supabase_token");
  const res = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("alux_supabase_token");
    localStorage.removeItem("alux_supabase_refresh");
  }
  if (!res.ok) throw Object.assign(new Error(data.error || data.reason || "Request failed"), { status: res.status, data });
  return data;
}

function getSupabaseClient() {
  const supabaseConfig = state.config?.supabase;
  if (!supabaseConfig?.enabled || !supabaseConfig.anonKey || !window.supabase?.createClient) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return supabaseClient;
}

async function syncSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const params = new URLSearchParams(location.search);
  const authError = params.get("error_description") || params.get("error");
  if (authError) {
    history.replaceState(null, "", location.pathname + location.hash);
    throw new Error(authError);
  }
  const code = params.get("code");
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    history.replaceState(null, "", location.pathname + location.hash);
    return persistSupabaseSession(data?.session);
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return persistSupabaseSession(data?.session);
}

function persistSupabaseSession(session) {
  if (session?.access_token) {
    localStorage.setItem("alux_supabase_token", session.access_token);
    if (session.refresh_token) localStorage.setItem("alux_supabase_refresh", session.refresh_token);
    return session;
  }
  return null;
}

function toast(message) {
  clearTimeout(state.toastTimer);
  $(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  state.toastTimer = setTimeout(() => el.remove(), 3600);
}

function renderFatal(error) {
  const message = error?.message || "The app could not finish loading.";
  document.body.innerHTML = `<main class="fatal">
    <section class="panel fatal-panel">
      <img class="hero-logo" src="/assets/alux-art-logo.png" alt="Alux Art logo" width="150" height="150" />
      <h1>Alux Art could not load</h1>
      <p>${escapeHtml(message)}</p>
      <button class="btn primary" id="retryLoad">Retry</button>
    </section>
  </main>`;
  $("#retryLoad")?.addEventListener("click", () => location.reload());
}

window.addEventListener("error", (event) => {
  console.error(event.error || event.message);
  toast("Something went wrong. Please retry the action.");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast(event.reason?.message || "Something went wrong. Please retry the action.");
});

async function init() {
  const config = await request("/api/config");
  state.config = config;
  captureSupabaseSession();
  await syncSupabaseSession();
  const [me, pricing] = await Promise.all([
    request("/api/me"),
    request("/api/pricing")
  ]);
  state.user = me.user;
  state.pricing = pricing;
  state.currency = state.user?.currency || "NGN";
  if (state.user) {
    const [library, shoots] = await Promise.all([
      request("/api/identity-library"),
      request("/api/shoots")
    ]);
    state.savedIdentityImages = library.images || [];
    state.shoots = shoots.shoots || [];
    // Auto-preload saved identity images if zone is empty
    if (!state.identityImages.length && state.savedIdentityImages.length) {
      state.identityImages = state.savedIdentityImages.map((img) => ({ ...img }));
    }
  }
  render();
}

function captureSupabaseSession() {
  const hash = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken) {
    localStorage.setItem("alux_supabase_token", accessToken);
    if (refreshToken) localStorage.setItem("alux_supabase_refresh", refreshToken);
    history.replaceState(null, "", location.pathname);
  }
}

function render() {
  const userInitial = escapeHtml((state.user?.name || state.user?.email || "?").trim()[0] || "?");
  const currency = escapeHtml(state.currency || "NGN");
  document.body.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="mark"><img src="/assets/alux-art-logo.png" alt="Alux Art logo" width="42" height="42" decoding="async" /></div>
        <div><h1>Alux Art</h1><span>AI Photoshoot Studio</span></div>
      </div>
      <nav class="nav-actions">
        ${state.user ? `
          <button class="btn ghost ${location.hash !== "#admin" ? "active-nav" : ""}" data-view="shoot">+ <span>New Shoot</span></button>
          ${state.user.role === "admin" ? `<button class="btn ghost ${location.hash === "#admin" ? "active-nav" : ""}" data-view="admin">A <span>Admin</span></button>` : ""}
          <button class="btn small" id="currencyToggle">${currency}</button>
          <button class="btn small" id="logout">Sign out</button>
        ` : ""}
      </nav>
      ${state.user ? `<div class="sidebar-user"><div class="avatar">${userInitial}</div></div>` : ""}
    </header>
    <main id="view"></main>
  </div>`;

  if (!state.user) renderHero();
  else if (location.hash === "#admin" && state.user.role === "admin") renderAdmin();
  else renderWorkspace();

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.view === "admin" ? "#admin" : "";
      render();
    });
  });
  $("#logout")?.addEventListener("click", async () => {
    await request("/api/logout", { method: "POST" });
    localStorage.removeItem("alux_supabase_token");
    localStorage.removeItem("alux_supabase_refresh");
    state.user = null;
    state.currentShoot = null;
    state.identityImages = [];
    state.savedIdentityImages = [];
    history.replaceState(null, "", location.pathname);
    render();
  });
  $("#currencyToggle")?.addEventListener("click", async () => {
    state.currency = state.currency === "NGN" ? "USD" : "NGN";
    const { user } = await request("/api/me/preferences", { method: "PATCH", body: { currency: state.currency } });
    state.user = user;
    render();
  });
}

function renderHero() {
  const devMode = !state.config?.supabase?.enabled;
  const adminEmail = escapeHtml(state.config?.adminEmail || "");
  $("#view").innerHTML = `<section class="hero">
    <div class="hero-copy">
      <img class="hero-logo" src="/assets/alux-art-logo.png" alt="Alux Art logo" width="150" height="150" decoding="async" fetchpriority="high" />
      <h2>Alux Art</h2>
      <p>A zero-prompt virtual photo studio. Upload identity and inspiration images, choose a quote, and the orchestration pipeline produces a 10-image professional shoot with 4K downloads.</p>
      <div class="hero-grid">
        <div class="feature-tile"><strong>1. Identity Lock-In</strong></div>
        <div class="feature-tile"><strong>2. Agentic Pipeline</strong></div>
        <div class="feature-tile"><strong>3. 4K Delivery</strong></div>
      </div>
    </div>
    <form class="auth-panel" id="loginForm">
      <h3>Get started</h3>
      ${devMode ? `
        <p class="muted" style="margin:0 0 16px;font-size:13px;">Local dev mode — enter your Google email to simulate OAuth.</p>
        <div class="field">
          <label>Google email</label>
          <input class="input" type="email" name="email" value="${adminEmail}" required />
        </div>
        <div class="field">
          <label>Name</label>
          <input class="input" name="name" value="Fegorson Photography" required />
        </div>
      ` : ""}
      <button class="btn primary google-btn" type="submit">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908C16.658 14.126 17.64 11.818 17.64 9.205z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Sign up with Google
      </button>
    </form>
  </section>`;

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const client = getSupabaseClient();
      if (client) {
        const { data, error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${location.origin}/`,
            queryParams: { prompt: "select_account" }
          }
        });
        if (error) throw error;
        if (data?.url) location.href = data.url;
        return;
      }
      const auth = await request("/api/auth/google", { method: "POST", body: { email: form.get("email"), name: form.get("name") } });
      if (auth.url) { location.href = auth.url; return; }
      state.user = auth.user;
      state.currency = auth.user.currency;
      const [library, shoots] = await Promise.all([
        request("/api/identity-library"),
        request("/api/shoots")
      ]);
      state.savedIdentityImages = library.images || [];
      state.shoots = shoots.shoots || [];
      if (!state.identityImages.length && state.savedIdentityImages.length) {
        state.identityImages = state.savedIdentityImages.map((img) => ({ ...img }));
      }
      toast(`Signed in as ${auth.user.email}`);
      render();
    } catch (err) {
      toast(err.message || "Could not start Google sign-in.");
    }
  });
}

function renderWorkspace() {
  $("#view").innerHTML = `<section class="main-stack">
    <section class="top-controls">
      ${panel("Shoot Controls", "", controls())}
    </section>
    <section class="workspace">
      <div class="main-stack">
        ${panel("1. Identity Lock-In", "Upload your identity photos. The pipeline locks your facial profile for every shot.", identityUploader())}
        ${panel("Inspiration Upload", "Add editorial references, mood boards, or lighting examples.", inspirationUploader())}
        ${advancedPanel()}
        ${panel("Quote", "Generate an AI quote from the mood, or write a custom one.", quoteEditor())}
        ${panel("Shoot Summary", "", summary())}
        ${panel("Recent Shoots", "Open a previous shoot to view generated images and downloads.", recentShoots())}
        <section id="galleryHost">${state.currentShoot ? gallery(state.currentShoot) : ""}</section>
      </div>
      <aside class="side-stack">
        ${panel("Quick Status", "", quickStatus())}
      </aside>
    </section>
  </section>`;
  bindWorkspace();
}

function panel(title, subtitle, body) {
  return `<section class="panel">
    <div class="panel-head"><div><h3>${escapeHtml(title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div></div>
    ${body}
  </section>`;
}

function identityUploader() {
  const images = state.identityImages;
  const hasEnough = images.length >= 3;
  return `<div class="chips" style="margin-bottom:12px">
    <span class="chip ${hasEnough ? "ok" : "warn"}">${images.length}/3 minimum</span>
    ${images.length ? `<span class="chip">${images.length} image${images.length !== 1 ? "s" : ""} loaded</span>` : ""}
  </div>
  <label class="identity-zone ${images.length ? "has-images" : ""}" id="identityZone">
    ${images.length ? `<div class="identity-thumbs-grid">${images.map((item, i) => identityThumbCard(item, i)).join("")}</div>` : ""}
    <div class="drop-zone-hint">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>${images.length ? "Click or drop to add more" : "Drag & drop or click to upload"}</span>
      <span class="hint-sub">You can upload multiple images at once.</span>
    </div>
    <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-kind="identity">
  </label>
  <div class="identity-zone-footer">
    <label class="save-toggle" title="Save photos to your identity library for reuse">
      <input type="checkbox" id="saveIdentityToggle" ${state.saveIdentity ? "checked" : ""}> Save to library
    </label>
    <button class="btn small danger" id="clearIdentity" type="button" ${images.length ? "" : "disabled"}>Clear identity</button>
  </div>`;
}

function identityThumbCard(item, index) {
  const dataUrl = safeUrl(item.dataUrl);
  const progress = safePercent(item.uploadProgress ?? 100);
  const isUploading = item.uploadProgress !== undefined && item.uploadProgress < 100;
  return `<div class="id-thumb" data-upload-id="${escapeHtml(item.id || "")}">
    ${dataUrl
      ? `<img src="${dataUrl}" alt="${escapeHtml(item.name)}">`
      : `<div class="id-thumb-placeholder">${escapeHtml((item.name || "?").slice(0, 6))}</div>`}
    ${isUploading ? `<div class="id-thumb-progress"><div class="id-thumb-bar" style="width:${progress}%"></div></div>` : ""}
    <button class="id-thumb-x remove-upload" data-kind="identity" data-index="${index}" type="button" title="Remove">×</button>
  </div>`;
}

function inspirationUploader() {
  return `<div class="chips"><span class="chip ${state.inspirationImages.length >= 1 ? "ok" : "warn"}">${state.inspirationImages.length}/1 required</span><span class="chip">Lighting</span><span class="chip">Palette</span><span class="chip">Pose</span></div>
  <div class="upload-grid" id="inspirationGrid">${uploadTiles("inspiration", state.inspirationImages, 3)}</div>`;
}

function advancedPanel() {
  if (state.mode !== "advanced") return "";
  return panel("Advanced References", "Upload references and tag them so the AI knows exactly how to use each one.", `<div class="chips">${TAGS.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div><div class="upload-grid tagged-grid">${uploadTiles("tagged", state.taggedReferences, 6)}</div>`);
}

function uploadTiles(kind, list, minimum) {
  const existing = list.map((item, index) => uploadTileShell(item, kind, index)).join("");
  const slots = Math.max(1, minimum - list.length);
  return `${existing}${Array.from({ length: slots }, () => `<label class="drop">Click to upload<span>JPG, PNG, WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-kind="${kind}"></label>`).join("")}`;
}

function uploadTileShell(item, kind, index) {
  return `<div data-upload-id="${escapeHtml(item.id || "")}">
    <div class="upload-card">${uploadPreview(item)}</div>
    ${uploadStatus(item)}
    ${kind === "tagged" ? customReferenceControls(item, index, kind) : `<div class="tag-row"><span class="chip">${escapeHtml(item.name)}</span><button class="btn icon remove-upload" data-kind="${kind}" data-index="${index}" title="Remove">x</button></div>`}
  </div>`;
}

function uploadPreview(item) {
  const dataUrl = safeUrl(item.dataUrl);
  if (dataUrl && (/^data:image\//i.test(item.dataUrl || "") || /^https?:\/\//i.test(item.dataUrl || ""))) {
    return `<img class="thumb" src="${dataUrl}" alt="${escapeHtml(item.name)}">`;
  }
  if (dataUrl && item.type && !/^image\/(png|jpe?g|webp|gif)$/i.test(item.type)) {
    return `<div class="upload-placeholder"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.type)} selected</span></div>`;
  }
  return `<div class="upload-placeholder"><strong>${escapeHtml(item.name || "Reading image")}</strong><span>${escapeHtml(item.uploadStatus || "Preparing preview")}</span></div>`;
}

function uploadStatus(item) {
  if (!item.uploadStatus && item.uploadProgress === undefined) return "";
  const progress = safePercent(item.uploadProgress ?? 0);
  const errorClass = item.uploadError ? " upload-status-error" : "";
  return `<div class="upload-status${errorClass}">
    <div class="upload-status-top"><span>${escapeHtml(item.uploadStatus || "Selected")}</span><span>${progress}%</span></div>
    <div class="upload-progress-shell"><div class="upload-progress-bar" style="width:${progress}%"></div></div>
    ${item.uploadError ? `<p>${escapeHtml(item.uploadError)}</p>` : ""}
  </div>`;
}

function customReferenceControls(item, index, kind) {
  return `<div class="custom-ref-fields">
    <div class="tag-row">
      <select class="select tag-select" data-index="${index}" aria-label="Reference category">${TAGS.map((tag) => `<option ${item.tag === tag ? "selected" : ""}>${tag}</option>`).join("")}</select>
      <button class="btn icon remove-upload" data-kind="${kind}" data-index="${index}" title="Remove">x</button>
    </div>
    <div class="field compact-field">
      <label>Custom name tag</label>
      <input class="input custom-ref-name" data-index="${index}" value="${escapeHtml(item.customName || "")}" placeholder="e.g. Nail design, red jacket, soft curls">
    </div>
    <div class="field compact-field">
      <label>Notes for AI</label>
      <textarea class="custom-ref-note" data-index="${index}" placeholder="Tell the AI what to copy or avoid from this reference.">${escapeHtml(item.note || "")}</textarea>
    </div>
  </div>`;
}

function quoteEditor() {
  return `<div class="field">
    <label>Quote text</label>
    <textarea id="quoteText">${escapeHtml(state.quote.text)}</textarea>
  </div>
  <div class="field">
    <label>Attribution</label>
    <input class="input" id="quoteAttribution" value="${escapeHtml(state.quote.attribution || "")}">
  </div>
  <button class="btn" id="generateQuote">Generate Quote with AI</button>`;
}

function controls() {
  return `<div class="controls-grid">
    <div class="field">
      <label>Mode</label>
      <div class="segmented"><button class="${state.mode === "fast" ? "active" : ""}" data-mode="fast">Fast</button><button class="${state.mode === "advanced" ? "active" : ""}" data-mode="advanced">Advanced</button></div>
    </div>
    <div class="field">
      <label>Aspect ratio</label>
      <select class="select" id="aspectRatio">${Object.entries(state.config.aspects).map(([key, value]) => `<option value="${escapeHtml(key)}" ${state.aspectRatio === key ? "selected" : ""}>${escapeHtml(value.label)} - ${safeNumber(value.width)}x${safeNumber(value.height)}</option>`).join("")}</select>
    </div>
  </div>`;
}

function quickStatus() {
  const latest = state.shoots[0];
  return `<div class="summary-list">
    <div class="summary-row"><span>Selected</span><strong>${state.currentShoot ? escapeHtml(state.currentShoot.status) : "None"}</strong></div>
    <div class="summary-row"><span>Latest shoot</span><strong>${latest ? escapeHtml(latest.status) : "None"}</strong></div>
    <div class="summary-row"><span>Recent shoots</span><strong>${state.shoots.length}</strong></div>
  </div>
  <p class="muted">Completed images are under Recent Shoots. Click Open to restore the gallery.</p>`;
}

function recentShoots() {
  if (!state.shoots.length) {
    return `<p class="muted">No shoots yet. Start a shoot and it will appear here.</p>`;
  }
  return `<div class="recent-list">${state.shoots.slice(0, 6).map((shoot) => `<article class="recent-shoot">
    <div>
      <strong>${escapeHtml(shoot.id)}</strong>
      <span class="muted">${escapeHtml(shoot.status)} - ${safeNumber(shoot.completeImages)}/10 images - ${escapeHtml(shoot.aspectRatio)} - ${formatDateTime(shoot.createdAt)}</span>
    </div>
    <button class="btn small open-shoot" data-id="${escapeHtml(shoot.id)}">Open</button>
  </article>`).join("")}</div>`;
}

function summary() {
  const primary = state.currency === "NGN" ? money(state.pricing.ngn, "NGN") : money(state.pricing.usd, "USD");
  const secondary = state.currency === "NGN" ? money(state.pricing.usd, "USD") : money(state.pricing.ngn, "NGN");
  const isAdminUser = state.user?.role === "admin";
  const canGenerate = ready() || isAdminUser;
  return `<div class="summary-list">
    <div class="summary-row"><span>Identity images</span><strong>${state.identityImages.length}</strong></div>
    <div class="summary-row"><span>Inspiration images</span><strong>${state.inspirationImages.length}</strong></div>
    <div class="summary-row"><span>Tagged overrides</span><strong>${state.taggedReferences.length}</strong></div>
    <div class="summary-row"><span>Aspect ratio</span><strong>${escapeHtml(state.aspectRatio)}</strong></div>
    <div class="summary-row"><span>Output</span><strong>2 images (test mode)</strong></div>
    <div class="summary-row"><span>Image provider</span><strong>fal.ai</strong></div>
    <div class="summary-row"><span>Download</span><strong>True 4K PNG + ZIP</strong></div>
  </div>
  <div class="price">
    <div><span class="muted">Shoot price</span><strong>${primary}</strong><div class="muted">${secondary} secondary</div></div>
    <span class="chip ok">Paystack</span>
  </div>
  <p class="muted">${ready() ? "Ready to start. Gallery progress will stream in real time." : "Complete identity and inspiration uploads to unlock generation."}</p>
  <button class="btn primary summary-pay-btn" id="createShoot" ${canGenerate ? "" : "disabled"}>
    ${isAdminUser ? "Start Admin Test Shoot" : "Pay and generate"}
  </button>`;
}

function ready() {
  return state.identityImages.length >= 3 && state.inspirationImages.length >= 1;
}

function bindWorkspace() {
  document.querySelectorAll("[data-mode]").forEach((btn) => btn.addEventListener("click", () => {
    state.mode = btn.dataset.mode;
    renderWorkspace();
  }));
  $("#aspectRatio")?.addEventListener("change", (e) => { state.aspectRatio = e.target.value; renderWorkspace(); });

  // Identity zone: click/drop on the label triggers the hidden file input
  document.querySelectorAll("input[type=file]").forEach((input) => input.addEventListener("change", readFiles));

  // Drag-and-drop on identity zone
  const identityZone = $("#identityZone");
  if (identityZone) {
    identityZone.addEventListener("dragover", (e) => { e.preventDefault(); identityZone.classList.add("drag-over"); });
    identityZone.addEventListener("dragleave", () => identityZone.classList.remove("drag-over"));
    identityZone.addEventListener("drop", (e) => {
      e.preventDefault();
      identityZone.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      const fakeEvent = { target: { dataset: { kind: "identity" }, files, value: "" } };
      readFiles(fakeEvent);
    });
  }

  // Remove buttons (identity thumbnails and inspiration tiles)
  document.querySelectorAll(".remove-upload").forEach((btn) => btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = listFor(btn.dataset.kind);
    list.splice(Number(btn.dataset.index), 1);
    renderWorkspace();
  }));

  // Save-to-library toggle
  $("#saveIdentityToggle")?.addEventListener("change", (e) => {
    state.saveIdentity = e.target.checked;
  });

  // Clear identity button — clears session and database library
  $("#clearIdentity")?.addEventListener("click", async () => {
    state.identityImages = [];
    state.savedIdentityImages = [];
    renderWorkspace();
    if (state.user) {
      try {
        await request("/api/identity-library", { method: "DELETE" });
        toast("Identity library cleared.");
      } catch (err) {
        toast(`Cleared from session. Database clear failed: ${err.message}`);
      }
    }
  });

  document.querySelectorAll(".tag-select").forEach((select) => select.addEventListener("change", () => {
    state.taggedReferences[Number(select.dataset.index)].tag = select.value;
  }));
  document.querySelectorAll(".custom-ref-name").forEach((input) => input.addEventListener("input", () => {
    state.taggedReferences[Number(input.dataset.index)].customName = input.value;
  }));
  document.querySelectorAll(".custom-ref-note").forEach((textarea) => textarea.addEventListener("input", () => {
    state.taggedReferences[Number(textarea.dataset.index)].note = textarea.value;
  }));
  $("#quoteText")?.addEventListener("input", (e) => { state.quote.text = e.target.value; });
  $("#quoteAttribution")?.addEventListener("input", (e) => { state.quote.attribution = e.target.value; });
  $("#generateQuote")?.addEventListener("click", () => {
    const options = [
      "I do not chase the spotlight. I become the image it was waiting for.",
      "Elegance is the quiet confidence of being fully seen.",
      "The future belongs to the version of me I am brave enough to create.",
      "Every frame is proof that identity can become art."
    ];
    state.quote = { text: options[Math.floor(Math.random() * options.length)], attribution: "Alux Art" };
    renderWorkspace();
  });
  document.querySelectorAll(".open-shoot").forEach((btn) => btn.addEventListener("click", async () => {
    const { shoot } = await request(`/api/shoots/${pathPart(btn.dataset.id)}`);
    state.currentShoot = shoot;
    $("#galleryHost").innerHTML = gallery(shoot);
    bindGallery();
    $("#galleryHost")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#createShoot")?.addEventListener("click", createShoot);
  bindGallery();
}

function listFor(kind) {
  if (kind === "identity") return state.identityImages;
  if (kind === "inspiration") return state.inspirationImages;
  return state.taggedReferences;
}

async function readFiles(event) {
  const kind = event.target.dataset.kind;
  const list = listFor(kind);
  const files = Array.from(event.target.files || []);
  if (event.target.value !== undefined) event.target.value = "";
  if (!files.length) return;
  const uploaded = [];
  toast(`Loading ${files.length} ${files.length === 1 ? "image" : "images"}...`);
  for (const file of files) {
    const image = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: normalizeImageType(file) || "image/*",
      dataUrl: "",
      fingerprint: `${file.name}:${file.size}:${file.lastModified}`,
      tag: TAGS[0],
      customName: "",
      note: "",
      uploadKind: kind,
      uploadProgress: 5,
      uploadStatus: "Reading file"
    };
    list.push(image);
    renderWorkspace();
    try {
      image.dataUrl = await readImageFile(file, (progress) => {
        image.uploadProgress = progress;
        image.uploadStatus = "Reading file";
        updateUploadCard(image);
      });
      image.uploadProgress = kind === "identity" ? 80 : 100;
      image.uploadStatus = kind === "identity" ? "Saving to identity library" : "Ready";
      updateUploadCard(image);
      if (kind === "identity") uploaded.push(image);
    } catch (err) {
      image.uploadProgress = 100;
      image.uploadStatus = "Could not read file";
      image.uploadError = err.message;
      updateUploadCard(image);
      toast(`Could not read ${file.name}: ${err.message}`);
    }
  }
  if (uploaded.length) {
    if (state.saveIdentity) {
      try {
        const { images, saved } = await request("/api/identity-library", { method: "POST", body: { images: uploaded } });
        state.savedIdentityImages = images || [];
        uploaded.forEach((local) => {
          const savedMatch = (saved || []).find((item) => item.fingerprint === local.fingerprint);
          local.uploadProgress = 100;
          local.uploadStatus = savedMatch ? "Saved" : "Selected";
          local.uploadError = "";
          if (!savedMatch) return;
          const index = state.identityImages.findIndex((item) => item.id === local.id);
          if (index >= 0) state.identityImages[index] = { ...savedMatch, uploadProgress: 100, uploadStatus: "Saved" };
        });
        toast("Identity upload saved for reuse.");
      } catch (err) {
        uploaded.forEach((image) => {
          image.uploadProgress = 100;
          image.uploadStatus = "Selected, save failed";
          image.uploadError = err.message;
        });
        toast(`Identity image selected, but could not save it: ${err.message}`);
      }
    } else {
      uploaded.forEach((image) => {
        image.uploadProgress = 100;
        image.uploadStatus = "Selected (not saved)";
      });
    }
  }
  renderWorkspace();
}

function normalizeImageType(file) {
  const explicitType = String(file.type || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(explicitType)) return explicitType;
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "";
}

function withImageDataUrlType(dataUrl, contentType) {
  const value = String(dataUrl || "");
  if (!contentType || value.startsWith(`data:${contentType};base64,`)) return value;
  return value.replace(/^data:[^;]*;base64,/i, `data:${contentType};base64,`);
}

function readImageFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const contentType = normalizeImageType(file);
    if (!contentType) {
      reject(new Error("Use JPG, PNG, or WebP for AI reference generation"));
      return;
    }
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(8, Math.min(75, Math.round((event.loaded / event.total) * 75))));
    };
    reader.onerror = () => reject(new Error(reader.error?.message || "Browser could not read this file"));
    reader.onload = () => {
      onProgress(78);
      resolve(withImageDataUrlType(reader.result, contentType));
    };
    reader.readAsDataURL(file);
  });
}

function updateUploadCard(image) {
  const kind = image.uploadKind || "identity";
  if (kind === "identity") {
    const card = document.querySelector(`[data-upload-id="${image.id}"]`);
    if (!card) return;
    const index = state.identityImages.findIndex((item) => item.id === image.id);
    card.outerHTML = identityThumbCard(image, Math.max(0, index));
    return;
  }
  const card = document.querySelector(`[data-upload-id="${image.id}"]`);
  if (!card) return;
  const index = listFor(kind).findIndex((item) => item.id === image.id);
  card.outerHTML = uploadTileShell(image, kind, Math.max(0, index));
}

async function createShoot() {
  try {
    toast("Preparing reference uploads...");
    await prepareReferencesForShoot();
    const { shoot } = await request("/api/shoots", {
      method: "POST",
      body: {
        mode: state.mode,
        aspectRatio: state.aspectRatio,
        currency: state.currency,
        identityImages: state.identityImages.map(stripImage),
        inspirationImages: state.inspirationImages.map(stripImage),
        taggedReferences: state.taggedReferences.map(stripImage),
        quote: state.quote,
        adminBypass: state.user?.role === "admin"
      }
    });
    state.currentShoot = shoot;
    state.shoots = [shootSummary(shoot), ...state.shoots.filter((item) => item.id !== shoot.id)];
    renderWorkspace();
    $("#galleryHost")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (state.user?.role === "admin") {
      connectShootUpdates(shoot.id);
      toast("Admin test shoot queued. Generation progress is streaming.");
      return;
    }
    // Paystack payment gate
    const payment = await request(`/api/shoots/${pathPart(shoot.id)}/pay`, { method: "POST" });
    if (payment.authorization_url) {
      toast("Opening secure Paystack checkout.");
      location.href = payment.authorization_url;
      return;
    }
    connectShootUpdates(shoot.id);
    toast("Shoot queued. Generation progress is streaming.");
  } catch (err) {
    toast(err.message);
  }
}

async function prepareReferencesForShoot() {
  // Pre-upload identity images that haven't been saved to the library yet.
  // This keeps the shoot creation payload lean (no large base64 blobs).
  const unstagedIdentity = state.identityImages.filter((img) => img.dataUrl && (!img.storageBucket || !img.storagePath));
  if (unstagedIdentity.length) {
    toast(`Uploading ${unstagedIdentity.length} identity image${unstagedIdentity.length > 1 ? "s" : ""}...`);
    unstagedIdentity.forEach((img) => { img.uploadProgress = 82; img.uploadStatus = "Uploading"; });
    try {
      const { saved } = await request("/api/identity-library", {
        method: "POST",
        body: { images: unstagedIdentity }
      });
      (saved || []).forEach((savedImg) => {
        const local = state.identityImages.find((img) => img.fingerprint === savedImg.fingerprint || img.id === savedImg.id);
        if (local) Object.assign(local, savedImg, { uploadProgress: 100, uploadStatus: "Saved" });
      });
    } catch (err) {
      unstagedIdentity.forEach((img) => { img.uploadProgress = 100; img.uploadStatus = "Upload failed"; img.uploadError = err.message; });
      throw new Error(`Identity upload failed: ${err.message}`);
    }
  }
  await stageReferenceList("inspiration", state.inspirationImages);
  await stageReferenceList("custom", state.taggedReferences);
}

async function stageReferenceList(purpose, list) {
  const pending = list.filter((image) => image.dataUrl && (!image.storageBucket || !image.storagePath));
  if (!pending.length) return;
  pending.forEach((image) => {
    image.uploadProgress = Math.max(Number(image.uploadProgress || 0), 82);
    image.uploadStatus = "Saving reference";
    updateUploadCard(image);
  });
  for (const local of pending) {
    const { saved } = await request("/api/reference-uploads", {
      method: "POST",
      body: { purpose, images: [stripImage(local, true)] }
    });
    const staged = (saved || [])[0];
    if (!staged) throw new Error(`Could not save ${local.name || "reference image"}`);
    Object.assign(local, staged, {
      dataUrl: staged.dataUrl || local.dataUrl,
      uploadProgress: 100,
      uploadStatus: "Reference saved",
      uploadError: ""
    });
    updateUploadCard(local);
  }
}

function shootSummary(shoot) {
  return {
    id: shoot.id,
    ownerEmail: shoot.ownerEmail,
    mode: shoot.mode,
    aspectRatio: shoot.aspectRatio,
    status: shoot.status,
    progress: shoot.progress,
    zipStatus: shoot.zipStatus,
    createdAt: shoot.createdAt,
    completedAt: shoot.completedAt,
    completeImages: shoot.images.filter((image) => image.status === "COMPLETE").length
  };
}

function stripImage(img, includeData = false) {
  return {
    id: img.id,
    name: img.name,
    size: img.size,
    type: img.type,
    tag: img.tag,
    customName: img.customName || "",
    note: img.note || "",
    fingerprint: img.fingerprint || "",
    storageBucket: img.storageBucket || "",
    storagePath: img.storagePath || "",
    ...(includeData ? { dataUrl: img.dataUrl } : {})
  };
}

// Supabase Realtime subscription with SSE fallback
function connectShootUpdates(shootId) {
  const client = getSupabaseClient();
  if (client) {
    // Unsubscribe any existing channel
    if (state.realtimeChannel) {
      client.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    const channel = client
      .channel(`shoot-events-${shootId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "generation_events",
        filter: `shoot_id=eq.${shootId}`
      }, (payload) => {
        const event = payload.new?.payload;
        if (event) handleShootEvent(event);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          toast("Real-time updates connected.");
        }
      });
    state.realtimeChannel = channel;
    return;
  }
  // SSE fallback for local dev
  connectEvents(shootId);
}

function connectEvents(shootId) {
  const events = new EventSource(`/api/shoots/${pathPart(shootId)}/events`);
  ["snapshot", "queued", "stage", "slot_update", "slot_complete", "zip_ready", "complete"].forEach((type) => {
    events.addEventListener(type, (event) => {
      const data = JSON.parse(event.data);
      handleShootEvent({ ...data, type });
      if (type === "complete") events.close();
    });
  });
}

function handleShootEvent(event) {
  if (event.shoot) state.currentShoot = event.shoot;
  if (event.image && state.currentShoot) {
    const index = state.currentShoot.images.findIndex((img) => img.id === event.image.id);
    if (index >= 0) state.currentShoot.images[index] = event.image;
  }
  if (event.progress && state.currentShoot) state.currentShoot.progress = event.progress;
  if (event.stage && state.currentShoot) state.currentShoot.pipelineStage = event.stage;
  if (event.type === "zip_ready" && state.currentShoot) {
    state.currentShoot.zipStatus = "READY";
    state.currentShoot.zipUrl = event.zipUrl;
    state.currentShoot.zipFileSize = event.zipFileSize;
  }
  if (event.type === "complete") {
    const client = getSupabaseClient();
    if (client && state.realtimeChannel) {
      client.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    state.shoots = [shootSummary(state.currentShoot), ...state.shoots.filter((item) => item.id !== state.currentShoot.id)];
    toast("Shoot complete. 4K downloads are ready.");
  }
  if ($("#galleryHost") && state.currentShoot) {
    $("#galleryHost").innerHTML = gallery(state.currentShoot);
    bindGallery();
  }
}

function gallery(shoot) {
  const progress = safePercent(shoot.progress);
  const shootId = escapeHtml(shoot.id);
  const canResume = state.user?.role === "admin" && !["COMPLETE", "PACKAGING"].includes(shoot.status);
  return `<section class="panel gallery">
    <div class="gallery-top">
      <div><h3>Generation Gallery</h3><p class="muted">${escapeHtml(shoot.pipelineStage || shoot.status)} - ${escapeHtml(shoot.status)}</p></div>
      <div class="nav-actions">
        ${canResume ? `<button class="btn small resume-shoot" data-shoot-id="${shootId}">Resume</button>` : ""}
        <button class="btn download-zip" data-shoot-id="${shootId}" ${shoot.zipStatus === "READY" ? "" : "disabled"}>Download All ${shoot.zipFileSize ? `(${size(shoot.zipFileSize)})` : ""}</button>
      </div>
    </div>
    <div class="progress-shell"><div class="progress-bar" style="width:${progress}%"></div></div>
    <div class="shot-grid" style="margin-top:16px">${shoot.images.map((image) => shotCard(image, shoot.id)).join("")}</div>
  </section>`;
}

function shotCard(image, shootId) {
  const ready = image.status === "COMPLETE";
  const previewUrl = safeUrl(image.previewUrl);
  const canPreview = ready && previewUrl;
  const slot = safeNumber(image.slot);
  const status = escapeHtml(image.status);
  const dimensions = image.finalDimensions || {};
  const sizeText = ready ? `${safeNumber(dimensions.width)}x${safeNumber(dimensions.height)} - ${size(image.fileSize)}` : status;
  return `<article class="shot-card">
    <div class="shot-media">
      ${canPreview ? `<img src="${previewUrl}" alt="Generated slot ${slot}">` : `<div class="loader">${escapeHtml(image.stage || image.status || "Preview unavailable")}</div>`}
      <div class="slot">${slot}</div>
    </div>
    <div class="shot-body">
      <strong>${image.kind === "quote" ? "Quote Graphic" : image.kind === "mood" ? "Aesthetic Mood" : "Identity Portrait"}</strong>
      <span class="muted">${sizeText}</span>
      ${state.user?.role === "admin" && image.apiModel ? `<span class="chip" style="font-size:11px;opacity:0.7;margin-top:4px">${escapeHtml(image.apiModel)}</span>` : ""}
      <div class="shot-actions">
        <button class="btn ${ready ? "primary" : "small"} download" data-id="${escapeHtml(image.id)}" data-shoot-id="${escapeHtml(shootId)}" ${ready ? "" : "disabled"}>↓ Download 4K</button>
        <button class="btn small preview" data-url="${previewUrl}" ${canPreview ? "" : "disabled"}>Preview</button>
        ${image.kind === "quote" ? `<button class="btn small instagram" data-shoot-id="${escapeHtml(shootId)}" ${ready ? "" : "disabled"}>Instagram 1080</button>` : ""}
      </div>
    </div>
  </article>`;
}

function providerLabel(provider) {
  if (provider === "fal") return "fal.ai";
  if (provider === "openai") return "OpenAI";
  if (provider === "google") return "Google";
  if (provider === "local-mock") return "Local fallback";
  return "AI";
}

function bindGallery() {
  document.querySelectorAll(".resume-shoot").forEach((btn) => btn.addEventListener("click", async () => {
    const shootId = btn.dataset.shootId || state.currentShoot?.id;
    if (!shootId) return toast("Open a shoot first.");
    btn.disabled = true;
    try {
      const { shoot } = await request(`/api/shoots/${pathPart(shootId)}/resume`, { method: "POST" });
      state.currentShoot = shoot;
      $("#galleryHost").innerHTML = gallery(shoot);
      bindGallery();
      connectShootUpdates(shoot.id);
      toast("Generation resumed.");
    } catch (err) {
      btn.disabled = false;
      toast(err.message || "Could not resume generation.");
    }
  }));
  document.querySelectorAll(".preview").forEach((btn) => btn.addEventListener("click", () => {
    const url = normalizeUrl(btn.dataset.url);
    if (!url) return toast("Preview link is unavailable.");
    window.open(url, "_blank", "noopener,noreferrer");
  }));
  document.querySelectorAll(".download").forEach((btn) => btn.addEventListener("click", async () => {
    const shootId = btn.dataset.shootId || state.currentShoot?.id;
    if (!shootId) return toast("Open a shoot first.");
    const data = await request(`/api/shoots/${pathPart(shootId)}/images/${pathPart(btn.dataset.id)}?download=1`);
    download(data.url, data.filename);
    toast(`Signed URL generated. Expires at ${new Date(data.expiresAt).toLocaleTimeString()}.`);
  }));
  document.querySelectorAll(".instagram").forEach((btn) => btn.addEventListener("click", async () => {
    const shootId = btn.dataset.shootId || state.currentShoot?.id;
    if (!shootId) return toast("Open a shoot first.");
    const data = await request(`/api/shoots/${pathPart(shootId)}/quote-instagram-download`);
    download(data.url, data.filename);
  }));
  document.querySelectorAll(".download-zip").forEach((btn) => btn.addEventListener("click", async () => {
    const shootId = btn.dataset.shootId || state.currentShoot?.id;
    if (!shootId) return toast("Open a shoot first.");
    const data = await request(`/api/shoots/${pathPart(shootId)}/download-zip`);
    download(data.url, data.filename);
  }));
}

function download(url, filename) {
  const safeDownloadUrl = normalizeUrl(url);
  if (!safeDownloadUrl) return toast("Download link is unavailable.");
  const a = document.createElement("a");
  a.href = safeDownloadUrl;
  a.download = String(filename || "alux-art-download");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function renderAdmin() {
  const data = await request("/api/admin/overview");
  state.admin = data;
  const metrics = data.metrics || {};
  const downloadLogs = Array.isArray(data.downloadLogs) ? data.downloadLogs : [];
  $("#view").innerHTML = `<section class="main-stack">
    <div class="panel">
      <div class="panel-head"><div><h3>Admin Dashboard</h3></div></div>
      <div class="admin-grid">
        <div class="metric"><span>Queue depth</span><strong>${safeNumber(metrics.queueDepth)}</strong></div>
        <div class="metric"><span>Revenue NGN</span><strong>${money(safeNumber(metrics.totalRevenueNGN), "NGN")}</strong></div>
        <div class="metric"><span>Revenue USD</span><strong>${money(safeNumber(metrics.totalRevenueUSD), "USD")}</strong></div>
        <div class="metric"><span>Storage</span><strong>${size(metrics.storageBytes)}</strong></div>
        <div class="metric"><span>Model credits</span><strong>${safeNumber(metrics.modelCredits)}%</strong></div>
        <div class="metric"><span>Error rate</span><strong>${safeNumber(metrics.apiErrorRate)}%</strong></div>
        <div class="metric"><span>GPU seconds</span><strong>${safeNumber(metrics.upscalingGpuSeconds)}</strong></div>
        <div class="metric"><span>Downloads</span><strong>${downloadLogs.length}</strong></div>
      </div>
    </div>
    <div class="admin-columns">
      ${adminPricing(data.pricing)}
      ${adminModels(data.modelSlots)}
    </div>
    <div class="admin-columns">
      ${adminUsers(data.users)}
      ${adminShoots(data.shoots)}
    </div>
  </section>`;
  bindAdmin();
}

function adminPricing(pricing) {
  const safePricing = pricing || {};
  return `<section class="panel">
    <h3>Pricing Control</h3>
    <div class="field"><label>NGN price</label><input class="input" id="adminNgn" type="number" value="${safeNumber(safePricing.ngn)}"></div>
    <div class="field"><label>USD price</label><input class="input" id="adminUsd" type="number" value="${safeNumber(safePricing.usd)}"></div>
    <button class="btn primary" id="savePricing">Save Pricing</button>
  </section>`;
}

function adminModels(slots) {
  const safeSlots = Array.isArray(slots) ? slots : [];
  return `<section class="panel">
    <h3>Model Selection</h3>
    <p class="muted">Primary: ${DEFAULT_IMAGE_MODEL}. Fallback: ${SECONDARY_IMAGE_MODEL}.</p>
    <div class="summary-list">${safeSlots.map((slot, index) => `<div class="summary-row"><span>Slot ${safeNumber(slot.slot)}</span><div class="model-row"><select class="select model-slot" data-index="${index}">${modelOptions(slot.model)}</select><select class="select fallback-slot" data-index="${index}">${modelOptions(slot.fallback || SECONDARY_IMAGE_MODEL)}</select></div></div>`).join("")}</div>
    <button class="btn primary" id="saveModels">Save Models</button>
  </section>`;
}

function modelOptions(current) {
  const selected = current || DEFAULT_IMAGE_MODEL;
  const choices = MODELS.includes(selected) ? MODELS : [selected, ...MODELS];
  return choices.map((m) => `<option ${selected === m ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");
}

function adminUsers(users) {
  const safeUsers = Array.isArray(users) ? users : [];
  return `<section class="panel">
    <h3>User Management</h3>
    <div class="table-card"><table><thead><tr><th>Email</th><th>Role</th><th>Currency</th><th>Status</th><th></th></tr></thead><tbody>
      ${safeUsers.map((u) => `<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.currency)}</td><td>${u.banned ? "Banned" : "Active"}</td><td><button class="btn small ban-user" data-id="${escapeHtml(u.id)}" data-banned="${!u.banned}">${u.banned ? "Unban" : "Ban"}</button></td></tr>`).join("") || `<tr><td colspan="5">No users found</td></tr>`}
    </tbody></table></div>
  </section>`;
}

function adminShoots(shoots) {
  const safeShoots = Array.isArray(shoots) ? shoots : [];
  return `<section class="panel">
    <h3>Shoot Monitoring</h3>
    <div class="table-card"><table><thead><tr><th>ID</th><th>Owner</th><th>Status</th><th>Mode</th><th>Progress</th></tr></thead><tbody>
      ${safeShoots.map((s) => `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.ownerEmail)}</td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(s.mode)}</td><td>${safePercent(s.progress)}%</td></tr>`).join("") || `<tr><td colspan="5">No shoots yet</td></tr>`}
    </tbody></table></div>
  </section>`;
}

function bindAdmin() {
  $("#savePricing")?.addEventListener("click", async () => {
    const { pricing } = await request("/api/admin/pricing", { method: "PATCH", body: { ngn: Number($("#adminNgn").value), usd: Number($("#adminUsd").value) } });
    state.pricing = pricing;
    toast("Pricing updated.");
  });
  $("#saveModels")?.addEventListener("click", async () => {
    const modelSlots = state.admin.modelSlots.map((slot, index) => ({
      ...slot,
      model: document.querySelectorAll(".model-slot")[index].value,
      fallback: document.querySelectorAll(".fallback-slot")[index].value
    }));
    await request("/api/admin/model-slots", { method: "PATCH", body: { modelSlots } });
    toast("Model slots updated.");
  });
  document.querySelectorAll(".ban-user").forEach((btn) => btn.addEventListener("click", async () => {
    await request("/api/admin/users", { method: "PATCH", body: { userId: btn.dataset.id, banned: btn.dataset.banned === "true" } });
    renderAdmin();
  }));
}

window.addEventListener("hashchange", render);
init().catch((err) => {
  renderFatal(err);
});
