const state = {
  user: null,
  config: null,
  pricing: null,
  mode: "fast",
  aspectRatio: "3:4",
  currency: "NGN",
  identityImages: [],
  savedIdentityImages: [],
  shoots: [],
  inspirationImages: [],
  taggedReferences: [],
  quote: { text: "Luxury is becoming the best version of yourself.", attribution: "Alux Art" },
  currentShoot: null,
  admin: null,
  toastTimer: null
};
let supabaseClient = null;

const TAGS = ["OUTFIT", "HAIRSTYLE", "MAKEUP", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE"];
const DEFAULT_IMAGE_MODEL = "openai/gpt-5.4-image-2";
const SECONDARY_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const MODELS = [
  DEFAULT_IMAGE_MODEL,
  SECONDARY_IMAGE_MODEL,
  "openai/gpt-image-1",
  "openai/gpt-image-2",
  "google/imagen-4",
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
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data?.session;
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
  const userEmail = escapeHtml(state.user?.email || "");
  const currency = escapeHtml(state.currency || "NGN");
  document.body.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="mark"><img src="/assets/alux-art-logo.png" alt="Alux Art logo" width="42" height="42" decoding="async" /></div>
        <div><h1>Alux Art</h1><span>AI Photoshoot Orchestration Platform</span></div>
      </div>
      <nav class="nav-actions">
        ${state.user ? `
          <button class="btn ghost ${location.hash !== "#admin" ? "active-nav" : ""}" data-view="shoot">+ <span>New Shoot</span></button>
          ${state.user.role === "admin" ? `<button class="btn ghost ${location.hash === "#admin" ? "active-nav" : ""}" data-view="admin">A <span>Admin</span></button>` : ""}
          <button class="btn small" id="currencyToggle">${currency}</button>
          <button class="btn small" id="logout">Sign out</button>
        ` : ""}
      </nav>
      ${state.user ? `<div class="sidebar-user"><div class="avatar">${userInitial}</div><span>${userEmail}</span></div>` : ""}
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
  const adminEmail = escapeHtml(state.config.adminEmail || "");
  $("#view").innerHTML = `<section class="hero">
    <div class="hero-copy">
      <img class="hero-logo" src="/assets/alux-art-logo.png" alt="Alux Art logo" width="150" height="150" decoding="async" fetchpriority="high" />
      <h2>Alux Art</h2>
      <p>A zero-prompt virtual photo studio. Upload identity and inspiration images, choose a quote, and the orchestration pipeline produces a 10-image professional shoot with 4K downloads.</p>
      <div class="hero-grid">
        <div class="feature-tile"><strong>Identity Lock-In</strong><span>Minimum 3 identity references create a reusable subject profile.</span></div>
        <div class="feature-tile"><strong>Agent Pipeline</strong><span>Vision analysis, character sheet, shoot brief, model routing, and quote composition.</span></div>
        <div class="feature-tile"><strong>4K Delivery</strong><span>Each completed image exposes signed-style 4K downloads and a ZIP package.</span></div>
      </div>
    </div>
    <form class="auth-panel" id="loginForm">
      <h3>Continue with Google</h3>
      <p class="muted">${state.config.supabase?.enabled ? "Production mode uses Supabase Google OAuth. Only Google sign-in is available." : `Local development uses your Google email as a simulated OAuth identity. Use ${adminEmail} for admin access.`}</p>
      <div class="field">
        <label>Google email</label>
        <input class="input" type="email" name="email" value="${adminEmail}" required />
      </div>
      <div class="field">
        <label>Name</label>
        <input class="input" name="name" value="Fegorson Photography" required />
      </div>
      <button class="btn primary" type="submit">Sign in with Google</button>
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
            queryParams: {
              login_hint: String(form.get("email") || ""),
              prompt: "select_account"
            }
          }
        });
        if (error) throw error;
        if (data?.url) location.href = data.url;
        return;
      }
      const auth = await request("/api/auth/google", { method: "POST", body: { email: form.get("email"), name: form.get("name") } });
      if (auth.url) {
        location.href = auth.url;
        return;
      }
      const { user } = auth;
      state.user = user;
      state.currency = user.currency;
      const [library, shoots] = await Promise.all([
        request("/api/identity-library"),
        request("/api/shoots")
      ]);
      state.savedIdentityImages = library.images || [];
      state.shoots = shoots.shoots || [];
      toast(`Signed in as ${user.email}`);
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
      ${panel("Identity Lock-In", "Upload at least 3 identity images. The app creates a locked profile for the shoot.", identityUploader())}
      ${panel("Inspiration Upload", "Add editorial references, campaign images, mood boards, or lighting examples.", inspirationUploader())}
      ${advancedPanel()}
      ${panel("Quote", "Generate an AI quote from the mood, or write a custom one.", quoteEditor())}
      ${panel("Summary", "Review your shoot before generation.", summary())}
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
  return `<div class="chips"><span class="chip ${state.identityImages.length >= 3 ? "ok" : "warn"}">${state.identityImages.length}/3 selected</span><span class="chip">${state.savedIdentityImages.length} saved</span><span class="chip">Reusable identity library</span><span class="chip">Face geometry</span></div>
  <div class="upload-grid" id="identityGrid">${uploadTiles("identity", state.identityImages, 3)}</div>
  <div class="library-head">
    <div><strong>Saved Identity Uploads</strong><p class="muted">Reuse old identity photos for another shoot, or remove ones you do not want kept.</p></div>
    <button class="btn small" id="useAllSaved" ${state.savedIdentityImages.length ? "" : "disabled"}>Use saved</button>
  </div>
  <div class="saved-grid">${savedIdentityTiles()}</div>`;
}

