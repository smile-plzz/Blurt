// Offline shell cache for the main app (home feed, onboarding, recovery, task
// detail, settings, review).
//
// Modeled on capture/web/sw.js, but deliberately NOT cache-first: capture/web's
// service worker serves every asset straight from cache first, so a deployed
// code change never reaches an existing user until CACHE is bumped by hand -
// documented as its known flaw. This app shell changes far more often (six
// pages, several routes), so a stale-code bug here is more likely and more
// costly. Instead this worker is network-first for the HTML/JS/CSS shell: try
// the network, cache whatever comes back, and only fall back to the cache when
// the network fails (offline, flaky connection). Users on a live connection
// always get current code; the cache exists purely as the offline fallback.
//
// /api/* is never touched here - those are live model calls (orchestrator,
// decompose), not shell assets, and must never be served stale or cached.

const CACHE = "blurt-app-shell-v1";

const ASSETS = [
  "/frontend/web/index.html",
  "/frontend/web/onboarding.html",
  "/frontend/web/settings.html",
  "/frontend/web/task.html",
  "/frontend/web/recovery.html",
  "/frontend/web/review.html",
  "/frontend/web/style.css",
  "/frontend/web/persona.js",
  "/frontend/web/intents.js",
  "/frontend/web/questions.js",
  "/frontend/web/app.js",
  "/frontend/web/onboarding.js",
  "/frontend/web/recovery.js",
  "/frontend/web/settings.js",
  "/frontend/web/task.js",
  "/frontend/web/review.js",
  "/frontend/web/pwa.js",
  "/frontend/web/manifest.json",
  "/frontend/mockups/_ds/organic-d78833b6-7fe1-4f47-8711-04fb39094145/styles.css"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests. Everything else (cross-origin, POST,
  // etc.) passes straight through untouched.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Live model calls - never cached, never served from cache.
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
