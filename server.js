const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, ".env"));

const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORAGE = path.join(ROOT, "storage");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3000);
const PROCESS_ROLE = env("ALUX_PROCESS_ROLE", env("PROCESS_ROLE", "all")).toLowerCase();
const HTTP_ENABLED = PROCESS_ROLE !== "worker";
const RUN_WORKER = env("RUN_WORKER");
const WORKER_ENABLED = RUN_WORKER === "true" || RUN_WORKER !== "false";
const ADMIN_EMAIL = env("ADMIN_EMAIL", "fegorsonphotography@gmail.com").toLowerCase();
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";
const SECONDARY_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const OPENAI_API_KEY = env("OPENAI_API_KEY");
const OPENAI_IMAGE_QUALITY = env("OPENAI_IMAGE_QUALITY", "low");
const OPENAI_IMAGE_TIMEOUT_MS = Number(env("OPENAI_IMAGE_TIMEOUT_MS", "120000"));
const OPENAI_GENERATION_ENABLED = env("OPENAI_IMAGE_GENERATION") !== "mock";
const PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY");
const LEGACY_MODELS = new Set([
  "OpenAI GPT-Image-1",
  "Google Imagen 3",
  "Google Imagen 4",
  "Future Model Slot",
  "openai/gpt-5.4-image-2",
  "gpt-5.4-image-2",
  "openai/gpt-image-1.5",
  "gpt-image-1.5",
  "openai/gpt-image-1",
  "gpt-image-1",
  "openai/gpt-image-1-mini",
  "gpt-image-1-mini"
]);
const OPENAI_IMAGE_MODEL = normalizeImageModel(env("OPENAI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL), DEFAULT_IMAGE_MODEL);
const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_PUBLIC_KEY_FALLBACKS = {
  owdfoxglbxrqhgqbvkon: "sb_publishable_zo4Dxes0P6-t2Z1KD4jAtg_QnhzutOg"
};
const CONFIGURED_SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY", env("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const SUPABASE_ANON_KEY = usableSupabasePublicKey(CONFIGURED_SUPABASE_ANON_KEY)
  ? CONFIGURED_SUPABASE_ANON_KEY
  : supabasePublicKeyFallback(SUPABASE_URL, CONFIGURED_SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);

function cleanEnv(value) {
  if (value === undefined || value === null) return "";
  let cleaned = String(value).trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.replace(/^["']+|["']+$/g, "");
}

function env(name, fallback = "") {
  const value = cleanEnv(process.env[name]);
  return value || fallback;
}

function supabaseProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function usableSupabasePublicKey(key) {
  if (!key) return false;
  if (key.startsWith("sb_publishable_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload.iss === "supabase" && payload.role === "anon";
  } catch {
    return false;
  }
}

function supabasePublicKeyFallback(url, configuredKey) {
  const fallback = SUPABASE_PUBLIC_KEY_FALLBACKS[supabaseProjectRef(url)];
  return fallback || configuredKey;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = cleanEnv(trimmed.slice(equals + 1));
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const ASPECTS = {
  "3:4": { width: 3072, height: 4096, label: "Portrait 3:4" },
  "4:5": { width: 3277, height: 4096, label: "Instagram 4:5" },
  "1:1": { width: 4096, height: 4096, label: "Square 1:1" },
  "9:16": { width: 2304, height: 4096, label: "Stories 9:16" },
  "16:9": { width: 4096, height: 2304, label: "Landscape 16:9" },
  "2:3": { width: 2731, height: 4096, label: "Print 2:3" }
};

const store = {
  db: null,
  sessions: new Map(),
  streams: new Map(),
  workers: new Map()
};

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

async function ensureDirs() {
  const dirs = [
    DATA_DIR,
    STORAGE,
    path.join(STORAGE, "previews"),
    path.join(STORAGE, "downloads"),
    path.join(STORAGE, "zip"),
    path.join(STORAGE, "instagram")
  ];
  await Promise.all(dirs.map((dir) => fsp.mkdir(dir, { recursive: true })));
}

async function loadDb() {
  await ensureDirs();
  try {
    store.db = JSON.parse(await fsp.readFile(DB_FILE, "utf8"));
    store.db.users = store.db.users || [];
    store.db.users.forEach((user) => {
      user.identityLibrary = user.identityLibrary || [];
    });
    store.db.shoots = store.db.shoots || [];
    store.db.downloadLogs = store.db.downloadLogs || [];
    store.db.auditLogs = store.db.auditLogs || [];
    store.db.pricing = store.db.pricing || { ngn: 25000, usd: 29, updatedAt: now() };
    store.db.modelSlots = normalizeModelSlots(store.db.modelSlots);
    store.db.metrics = store.db.metrics || {
      totalRevenueNGN: 0,
      totalRevenueUSD: 0,
      queueDepth: 0,
      apiErrorRate: 0.7,
      modelCredits: 84,
      storageBytes: 0,
      upscalingGpuSeconds: 0
    };
    await saveDb();
  } catch {
    store.db = {
      users: [],
      shoots: [],
      downloadLogs: [],
      auditLogs: [],
      pricing: { ngn: 25000, usd: 29, updatedAt: now() },
      modelSlots: normalizeModelSlots(),
      metrics: {
        totalRevenueNGN: 0,
        totalRevenueUSD: 0,
        queueDepth: 0,
        apiErrorRate: 0.7,
        modelCredits: 84,
        storageBytes: 0,
        upscalingGpuSeconds: 0
      }
    };
    await saveDb();
  }
}

async function saveDb() {
  await fsp.writeFile(DB_FILE, JSON.stringify(store.db, null, 2));
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [k, ...v] = part.trim().split("=");
    return [k, decodeURIComponent(v.join("="))];
  }));
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()"
  };
}

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...headers
  });
  res.end(body);
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  req.rawBody = raw;
  if (!raw) return {};
  return JSON.parse(raw);
}

function localCurrentUser(req) {
  const sid = cookies(req).alux_session;
  const userId = sid && store.sessions.get(sid);
  return store.db.users.find((u) => u.id === userId) || null;
}

function bearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function requestOrigin(req) {
  if (req.headers.origin) return req.headers.origin;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  const protocol = forwardedProto || (isLocal ? "http" : "https");
  return `${protocol}://${host}`;
}

async function supabaseJson(pathname, options = {}) {
  if (!SUPABASE_ENABLED) throw new Error("Supabase is not configured");
  const url = pathname.startsWith("http") ? pathname : `${SUPABASE_URL}${pathname}`;
  const key = options.service === false || options.token ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: key,
    authorization: `Bearer ${options.token || key}`,
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status, data });
  }
  return data;
}