function inspirationUploader() {
  return `<div class="chips"><span class="chip ${state.inspirationImages.length >= 1 ? "ok" : "warn"}">${state.inspirationImages.length}/1 required</span><span class="chip">Lighting</span><span class="chip">Palette</span><span class="chip">Pose</span><span class="chip">Scene</span></div>
  <div class="upload-grid" id="inspirationGrid">${uploadTiles("inspiration", state.inspirationImages, 3)}</div>`;
}

function advancedPanel() {
  if (state.mode !== "advanced") return "";
  return panel("Advanced References", "Upload references, name them, and add notes so the AI knows exactly how to use each one.", `<div class="chips">${TAGS.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div><div class="upload-grid tagged-grid">${uploadTiles("tagged", state.taggedReferences, 6)}</div>`);
}

function uploadTiles(kind, list, minimum) {
  const existing = list.map((item, index) => `<div>
    <div class="upload-card"><img class="thumb" src="${safeUrl(item.dataUrl)}" alt="${escapeHtml(item.name)}"></div>
    ${kind === "tagged" ? customReferenceControls(item, index, kind) : `<div class="tag-row"><span class="chip">${escapeHtml(item.name)}</span><button class="btn icon remove-upload" data-kind="${kind}" data-index="${index}" title="Remove">x</button></div>`}
  </div>`).join("");
  const slots = Math.max(1, minimum - list.length);
  return `${existing}${Array.from({ length: slots }, () => `<label class="drop">Click to upload<input type="file" accept="image/*" multiple data-kind="${kind}"></label>`).join("")}`;
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

function savedIdentityTiles() {
  if (!state.savedIdentityImages.length) {
    return `<div class="empty-library">No saved identity uploads yet. Upload identity images above and they will be saved here.</div>`;
  }
  return state.savedIdentityImages.map((item) => {
    const selected = state.identityImages.some((image) => image.id === item.id);
    const itemId = escapeHtml(item.id);
    return `<article class="saved-card">
      <img class="thumb" src="${safeUrl(item.dataUrl)}" alt="${escapeHtml(item.name)}">
      <div class="saved-card-body">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="muted">${size(item.size)} - saved ${formatDate(item.createdAt)}</span>
        <div class="tag-row">
          <button class="btn small reuse-identity" data-id="${itemId}" ${selected ? "disabled" : ""}>${selected ? "Selected" : "Reuse"}</button>
          <button class="btn small remove-saved-identity" data-id="${itemId}">Remove saved</button>
        </div>
      </div>
    </article>`;
  }).join("");
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
  return `<div class="controls-grid"><div class="field">
    <label>Mode</label>
    <div class="segmented"><button class="${state.mode === "fast" ? "active" : ""}" data-mode="fast">Fast</button><button class="${state.mode === "advanced" ? "active" : ""}" data-mode="advanced">Advanced</button></div>
  </div>
  <div class="field">
    <label>Aspect ratio</label>
    <select class="select" id="aspectRatio">${Object.entries(state.config.aspects).map(([key, value]) => `<option value="${escapeHtml(key)}" ${state.aspectRatio === key ? "selected" : ""}>${escapeHtml(value.label)} - ${safeNumber(value.width)}x${safeNumber(value.height)}</option>`).join("")}</select>
  </div>
  <div class="field action-field"><label>&nbsp;</label><button class="btn primary" id="createShoot" ${ready() ? "" : "disabled"}>${state.user.role === "admin" ? "Start Admin Test Shoot" : "Generate & Pay"}</button></div></div>`;
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
  const provider = state.config.openai?.enabled ? `OpenAI ${state.config.openai.model}` : "Local mock";
  return `<div class="summary-list">
    <div class="summary-row"><span>Identity images</span><strong>${state.identityImages.length}</strong></div>
    <div class="summary-row"><span>Inspiration images</span><strong>${state.inspirationImages.length}</strong></div>
    <div class="summary-row"><span>Tagged overrides</span><strong>${state.taggedReferences.length}</strong></div>
    <div class="summary-row"><span>Aspect ratio</span><strong>${escapeHtml(state.aspectRatio)}</strong></div>
    <div class="summary-row"><span>Output</span><strong>10 images</strong></div>
    <div class="summary-row"><span>Image provider</span><strong>${escapeHtml(provider)}</strong></div>
    <div class="summary-row"><span>Download</span><strong>True 4K PNG + ZIP</strong></div>
  </div>
  <div class="price"><div><span class="muted">Shoot price</span><strong>${primary}</strong><div class="muted">${secondary} secondary</div></div><span class="chip ok">Paystack</span></div>
  <p class="muted">${ready() ? "Ready to start. Gallery progress will stream in real time." : "Complete identity and inspiration uploads to unlock generation."}</p>`;
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
  document.querySelectorAll("input[type=file]").forEach((input) => input.addEventListener("change", readFiles));
  document.querySelectorAll(".remove-upload").forEach((btn) => btn.addEventListener("click", () => {
    const list = listFor(btn.dataset.kind);
    list.splice(Number(btn.dataset.index), 1);
    renderWorkspace();
  }));
  document.querySelectorAll(".tag-select").forEach((select) => select.addEventListener("change", () => {
    state.taggedReferences[Number(select.dataset.index)].tag = select.value;
  }));
  document.querySelectorAll(".custom-ref-name").forEach((input) => input.addEventListener("input", () => {
    state.taggedReferences[Number(input.dataset.index)].customName = input.value;
  }));
  document.querySelectorAll(".custom-ref-note").forEach((textarea) => textarea.addEventListener("input", () => {
    state.taggedReferences[Number(textarea.dataset.index)].note = textarea.value;
  }));
  document.querySelectorAll(".reuse-identity").forEach((btn) => btn.addEventListener("click", () => {
    const image = state.savedIdentityImages.find((item) => item.id === btn.dataset.id);
    if (image && !state.identityImages.some((item) => item.id === image.id)) {
      state.identityImages.push({ ...image });
      renderWorkspace();
    }
  }));
  document.querySelectorAll(".remove-saved-identity").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("Remove this saved identity upload from your library?")) return;
      const { images } = await request(`/api/identity-library/${pathPart(btn.dataset.id)}`, { method: "DELETE" });
    state.savedIdentityImages = images || [];
    state.identityImages = state.identityImages.filter((image) => image.id !== btn.dataset.id);
    renderWorkspace();
    toast("Saved identity upload removed.");
  }));
  $("#useAllSaved")?.addEventListener("click", () => {
    state.savedIdentityImages.forEach((image) => {
      if (!state.identityImages.some((item) => item.id === image.id)) state.identityImages.push({ ...image });
    });
    renderWorkspace();
  });
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
  const uploaded = [];
  for (const file of Array.from(event.target.files)) {
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const image = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, dataUrl, fingerprint: `${file.name}:${file.size}:${file.lastModified}`, tag: TAGS[0], customName: "", note: "" };
    list.push(image);
    if (kind === "identity") uploaded.push(image);
  }
  if (uploaded.length) {
    try {
      const { images, saved } = await request("/api/identity-library", { method: "POST", body: { images: uploaded } });
      state.savedIdentityImages = images || [];
      uploaded.forEach((local) => {
        const savedMatch = (saved || []).find((item) => item.fingerprint === local.fingerprint);
        if (!savedMatch) return;
        const index = state.identityImages.findIndex((item) => item.id === local.id);
        if (index >= 0) state.identityImages[index] = { ...savedMatch };
      });
      toast("Identity upload saved for reuse.");
    } catch (err) {
      toast(`Identity image selected, but could not save it: ${err.message}`);
    }
  }
  renderWorkspace();
}

