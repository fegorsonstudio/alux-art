// Minimal service worker whose only job is to satisfy PWA installability
// criteria (Chrome requires a registered SW with a fetch handler before it
// will fire beforeinstallprompt). It intentionally does NOT cache or
// intercept anything — this app has live auth, payment, and generation
// state that must never be served stale from a cache.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle every request normally.
});