async function supabaseRows(table, query = "", options = {}) {
  const suffix = query ? `?${query}` : "";
  return supabaseJson(`/rest/v1/${table}${suffix}`, {
    ...options,
    headers: {
      prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });
}

function dataUrlToFile(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function safeStorageName(name, fallback = "image") {
  const clean = String(name || fallback).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || fallback;
}

async function supabaseUpload(bucket, objectPath, data, contentType, token = "") {
  const key = token ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${token || key}`,
      "content-type": contentType || "application/octet-stream",
      "x-upsert": "true"
    },
    body: data
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || `Storage upload failed (${response.status})`);
  return payload;
}

async function supabaseRemove(bucket, objectPath, token = "") {
  return supabaseJson(`/storage/v1/object/${bucket}`, {
    token,
    method: "DELETE",
    body: { prefixes: [objectPath] }
  });
}

async function supabaseSignedUrl(bucket, objectPath, expiresIn = 3600, token = "") {
  const payload = await supabaseJson(`/storage/v1/object/sign/${bucket}/${objectPath}`, {
    token,
    method: "POST",
    body: { expiresIn }
  });
  const signed = payload?.signedURL || payload?.signedUrl || "";
  return signed.startsWith("http") ? signed : `${SUPABASE_URL}/storage/v1${signed}`;
}

async function supabaseIdentityLibrary(user) {
  const rows = await supabaseRows("identity_images", `user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`, {
    token: user.token,
    headers: { prefer: "" }
  });
  return Promise.all((rows || []).map(async (row) => ({
    id: row.id,
    name: row.name,
    size: Number(row.size || 0),
    type: row.type,
    dataUrl: await supabaseSignedUrl(row.storage_bucket, row.storage_path, 3600, user.token).catch(() => ""),
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path
  })));
}

async function supabaseCurrentUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const authUser = await supabaseJson("/auth/v1/user", { service: false, token }).catch((err) => {
    if (err.status === 401 || err.status === 403) return null;
    throw err;
  });
  if (!authUser?.id || !authUser?.email) return null;
  const user = {
    id: authUser.id,
    email: authUser.email,
    token,
    name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email.split("@")[0],
    currency: authUser.email.endsWith(".ng") ? "NGN" : "USD",
    region: "NG",
    banned: false
  };
  await supabaseRows("profiles", "", {
    method: "POST",
    body: [{
      id: user.id,
      email: user.email,
      display_name: user.name,
      currency: user.currency,
      region: user.region
    }],
    prefer: "resolution=merge-duplicates,return=representation"
  }).catch(() => {});
  const profiles = await supabaseRows("profiles", `id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: { prefer: "" } }).catch(() => []);
  const profile = profiles?.[0];
  if (profile) {
    user.name = profile.display_name || user.name;
    user.currency = profile.currency || user.currency;
    user.region = profile.region || user.region;
    user.banned = Boolean(profile.banned);
  }
  return user;
}

async function currentUser(req) {
  if (SUPABASE_ENABLED) return supabaseCurrentUser(req);
  return localCurrentUser(req);
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Authentication required" });
    return null;
  }
  if (user.banned) {
    send(res, 403, { error: "Account is blocked" });
    return null;
  }
  return user;
}

function isAdmin(user) {
  return user && user.email.toLowerCase() === ADMIN_EMAIL;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: isAdmin(user) ? "admin" : "user",
    currency: user.currency,
    region: user.region,
    banned: Boolean(user.banned)
  };
}

function supabaseStatus() {
  return {
    enabled: SUPABASE_ENABLED,
    url: SUPABASE_ENABLED ? SUPABASE_URL : "",
    anonKey: SUPABASE_ENABLED ? SUPABASE_ANON_KEY : "",
    authMode: SUPABASE_ENABLED ? "google-oauth" : "local-dev"
  };
}

function normalizeModelSlots(slots) {
  const existing = Array.isArray(slots) ? slots : [];
  return Array.from({ length: 10 }, (_, i) => {
    const previous = existing.find((slot) => Number(slot.slot) === i + 1) || {};
    const previousModel = previous.model || "";
    const previousFallback = previous.fallback || "";
    return {
      slot: i + 1,
      model: !previousModel || LEGACY_MODELS.has(previousModel) ? DEFAULT_IMAGE_MODEL : previousModel,
      fallback: !previousFallback || LEGACY_MODELS.has(previousFallback) ? SECONDARY_IMAGE_MODEL : previousFallback,
      enabled: previous.enabled !== false
    };
  });
}

function queueEvent(shootId, event) {
  const shoot = store.db.shoots.find((s) => s.id === shootId);
  const streamEvent = sanitizeEvent(event);
  if (shoot) {
    const durableEvent = { ...streamEvent, at: now() };
    delete durableEvent.shoot;
    shoot.events.push(durableEvent);
    saveDb().catch(() => {});
    syncSupabaseProgress(shoot, streamEvent).catch(() => {});
  }
  const clients = store.streams.get(shootId) || new Set();
  for (const res of clients) {
    res.write(`event: ${streamEvent.type}\n`);
    res.write(`data: ${JSON.stringify(streamEvent)}\n\n`);
  }
}

async function syncSupabaseProgress(shoot, event) {
  if (!SUPABASE_ENABLED || !shoot?.ownerId) return;
  await supabaseRows("generation_events", "", {
    method: "POST",
    body: [{
      shoot_id: shoot.id,
      user_id: shoot.ownerId,
      type: event.type || "event",
      payload: event
    }]
  }).catch(() => {});
  await supabaseRows("shoots", `id=eq.${encodeURIComponent(shoot.id)}`, {
    method: "PATCH",
    body: {
      status: shoot.status,
      progress: shoot.progress || 0,
      pipeline_stage: shoot.pipelineStage || event.stage || "Processing",
      zip_status: shoot.zipStatus,
      zip_storage_bucket: shoot.zipStorageBucket || null,
      zip_storage_path: shoot.zipStoragePath || null,
      zip_file_size: shoot.zipFileSize || null,
      zip_ready_at: shoot.zipReadyAt || null,
      completed_at: shoot.completedAt || null,
      updated_at: now()
    }
  }).catch(() => {});
  const image = event.image;
  if (image?.id) {
    await supabaseRows("shoot_images", `id=eq.${encodeURIComponent(image.id)}`, {
      method: "PATCH",
      body: supabaseImagePatch(image)
    }).catch(() => {});
  } else if (event.type === "complete" && Array.isArray(shoot.images)) {
    for (const img of shoot.images) {
      await supabaseRows("shoot_images", `id=eq.${encodeURIComponent(img.id)}`, {
        method: "PATCH",
        body: supabaseImagePatch(img)
      }).catch(() => {});
    }
  }
}

function supabaseImagePatch(image) {
  return {
    status: image.status,
    stage: image.stage,
    provider: image.provider || null,
    provider_error: image.providerError || null,
    configured_model: image.configuredModel || null,
    api_model: image.apiModel || null,
    fallback_model: image.fallbackModel || null,
    preview_storage_bucket: image.previewStorageBucket || null,
    preview_storage_path: image.previewStoragePath || null,
    download_storage_bucket: image.downloadStorageBucket || null,
    download_storage_path: image.downloadStoragePath || null,
    instagram_storage_bucket: image.instagramStorageBucket || null,
    instagram_storage_path: image.instagramStoragePath || null,
    original_dimensions: image.originalDimensions || null,
    final_dimensions: image.finalDimensions || null,
    target_dimensions: image.targetDimensions || null,
    upscaled: Boolean(image.upscaled),
    file_size: image.fileSize || 0,
    preview_file_size: image.previewFileSize || 0,
    instagram_file_size: image.instagramFileSize || 0,
    updated_at: now()
  };
}

function sanitizeEvent(event) {
  const clean = { ...event };
  if (clean.shoot) {
    clean.shoot = {
      ...clean.shoot,
      events: clean.shoot.events?.map((evt) => {
        const copy = { ...evt };
        delete copy.shoot;
        return copy;
      })
    };
  }
  return clean;
}

function targetDims(aspectRatio) {
  return ASPECTS[aspectRatio] || ASPECTS["3:4"];
}

function openAiStatus() {
  return {
    enabled: Boolean(OPENAI_API_KEY) && OPENAI_GENERATION_ENABLED,
    model: OPENAI_IMAGE_MODEL,
    defaultModel: DEFAULT_IMAGE_MODEL,
    secondaryModel: SECONDARY_IMAGE_MODEL,
    referencesEnabled: false
  };
}

function colorFor(slot) {
  const palettes = [
    ["#101827", "#d7b46a"],
    ["#161114", "#b76e79"],
    ["#0b1f1c", "#61d394"],
    ["#1c1b29", "#93a4ff"],
    ["#21170e", "#e7a857"],
    ["#0f1b2f", "#7ed7ff"],
    ["#241824", "#ff9bd4"],
    ["#151b16", "#d1f28a"],
    ["#181818", "#fafafa"],
    ["#11131a", "#f4efe7"]
  ];
  return palettes[(slot - 1) % palettes.length];
}