async function createShoot() {
  try {
    const { shoot } = await request("/api/shoots", {
      method: "POST",
      body: {
        mode: state.mode,
        aspectRatio: state.aspectRatio,
        currency: state.currency,
        identityImages: state.identityImages.map(stripImage),
        inspirationImages: state.inspirationImages.map((img) => stripImage(img, true)),
        taggedReferences: state.taggedReferences.map((img) => stripImage(img, true)),
        quote: state.quote
      }
    });
    state.currentShoot = shoot;
    state.shoots = [shootSummary(shoot), ...state.shoots.filter((item) => item.id !== shoot.id)];
    renderWorkspace();
    $("#galleryHost")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const payment = await request(`/api/shoots/${pathPart(shoot.id)}/pay`, { method: "POST" });
    if (payment.authorization_url) {
      toast("Opening secure Paystack checkout.");
      location.href = payment.authorization_url;
      return;
    }
    connectEvents(shoot.id);
    toast("Shoot queued. Generation progress is streaming.");
  } catch (err) {
    toast(err.message);
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

function connectEvents(shootId) {
  const events = new EventSource(`/api/shoots/${pathPart(shootId)}/events`);
  ["snapshot", "queued", "stage", "slot_update", "slot_complete", "zip_ready", "complete"].forEach((type) => {
    events.addEventListener(type, (event) => {
      const data = JSON.parse(event.data);
      if (data.shoot) state.currentShoot = data.shoot;
      if (data.image && state.currentShoot) {
        const index = state.currentShoot.images.findIndex((img) => img.id === data.image.id);
        if (index >= 0) state.currentShoot.images[index] = data.image;
      }
      if (data.progress && state.currentShoot) state.currentShoot.progress = data.progress;
      if (data.stage && state.currentShoot) state.currentShoot.pipelineStage = data.stage;
      if (type === "zip_ready" && state.currentShoot) {
        state.currentShoot.zipStatus = "READY";
        state.currentShoot.zipUrl = data.zipUrl;
        state.currentShoot.zipFileSize = data.zipFileSize;
      }
      if (type === "complete") {
        events.close();
        state.shoots = [shootSummary(state.currentShoot), ...state.shoots.filter((item) => item.id !== state.currentShoot.id)];
        toast("Shoot complete. 4K downloads are ready.");
      }
      $("#galleryHost").innerHTML = gallery(state.currentShoot);
      bindGallery();
    });
  });
}

function gallery(shoot) {
  const progress = safePercent(shoot.progress);
  const shootId = escapeHtml(shoot.id);
  return `<section class="panel gallery">
    <div class="gallery-top">
      <div><h3>Generation Gallery</h3><p class="muted">${escapeHtml(shoot.pipelineStage || shoot.status)} - ${escapeHtml(shoot.status)}</p></div>
      <div class="nav-actions">
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
      ${ready ? `<span class="chip">${image.provider === "openai" ? "OpenAI" : "Mock"}${image.providerError ? " fallback" : ""}</span>` : ""}
      <div class="shot-actions ${image.kind === "quote" ? "quote" : ""}">
        <button class="btn small preview" data-url="${previewUrl}" ${canPreview ? "" : "disabled"}>Preview</button>
        <button class="btn small download" data-id="${escapeHtml(image.id)}" data-shoot-id="${escapeHtml(shootId)}" ${ready ? "" : "disabled"}>4K</button>
        ${image.kind === "quote" ? `<button class="btn small instagram" data-shoot-id="${escapeHtml(shootId)}" ${ready ? "" : "disabled"}>Instagram 1080</button>` : ""}
      </div>
    </div>
  </article>`;
}

function bindGallery() {
  $(".preview") && document.querySelectorAll(".preview").forEach((btn) => btn.addEventListener("click", () => {
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
      <div class="panel-head"><div><h3>Admin Dashboard</h3><p>Only ${escapeHtml(state.config.adminEmail)} can access this route.</p></div></div>
      <div class="admin-grid">
        <div class="metric"><span>Queue depth</span><strong>${safeNumber(metrics.queueDepth)}</strong></div>
        <div class="metric"><span>Revenue NGN</span><strong>${money(safeNumber(metrics.totalRevenueNGN), "NGN")}</strong></div>
        <div class="metric"><span>Revenue USD</span><strong>${money(safeNumber(metrics.totalRevenueUSD), "USD")}</strong></div>
        <div class="metric"><span>Storage</span><strong>${size(metrics.storageBytes)}</strong></div>
        <div class="metric"><span>Model credits</span><strong>${safeNumber(metrics.modelCredits)}%</strong></div>
        <div class="metric"><span>Error rate</span><strong>${safeNumber(metrics.apiErrorRate)}%</strong></div>
        <div class="metric"><span>GPU seconds</span><strong>${safeNumber(metrics.upscalingGpuSeconds)}</strong></div>
        <div class="metric"><span>Downloads</span><strong>${downloadLogs.length}</strong></div>
        <div class="metric"><span>OpenAI</span><strong>${state.config.openai?.enabled ? "On" : "Off"}</strong></div>
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
    <p class="muted">Default: ${DEFAULT_IMAGE_MODEL}. Secondary fallback: ${SECONDARY_IMAGE_MODEL}.</p>
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