function svgPreview(shoot, image) {
  const [a, b] = colorFor(image.slot);
  const dims = targetDims(shoot.aspectRatio);
  const title = image.kind === "quote" ? "Quote Graphic" : image.kind === "mood" ? "Mood Image" : `Identity Shot ${image.slot}`;
  const quote = escapeXml(shoot.quote?.text || "Designed by Alux Art");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="900" height="1200" fill="url(#g)"/>
  <circle cx="450" cy="390" r="210" fill="rgba(255,255,255,.14)"/>
  <rect x="120" y="720" width="660" height="210" rx="34" fill="rgba(0,0,0,.28)"/>
  <text x="450" y="785" text-anchor="middle" fill="#fff" font-size="40" font-family="Arial, sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="450" y="846" text-anchor="middle" fill="#fff" opacity=".82" font-size="25" font-family="Arial, sans-serif">${dims.width} x ${dims.height} 4K PNG</text>
  <text x="450" y="907" text-anchor="middle" fill="#fff" opacity=".72" font-size="22" font-family="Arial, sans-serif">${quote.slice(0, 62)}</text>
  <text x="450" y="1110" text-anchor="middle" fill="#fff" opacity=".6" font-size="28" font-family="Arial, sans-serif">ALUX ART</text>
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" }[c]));
}

function makePng(width, height, slot) {
  const [a, b] = colorFor(slot).map(hexToRgb);
  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    const row = y * rowLength;
    raw[row] = 0;
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 3;
      const wave = (Math.sin((x / width) * Math.PI * 2 + slot) + 1) / 2;
      raw[p] = Math.round(a[0] * (1 - t) + b[0] * t + wave * 16);
      raw[p + 1] = Math.round(a[1] * (1 - t) + b[1] * t + wave * 12);
      raw[p + 2] = Math.round(a[2] * (1 - t) + b[2] * t + wave * 10);
    }
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])])),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  return png;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.data;
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += header.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

async function generateImageFiles(shoot, image) {
  const dims = targetDims(shoot.aspectRatio);
  const previewKey = path.join(STORAGE, "previews", `${image.id}.svg`);
  const fullKey = path.join(STORAGE, "downloads", `${image.id}-4k.png`);
  let full;
  let provider = "local-mock";
  let originalDimensions = { width: 1536, height: Math.round(1536 * dims.height / dims.width) };
  let previewUrl = `/storage/previews/${image.id}.svg`;

  try {
    if (openAiStatus().enabled) {
      image.stage = "OpenAI generation";
      queueEvent(shoot.id, { type: "slot_update", shootId: shoot.id, image });
      const generated = await generateOpenAiImage(shoot, image);
      full = generated.buffer;
      provider = generated.provider;
      originalDimensions = generated.dimensions || originalDimensions;
      image.configuredModel = generated.configuredModel;
      image.apiModel = generated.apiModel;
      image.fallbackModel = generated.fallbackModel;
      const previewPngKey = path.join(STORAGE, "previews", `${image.id}.png`);
      await fsp.writeFile(previewPngKey, full);
      previewUrl = `/storage/previews/${image.id}.png`;
    }
  } catch (err) {
    image.providerError = err.message;
    queueEvent(shoot.id, { type: "slot_update", shootId: shoot.id, image });
  }

  if (!full) {
    await fsp.writeFile(previewKey, svgPreview(shoot, image));
    full = makePng(dims.width, dims.height, image.slot);
  }

  await fsp.writeFile(fullKey, full);
  image.previewUrl = previewUrl;
  image.downloadUrl = `/storage/downloads/${image.id}-4k.png`;
  image.provider = provider;
  image.finalDimensions = provider === "openai" ? originalDimensions : dims;
  image.targetDimensions = dims;
  image.originalDimensions = originalDimensions;
  image.upscaled = image.originalDimensions.width < dims.width || image.originalDimensions.height < dims.height;
  image.fileSize = full.length;
  image.previewFileSize = provider === "openai" ? full.length : Buffer.byteLength(svgPreview(shoot, image));
  if (image.kind === "quote") {
    const insta = makePng(1080, 1080, image.slot);
    const instagramKey = path.join(STORAGE, "instagram", `${image.id}-instagram.png`);
    await fsp.writeFile(instagramKey, insta);
    image.instagramUrl = `/storage/instagram/${image.id}-instagram.png`;
    image.instagramFileSize = insta.length;
  }
  if (SUPABASE_ENABLED && shoot.ownerId) {
    try {
      const ownerPath = `${shoot.ownerId}/shoots/${shoot.id}`;
      const previewBuffer = provider === "openai"
        ? full
        : Buffer.from(svgPreview(shoot, image));
      const previewExt = provider === "openai" ? "png" : "svg";
      const previewType = provider === "openai" ? "image/png" : "image/svg+xml";
      image.previewStorageBucket = "generated-previews";
      image.previewStoragePath = `${ownerPath}/slot-${image.slot}.${previewExt}`;
      image.downloadStorageBucket = "generated-4k";
      image.downloadStoragePath = `${ownerPath}/slot-${image.slot}-4k.png`;
      await supabaseUpload(image.previewStorageBucket, image.previewStoragePath, previewBuffer, previewType);
      await supabaseUpload(image.downloadStorageBucket, image.downloadStoragePath, full, "image/png");
      image.previewUrl = await supabaseSignedUrl(image.previewStorageBucket, image.previewStoragePath).catch(() => image.previewUrl);
      image.downloadUrl = await supabaseSignedUrl(image.downloadStorageBucket, image.downloadStoragePath).catch(() => image.downloadUrl);
      if (image.kind === "quote") {
        const instagramBuffer = await fsp.readFile(path.join(STORAGE, "instagram", `${image.id}-instagram.png`));
        image.instagramStorageBucket = "quote-instagram";
        image.instagramStoragePath = `${ownerPath}/quote-instagram.png`;
        await supabaseUpload(image.instagramStorageBucket, image.instagramStoragePath, instagramBuffer, "image/png");
        image.instagramUrl = await supabaseSignedUrl(image.instagramStorageBucket, image.instagramStoragePath).catch(() => image.instagramUrl);
      }
    } catch (err) {
      console.error("Supabase generated image upload failed; using local file URLs", err);
    }
  }
}

function openAiImageSize(aspectRatio, model = OPENAI_IMAGE_MODEL) {
  if (openAiApiModelName(model) === "gpt-image-2") {
    const dims = targetDims(aspectRatio);
    const scale = Math.min(3840 / dims.width, 3840 / dims.height, Math.sqrt(8294400 / (dims.width * dims.height)), 1);
    const width = Math.max(1024, Math.floor((dims.width * scale) / 16) * 16);
    const height = Math.max(1024, Math.floor((dims.height * scale) / 16) * 16);
    return `${width}x${height}`;
  }
  if (aspectRatio === "1:1") return "1024x1024";
  if (aspectRatio === "16:9") return "1536x1024";
  return "1024x1536";
}

function shotPrompt(shoot, image) {
  const ratio = targetDims(shoot.aspectRatio);
  const quote = shoot.quote?.text || "Luxury is becoming the best version of yourself.";
  const base = [
    "Create a premium editorial photoshoot image for Alux Art.",
    `Aspect ratio target: ${shoot.aspectRatio}, production target ${ratio.width}x${ratio.height}.`,
    "Style: luxury AI photography, polished studio-quality lighting, refined fashion campaign composition, realistic camera depth, no text, no watermark.",
    "Important privacy note: uploaded user reference images are not sent to this provider in this local build; create a tasteful non-identifying editorial result."
  ];
  if (image.kind === "identity") {
    base.push(`Shot ${image.slot}: a confident subject-focused editorial portrait with varied pose, elegant styling, cinematic lighting, premium backdrop, natural human proportions.`);
  } else if (image.kind === "mood") {
    base.push("Shot 9: aesthetic mood image with no person required, luxury still-life details, atmospheric background, refined color palette.");
  } else {
    base.push(`Shot 10: poster-like quote graphic background, leave clean negative space for this quote to be composited later: "${quote}". Do not render readable text in the image.`);
  }
  if (shoot.mode === "advanced" && shoot.taggedReferences?.length) {
    base.push(`Creative direction includes these user-selected override categories: ${shoot.taggedReferences.map((ref) => ref.tag).filter(Boolean).join(", ")}.`);
  }
  return base.join(" ");
}

async function generateOpenAiImage(shoot, image) {
  const key = OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const selected = selectedGenerationModel(image);
  const apiModel = openAiApiModelName(selected.model);
  if (!apiModel) {
    throw new Error(`Selected model ${selected.model} is not an OpenAI image model for this local provider`);
  }
  const size = openAiImageSize(shoot.aspectRatio, apiModel);
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: apiModel,
      prompt: shotPrompt(shoot, image),
      n: 1,
      size,
      quality: OPENAI_IMAGE_QUALITY
    }),
    signal: AbortSignal.timeout(OPENAI_IMAGE_TIMEOUT_MS)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `OpenAI image request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  let buffer;
  if (data.data?.[0]?.b64_json) {
    buffer = Buffer.from(data.data[0].b64_json, "base64");
  } else if (data.data?.[0]?.url) {
    const imageResponse = await fetch(data.data[0].url, { signal: AbortSignal.timeout(60000) });
    if (!imageResponse.ok) throw new Error(`OpenAI image URL failed with HTTP ${imageResponse.status}`);
    buffer = Buffer.from(await imageResponse.arrayBuffer());
  }
  if (!buffer?.length) throw new Error("OpenAI did not return image data");
  return {
    buffer,
    provider: "openai",
    configuredModel: selected.model,
    apiModel,
    fallbackModel: selected.fallback,
    dimensions: readPngDimensions(buffer) || sizeToDimensions(size)
  };
}

function selectedGenerationModel(image) {
  const slot = store.db.modelSlots?.find((item) => Number(item.slot) === Number(image.slot));
  const model = slot?.enabled === false ? OPENAI_IMAGE_MODEL : normalizeImageModel(slot?.model);
  return {
    model,
    fallback: normalizeImageModel(slot?.fallback, SECONDARY_IMAGE_MODEL)
  };
}

function normalizeImageModel(model, fallback = OPENAI_IMAGE_MODEL) {
  const value = String(model || "").trim();
  return !value || LEGACY_MODELS.has(value) ? fallback : value;
}

function openAiApiModelName(model) {
  const value = String(model || "");
  if (value.startsWith("openai/")) return value.slice("openai/".length);
  if (value.startsWith("gpt-image-")) return value;
  return null;
}

function sizeToDimensions(size) {
  const [width, height] = String(size).split("x").map(Number);
  return { width, height };
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 137 || buffer[1] !== 80 || buffer[2] !== 78 || buffer[3] !== 71) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function packageZip(shoot) {
  const files = [];
  for (const image of shoot.images) {
    const file = await fsp.readFile(path.join(STORAGE, "downloads", `${image.id}-4k.png`));
    files.push({ name: `alux-art-${shoot.id}-slot-${image.slot}-4k.png`, data: file });
  }
  const out = zip(files);
  const zipPath = path.join(STORAGE, "zip", `${shoot.id}-4k.zip`);
  await fsp.writeFile(zipPath, out);
  shoot.zipStatus = "READY";
  shoot.zipUrl = `/storage/zip/${shoot.id}-4k.zip`;
  shoot.zipFileSize = out.length;
  shoot.zipReadyAt = now();
  if (SUPABASE_ENABLED && shoot.ownerId) {
    try {
      shoot.zipStorageBucket = "shoot-zips";
      shoot.zipStoragePath = `${shoot.ownerId}/shoots/${shoot.id}/alux-art-${shoot.id}-4k.zip`;
      await supabaseUpload(shoot.zipStorageBucket, shoot.zipStoragePath, out, "application/zip");
      shoot.zipUrl = await supabaseSignedUrl(shoot.zipStorageBucket, shoot.zipStoragePath).catch(() => shoot.zipUrl);
    } catch (err) {
      console.error("Supabase ZIP upload failed; using local ZIP URL", err);
    }
  }
  store.db.metrics.storageBytes = store.db.shoots.flatMap((s) => s.images).reduce((sum, img) => sum + (img.fileSize || 0) + (img.previewFileSize || 0) + (img.instagramFileSize || 0), 0) + out.length;
  queueEvent(shoot.id, { type: "zip_ready", shootId: shoot.id, zipUrl: shoot.zipUrl, zipFileSize: shoot.zipFileSize });
  await saveDb();
}

async function runShootPipeline(shoot) {
  if (store.workers.has(shoot.id)) return;
  store.workers.set(shoot.id, true);
  try {
    const stages = ["Vision analysis", "Character sheet", "Shoot brief", "Prompt engineering", "4K validation"];
    for (let i = 0; i < stages.length; i++) {
      shoot.pipelineStage = stages[i];
      shoot.progress = Math.min(18 + i * 7, 45);
      queueEvent(shoot.id, { type: "stage", shootId: shoot.id, stage: stages[i], progress: shoot.progress });
      await new Promise(r => setTimeout(r, 650));
    }
    
    const imagePromises = shoot.images.map(async (image, i) => {
      await new Promise(r => setTimeout(r, i * 750));
      image.status = "PROCESSING";
      image.stage = "Generating";
      queueEvent(shoot.id, { type: "slot_update", shootId: shoot.id, image });
      await new Promise(r => setTimeout(r, 600));
      image.stage = "Upscaling to 4K";
      queueEvent(shoot.id, { type: "slot_update", shootId: shoot.id, image });
      
      await generateImageFiles(shoot, image);
      
      image.status = "COMPLETE";
      image.stage = "Ready";
      shoot.progress = Math.min(95, 45 + shoot.images.filter((img) => img.status === "COMPLETE").length * 5);
      store.db.metrics.upscalingGpuSeconds += image.upscaled ? 22 : 0;
      queueEvent(shoot.id, { type: "slot_complete", shootId: shoot.id, image, progress: shoot.progress });
    });
    
    await Promise.all(imagePromises);
    
    shoot.status = "PACKAGING";
    shoot.pipelineStage = "Packaging ZIP";
    shoot.progress = 98;
    shoot.zipStatus = "PACKAGING";
    queueEvent(shoot.id, { type: "stage", shootId: shoot.id, stage: "Packaging ZIP", progress: 98 });
    
    await packageZip(shoot);
    
    shoot.status = "COMPLETE";
    shoot.progress = 100;
    shoot.completedAt = now();
    store.db.metrics.queueDepth = Math.max(0, store.db.metrics.queueDepth - 1);
    queueEvent(shoot.id, { type: "complete", shootId: shoot.id, shoot });
  } catch (err) {
    console.error(`Shoot ${shoot.id} pipeline failed:`, err);
    shoot.status = "FAILED";
    shoot.pipelineStage = "Failed";
    queueEvent(shoot.id, { type: "stage", shootId: shoot.id, stage: "Failed", progress: shoot.progress });
  } finally {
    store.workers.delete(shoot.id);
    await saveDb();
  }
}

let workerRunning = false;
async function startWorkerLoop() {
  if (workerRunning) return;
  workerRunning = true;
  console.log("Background worker loop started.");
  while (true) {
    try {
      if (SUPABASE_ENABLED) {
        const rows = await supabaseRows("shoots", "status=eq.QUEUED&select=*&limit=1", { headers: { prefer: "" } }).catch(() => []);
        if (rows && rows.length > 0) {
          const row = rows[0];
          const updated = await supabaseRows("shoots", `id=eq.${encodeURIComponent(row.id)}&status=eq.QUEUED`, {
            method: "PATCH",
            body: { status: "PROCESSING", updated_at: now() },
            headers: { prefer: "return=representation" }
          }).catch(() => []);
          
          if (updated && updated.length > 0) {
            let shoot = store.db.shoots.find(s => s.id === row.id);
            if (!shoot) {
              shoot = await loadSupabaseShootForApp(row.id, { id: row.user_id, email: row.owner_email });
              if (shoot) store.db.shoots.push(shoot);
            }
            if (shoot) {
              shoot.status = "PROCESSING";
              await runShootPipeline(shoot);
            }
          }
        }
      } else {
        const shoot = store.db.shoots.find(s => s.status === "QUEUED" && !store.workers.has(s.id));
        if (shoot) {
          shoot.status = "PROCESSING";
          await saveDb();
          await runShootPipeline(shoot);
        }
      }
    } catch (err) {
      console.error("Worker loop error:", err);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

function newShoot(payload, user) {
  const shootId = id("shoot");
  const mode = payload.mode === "advanced" ? "advanced" : "fast";
  const aspectRatio = ASPECTS[payload.aspectRatio] ? payload.aspectRatio : "3:4";
  const images = Array.from({ length: 10 }, (_, i) => ({
    id: id("img"),
    slot: i + 1,
    kind: i === 8 ? "mood" : i === 9 ? "quote" : "identity",
    status: "AWAITING_PAYMENT",
    stage: "Locked",
    fileSize: 0
  }));
  return {
    id: shootId,
    ownerId: user.id,
    ownerEmail: user.email,
    mode,
    aspectRatio,
    currency: payload.currency || user.currency || "NGN",
    status: "DRAFT",
    progress: 0,
    pipelineStage: "Draft",
    quote: payload.quote || { text: "Luxury is becoming the best version of yourself.", attribution: "Alux Art" },
    identityImages: payload.identityImages || [],
    inspirationImages: payload.inspirationImages || [],
    taggedReferences: payload.taggedReferences || [],
    identityProfile: {
      status: "LOCKED",
      fitzpatrick: "V",
      hair: "dark textured hair",
      features: ["consistent face geometry", "warm skin undertone", "editorial-ready styling profile"]
    },
    shootBrief: {
      theme: "premium editorial AI photoshoot",
      shots: images.map((img) => ({
        slot: img.slot,
        type: img.kind,
        directive: img.kind === "quote" ? "compose quote graphic from portrait" : img.kind === "mood" ? "aesthetic still-life mood image" : "identity-preserving portrait variation"
      }))
    },
    images,
    events: [],
    zipStatus: "LOCKED",
    createdAt: now(),
    updatedAt: now()
  };
}

async function createSupabaseShoot(payload, user) {
  const shoot = newShoot(payload, user);
  shoot.id = crypto.randomUUID();
  shoot.ownerId = user.id;
  shoot.ownerEmail = user.email;
  shoot.images = shoot.images.map((image) => ({ ...image, id: crypto.randomUUID() }));
  const shootRow = {
    id: shoot.id,
    user_id: user.id,
    owner_email: user.email,
    mode: shoot.mode,
    aspect_ratio: shoot.aspectRatio,
    currency: shoot.currency,
    status: shoot.status,
    progress: shoot.progress,
    pipeline_stage: shoot.pipelineStage,
    quote: shoot.quote,
    identity_profile: shoot.identityProfile,
    shoot_brief: shoot.shootBrief,
    zip_status: shoot.zipStatus
  };
  await supabaseRows("shoots", "", { token: user.token, method: "POST", body: [shootRow] });
  await supabaseRows("shoot_images", "", {
    token: user.token,
    method: "POST",
    body: shoot.images.map((image) => ({
      id: image.id,
      shoot_id: shoot.id,
      user_id: user.id,
      slot: image.slot,
      kind: image.kind,
      status: image.status,
      stage: image.stage,
      file_size: image.fileSize || 0
    }))
  });
  await persistSupabaseReferences(shoot, payload, user);
  return shoot;
}

async function persistSupabaseReferences(shoot, payload, user) {
  const rows = [];
  for (const image of payload.identityImages || []) {
    if (image.storageBucket && image.storagePath) {
      rows.push({
        shoot_id: shoot.id,
        user_id: user.id,
        purpose: "identity",
        name: image.name || "identity image",
        type: image.type || "image/jpeg",
        size: Number(image.size || 0),
        storage_bucket: image.storageBucket,
        storage_path: image.storagePath,
        metadata: { identity_image_id: image.id }
      });
    }
  }
  for (const image of payload.inspirationImages || []) {
    const stored = await storeSupabaseReferenceFile(user, shoot.id, "inspiration-images", "inspiration", image);
    if (stored) rows.push(stored);
  }
  for (const image of payload.taggedReferences || []) {
    const stored = await storeSupabaseReferenceFile(user, shoot.id, "custom-references", "custom", image);
    if (stored) rows.push(stored);
  }
  if (rows.length) await supabaseRows("shoot_references", "", { token: user.token, method: "POST", body: rows });
}

async function storeSupabaseReferenceFile(user, shootId, bucket, purpose, image) {
  const file = dataUrlToFile(image?.dataUrl);
  if (!file) return null;
  const objectPath = `${user.id}/shoots/${shootId}/${purpose}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeStorageName(image.name, "reference.jpg")}`;
  await supabaseUpload(bucket, objectPath, file.buffer, file.contentType, user.token);
  return {
    shoot_id: shootId,
    user_id: user.id,
    purpose,
    tag: image.tag || null,
    custom_name: image.customName || null,
    note: image.note || null,
    name: image.name || "reference image",
    type: image.type || file.contentType,
    size: Number(image.size || file.buffer.length),
    storage_bucket: bucket,
    storage_path: objectPath,
    metadata: { fingerprint: image.fingerprint || null }
  };
}

async function loadSupabaseShootForApp(shootId, user) {
  const rows = await supabaseRows("shoots", `id=eq.${encodeURIComponent(shootId)}&select=*`, { token: user.token, headers: { prefer: "" } });
  const row = rows?.[0];
  if (!row) return null;
  if (row.user_id !== user.id && !isAdmin(user)) return null;
  const imageRows = await supabaseRows("shoot_images", `shoot_id=eq.${encodeURIComponent(shootId)}&select=*&order=slot.asc`, { token: user.token, headers: { prefer: "" } });
  const images = await Promise.all((imageRows || []).map(async (image) => ({
    id: image.id,
    slot: image.slot,
    kind: image.kind,
    status: image.status,
    stage: image.stage,
    provider: image.provider,
    providerError: image.provider_error,
    configuredModel: image.configured_model,
    apiModel: image.api_model,
    fallbackModel: image.fallback_model,
    previewUrl: image.preview_storage_bucket && image.preview_storage_path ? await supabaseSignedUrl(image.preview_storage_bucket, image.preview_storage_path, 3600, user.token).catch(() => "") : "",
    downloadUrl: image.download_storage_bucket && image.download_storage_path ? await supabaseSignedUrl(image.download_storage_bucket, image.download_storage_path, 3600, user.token).catch(() => "") : "",
    instagramUrl: image.instagram_storage_bucket && image.instagram_storage_path ? await supabaseSignedUrl(image.instagram_storage_bucket, image.instagram_storage_path, 3600, user.token).catch(() => "") : "",
    previewStorageBucket: image.preview_storage_bucket,
    previewStoragePath: image.preview_storage_path,
    downloadStorageBucket: image.download_storage_bucket,
    downloadStoragePath: image.download_storage_path,
    instagramStorageBucket: image.instagram_storage_bucket,
    instagramStoragePath: image.instagram_storage_path,
    originalDimensions: image.original_dimensions,
    finalDimensions: image.final_dimensions,
    targetDimensions: image.target_dimensions,
    upscaled: image.upscaled,
    fileSize: Number(image.file_size || 0),
    previewFileSize: Number(image.preview_file_size || 0),
    instagramFileSize: Number(image.instagram_file_size || 0)
  })));
  return {
    id: row.id,
    ownerId: row.user_id,
    ownerEmail: row.owner_email,
    mode: row.mode,
    aspectRatio: row.aspect_ratio,
    currency: row.currency,
    status: row.status,
    progress: row.progress,
    pipelineStage: row.pipeline_stage,
    quote: row.quote,
    identityProfile: row.identity_profile,
    shootBrief: row.shoot_brief,
    identityImages: [],
    inspirationImages: [],
    taggedReferences: [],
    images,
    events: [],
    zipStatus: row.zip_status,
    zipStorageBucket: row.zip_storage_bucket,
    zipStoragePath: row.zip_storage_path,
    zipUrl: row.zip_storage_bucket && row.zip_storage_path ? await supabaseSignedUrl(row.zip_storage_bucket, row.zip_storage_path, 3600, user.token).catch(() => "") : "",
    zipFileSize: Number(row.zip_file_size || 0),
    zipReadyAt: row.zip_ready_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

async function api(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      service: "alux-art",
      time: now(),
      supabase: supabaseStatus(),
      openai: openAiStatus(),
      paystack: { configured: Boolean(PAYSTACK_SECRET_KEY) },
      process: { role: PROCESS_ROLE, httpEnabled: HTTP_ENABLED, workerEnabled: WORKER_ENABLED },
      worker: { running: workerRunning }
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    if (SUPABASE_ENABLED) {
      const origin = requestOrigin(req);
      const redirectTo = encodeURIComponent(origin.endsWith("/") ? origin : `${origin}/`);
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
      return send(res, 200, { provider: "supabase", url: authUrl });
    }
    const payload = await body(req);
    if (!payload.email || !payload.email.includes("@")) return send(res, 400, { error: "Valid Google email required" });
    let user = store.db.users.find((u) => u.email.toLowerCase() === payload.email.toLowerCase());
    if (!user) {
      user = { id: id("usr"), email: payload.email, name: payload.name || payload.email.split("@")[0], currency: payload.email.endsWith(".ng") ? "NGN" : "USD", region: "NG", identityLibrary: [], createdAt: now() };
      store.db.users.push(user);
    } else {
      user.identityLibrary = user.identityLibrary || [];
    }
    const sid = id("sess");
    store.sessions.set(sid, user.id);
    await saveDb();
    return send(res, 200, { user: publicUser(user) }, { "set-cookie": `alux_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax` });
  }

  if (req.method === "POST" && url.pathname === "/api/webhooks/paystack") {
    if (!PAYSTACK_SECRET_KEY) return sendText(res, 503, "PAYSTACK_SECRET_KEY is not configured");
    const payload = await body(req);
    const signature = req.headers["x-paystack-signature"];
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(req.rawBody || "").digest("hex");
    if (hash !== signature) return sendText(res, 400, "Invalid signature");
    
    if (payload.event === "charge.success") {
      const data = payload.data;
      const shootId = data.metadata?.shoot_id;
      const userId = data.metadata?.user_id;
      if (shootId) {
        const shoot = store.db.shoots.find((s) => s.id === shootId) || (SUPABASE_ENABLED ? await loadSupabaseShootForApp(shootId, { id: userId }) : null);
        if (shoot && shoot.status !== "QUEUED" && shoot.status !== "COMPLETE") {
          shoot.status = "QUEUED";
          shoot.images.forEach((img) => { img.status = "PROCESSING"; img.stage = "Queued"; });
          
          if (SUPABASE_ENABLED) {
            await supabaseRows("payments", `provider_reference=eq.${encodeURIComponent(data.reference)}`, {
              method: "PATCH",
              body: { status: "SUCCESS", paid_at: now() }
            }).catch(console.error);
            await supabaseRows("shoots", `id=eq.${encodeURIComponent(shoot.id)}`, {
              method: "PATCH",
              body: { status: "QUEUED", zip_status: "LOCKED", updated_at: now() }
            }).catch(console.error);
          }
          
          const amountDec = data.amount / 100;
          if (data.currency === "NGN") store.db.metrics.totalRevenueNGN += amountDec;
          else store.db.metrics.totalRevenueUSD += amountDec;
          store.db.metrics.queueDepth += 1;
          await saveDb();
          queueEvent(shoot.id, { type: "queued", shootId: shoot.id, shoot });
          
          // Worker loop will pick this up automatically!
        }
      }
    }
    return sendText(res, 200, "OK");
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    return send(res, 200, { ok: true }, { "set-cookie": "alux_session=; Path=/; Max-Age=0" });
  }
  if (req.method === "GET" && url.pathname === "/api/me") return send(res, 200, { user: publicUser(await currentUser(req)) });
  if (req.method === "PATCH" && url.pathname === "/api/me/preferences") {
    const user = await requireUser(req, res);
    if (!user) return;
    const payload = await body(req);
    if (["NGN", "USD"].includes(payload.currency)) {
      user.currency = payload.currency;
      if (SUPABASE_ENABLED) {
        await supabaseRows("profiles", `id=eq.${encodeURIComponent(user.id)}`, {
          token: user.token,
          method: "PATCH",
          body: { currency: user.currency, updated_at: now() }
        });
      } else {
        await saveDb();
      }
    }
    return send(res, 200, { user: publicUser(user) });
  }
  if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { aspects: ASPECTS, pricing: store.db.pricing, adminEmail: ADMIN_EMAIL, openai: openAiStatus(), supabase: supabaseStatus() });
  if (req.method === "GET" && url.pathname === "/api/pricing") {
    if (SUPABASE_ENABLED) {
      const rows = await supabaseRows("pricing_configs", "id=eq.true&select=*", { headers: { prefer: "" } }).catch(() => []);
      if (rows?.[0]) return send(res, 200, { ngn: Number(rows[0].ngn), usd: Number(rows[0].usd), updatedAt: rows[0].updated_at });
    }
    return send(res, 200, store.db.pricing);
  }

  if (req.method === "GET" && url.pathname === "/api/shoots") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (SUPABASE_ENABLED) {
      const filter = isAdmin(user) ? "" : `user_id=eq.${encodeURIComponent(user.id)}&`;
      const rows = await supabaseRows("shoots", `${filter}select=*&order=created_at.desc`, { token: user.token, headers: { prefer: "" } });
      const shoots = (rows || []).map((row) => {
        const local = store.db.shoots.find((shoot) => shoot.id === row.id);
        return {
          id: row.id,
          ownerEmail: row.owner_email,
          mode: row.mode,
          aspectRatio: row.aspect_ratio,
          status: local?.status || row.status,
          progress: local?.progress ?? row.progress,
          zipStatus: local?.zipStatus || row.zip_status,
          createdAt: row.created_at,
          completedAt: local?.completedAt || row.completed_at,
          completeImages: local?.images?.filter((image) => image.status === "COMPLETE").length || 0
        };
      });
      return send(res, 200, { shoots });
    }
    const shoots = store.db.shoots
      .filter((shoot) => shoot.ownerId === user.id || isAdmin(user))
      .map((shoot) => ({
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
      }));
    return send(res, 200, { shoots });
  }

  if (req.method === "GET" && url.pathname === "/api/identity-library") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (SUPABASE_ENABLED) {
      const images = await supabaseIdentityLibrary(user);
      return send(res, 200, { images });
    }
    user.identityLibrary = user.identityLibrary || [];
    return send(res, 200, { images: user.identityLibrary });
  }

  if (req.method === "POST" && url.pathname === "/api/identity-library") {
    const user = await requireUser(req, res);
    if (!user) return;
    const payload = await body(req);
    const images = Array.isArray(payload.images) ? payload.images : [];
    if (SUPABASE_ENABLED) {
      const saved = [];
      for (const image of images) {
        const file = dataUrlToFile(image?.dataUrl);
        if (!file || !file.contentType.startsWith("image/")) continue;
        const fingerprint = image.fingerprint || id("fp");
        const existing = await supabaseRows("identity_images", `user_id=eq.${encodeURIComponent(user.id)}&fingerprint=eq.${encodeURIComponent(fingerprint)}&select=*`, {
          token: user.token,
          headers: { prefer: "" }
        });
        if (existing?.[0]) {
          await supabaseRows("identity_images", `id=eq.${encodeURIComponent(existing[0].id)}`, {
            token: user.token,
            method: "PATCH",
            body: { last_used_at: now() }
          });
          saved.push((await supabaseIdentityLibrary(user)).find((item) => item.id === existing[0].id));
          continue;
        }
        const objectPath = `${user.id}/identity/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeStorageName(image.name, "identity.jpg")}`;
        await supabaseUpload("identity-images", objectPath, file.buffer, file.contentType, user.token);
        const rows = await supabaseRows("identity_images", "", {
          token: user.token,
          method: "POST",
          body: [{
            user_id: user.id,
            name: String(image.name || "identity image"),
            size: Number(image.size || file.buffer.length),
            type: String(image.type || file.contentType),
            storage_bucket: "identity-images",
            storage_path: objectPath,
            fingerprint
          }]
        });
        const row = rows?.[0];
        if (row) {
          saved.push({
            id: row.id,
            name: row.name,
            size: Number(row.size || 0),
            type: row.type,
            dataUrl: await supabaseSignedUrl(row.storage_bucket, row.storage_path, 3600, user.token).catch(() => ""),
            fingerprint: row.fingerprint,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            storageBucket: row.storage_bucket,
            storagePath: row.storage_path
          });
        }
      }
      const library = await supabaseIdentityLibrary(user);
      return send(res, 201, { images: library, saved: saved.filter(Boolean) });
    }
    user.identityLibrary = user.identityLibrary || [];
    const saved = [];
    for (const image of images) {
      if (!image?.dataUrl || !String(image.dataUrl).startsWith("data:image/")) continue;
      const existing = user.identityLibrary.find((item) => item.fingerprint === image.fingerprint);
      if (existing) {
        saved.push(existing);
        continue;
      }
      const record = {
        id: id("ident"),
        name: String(image.name || "identity image"),
        size: Number(image.size || 0),
        type: String(image.type || "image/jpeg"),
        dataUrl: image.dataUrl,
        fingerprint: image.fingerprint || id("fp"),
        createdAt: now(),
        lastUsedAt: now()
      };
      user.identityLibrary.unshift(record);
      saved.push(record);
    }
    await saveDb();
    return send(res, 201, { images: user.identityLibrary, saved });
  }

  const identityMatch = url.pathname.match(/^\/api\/identity-library\/([^/]+)$/);
  if (identityMatch && req.method === "DELETE") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (SUPABASE_ENABLED) {
      const rows = await supabaseRows("identity_images", `id=eq.${encodeURIComponent(identityMatch[1])}&user_id=eq.${encodeURIComponent(user.id)}&select=*`, {
        token: user.token,
        headers: { prefer: "" }
      });
      const image = rows?.[0];
      if (!image) return send(res, 404, { error: "Identity image not found" });
      await supabaseRemove(image.storage_bucket, image.storage_path, user.token).catch(() => {});
      await supabaseRows("identity_images", `id=eq.${encodeURIComponent(image.id)}`, {
        token: user.token,
        method: "DELETE",
        headers: { prefer: "" }
      });
      return send(res, 200, { images: await supabaseIdentityLibrary(user) });
    }
    user.identityLibrary = user.identityLibrary || [];
    const before = user.identityLibrary.length;
    user.identityLibrary = user.identityLibrary.filter((image) => image.id !== identityMatch[1]);
    if (user.identityLibrary.length === before) return send(res, 404, { error: "Identity image not found" });
    await saveDb();
    return send(res, 200, { images: user.identityLibrary });
  }

  if (req.method === "POST" && url.pathname === "/api/shoots") {
    const user = await requireUser(req, res);
    if (!user) return;
    const payload = await body(req);
    if (!Array.isArray(payload.identityImages) || payload.identityImages.length < 3) return send(res, 400, { error: "Upload at least 3 identity images" });
    if (!Array.isArray(payload.inspirationImages) || payload.inspirationImages.length < 1) return send(res, 400, { error: "Upload at least 1 inspiration image" });
    const shoot = SUPABASE_ENABLED ? await createSupabaseShoot(payload, user) : newShoot(payload, user);
    store.db.shoots.unshift(shoot);
    await saveDb();
    return send(res, 201, { shoot });
  }
  const shootMatch = url.pathname.match(/^\/api\/shoots\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (shootMatch) {
    const user = await requireUser(req, res);
    if (!user) return;
    const shoot = store.db.shoots.find((s) => s.id === shootMatch[1]) || (SUPABASE_ENABLED ? await loadSupabaseShootForApp(shootMatch[1], user) : null);
    if (!shoot) return send(res, 404, { error: "Shoot not found" });
    if (shoot.ownerId !== user.id && !isAdmin(user)) return send(res, 403, { error: "Not allowed" });
    const action = shootMatch[2];
    const leaf = shootMatch[3];
    if (req.method === "GET" && !action) return send(res, 200, { shoot });
    if (req.method === "POST" && action === "pay") {
      if (!isAdmin(user)) {
        if (!PAYSTACK_SECRET_KEY) {
          return send(res, 503, { error: "PAYSTACK_SECRET_KEY is not configured" });
        }
        const amount = shoot.currency === "NGN" ? store.db.pricing.ngn : store.db.pricing.usd;
        const amountInSubunits = Math.round(amount * 100);
        const origin = requestOrigin(req);
        
        try {
          const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email: user.email,
              amount: amountInSubunits,
              currency: shoot.currency,
              callback_url: `${origin}/studio/shoot/${shoot.id}`,
              metadata: { shoot_id: shoot.id, user_id: user.id }
            })
          });
          const paystackData = await paystackRes.json();
          if (!paystackData.status) {
            return send(res, 400, { error: paystackData.message || "Failed to initialize payment" });
          }
          
          if (SUPABASE_ENABLED) {
            await supabaseRows("payments", "", {
              token: user.token,
              method: "POST",
              body: [{
                shoot_id: shoot.id,
                user_id: shoot.ownerId,
                status: "PENDING",
                currency: shoot.currency,
                amount,
                provider: "paystack",
                provider_reference: paystackData.data.reference,
                metadata: { authorization_url: paystackData.data.authorization_url }
              }]
            }).catch(console.error);
          }
          
          return send(res, 200, { 
            authorization_url: paystackData.data.authorization_url, 
            reference: paystackData.data.reference 
          });
        } catch (err) {
          console.error("Paystack init error", err);
          return send(res, 500, { error: "Failed to initialize payment provider" });
        }
      }

      // Admin bypass simulation
      shoot.status = "QUEUED";
      shoot.images.forEach((img) => { img.status = "PROCESSING"; img.stage = "Queued"; });
      shoot.payment = {
        id: id("pay"),
        status: "BYPASSED",
        currency: shoot.currency,
        amount: shoot.currency === "NGN" ? store.db.pricing.ngn : store.db.pricing.usd,
        provider: "admin-bypass",
        paidAt: now()
      };
      if (SUPABASE_ENABLED) {
        const amount = shoot.currency === "NGN" ? store.db.pricing.ngn : store.db.pricing.usd;
        await supabaseRows("payments", "", {
          token: user.token,
          method: "POST",
          body: [{
            shoot_id: shoot.id,
            user_id: shoot.ownerId,
            status: shoot.payment.status,
            currency: shoot.currency,
            amount,
            provider: shoot.payment.provider,
            provider_reference: shoot.payment.id,
            paid_at: shoot.payment.paidAt,
            metadata: { local_simulation: true }
          }]
        }).catch(() => {});
        await supabaseRows("shoots", `id=eq.${encodeURIComponent(shoot.id)}`, {
          token: user.token,
          method: "PATCH",
          body: { status: "QUEUED", zip_status: "LOCKED", updated_at: now() }
        }).catch(() => {});
      }
      shoot.zipStatus = "LOCKED";
      store.db.metrics.queueDepth += 1;
      await saveDb();
      queueEvent(shoot.id, { type: "queued", shootId: shoot.id, shoot });
      runShootPipeline(shoot).catch((err) => console.error("Admin bypass generation failed", err));
      return send(res, 200, { shoot, payment: shoot.payment });
    }
    if (req.method === "GET" && action === "events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive"
      });
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify({ type: "snapshot", shoot })}\n\n`);
      const set = store.streams.get(shoot.id) || new Set();
      set.add(res);
      store.streams.set(shoot.id, set);
      req.on("close", () => set.delete(res));
      return;
    }
    if (req.method === "GET" && action === "download-zip") {
      if (shoot.status !== "COMPLETE" || shoot.zipStatus !== "READY") return send(res, 425, { status: "not_ready", reason: "ZIP is still being packaged" });
      store.db.downloadLogs.push({ id: id("dl"), userId: user.id, shootId: shoot.id, type: "ZIP", bytes: shoot.zipFileSize, at: now() });
      if (SUPABASE_ENABLED) {
        await supabaseRows("download_logs", "", {
          method: "POST",
          body: [{ user_id: user.id, shoot_id: shoot.id, type: "ZIP", bytes: shoot.zipFileSize || 0 }]
        }).catch(() => {});
      }
      await saveDb();
      const zipUrl = SUPABASE_ENABLED && shoot.zipStorageBucket && shoot.zipStoragePath ? await supabaseSignedUrl(shoot.zipStorageBucket, shoot.zipStoragePath).catch(() => shoot.zipUrl) : shoot.zipUrl;
      return send(res, 200, { url: zipUrl, expiresAt: new Date(Date.now() + 3600000).toISOString(), fileSize: shoot.zipFileSize, filename: `alux-art-${shoot.id}-4k.zip` });
    }
    if (req.method === "GET" && action === "quote-instagram-download") {
      const image = shoot.images.find((img) => img.kind === "quote");
      if (!image?.instagramUrl) return send(res, 425, { status: "not_ready", reason: "Instagram quote image is not ready" });
      store.db.downloadLogs.push({ id: id("dl"), userId: user.id, shootId: shoot.id, imageId: image.id, type: "INSTAGRAM_QUOTE", bytes: image.instagramFileSize, at: now() });
      if (SUPABASE_ENABLED) {
        await supabaseRows("download_logs", "", {
          method: "POST",
          body: [{ user_id: user.id, shoot_id: shoot.id, image_id: image.id, type: "INSTAGRAM_QUOTE", bytes: image.instagramFileSize || 0 }]
        }).catch(() => {});
      }
      await saveDb();
      const instagramUrl = SUPABASE_ENABLED && image.instagramStorageBucket && image.instagramStoragePath ? await supabaseSignedUrl(image.instagramStorageBucket, image.instagramStoragePath).catch(() => image.instagramUrl) : image.instagramUrl;
      return send(res, 200, { url: instagramUrl, expiresAt: new Date(Date.now() + 3600000).toISOString(), fileSize: image.instagramFileSize, dimensions: { width: 1080, height: 1080 }, filename: `alux-art-${shoot.id}-quote-instagram.png` });
    }
    if (req.method === "GET" && action === "images" && leaf) {
      const image = shoot.images.find((img) => img.id === leaf);
      if (!image) return send(res, 404, { error: "Image not found" });
      if (url.searchParams.get("download") !== "1") return send(res, 400, { error: "Unknown image action" });
      if (image.status !== "COMPLETE") return send(res, 425, { status: "not_ready", reason: "Image is still processing" });
      store.db.downloadLogs.push({ id: id("dl"), userId: user.id, shootId: shoot.id, imageId: image.id, type: "SINGLE_4K", bytes: image.fileSize, at: now() });
      if (SUPABASE_ENABLED) {
        await supabaseRows("download_logs", "", {
          method: "POST",
          body: [{ user_id: user.id, shoot_id: shoot.id, image_id: image.id, type: "SINGLE_4K", bytes: image.fileSize || 0 }]
        }).catch(() => {});
      }
      await saveDb();
      const downloadUrl = SUPABASE_ENABLED && image.downloadStorageBucket && image.downloadStoragePath ? await supabaseSignedUrl(image.downloadStorageBucket, image.downloadStoragePath).catch(() => image.downloadUrl) : image.downloadUrl;
      return send(res, 200, { url: downloadUrl, expiresAt: new Date(Date.now() + 3600000).toISOString(), fileSize: image.fileSize, dimensions: image.finalDimensions, filename: `alux-art-${shoot.id}-slot-${image.slot}-4k.png` });
    }
  }

  if (url.pathname.startsWith("/api/admin")) {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isAdmin(user)) return send(res, 403, { error: "Admin only" });
    if (req.method === "GET" && url.pathname === "/api/admin/overview") {
      return send(res, 200, {
        pricing: store.db.pricing,
        modelSlots: store.db.modelSlots,
        users: store.db.users.map(publicUser),
        shoots: store.db.shoots,
        downloadLogs: store.db.downloadLogs,
        metrics: store.db.metrics
      });
    }
    if (req.method === "PATCH" && url.pathname === "/api/admin/pricing") {
      const payload = await body(req);
      store.db.pricing.ngn = Number(payload.ngn || store.db.pricing.ngn);
      store.db.pricing.usd = Number(payload.usd || store.db.pricing.usd);
      store.db.pricing.updatedAt = now();
      store.db.auditLogs.push({ id: id("audit"), actor: user.email, action: "pricing.update", at: now(), payload: store.db.pricing });
      await saveDb();
      return send(res, 200, { pricing: store.db.pricing });
    }
    if (req.method === "PATCH" && url.pathname === "/api/admin/model-slots") {
      const payload = await body(req);
      store.db.modelSlots = normalizeModelSlots(payload.modelSlots || store.db.modelSlots);
      store.db.auditLogs.push({ id: id("audit"), actor: user.email, action: "models.update", at: now() });
      await saveDb();
      return send(res, 200, { modelSlots: store.db.modelSlots });
    }
    if (req.method === "PATCH" && url.pathname === "/api/admin/users") {
      const payload = await body(req);
      const target = store.db.users.find((u) => u.id === payload.userId);
      if (!target) return send(res, 404, { error: "User not found" });
      target.banned = Boolean(payload.banned);
      await saveDb();
      return send(res, 200, { user: publicUser(target) });
    }
  }

  send(res, 404, { error: "Not found" });
}

async function staticFile(req, res, url) {
  let filePath;
  if (url.pathname.startsWith("/storage/")) filePath = path.join(ROOT, url.pathname);
  else filePath = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
  const resolved = path.resolve(filePath);
  const relativePublic = path.relative(PUBLIC, resolved);
  const relativeStorage = path.relative(STORAGE, resolved);
  const insidePublic = relativePublic === "" || (!relativePublic.startsWith("..") && !path.isAbsolute(relativePublic));
  const insideStorage = relativeStorage === "" || (!relativeStorage.startsWith("..") && !path.isAbsolute(relativeStorage));
  if (!insidePublic && !insideStorage) return sendText(res, 403, req.method === "HEAD" ? undefined : "Forbidden");
  try {
    const data = await fsp.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".zip": "application/zip" };
    const cacheControl = url.pathname.startsWith("/assets/")
      ? "public, max-age=86400"
      : url.pathname.startsWith("/storage/")
        ? "public, max-age=3600"
        : "no-store";
    sendText(res, 200, req.method === "HEAD" ? undefined : data, { "content-type": types[ext] || "application/octet-stream", "cache-control": cacheControl });
  } catch {
    if (!url.pathname.includes(".")) {
      const data = await fsp.readFile(path.join(PUBLIC, "index.html"));
      sendText(res, 200, req.method === "HEAD" ? undefined : data, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    } else {
      sendText(res, 404, req.method === "HEAD" ? undefined : "Not found");
    }
  }
}

async function main() {
  await loadDb();
  if (WORKER_ENABLED) startWorkerLoop();
  if (HTTP_ENABLED) {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname.startsWith("/api/")) return await api(req, res, url);
        return staticFile(req, res, url);
      } catch (err) {
        console.error(err);
        send(res, 500, { error: "Internal server error" });
      }
    });
    server.listen(PORT, () => console.log(`Alux Art ${PROCESS_ROLE} process running at http://localhost:${PORT}`));
    return;
  }
  if (WORKER_ENABLED) {
    console.log(`Alux Art ${PROCESS_ROLE} process running without HTTP server.`);
    return;
  }
  throw new Error(`Invalid ALUX_PROCESS_ROLE: ${PROCESS_ROLE}`);
}

main();
